"""Two-phase create on the ADR-304 engine (Spec 020 §5): hold everything or create everything.

A stub engine decides what is suspected, so these test the backend's flow — validation first,
nothing written on a hold, acknowledgements bound to drafts, one transaction — plus one pass
with the real fast-v2 engine end to end.
"""

import os

os.environ["ENV"] = "testing"

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.dedup_engine import registry
from app.dedup_engine.contract import NewStation, NewTask, NewTicket, Suspect, task_ref
from app.dedup_engine.fast_v2 import FastEngine
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import dedup as dedup_service
from app.services.dedup_submission import (
    SubmissionCreated,
    SubmissionHeld,
    TaskSubmission,
    submit_new_station,
    submit_new_task,
    submit_new_ticket,
)
from app.services.notification_service import NotificationService
from tests.dedup_helpers import AsyncStubEngine, actor_with

pytestmark = pytest.mark.asyncio

LON, LAT = 121.5601, 23.6701
POINT = {"type": "Point", "coordinates": [LON, LAT]}
RELATED = str(uuid_mod.uuid4())


def _suspect_tasks_named(*names):
    """A stub `check` that suspects every task draft whose name is in `names`, by position."""

    def suspects(submission):
        drafts = submission.tasks if isinstance(submission, NewTicket) else (submission.task,)
        return [
            Suspect(task_ref(i), "ticket_task", RELATED, 0.95, {}, related_ticket_uuid=str(uuid_mod.uuid4()))
            for i, draft in enumerate(drafts)
            if draft.task_name in names
        ]

    return suspects


@pytest.fixture
def engine(monkeypatch) -> AsyncStubEngine:
    """Suspects nothing unless a test says so."""
    stub = AsyncStubEngine()
    monkeypatch.setattr(registry, "_SUBMISSION_ENGINE", stub)
    return stub


