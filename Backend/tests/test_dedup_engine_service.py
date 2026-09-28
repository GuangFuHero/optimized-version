"""The dedup service on the Spec 020 engine: find a match, record a hint, card an acknowledged pair.

A stub engine decides what matches, so these test the service's own duties — radius clamp,
fail-open, what gets written and what never does — not the algorithm.
"""

import json
import os
import uuid as uuid_mod

os.environ["ENV"] = "testing"

import logging
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.dedup_engine import registry
from app.dedup_engine.contract import GeoPoint, Match, TicketSnapshot
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.repositories.dedup_repository import dedup_candidate_repository
from app.services import dedup as dedup_service
from tests.dedup_helpers import StubEngine, actor_with

pytestmark = pytest.mark.asyncio

LON, LAT = 121.5601, 23.6701
NOW = datetime.now(UTC)
MARK = "⟦MARK-7f3a⟧"


@pytest.fixture
def engine(monkeypatch) -> StubEngine:
    """The stub the service will get from the registry."""
    stub = StubEngine()
    monkeypatch.setattr(registry, "_ENGINE", stub)
    return stub


def _submission(uuid=None, **fields) -> TicketSnapshot:
    base = {"title": f"{MARK}民生街淹水", "description": f"{MARK}一樓積水", "task_type": "rescue"}
    return TicketSnapshot(uuid=uuid, location=GeoPoint(LON, LAT), created_at=NOW, **(base | fields))


async def _stored_ticket(db, owner, *, east_deg=0.0, **overrides) -> str:
    fields = {
        "title": "民生街淹水",
        "status": "pending",
        "priority": "high",
        "visibility": "public",
        "contact_name": "王",
        "contact_phone": "0912345678",
        "created_by": owner,
        "created_at": NOW - timedelta(minutes=5),
    }
    ticket = Tickets(geometry=from_shape(Point(LON + east_deg, LAT), srid=4326), **(fields | overrides))
    db.add(ticket)
    await db.flush()
    return str(ticket.uuid)


async def _all(db, model):
    return (await db.execute(select(model))).scalars().all()


# --- find_match --------------------------------------------------------------------------


async def test_find_match_returns_the_engines_best_and_hands_it_facts(db, engine):
    """Rows near the submission become candidates with distance and phone facts; rank()[0] wins."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    near = await _stored_ticket(db, str(actor.uuid))
    await db.commit()
    engine.matches = lambda cands: [Match(c.snapshot.uuid, 0.9, {}) for c in cands]

    match = await dedup_service.find_match(
        db, kind="ticket", submission=_submission(), submission_phone="0912-345-678", actor=actor, now=NOW
    )

    assert match.candidate_uuid == near
    ((_, candidates),) = engine.rank_calls
    assert candidates[0].distance_m == pytest.approx(0.0, abs=0.01)
    assert candidates[0].same_contact_phone is True


async def test_find_match_is_none_when_nothing_ranks(db, engine):
    """An empty rank is no match."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    await _stored_ticket(db, str(actor.uuid))
    await db.commit()
    assert (
        await dedup_service.find_match(
            db, kind="ticket", submission=_submission(), submission_phone=None, actor=actor, now=NOW
        )
        is None
    )


async def test_an_oversized_radius_is_clamped(db, engine, monkeypatch, caplog):
    """The backend never searches past MAX_CANDIDATE_RADIUS_M, whatever the engine asks (ADR-292)."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.radius_m = 50_000.0
    seen = {}

    async def spy(db_, **kwargs):
        seen.update(kwargs)
        return []

    monkeypatch.setattr(dedup_candidate_repository, "nearby_open_rows", spy)
    with caplog.at_level(logging.WARNING, logger="app.dedup"):
        await dedup_service.find_match(
            db, kind="ticket", submission=_submission(), submission_phone=None, actor=actor, now=NOW
        )
    assert seen["radius_m"] == dedup_service.MAX_CANDIDATE_RADIUS_M == 1000.0
    assert "clamping" in caplog.text


async def test_an_engine_failure_is_no_match_and_leaves_the_actor_usable(db, engine):
    """Fail-open: None, rolled back, and the actor reloaded so the caller can still create.

    The rollback expires every loaded object; without the reload, the next read of the actor
    is an async lazy load and raises MissingGreenlet (plan: known pitfall 1). Real session, on
    purpose.
    """
    actor = await actor_with(db, Perm.TICKET_ADD)
    await _stored_ticket(db, str(actor.uuid))
    await db.commit()
    engine.fail_rank = True

    match = await dedup_service.find_match(
        db, kind="ticket", submission=_submission(), submission_phone=None, actor=actor, now=NOW
    )

    assert match is None
    assert actor.uuid is not None  # would raise MissingGreenlet if the actor stayed expired


# --- record_hint_shown ---------------------------------------------------------------------


async def test_record_hint_shown_writes_one_event_with_version_and_no_text(db, engine):
    """Only uuid, similarity, engine version and the engine's evidence (ADR-295). Not committed."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    candidate = str(uuid_mod.uuid4())
    await dedup_service.record_hint_shown(
        db,
        kind="ticket",
        match=Match(candidate, 0.91234567, {"components": [1, 2]}),
        actor_uuid=str(actor.uuid),
    )
    (event,) = await _all(db, DedupAuditEvent)
    assert (event.event_type, str(event.primary_uuid), event.duplicate_uuid) == (
        "hint_shown",
        candidate,
        None,
    )
    assert event.engine_version == "stub-v1"
    assert event.evidence == {"similarity": 0.9123, "engine": {"components": [1, 2]}}
    await db.rollback()
    assert await _all(db, DedupAuditEvent) == []


