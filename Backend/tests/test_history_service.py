"""Timeline aggregation, merging and derivation (feature 016, ADR-131~137).

Note on the fixture: `db` builds the schema from `Base.metadata`, which carries no audit
triggers — those are installed by migrations. So these tests insert audit rows by hand,
shaped exactly the way the trigger writes them. The real trigger path is exercised in the
docker verification (plan Task 10); what is under test here is the interpretation, and
hand-written rows make the awkward cases (a hard-deleted assignment, a soft delete) actually
reachable.
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime, timedelta

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import select

from app.models.audit import AuditLog
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import StationProperty
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services.history import (
    ASSIGNED,
    CREATED,
    DELETED,
    RESTORED,
    STATION,
    TICKET,
    UNASSIGNED,
    build_events,
    entity_exists,
    fetch_audit_rows,
    resolve_scope_ids,
)


async def _user(db, name="Actor") -> User:
    actor = User(name=name)
    db.add(actor)
    await db.flush()
    return actor


async def _ticket_with_two_tasks(db):
    """A ticket carrying everything the two-hop expansion is supposed to reach."""
    actor = await _user(db)
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(actor.uuid),
        title="需要飲用水", contact_name="王小姐", status="pending", priority="high",
    )
    db.add(ticket)
    await db.flush()

    db.add(SecondaryLocation(
        uuid=uuidlib.uuid4(), geometry_uuid=str(ticket.uuid),
        location_type="address", county="花蓮縣", city="光復鄉",
    ))

    tasks = []
    for n in range(2):
        task = TicketTask(
            uuid=uuidlib.uuid4(), ticket_uuid=str(ticket.uuid), task_type="cleanup",
            task_name=f"清淤 {n}", created_by=str(actor.uuid),
        )
        db.add(task)
        await db.flush()
        tasks.append(task)
        db.add(TaskProperty(
            uuid=uuidlib.uuid4(), task_uuid=str(task.uuid),
            property_name="人力", property_value="5",
        ))
        db.add(TaskAssignment(
            uuid=uuidlib.uuid4(), task_uuid=str(task.uuid), actor_uuid=str(actor.uuid),
        ))
    await db.flush()
    return ticket, tasks, actor


# --- row_id expansion (ADR-131) ---


@pytest.mark.asyncio
async def test_ticket_expansion_reaches_two_hops(db):
    """1 ticket + 1 address + 2 tasks + 2 properties + 2 assignments = 8 row ids."""
    ticket, tasks, _ = await _ticket_with_two_tasks(db)

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)

    assert len(ids.row_ids) == 8
    assert ticket.uuid in ids.row_ids
    assert {t.uuid for t in tasks} <= ids.row_ids


@pytest.mark.asyncio
async def test_ticket_expansion_carries_the_task_ids_separately(db):
    """ADR-132's second access path matches on task_uuid, so those ids travel apart."""
    ticket, tasks, _ = await _ticket_with_two_tasks(db)

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)

    assert ids.task_uuids == {t.uuid for t in tasks}


@pytest.mark.asyncio
async def test_the_resource_itself_is_always_in_the_set(db):
    """base_geometries and the subclass table share one uuid, so one id reaches both rows."""
    ticket, _, _ = await _ticket_with_two_tasks(db)

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)

    assert ticket.uuid in ids.row_ids


@pytest.mark.asyncio
async def test_a_ticket_with_no_children_still_resolves(db):
    """A brand-new ticket has no tasks yet; expansion must not depend on finding any."""
    actor = await _user(db)
    ticket = Tickets(
        uuid=uuidlib.uuid4(), property_name="request", created_by=str(actor.uuid),
        title="孤兒單", contact_name="李先生", status="pending", priority="low",
    )
    db.add(ticket)
    await db.flush()

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)

    assert ids.row_ids == {ticket.uuid}
    assert ids.task_uuids == set()


@pytest.mark.asyncio
async def test_station_expansion_stops_at_one_hop(db):
    """A station's children reference it directly — there is no second hop to make."""
    actor = await _user(db)
    station = Station(
        uuid=uuidlib.uuid4(), property_name="station", created_by=str(actor.uuid),
        name="光復國小避難所", type="shelter",
    )
    db.add(station)
    await db.flush()
    db.add(SecondaryLocation(
        uuid=uuidlib.uuid4(), geometry_uuid=str(station.uuid), location_type="address",
    ))
    db.add(StationProperty(
        uuid=uuidlib.uuid4(), station_uuid=str(station.uuid),
        property_type="supply", property_name="飲用水", quantity=100,
        created_by=str(actor.uuid),
    ))
    await db.flush()

    ids = await resolve_scope_ids(db, entity=STATION, uuid=station.uuid)

    assert len(ids.row_ids) == 3
    assert ids.task_uuids == set()


