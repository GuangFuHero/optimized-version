"""The backend's guard around an ADR-304 engine (Spec 020 §4), on a real session.

The engine may query the database, so the backend runs it in a savepoint it always rolls back,
under a timeout, detects writes, drops malformed or acknowledged results, and fails open.
"""

import os

os.environ["ENV"] = "testing"

import json
import logging
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


async def _ticket_with_task(db, owner) -> tuple[str, str]:
    ticket = Tickets(
        geometry=from_shape(Point(HERE.lon, HERE.lat), srid=4326), title="淹水", status="pending",
        priority="high", visibility="public", contact_name="王", created_by=owner,
    )  # fmt: skip
    db.add(ticket)
    await db.flush()
    task = TicketTask(ticket_uuid=ticket.uuid, task_type="rescue", task_name="抽水", created_by=owner)
    db.add(task)
    await db.flush()
    return str(ticket.uuid), str(task.uuid)


async def test_record_pair_ignored_cards_the_pair(db, engine):
    """The acknowledged pair: a dup_ignored card scored by the engine and an ignored_by_submitter event."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    _, related = await _ticket_with_task(db, str(actor.uuid))
    created = str(uuid_mod.uuid4())

    pair = await dedup_service.record_pair_ignored(
        db, submission=SUBMISSION, draft_ref="task:0", created_uuid=created,
        related_kind="ticket_task", related_uuid=related, actor_uuid=str(actor.uuid), now=NOW,
    )  # fmt: skip

    assert (pair.entity_kind, pair.status, pair.hint_outcome, pair.engine_version) == (
        "ticket_task", "dup_ignored", "ignored_hint", "stub-v2",
    )  # fmt: skip
    assert {str(pair.low_uuid), str(pair.high_uuid)} == {created, related}
    assert float(pair.similarity) == 0.91
    (event,) = (await db.execute(select(DedupAuditEvent))).scalars().all()
    assert (event.event_type, str(event.primary_uuid), str(event.duplicate_uuid)) == (
        "ignored_by_submitter", related, created,
    )  # fmt: skip
    assert engine.score_calls == [("task:0", "ticket_task", related)]


async def test_record_pair_ignored_without_a_target_writes_nothing(db, engine):
    """The engine reports the related entity gone: no card, no event."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.scored = None
    pair = await dedup_service.record_pair_ignored(
        db, submission=SUBMISSION, draft_ref="task:0", created_uuid=str(uuid_mod.uuid4()),
        related_kind="ticket_task", related_uuid=str(uuid_mod.uuid4()), actor_uuid=str(actor.uuid), now=NOW,
    )  # fmt: skip
    assert pair is None
    assert (await db.execute(select(func.count()).select_from(DuplicatePair))).scalar_one() == 0


async def test_record_pair_ignored_when_scoring_fails_still_cards(db, engine):
    """The submitter's choice is kept even without a score (spec §5.1)."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    _, related = await _ticket_with_task(db, str(actor.uuid))
    engine.fail_score = True
    pair = await dedup_service.record_pair_ignored(
        db, submission=SUBMISSION, draft_ref="task:0", created_uuid=str(uuid_mod.uuid4()),
        related_kind="ticket_task", related_uuid=related, actor_uuid=str(actor.uuid), now=NOW,
    )  # fmt: skip
    assert (pair.similarity, pair.evidence, pair.engine_version) == (None, None, "stub-v2")


async def test_station_submissions_go_through_the_same_guard(db, engine):
    """NewStation is checked the same way."""
    actor = await actor_with(db, Perm.STATION_ADD)
    station = _suspect("station", kind="station")
    engine.suspects = [station]
    result = await dedup_service.check_submission(
        db, submission=NewStation(StationDraft(location=HERE)), acknowledged=frozenset(), actor=actor, now=NOW
    )
    assert result == [station]
