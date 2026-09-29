"""fast-v2's candidate queries against real PostGIS (Spec 019 task-level rules, ADR-304)."""

import os

os.environ["ENV"] = "testing"

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2 import Geography
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import cast, event, func, select

from app.dedup_engine import candidates
from app.dedup_engine.contract import GeoPoint
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

pytestmark = pytest.mark.asyncio

HERE = GeoPoint(121.5601, 23.6701)
NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
DEG_100M = 0.00098  # ~100 m of longitude at this latitude


async def _owner(db) -> str:
    user = User(name=f"cand-{uuid_mod.uuid4().hex[:6]}")
    db.add(user)
    await db.flush()
    return str(user.uuid)


async def _ticket(db, owner, *, east_deg=0.0, **overrides) -> Tickets:
    fields = {
        "title": "淹水",
        "status": "pending",
        "priority": "high",
        "visibility": "public",
        "contact_name": "王",
    }
    ticket = Tickets(
        geometry=from_shape(Point(HERE.lon + east_deg, HERE.lat), srid=4326),
        created_by=owner,
        **(fields | overrides),
    )
    db.add(ticket)
    await db.flush()
    return ticket


async def _task(db, owner, ticket, **overrides) -> str:
    fields = {"task_type": "rescue", "task_name": "抽水", "status": "pending"}
    task = TicketTask(ticket_uuid=ticket.uuid, created_by=owner, **(fields | overrides))
    db.add(task)
    await db.flush()
    return str(task.uuid)


async def _station(db, owner, *, east_deg=0.0, **overrides) -> str:
    fields = {
        "name": "收容所",
        "type": "shelter",
        "level": 0,
        "visibility": "public",
        "operational_status": "active",
    }
    station = Station(
        geometry=from_shape(Point(HERE.lon + east_deg, HERE.lat), srid=4326),
        created_by=owner,
        **(fields | overrides),
    )
    db.add(station)
    await db.flush()
    return str(station.uuid)


async def _open_task_uuids(db, **kwargs) -> set[str]:
    rows = await candidates.open_tasks_near(db, at=HERE, radius_m=300.0, **kwargs)
    return {str(task.uuid) for task, _, _ in rows}


async def test_open_tasks_follow_the_task_and_ticket_rules(db):
    """Task status and deletion, ticket cancellation and deletion, and the radius all cut."""
    owner = await _owner(db)
    live = await _ticket(db, owner)
    done = await _ticket(db, owner, status="completed")
    cancelled = await _ticket(db, owner, status="cancelled")
    deleted = await _ticket(db, owner, delete_at=NOW)
    far = await _ticket(db, owner, east_deg=DEG_100M * 5)

    pending = await _task(db, owner, live)
    in_progress = await _task(db, owner, live, status="in_progress")
    on_completed_ticket = await _task(db, owner, done)
    await _task(db, owner, live, status="fulfilled")
    await _task(db, owner, live, status="canceled")
    await _task(db, owner, live, delete_at=NOW)
    await _task(db, owner, cancelled)
    await _task(db, owner, deleted)
    await _task(db, owner, far)

    assert await _open_task_uuids(db) == {pending, in_progress, on_completed_ticket}


async def test_a_ticket_without_tasks_is_never_a_candidate(db):
    """Only tasks are compared; a bare ticket brings nothing."""
    owner = await _owner(db)
    await _ticket(db, owner)
    assert await _open_task_uuids(db) == set()


async def test_the_ticket_being_added_to_is_excluded(db):
    """Adding a task to a ticket: that ticket's own tasks are not candidates (019 decision 3)."""
    owner = await _owner(db)
    mine, other = await _ticket(db, owner), await _ticket(db, owner)
    await _task(db, owner, mine)
    theirs = await _task(db, owner, other)
    assert await _open_task_uuids(db, exclude_ticket_uuid=str(mine.uuid)) == {theirs}


async def test_task_distance_is_its_tickets_geography_distance(db):
    """Metres from the ticket's point, as PostGIS measures it."""
    owner = await _owner(db)
    ticket = await _ticket(db, owner, east_deg=DEG_100M)
    await _task(db, owner, ticket)
    ((_, _, distance),) = await candidates.open_tasks_near(db, at=HERE, radius_m=300.0)
    expected = (
        await db.execute(
            select(
                func.ST_Distance(
                    cast(Tickets.geometry, Geography),
                    cast(func.ST_SetSRID(func.ST_MakePoint(HERE.lon, HERE.lat), 4326), Geography),
                )
            ).where(Tickets.uuid == ticket.uuid)
        )
    ).scalar_one()
    assert distance == pytest.approx(expected, abs=0.01)
    assert 95 < distance < 110


