"""The backend's guard around the pluggable dedup engine, on a real database session.

The engine may query the database, so the backend runs it in a savepoint it always rolls back,
under a timeout, detects writes, drops malformed or acknowledged results, and fails open.
"""

import os

os.environ["ENV"] = "testing"

import json
import logging
import time
import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.dedup_engine import registry
from app.dedup_engine.contract import (
    GeoPoint,
    NewStation,
    NewTicket,
    StationDraft,
    Suspect,
    TaskDraft,
    TicketDraft,
)
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import dedup as dedup_service
from tests.dedup_helpers import AsyncStubEngine, actor_with

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
HERE = GeoPoint(121.5601, 23.6701)
MARK = "⟦MARK-7f3a⟧"
SUBMISSION = NewTicket(
    ticket=TicketDraft(location=HERE, title=f"{MARK}淹水"),
    tasks=(
        TaskDraft(task_type="rescue", task_name=f"{MARK}抽水"),
        TaskDraft(task_type="supply", task_name="水"),
    ),
)


@pytest.fixture
def engine(monkeypatch) -> AsyncStubEngine:
    """The stub the backend will get."""
    stub = AsyncStubEngine()
    monkeypatch.setattr(registry, "_ENGINE", stub)
    return stub


def _suspect(ref="task:0", kind="ticket_task", uuid=None, **extra) -> Suspect:
    return Suspect(ref, kind, uuid or str(uuid_mod.uuid4()), 0.93, {"components": [1]}, **extra)


async def _check(db, actor, acknowledged=frozenset()):
    return await dedup_service.check_submission(
        db, submission=SUBMISSION, acknowledged=acknowledged, actor=actor, now=NOW
    )


async def _users(db) -> int:
    return (await db.execute(select(func.count()).select_from(User))).scalar_one()


async def test_returns_the_engines_suspects(db, engine):
    """The happy path passes suspects through untouched."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    wanted = [_suspect("task:0"), _suspect("task:1")]
    engine.suspects = wanted
    assert await _check(db, actor) == wanted
    assert engine.check_calls == [SUBMISSION]


async def test_drops_malformed_and_acknowledged_results(db, engine, caplog):
    """Kind not matching the draft, unknown refs, and acknowledged drafts are dropped; one per draft."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    keep = _suspect("task:0")
    engine.suspects = [
        keep,
        _suspect("task:0"),  # a second one for the same draft
        _suspect("task:1", kind="station"),  # a task matched to a station
        _suspect("photo:1", kind="ticket"),  # not a draft
        _suspect("ticket", kind="ticket"),  # acknowledged below
    ]
    with caplog.at_level(logging.WARNING, logger="app.dedup"):
        result = await _check(db, actor, acknowledged=frozenset({"ticket"}))
    assert result == [keep]
    assert "dropping" in caplog.text


async def test_a_timeout_is_no_suspects(db, engine, monkeypatch):
    """Fail-open on a slow engine."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    monkeypatch.setattr(dedup_service, "ENGINE_TIMEOUT_S", 0.05)
    engine.delay_s, engine.suspects = 1.0, [_suspect()]
    assert await _check(db, actor) == []
    assert actor.uuid is not None  # still usable


async def test_an_exception_is_no_suspects(db, engine):
    """Fail-open on a broken engine."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.fail = True
    assert await _check(db, actor) == []
    assert actor.uuid is not None


async def test_an_engine_that_writes_is_rolled_back_and_ignored(db, engine, caplog):
    """The savepoint drops the write; the backend notices it happened and treats it as no answer."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    await db.commit()
    await db.refresh(actor)
    before = await _users(db)
    engine.write, engine.suspects = True, [_suspect()]
    with caplog.at_level(logging.ERROR, logger="app.dedup"):
        assert await _check(db, actor) == []
    assert "wrote" in caplog.text
    await db.commit()
    assert await _users(db) == before


async def test_a_read_only_engine_leaves_no_trace(db, engine):
    """Nothing pending and no rows added by the check itself."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    await db.commit()
    await db.refresh(actor)
    before = await _users(db)
    engine.suspects = [_suspect()]
    await _check(db, actor)
    assert not (db.new or db.dirty or db.deleted)
    await db.commit()
    assert await _users(db) == before