@pytest.mark.asyncio
async def test_another_resources_children_never_leak_in(db):
    """Two tickets side by side must not see each other's tasks."""
    first, _, _ = await _ticket_with_two_tasks(db)
    second, second_tasks, _ = await _ticket_with_two_tasks(db)

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=first.uuid)

    assert not ({t.uuid for t in second_tasks} & ids.row_ids)
    assert second.uuid not in ids.row_ids


@pytest.mark.asyncio
async def test_unknown_entity_is_rejected(db):
    """A typo'd entity must fail loudly rather than resolve to an empty timeline."""
    with pytest.raises(ValueError, match="Unknown history entity"):
        await resolve_scope_ids(db, entity="closure_area", uuid=uuidlib.uuid4())


# --- resource lookup (checkpoint 2 needs the object, not a boolean) ---


@pytest.mark.asyncio
async def test_entity_exists_returns_the_object_for_checkpoint_two(db):
    """require_scope reads created_by/geometry off it to decide own/zone."""
    ticket, _, actor = await _ticket_with_two_tasks(db)

    found = await entity_exists(db, entity=TICKET, uuid=ticket.uuid)

    assert found is not None
    assert str(found.created_by) == str(actor.uuid)


@pytest.mark.asyncio
async def test_entity_exists_does_not_cross_the_entity_boundary(db):
    """A ticket uuid asked for as a station is not found.

    Both live in base_geometries, so querying the base table would happily return the
    wrong kind of resource.
    """
    ticket, _, _ = await _ticket_with_two_tasks(db)

    assert await entity_exists(db, entity=STATION, uuid=ticket.uuid) is None


@pytest.mark.asyncio
async def test_entity_exists_returns_none_for_an_unknown_uuid(db):
    """The endpoint turns this into a 404."""
    assert await entity_exists(db, entity=TICKET, uuid=uuidlib.uuid4()) is None


# --- fetching down both access paths (ADR-132) ---


def _audit(table, action, row_id, *, old=None, new=None, at=None, user=None):
    """An audit row shaped exactly the way `audit_trigger_func()` writes one."""
    return AuditLog(
        uuid=uuidlib.uuid4(), table_name=table, action=action, row_id=row_id,
        old_values=old, new_values=new, user_uuid=user, client_ip="10.0.0.1",
        created_at=at or datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_a_cancelled_assignment_is_still_in_the_timeline(db):
    """The whole reason ADR-132 exists.

    `unassign_task_actor` hard-deletes the assignment row, so its row_id can no longer be
    derived from ticket_tasks — the row-id path finds nothing. Only the payload lookup
    reaches it, and "somebody took this task and then dropped it" is exactly the history
    worth having.
    """
    ticket, tasks, actor = await _ticket_with_two_tasks(db)
    dead_assignment = uuidlib.uuid4()  # never present in task_assignments
    payload = {"task_uuid": str(tasks[0].uuid), "actor_uuid": str(actor.uuid)}
    db.add(_audit("task_assignments", "INSERT", dead_assignment, new=payload))
    db.add(_audit("task_assignments", "DELETE", dead_assignment, old=payload))
    await db.flush()

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)
    assert dead_assignment not in ids.row_ids, "precondition: unreachable by row_id"

    rows, _ = await fetch_audit_rows(db, ids=ids)

    actions = {r.action for r in rows if r.row_id == dead_assignment}
    assert actions == {"INSERT", "DELETE"}


@pytest.mark.asyncio
async def test_a_live_assignment_is_not_returned_twice(db):
    """It matches both access paths, so the union has to de-duplicate."""
    ticket, tasks, actor = await _ticket_with_two_tasks(db)
    live = (await db.execute(
        select(TaskAssignment).where(TaskAssignment.task_uuid == str(tasks[0].uuid))
    )).scalars().first()
    db.add(_audit(
        "task_assignments", "INSERT", live.uuid,
        new={"task_uuid": str(tasks[0].uuid), "actor_uuid": str(actor.uuid)},
    ))
    await db.flush()

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)
    rows, _ = await fetch_audit_rows(db, ids=ids)

    assert len([r for r in rows if r.row_id == live.uuid]) == 1


@pytest.mark.asyncio
async def test_truncation_is_reported_rather_than_silent(db):
    """Past the cap the caller is told, instead of quietly receiving a partial history."""
    ticket, _, _ = await _ticket_with_two_tasks(db)
    for _ in range(6):
        db.add(_audit("tickets", "UPDATE", ticket.uuid, old={"status": "a"},
                      new={"status": "b"}))
    await db.flush()

    ids = await resolve_scope_ids(db, entity=TICKET, uuid=ticket.uuid)
    rows, truncated = await fetch_audit_rows(db, ids=ids, cap=3)

    assert truncated is True
    assert len(rows) == 3


# --- event folding and derivation (ADR-134/135/136/137) ---


def _at(offset=0):
    from datetime import UTC, datetime

    return datetime(2026, 8, 21, 9, 0, tzinfo=UTC) + timedelta(minutes=offset)