async def test_one_named_task_ignores_status_and_radius_but_not_deletion(db):
    """The acknowledged task is measured wherever and however closed it is; a deleted one is gone."""
    owner = await _owner(db)
    far_done = await _ticket(db, owner, east_deg=DEG_100M * 50, status="completed")
    closed = await _task(db, owner, far_done, status="fulfilled")
    gone = await _task(db, owner, await _ticket(db, owner), delete_at=NOW)
    on_deleted_ticket = await _task(db, owner, await _ticket(db, owner, delete_at=NOW))

    task, ticket, distance = await candidates.task_with_distance(db, task_uuid=closed, at=HERE)
    assert (str(task.uuid), str(ticket.uuid)) == (closed, str(far_done.uuid))
    assert distance > 4000
    for uuid in (gone, on_deleted_ticket, str(uuid_mod.uuid4()), "not-a-uuid"):
        assert await candidates.task_with_distance(db, task_uuid=uuid, at=HERE) is None


async def test_ticket_location(db):
    """A live ticket's point; None for deleted, missing or malformed."""
    owner = await _owner(db)
    live = await _ticket(db, owner, east_deg=DEG_100M)
    deleted = await _ticket(db, owner, delete_at=NOW)
    location = await candidates.ticket_location(db, str(live.uuid))
    assert (location.lon, location.lat) == pytest.approx((HERE.lon + DEG_100M, HERE.lat))
    for uuid in (str(deleted.uuid), str(uuid_mod.uuid4()), "nope"):
        assert await candidates.ticket_location(db, uuid) is None


async def test_open_stations_follow_the_station_rules(db):
    """Deleted, permanently closed, expired-temporary and far stations are out."""
    owner = await _owner(db)
    active = await _station(db, owner)
    paused = await _station(db, owner, operational_status="temporarily_closed")
    still_valid = await _station(db, owner, is_temporary=True, expires_at=NOW + timedelta(days=1))
    await _station(db, owner, operational_status="permanently_closed")
    await _station(db, owner, delete_at=NOW)
    await _station(db, owner, is_temporary=True, expires_at=NOW - timedelta(minutes=1))
    await _station(db, owner, east_deg=DEG_100M * 5)

    rows = await candidates.open_stations_near(db, at=HERE, radius_m=300.0, now=NOW)
    assert {str(station.uuid) for station, _ in rows} == {active, paused, still_valid}


async def test_one_named_station(db):
    """Closed or not, unless deleted."""
    owner = await _owner(db)
    closed = await _station(db, owner, operational_status="permanently_closed")
    deleted = await _station(db, owner, delete_at=NOW)
    station, _ = await candidates.station_with_distance(db, station_uuid=closed, at=HERE)
    assert str(station.uuid) == closed
    assert await candidates.station_with_distance(db, station_uuid=deleted, at=HERE) is None
    assert await candidates.station_with_distance(db, station_uuid="nope", at=HERE) is None


async def _plan(db, run_query) -> str:
    """The plan Postgres picks for the query `run_query` sends, with sequential scans priced out.

    Pricing seq scans out keeps an empty test table from hiding whether an index is usable at all.
    """
    connection = await db.connection()
    sent: list[tuple[str, object]] = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        if "ST_DWithin" in statement:
            sent.append((statement, parameters))

    event.listen(connection.sync_connection, "before_cursor_execute", capture)
    try:
        await run_query()
    finally:
        event.remove(connection.sync_connection, "before_cursor_execute", capture)
    await connection.exec_driver_sql("SET LOCAL enable_seqscan = off")
    statement, parameters = sent[0]
    rows = await connection.exec_driver_sql("EXPLAIN " + statement, parameters)
    return "\n".join(row[0] for row in rows)


async def test_the_task_query_can_use_the_geography_index(db):
    """Otherwise every submission scans every geometry row (ADR-305)."""
    plan = await _plan(db, lambda: candidates.open_tasks_near(db, at=HERE, radius_m=300.0))
    assert "ix_base_geometries_geography" in plan, plan


async def test_the_station_query_can_use_the_centroid_geography_index(db):
    """Stations are measured from their centroid, so they need an index on that expression (ADR-305)."""
    plan = await _plan(db, lambda: candidates.open_stations_near(db, at=HERE, radius_m=300.0, now=NOW))
    assert "ix_base_geometries_centroid_geography" in plan, plan
