"""Two-phase create: any suspected duplicate holds the whole submission, otherwise all is created.

A stub engine decides what is suspected, so these test the backend's flow — validation first,
nothing written on a hold, acknowledgements bound to drafts, one transaction — plus end-to-end
passes with the real engine.
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
from app.dedup_engine.fast import FastEngine
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
    monkeypatch.setattr(registry, "_ENGINE", stub)
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
    assert float(pair.similarity) == 0.95  # the engine's own hint for task:0, where 送水 now is
    assert sorted(await _events(db)) == ["hint_shown", "ignored_by_submitter"]


async def test_the_create_is_atomic(db, engine, monkeypatch):
    """Recording the acknowledged pair fails after writing the card: ticket, tasks and card all vanish."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    original = dedup_service.record_pair_ignored

    async def write_then_fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("disk full")

    monkeypatch.setattr(dedup_service, "record_pair_ignored", write_then_fail)
    engine.suspects = _suspect_tasks_named("送水")
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


@pytest.mark.parametrize("ack", ["x", str(uuid_mod.uuid4())], ids=["not-a-uuid", "not-what-it-was-shown"])
async def test_an_acknowledgement_naming_anything_but_the_hint_still_gets_the_hint(db, engine, ack):
    """Only the entity the engine suspects for that draft skips the check (ADR-400); anything else is held."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    engine.suspects = _suspect_tasks_named("抽水")
    result = await submit_new_ticket(db, actor=actor, tasks=[_task("抽水", ack=ack)], **_ticket())
    assert isinstance(result, SubmissionHeld)
    assert [(s.draft_ref, s.related_uuid) for s in result.suspects] == [("task:0", RELATED)]
    await db.rollback()
    assert (await _count(db, Tickets), await _count(db, DuplicatePair)) == (0, 0)


async def test_a_station_acknowledging_another_station_is_still_held(db, engine, notifications):
    """The same rule for createStation: naming a station that exists is not enough."""
    actor = await actor_with(db, Perm.STATION_ADD)
    engine.suspects = [Suspect("station", "station", RELATED, 0.97, {})]
    result = await submit_new_station(
        db, actor=actor, acknowledged_duplicate_of=str(uuid_mod.uuid4()), **_station()
    )
    assert isinstance(result, SubmissionHeld)
    await db.rollback()
    assert (await _count(db, Station), await _count(db, DuplicatePair)) == (0, 0)


# --- task on an existing ticket ------------------------------------------------------------


async def _existing_ticket(db, actor) -> str:
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title="淹水",
        status="pending",
        priority="high",
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
    actor = await actor_with(db, Perm.TICKET_ADD, Perm.TICKET_EDIT)
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
    actor = await actor_with(db, Perm.TICKET_ADD, Perm.TICKET_EDIT)
    ticket_uuid = await _existing_ticket(db, actor)
    engine.suspects = _suspect_tasks_named("抽水")
    result = await submit_new_task(db, actor=actor, ticket_uuid=ticket_uuid, task=_task("抽水", ack=RELATED))
    assert isinstance(result, SubmissionCreated)
    await db.rollback()
    assert (await _count(db, TicketTask), await _count(db, DuplicatePair)) == (1, 1)


async def test_new_task_without_ticket_edit_fails_before_the_engine(db, engine):
    """Adding to a ticket needs ticket.edit on it; a caller without it never learns what is nearby."""
    owner = await actor_with(db, Perm.TICKET_ADD)
    ticket_uuid = await _existing_ticket(db, owner)
    with pytest.raises(HTTPException):
        await submit_new_task(db, actor=owner, ticket_uuid=ticket_uuid, task=_task("抽水"))
    assert engine.check_calls == []


async def test_a_held_task_does_not_reopen_a_completed_ticket(db, engine):
    """Nothing is written on a hold, so the ticket keeps its status."""
    actor = await actor_with(db, Perm.TICKET_ADD, Perm.TICKET_EDIT)
    ticket_uuid = await _existing_ticket(db, actor)
    ticket = await db.get(Tickets, uuid_mod.UUID(ticket_uuid))
    ticket.status = "completed"
    await db.commit()
    await db.refresh(actor)
    engine.suspects = _suspect_tasks_named("抽水")
    result = await submit_new_task(db, actor=actor, ticket_uuid=ticket_uuid, task=_task("抽水"))
    assert isinstance(result, SubmissionHeld)
    await db.rollback()
    assert (await db.get(Tickets, uuid_mod.UUID(ticket_uuid))).status == "completed"


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
    """No suspects: created and notified. Acknowledged: also carded, and reviewers told (ADR-345)."""
    actor = await actor_with(db, Perm.STATION_ADD)
    assert isinstance(
        await submit_new_station(db, actor=actor, acknowledged_duplicate_of=None, **_station()),
        SubmissionCreated,
    )
    await db.refresh(actor)
    engine.suspects = [Suspect("station", "station", RELATED, 0.97, {})]
    assert isinstance(
        await submit_new_station(db, actor=actor, acknowledged_duplicate_of=RELATED, **_station()),
        SubmissionCreated,
    )
    assert [n["event_type"] for n in notifications] == [
        "resource_station_updated",
        "dedup_review_pending",
        "resource_station_updated",
    ]
    await db.rollback()
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert pair.entity_kind == "station"


async def test_station_acknowledgement_that_is_not_a_uuid_is_held(db, engine, notifications):
    """`"x"` names nothing, so the station is checked and held like any other."""
    actor = await actor_with(db, Perm.STATION_ADD)
    engine.suspects = [Suspect("station", "station", RELATED, 0.97, {})]
    result = await submit_new_station(db, actor=actor, acknowledged_duplicate_of="x", **_station())
    assert isinstance(result, SubmissionHeld)
    await db.rollback()
    assert await _count(db, Station) == 0


# --- the real engine ---------------------------------------------------------------------


async def test_end_to_end_with_fast_v2(db, monkeypatch):
    """Held against a real open task nearby; filed with the acknowledgement; carded by the real engine."""
    monkeypatch.setattr(registry, "_ENGINE", FastEngine())
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
    assert (pair.entity_kind, pair.engine_version) == ("ticket_task", FastEngine.version)
    assert float(pair.similarity) >= 0.8


async def test_with_the_real_engine_acknowledging_a_task_far_away_does_not_file_it(db, monkeypatch):
    """The near duplicate is still the hint, and nothing pairs the new task with the far one (ADR-400)."""
    monkeypatch.setattr(registry, "_ENGINE", FastEngine())
    actor = await actor_with(db, Perm.TICKET_ADD)
    near = await _existing_ticket(db, actor)
    far = Tickets(
        geometry=from_shape(Point(LON + 0.15, LAT), srid=4326),  # about 15 km east
        title="淹水",
        status="pending",
        priority="high",
        contact_name="李",
        created_by=actor.uuid,
    )
    db.add(far)
    await db.flush()
    for ticket_uuid in (near, far.uuid):
        db.add(
            TicketTask(
                ticket_uuid=ticket_uuid,
                task_type="rescue",
                task_name="一樓淹水需要抽水機",
                created_by=actor.uuid,
                created_at=datetime.now(UTC) - timedelta(minutes=10),
            )
        )
    await db.flush()
    far_task = str(
        (await db.execute(select(TicketTask.uuid).where(TicketTask.ticket_uuid == far.uuid))).scalar_one()
    )
    await db.commit()
    await db.refresh(actor)
    pump = TaskSubmission(
        task_type="rescue", task_name="一樓淹水需要抽水機", acknowledged_duplicate_of=far_task
    )

    result = await submit_new_ticket(db, actor=actor, tasks=[pump], **_ticket())

    assert isinstance(result, SubmissionHeld)
    assert [s.related_ticket_uuid for s in result.suspects] == [near]
    await db.rollback()
    assert await _count(db, DuplicatePair) == 0


async def test_a_slow_check_on_an_acknowledged_create_still_creates(db, engine, monkeypatch):
    """The check is cut at the timeout before anything is written: all created, carded unscored."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    ticket_uuid = await _existing_ticket(db, actor)
    task = TicketTask(ticket_uuid=ticket_uuid, task_type="rescue", task_name="送水", created_by=actor.uuid)
    db.add(task)
    await db.flush()
    related = str(task.uuid)
    await db.commit()
    await db.refresh(actor)
    monkeypatch.setattr(dedup_service, "ENGINE_TIMEOUT_S", 0.2)
    engine.check_sql = "SELECT pg_sleep(5)"
    filed = await submit_new_ticket(db, actor=actor, tasks=[_task("送水", ack=related)], **_ticket())
    assert isinstance(filed, SubmissionCreated)
    await db.rollback()
    assert (await _count(db, Tickets), await _count(db, TicketTask)) == (2, 2)
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert (pair.similarity, related in {str(pair.low_uuid), str(pair.high_uuid)}) == (None, True)