def test_creating_a_resource_is_one_event_not_two():
    """ADR-134: base_geometries + tickets share a row_id and a transaction timestamp."""
    row_id = uuidlib.uuid4()
    at = _at()
    events = build_events([
        _audit("base_geometries", "INSERT", row_id, new={"property_name": "request"}, at=at),
        _audit("tickets", "INSERT", row_id, new={"title": "需要飲用水"}, at=at),
    ])

    assert len(events) == 1
    assert events[0].event_type == CREATED
    assert events[0].tables == {"base_geometries", "tickets"}


def test_a_soft_delete_reads_as_deleted_not_updated():
    """ADR-135: it is an UPDATE on base_geometries, and the subclass table is untouched.

    Reported literally, "who deleted this ticket" would have no answer at all.
    """
    events = build_events([
        _audit("base_geometries", "UPDATE", uuidlib.uuid4(),
               old={"delete_at": None}, new={"delete_at": "2026-08-22T14:00:00Z"}),
    ])

    assert events[0].event_type == DELETED


def test_undeleting_reads_as_restored():
    """The reverse transition on delete_at is a restore, not a plain edit (ADR-135)."""
    events = build_events([
        _audit("base_geometries", "UPDATE", uuidlib.uuid4(),
               old={"delete_at": "2026-08-22T14:00:00Z"}, new={"delete_at": None}),
    ])

    assert events[0].event_type == RESTORED


def test_assignment_rows_get_their_own_event_types():
    """Taking and dropping a task are distinct events, not two "updates"."""
    payload = {"task_uuid": str(uuidlib.uuid4())}
    events = build_events([
        _audit("task_assignments", "INSERT", uuidlib.uuid4(), new=payload, at=_at(0)),
        _audit("task_assignments", "DELETE", uuidlib.uuid4(), old=payload, at=_at(1)),
    ])

    assert [e.event_type for e in events] == [UNASSIGNED, ASSIGNED]  # newest first


def test_only_columns_that_moved_become_changes():
    """An edit that rewrites a row must not report every column as changed."""
    events = build_events([
        _audit("tickets", "UPDATE", uuidlib.uuid4(),
               old={"title": "同", "status": "pending", "priority": "medium"},
               new={"title": "同", "status": "in_progress", "priority": "high"}),
    ])

    assert {c.field for c in events[0].changes} == {"status", "priority"}


def test_events_are_newest_first():
    """The timeline reads top-down from the most recent change."""
    rows = [
        _audit("tickets", "UPDATE", uuidlib.uuid4(), new={"status": "a"}, at=_at(0)),
        _audit("tickets", "UPDATE", uuidlib.uuid4(), new={"status": "b"}, at=_at(5)),
        _audit("tickets", "UPDATE", uuidlib.uuid4(), new={"status": "c"}, at=_at(2)),
    ]

    events = build_events(rows)

    assert [e.at for e in events] == [_at(5), _at(2), _at(0)]


# --- actor derivation (ADR-136/137) ---


def test_a_null_actor_is_the_system_not_a_missing_person():
    """A NULL user_uuid means nobody, not a lost reference.

    ADR-136: app.current_user_id is only set on HTTP requests, so every seed, migration and
    background write lands unattributed.
    """
    events = build_events([_audit("tickets", "UPDATE", uuidlib.uuid4(), new={"status": "a"})])

    assert events[0].actor_uuid is None
    assert events[0].actor_kind == "system"


def test_a_crawler_insert_is_attributed_to_the_crawler():
    """ADR-137: source refines a system write, but only on INSERT."""
    events = build_events([
        _audit("stations", "INSERT", uuidlib.uuid4(),
               new={"name": "光復國小", "source": "crawler"}),
    ])

    assert events[0].actor_kind == "crawler"


def test_a_person_editing_a_crawler_row_is_not_the_crawler():
    """The trap ADR-137 exists to avoid.

    A crawler-created station keeps source='crawler' forever, so the value is still sitting
    in the payload of every later edit — including edits made by a human being.
    """
    someone = uuidlib.uuid4()
    events = build_events([
        _audit("stations", "UPDATE", uuidlib.uuid4(),
               old={"op_hour": "0800-1700", "source": "crawler"},
               new={"op_hour": "24h", "source": "crawler"}, user=someone),
    ])

    assert events[0].actor_kind == "user"
    assert events[0].actor_uuid == someone


def test_a_system_update_stays_system_and_is_never_guessed():
    """No user and not an INSERT: there is nothing to attribute it to, so it is not guessed."""
    events = build_events([
        _audit("stations", "UPDATE", uuidlib.uuid4(),
               old={"op_hour": "0800-1700", "source": "crawler"},
               new={"op_hour": "24h", "source": "crawler"}),
    ])

    assert events[0].actor_kind == "system"


def test_an_unrecognised_source_does_not_invent_a_kind():
    """`source` has no enum or constraint anywhere (ADR-137), so it holds arbitrary text."""
    events = build_events([
        _audit("stations", "INSERT", uuidlib.uuid4(), new={"source": "whatever"}),
    ])

    assert events[0].actor_kind == "system"