# --- record_acknowledged -----------------------------------------------------------------


async def test_record_acknowledged_cards_the_pair_as_ignored(db, engine):
    """A dup_ignored card scored by the engine, plus an ignored_by_submitter event. Not committed."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    target = await _stored_ticket(db, str(actor.uuid), east_deg=0.0005)
    created = str(uuid_mod.uuid4())

    pair = await dedup_service.record_acknowledged(
        db,
        kind="ticket",
        created=_submission(uuid=created, status="pending"),
        submission_phone="0912345678",
        acknowledged_uuid=target,
        actor_uuid=str(actor.uuid),
        now=NOW,
    )

    assert (pair.status, pair.hint_outcome, pair.rescan_needed) == ("dup_ignored", "ignored_hint", True)
    assert (pair.method, pair.source_layer, pair.engine_version) == ("fast_rule", "fast", "stub-v1")
    assert float(pair.similarity) == 0.93
    assert pair.evidence == {"stub": True}
    assert sorted([str(pair.low_uuid), str(pair.high_uuid)]) == sorted([target, created])
    ((_, candidate),) = engine.score_calls
    assert candidate.distance_m > 40 and candidate.same_contact_phone is True
    (event,) = await _all(db, DedupAuditEvent)
    assert (event.event_type, str(event.primary_uuid), str(event.duplicate_uuid)) == (
        "ignored_by_submitter",
        target,
        created,
    )
    assert event.pair_uuid == pair.uuid and event.engine_version == "stub-v1"
    await db.rollback()
    assert await _all(db, DuplicatePair) == []


async def test_record_acknowledged_updates_a_live_card_in_place(db, engine):
    """An existing card for the pair is flipped, not duplicated; its original verdict evidence stays."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    target = await _stored_ticket(db, str(actor.uuid))
    created = str(uuid_mod.uuid4())
    low, high = sorted([target, created])
    db.add(
        DuplicatePair(
            entity_kind="ticket", low_uuid=low, high_uuid=high, method="manual", source_layer="manual",
            status="confirmed", evidence={"by": "admin"},
        )
    )  # fmt: skip
    await db.flush()

    pair = await dedup_service.record_acknowledged(
        db, kind="ticket", created=_submission(uuid=created), submission_phone=None,
        acknowledged_uuid=target, actor_uuid=str(actor.uuid), now=NOW,
    )  # fmt: skip

    assert len(await _all(db, DuplicatePair)) == 1
    assert (pair.status, pair.rescan_needed, pair.hint_outcome) == ("dup_ignored", True, "ignored_hint")
    assert (pair.method, pair.evidence) == ("manual", {"by": "admin"})


@pytest.mark.parametrize("target", ["deleted", "missing", "malformed"])
async def test_record_acknowledged_without_a_live_target_writes_nothing(db, engine, target):
    """Nothing to pair with: no card, no event, and the caller still creates."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    uuid = {
        "deleted": await _stored_ticket(db, str(actor.uuid), delete_at=NOW),
        "missing": str(uuid_mod.uuid4()),
        "malformed": "not-a-uuid",
    }[target]
    pair = await dedup_service.record_acknowledged(
        db, kind="ticket", created=_submission(uuid=str(uuid_mod.uuid4())), submission_phone=None,
        acknowledged_uuid=uuid, actor_uuid=str(actor.uuid), now=NOW,
    )  # fmt: skip
    assert pair is None
    assert await _all(db, DuplicatePair) == []
    assert await _all(db, DedupAuditEvent) == []


async def test_record_acknowledged_when_scoring_fails_still_cards_the_pair(db, engine):
    """The submitter's choice is recorded even if the engine cannot score it (spec §5)."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    target = await _stored_ticket(db, str(actor.uuid))
    engine.fail_score = True
    pair = await dedup_service.record_acknowledged(
        db, kind="ticket", created=_submission(uuid=str(uuid_mod.uuid4())), submission_phone=None,
        acknowledged_uuid=target, actor_uuid=str(actor.uuid), now=NOW,
    )  # fmt: skip
    assert (pair.similarity, pair.evidence, pair.engine_version) == (None, None, "stub-v1")
    (event,) = await _all(db, DedupAuditEvent)
    assert event.evidence is None


async def test_nothing_written_echoes_the_submitted_text(db, monkeypatch):
    """With the real engine, neither the card nor the events carry title or description (ADR-295)."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    actor_uuid = str(actor.uuid)  # the commit below expires the actor in this fixture
    target = await _stored_ticket(db, actor_uuid, title=f"{MARK}民生街淹水", description=f"{MARK}一樓積水")
    await db.commit()
    match = await dedup_service.find_match(
        db, kind="ticket", submission=_submission(), submission_phone=None, actor=actor, now=NOW
    )
    assert match is not None and match.candidate_uuid == target
    await dedup_service.record_hint_shown(db, kind="ticket", match=match, actor_uuid=actor_uuid)
    await dedup_service.record_acknowledged(
        db, kind="ticket", created=_submission(uuid=str(uuid_mod.uuid4())), submission_phone=None,
        acknowledged_uuid=target, actor_uuid=actor_uuid, now=NOW,
    )  # fmt: skip
    written = [p.evidence for p in await _all(db, DuplicatePair)] + [
        e.evidence for e in await _all(db, DedupAuditEvent)
    ]
    assert MARK not in json.dumps(written, ensure_ascii=False)
    assert {e.engine_version for e in await _all(db, DedupAuditEvent)} == {"fast-v1"}