@pytest.fixture(autouse=True)
def notifications(monkeypatch):
    """Record station notices instead of sending them."""
    sent = []

    async def record(db_, **kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(NotificationService, "dispatch", record)
    return sent


def _ticket(**overrides) -> dict:
    fields = {
        "geometry": POINT,
        "title": "民生街淹水",
        "description": "一樓積水",
        "contact_name": "王小明",
        "contact_email": None,
        "contact_phone": "0912345678",
        "priority": "high",
        "task_type": "rescue",
        "visibility": "public",
        "disaster_types": ["flood"],
    }
    return fields | overrides


def _task(name, ack=None) -> TaskSubmission:
    return TaskSubmission(task_type="rescue", task_name=name, acknowledged_duplicate_of=ack)


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _events(db) -> list[str]:
    return list((await db.execute(select(DedupAuditEvent.event_type))).scalars())


# --- new ticket ----------------------------------------------------------------------------


async def test_no_suspects_creates_the_ticket_and_every_task(db, engine):
    """One transaction, tasks in draft order, no dedup rows."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    result = await submit_new_ticket(db, actor=actor, tasks=[_task("抽水"), _task("送水")], **_ticket())
    assert isinstance(result, SubmissionCreated)
    assert [t.task_name for t in result.tasks] == ["抽水", "送水"]
    assert all(str(t.ticket_uuid) == str(result.entity.uuid) for t in result.tasks)
    await db.rollback()  # committed, not merely flushed
    assert (await _count(db, Tickets), await _count(db, TicketTask)) == (1, 2)
    assert await _events(db) == []


async def test_any_suspect_holds_the_whole_submission(db, engine):
    """One task of three looks like an existing one: nothing is created; one hint_shown per suspect."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.suspects = _suspect_tasks_named("送水")
    result = await submit_new_ticket(
        db, actor=actor, tasks=[_task("抽水"), _task("送水"), _task("搬運")], **_ticket()
    )
    assert isinstance(result, SubmissionHeld)
    assert [(s.draft_ref, s.related_uuid) for s in result.suspects] == [("task:1", RELATED)]
    await db.rollback()
    assert (await _count(db, Tickets), await _count(db, TicketTask)) == (0, 0)
    assert await _events(db) == ["hint_shown"]


async def test_the_engine_sees_the_whole_submission(db, engine):
    """Ticket draft and every task draft, phone in E.164, location from the input."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    await submit_new_ticket(db, actor=actor, tasks=[_task("抽水")], **_ticket(contact_phone="0912-345-678"))
    (submission,) = engine.check_calls
    assert isinstance(submission, NewTicket)
    assert (submission.ticket.location.lon, submission.ticket.contact_phone) == (LON, "+886912345678")
    assert [t.task_name for t in submission.tasks] == ["抽水"]


async def test_an_acknowledgement_follows_its_draft(db, engine):
    """The acknowledged task moved to the front: it is created and carded; the other is not re-flagged."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.suspects = _suspect_tasks_named("送水")
    first = await submit_new_ticket(db, actor=actor, tasks=[_task("抽水"), _task("送水")], **_ticket())
    related = first.suspects[0].related_uuid
    await db.refresh(actor)

    second = await submit_new_ticket(
        db, actor=actor, tasks=[_task("送水", ack=related), _task("抽水")], **_ticket()
    )

    assert isinstance(second, SubmissionCreated)
    water_uuid = str(next(t for t in second.tasks if t.task_name == "送水").uuid)  # before the rollback
    await db.rollback()
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert (pair.entity_kind, pair.status) == ("ticket_task", "dup_ignored")
    assert {str(pair.low_uuid), str(pair.high_uuid)} == {water_uuid, related}
    assert engine.score_calls == [("task:0", "ticket_task", related)]
    assert sorted(await _events(db)) == ["hint_shown", "ignored_by_submitter"]


async def test_the_create_is_atomic(db, engine, monkeypatch):
    """Recording the acknowledged pair fails after writing the card: ticket, tasks and card all vanish."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    original = dedup_service.record_pair_ignored

    async def write_then_fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("disk full")

    monkeypatch.setattr(dedup_service, "record_pair_ignored", write_then_fail)
    with pytest.raises(RuntimeError):
        await submit_new_ticket(db, actor=actor, tasks=[_task("送水", ack=RELATED)], **_ticket())
    await db.rollback()
    assert (await _count(db, Tickets), await _count(db, TicketTask), await _count(db, DuplicatePair)) == (
        0,
        0,
        0,
    )


@pytest.mark.parametrize(
    ("perms", "overrides", "error"),
    [
        ((), {}, HTTPException),
        ((Perm.TICKET_ADD,), {"geometry": {"type": "Point", "coordinates": [999, 999]}}, ValueError),
        ((Perm.TICKET_ADD,), {"disaster_types": ["meteor"]}, ValueError),
    ],
    ids=["no-permission", "bad-coordinates", "unknown-disaster"],
)
async def test_invalid_input_fails_before_the_engine_is_asked(db, engine, perms, overrides, error):
    """A caller who could not create never learns what is nearby."""
    actor = await actor_with(db, *perms)
    engine.suspects = _suspect_tasks_named("抽水")
    with pytest.raises(error):
        await submit_new_ticket(db, actor=actor, tasks=[_task("抽水")], **_ticket(**overrides))
    assert engine.check_calls == []


async def test_an_engine_failure_still_creates(db, engine):
    """Fail-open."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.fail = True
    assert isinstance(
        await submit_new_ticket(db, actor=actor, tasks=[_task("抽水")], **_ticket()), SubmissionCreated
    )


# --- task on an existing ticket ------------------------------------------------------------


async def _existing_ticket(db, actor) -> str:
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title="淹水",
        status="pending",
        priority="high",
        visibility="public",
        contact_name="李",
        created_by=actor.uuid,
    )
    db.add(ticket)
    await db.flush()
    uuid = str(ticket.uuid)
    await db.commit()
    await db.refresh(actor)
    return uuid


async def test_new_task_suspected_is_held(db, engine):
    """Adding a task that looks like another open one: nothing added."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    ticket_uuid = await _existing_ticket(db, actor)
    engine.suspects = _suspect_tasks_named("抽水")
    result = await submit_new_task(db, actor=actor, ticket_uuid=ticket_uuid, task=_task("抽水"))
    assert isinstance(result, SubmissionHeld)
    (submission,) = engine.check_calls
    assert submission == NewTask(ticket_uuid=ticket_uuid, task=submission.task)
    await db.rollback()
    assert await _count(db, TicketTask) == 0


async def test_new_task_acknowledged_is_added_and_carded(db, engine):
    """With the acknowledgement it is added and the pair recorded."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    ticket_uuid = await _existing_ticket(db, actor)
    result = await submit_new_task(db, actor=actor, ticket_uuid=ticket_uuid, task=_task("抽水", ack=RELATED))
    assert isinstance(result, SubmissionCreated)
    await db.rollback()
    assert (await _count(db, TicketTask), await _count(db, DuplicatePair)) == (1, 1)