async def test_record_suspect_shown(db, engine):
    """One hint_shown per suspect, with kind, version and the engine's evidence — no submitted text."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    suspect = _suspect("task:1", related_ticket_uuid=str(uuid_mod.uuid4()))
    await dedup_service.record_suspect_shown(db, suspect=suspect, actor_uuid=str(actor.uuid))
    (event,) = (await db.execute(select(DedupAuditEvent))).scalars().all()
    assert (event.event_type, event.entity_kind, str(event.primary_uuid)) == (
        "hint_shown",
        "ticket_task",
        suspect.related_uuid,
    )
    assert event.engine_version == "stub-v2"
    assert event.evidence == {"similarity": 0.93, "draft_ref": "task:1", "engine": {"components": [1]}}
    assert MARK not in json.dumps(event.evidence, ensure_ascii=False)


async def _ticket_with_task(db, owner, task_uuid=None) -> tuple[str, str]:
    ticket = Tickets(
        geometry=from_shape(Point(HERE.lon, HERE.lat), srid=4326), title="淹水", status="pending",
        priority="high", contact_name="王", created_by=owner,
    )  # fmt: skip
    db.add(ticket)
    await db.flush()
    task = TicketTask(ticket_uuid=ticket.uuid, task_type="rescue", task_name="抽水", created_by=owner)
    if task_uuid:
        task.uuid = task_uuid
    db.add(task)
    await db.flush()
    return str(ticket.uuid), str(task.uuid)


async def _settled(db, actor, acknowledged: dict) -> dedup_service.Settled:
    return await dedup_service.settle_submission(
        db, submission=SUBMISSION, acknowledged=acknowledged, actor=actor, now=NOW
    )


async def _settle(db, actor, acknowledged: dict) -> list[dedup_service.AcknowledgedPair]:
    """The acknowledgements the check bears out."""
    return (await _settled(db, actor, acknowledged)).pairs


async def _committed_task(db, actor, task_uuid=None) -> str:
    """An open task that exists before the submission, as it would in production."""
    _, related = await _ticket_with_task(db, str(actor.uuid), task_uuid=task_uuid)
    await db.commit()
    await db.refresh(actor)
    return related


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def test_record_pair_ignored_cards_the_pair(db, engine):
    """The acknowledged pair: a dup_ignored card scored by the engine's hint, and its audit event."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    created = str(uuid_mod.uuid4())
    engine.suspects = [_suspect("task:0", uuid=related)]

    (scored,) = await _settle(db, actor, {"task:0": related})
    pair = await dedup_service.record_pair_ignored(
        db, pair=scored, created_uuid=created, actor_uuid=str(actor.uuid)
    )

    assert (pair.entity_kind, pair.status, pair.hint_outcome, pair.engine_version) == (
        "ticket_task", "dup_ignored", "ignored_hint", "stub-v2",
    )  # fmt: skip
    assert {str(pair.low_uuid), str(pair.high_uuid)} == {created, related}
    assert float(pair.similarity) == 0.93
    (event,) = (await db.execute(select(DedupAuditEvent))).scalars().all()
    assert (event.event_type, str(event.primary_uuid), str(event.duplicate_uuid)) == (
        "ignored_by_submitter", related, created,
    )  # fmt: skip
    assert engine.check_calls == [SUBMISSION]


async def test_one_check_says_what_to_card_and_what_to_hold(db, engine):
    """The acknowledged draft's hint is borne out; the other draft's hint still holds the submission."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    engine.suspects = [_suspect("task:0", uuid=related), _suspect("task:1")]

    settled = await _settled(db, actor, {"task:0": related})

    assert [pair.draft_ref for pair in settled.pairs] == ["task:0"]
    assert [suspect.draft_ref for suspect in settled.suspects] == ["task:1"]
    assert engine.check_calls == [SUBMISSION]


async def test_an_acknowledgement_naming_anything_but_its_drafts_hint_is_not_borne_out(db, engine):
    """`related` exists and is a hint, but for task:1; acknowledged on task:0 it counts for nothing."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    engine.suspects = [_suspect("task:0"), _suspect("task:1", uuid=related)]
    settled = await _settled(db, actor, {"task:0": related})
    assert (settled.pairs, [s.draft_ref for s in settled.suspects]) == ([], ["task:0", "task:1"])