async def test_new_task_on_a_missing_ticket_fails_before_the_engine(db, engine):
    """Same error as create_ticket_task, and the engine is not asked."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    with pytest.raises(ValueError, match="Ticket not found"):
        await submit_new_task(db, actor=actor, ticket_uuid=str(uuid_mod.uuid4()), task=_task("抽水"))
    assert engine.check_calls == []


# --- station -------------------------------------------------------------------------------


def _station(**overrides) -> dict:
    fields = {
        "geometry": POINT,
        "type": "shelter",
        "name": "光復國小臨時收容所",
        "description": None,
        "op_hour": None,
        "level": 0,
        "comment": None,
        "source": "manual",
        "visibility": "public",
    }
    return fields | overrides


async def test_station_held_creates_nothing_and_does_not_notify(db, engine, notifications):
    """Suspected station: nothing registered, nobody notified."""
    actor = await actor_with(db, Perm.STATION_ADD)
    engine.suspects = [Suspect("station", "station", RELATED, 0.97, {})]
    result = await submit_new_station(db, actor=actor, acknowledged_duplicate_of=None, **_station())
    assert isinstance(result, SubmissionHeld)
    assert isinstance(engine.check_calls[0], NewStation)
    assert notifications == []
    await db.rollback()
    assert await _count(db, Station) == 0


async def test_station_created_notifies_and_acknowledged_is_carded(db, engine, notifications):
    """No suspects: created and notified. Acknowledged: created, carded, notified."""
    actor = await actor_with(db, Perm.STATION_ADD)
    assert isinstance(
        await submit_new_station(db, actor=actor, acknowledged_duplicate_of=None, **_station()),
        SubmissionCreated,
    )
    await db.refresh(actor)
    assert isinstance(
        await submit_new_station(db, actor=actor, acknowledged_duplicate_of=RELATED, **_station()),
        SubmissionCreated,
    )
    assert [n["event_type"] for n in notifications] == ["resource_station_updated"] * 2
    await db.rollback()
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert pair.entity_kind == "station"


# --- the real engine ---------------------------------------------------------------------


async def test_end_to_end_with_fast_v2(db, monkeypatch):
    """Held against a real open task nearby; filed anyway with the acknowledgement; carded by fast-v2."""
    monkeypatch.setattr(registry, "_SUBMISSION_ENGINE", FastEngine())
    actor = await actor_with(db, Perm.TICKET_ADD)
    ticket_uuid = await _existing_ticket(db, actor)
    db.add(
        TicketTask(
            ticket_uuid=ticket_uuid,
            task_type="rescue",
            task_name="一樓淹水需要抽水機",
            task_description="水深及膝",
            created_by=actor.uuid,
            created_at=datetime.now(UTC) - timedelta(minutes=10),
        )
    )
    await db.commit()
    await db.refresh(actor)
    pump = TaskSubmission(task_type="rescue", task_name="一樓淹水需要抽水機", task_description="水深及膝")

    held = await submit_new_ticket(db, actor=actor, tasks=[pump], **_ticket())
    assert isinstance(held, SubmissionHeld)
    (suspect,) = held.suspects
    assert (suspect.draft_ref, suspect.related_ticket_uuid) == ("task:0", ticket_uuid)
    await db.refresh(actor)

    acked = TaskSubmission(
        task_type="rescue",
        task_name=pump.task_name,
        task_description=pump.task_description,
        acknowledged_duplicate_of=suspect.related_uuid,
    )
    filed = await submit_new_ticket(db, actor=actor, tasks=[acked], **_ticket())
    assert isinstance(filed, SubmissionCreated)
    await db.rollback()
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert (pair.entity_kind, pair.engine_version) == ("ticket_task", "fast-v2")
    assert float(pair.similarity) >= 0.8