async def test_when_the_check_fails_an_entity_that_exists_is_still_carded_unscored(db, engine):
    """Nothing was checked, so the submitter's choice is recorded without a score (ADR-313)."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    engine.fail = True
    (scored,) = await _settle(db, actor, {"task:0": related})
    pair = await dedup_service.record_pair_ignored(
        db, pair=scored, created_uuid=str(uuid_mod.uuid4()), actor_uuid=str(actor.uuid)
    )
    assert (pair.similarity, pair.evidence, pair.engine_version) == (None, None, "stub-v2")


async def test_when_the_check_fails_an_unknown_uuid_is_not_carded(db, engine):
    """Carded unscored only if the related entity exists; an unknown uuid writes nothing."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.fail = True
    for ref in ("task:0", "ticket", "station"):
        assert await _settle(db, actor, {ref: str(uuid_mod.uuid4())}) == []


async def test_an_acknowledgement_that_is_not_a_uuid_is_not_borne_out(db, engine):
    """It names nothing, so it is never compared or carded; the draft is held like any other."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.suspects = [_suspect("task:0")]
    settled = await _settled(db, actor, {"task:0": "not-a-uuid"})
    assert (settled.pairs, [s.draft_ref for s in settled.suspects]) == ([], ["task:0"])


async def test_a_failing_query_in_the_check_leaves_the_session_usable(db, engine):
    """An engine query error stays inside the guard: carded unscored, and the create still commits."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    engine.check_sql = "SELECT 1/0"
    (scored,) = await _settle(db, actor, {"task:0": related})
    assert scored.suspect is None
    _, created = await _ticket_with_task(db, str(actor.uuid))
    await dedup_service.record_pair_ignored(db, pair=scored, created_uuid=created, actor_uuid=str(actor.uuid))
    await db.commit()
    assert (await _count(db, Tickets), await _count(db, DuplicatePair)) == (2, 1)


async def test_a_slow_check_is_cut_at_the_timeout(db, engine, monkeypatch):
    """A slow query in the check stops at ENGINE_TIMEOUT_S; carded unscored, and the create still commits."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    monkeypatch.setattr(dedup_service, "ENGINE_TIMEOUT_S", 0.2)
    engine.check_sql = "SELECT pg_sleep(5)"
    start = time.perf_counter()
    (scored,) = await _settle(db, actor, {"task:0": related})
    assert time.perf_counter() - start < 2
    assert scored.suspect is None
    _, created = await _ticket_with_task(db, str(actor.uuid))
    await dedup_service.record_pair_ignored(db, pair=scored, created_uuid=created, actor_uuid=str(actor.uuid))
    await db.commit()
    assert (await _count(db, Tickets), await _count(db, DuplicatePair)) == (2, 1)


async def test_an_engine_that_writes_while_settling_an_acknowledgement_is_discarded(db, engine):
    """The check runs before any write, so a write is detected; its answer is dropped, card unscored."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor)
    users = await _users(db)
    engine.check_sql = "INSERT INTO users (uuid, name) VALUES (gen_random_uuid(), 'engine-was-here')"
    engine.suspects = [_suspect("task:0", uuid=related)]  # an answer that must not count
    (scored,) = await _settle(db, actor, {"task:0": related})
    assert scored.suspect is None
    await db.commit()
    assert await _users(db) == users


async def test_an_upper_case_uuid_is_ordered_like_postgres(db, engine):
    """`low_uuid < high_uuid` is checked on uuids, so an upper-case input must not flip the order."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    related = await _committed_task(db, actor, task_uuid="b0000000-0000-4000-8000-000000000000")
    created = "a0000000-0000-4000-8000-000000000000"
    engine.suspects = [_suspect("task:0", uuid=related)]
    (scored,) = await _settle(db, actor, {"task:0": related.upper()})
    pair = await dedup_service.record_pair_ignored(
        db, pair=scored, created_uuid=created, actor_uuid=str(actor.uuid)
    )
    assert (str(pair.low_uuid), str(pair.high_uuid)) == (created, related)
    await db.commit()


async def test_station_submissions_go_through_the_same_guard(db, engine):
    """NewStation is checked the same way."""
    actor = await actor_with(db, Perm.STATION_ADD)
    station = _suspect("station", kind="station")
    engine.suspects = [station]
    result = await dedup_service.check_submission(
        db, submission=NewStation(StationDraft(location=HERE)), acknowledged=frozenset(), actor=actor, now=NOW
    )
    assert result == [station]
