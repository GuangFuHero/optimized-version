"""Submissions in one area queue, so the later one sees the earlier one (ADR-396, PR #132).

ADR-419 adds the site's help request, ADR-420 caps the whole wait, ADR-421 rounds the logged
point, and ADR-422 gives stations their own keys.

Two submissions that ask the engine before either commits both get created with no hint. Each
race test pauses the first submission after its insert, before its commit, starts the second on
another connection, waits until Postgres shows it waiting on a lock, then lets the first commit.
The guard tests check the geometry the lock relies on: the engine's radius must fit inside it.
"""

import os

os.environ["ENV"] = "testing"

import asyncio
import logging
import time

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.dedup_engine import registry
from app.dedup_engine.contract import GeoPoint
from app.dedup_engine.fast import FastEngine
from app.models.auth import User
from app.models.geo import Station
from app.models.ticket_task import TicketTask
from app.services import dedup_area_lock
from app.services import station as station_service
from app.services import ticket as ticket_service
from app.services.dedup import AREA_LOCK_MAX_RADIUS_M, AREA_LOCK_TIMEOUT_MS
from app.services.dedup_submission import (
    SubmissionCreated,
    SubmissionHeld,
    TaskSubmission,
    submit_help_request,
    submit_new_station,
    submit_new_task,
    submit_new_ticket,
)
from app.services.notification_service import NotificationService
from tests.conftest import TEST_DB_URL
from tests.dedup_helpers import actor_with
from tests.test_dedup_submission import LAT, LON, _count, _existing_ticket, _help_request, _station, _ticket

pytestmark = pytest.mark.asyncio

PUMP = {"task_type": "rescue", "task_name": "一樓淹水需要抽水機", "task_description": "水深及膝"}
HERE = GeoPoint(LON, LAT)
FAR = GeoPoint(LON + 0.03, LAT)  # about 3 km east: a different area


@pytest.fixture(autouse=True)
def real_engine(monkeypatch):
    """The shipped engine, so a hold means it really saw the other submission."""
    monkeypatch.setattr(registry, "_ENGINE", FastEngine())


@pytest.fixture(autouse=True)
def no_notifications(monkeypatch):
    """Station notices are not what these tests are about."""

    async def drop(db_, **kwargs):
        return None

    monkeypatch.setattr(NotificationService, "dispatch", drop)


class Connections:
    """Sessions on separate connections, as two users' requests would be."""

    def __init__(self, count: int):
        """`count` engines, and a session on each of the first `count`."""
        self.engines = [create_async_engine(TEST_DB_URL) for _ in range(count)]
        self.sessions = [sessionmaker(e, class_=AsyncSession, expire_on_commit=True)() for e in self.engines]

    async def close(self):
        """Close the sessions, then dispose of the engines."""
        for session in self.sessions:
            await session.close()
        for engine in self.engines:
            await engine.dispose()


async def _as(session, actor):
    user = await session.get(User, actor.uuid)
    user.active_identity = actor.active_identity
    return user


async def _waiting_on_a_lock(engine, task, attempts: int = 200) -> None:
    """Return once another connection to this test's database is blocked on a lock."""
    for _ in range(attempts):
        if task.done():
            raise AssertionError(f"the second submission finished without waiting: {task.result()!r}")
        async with engine.connect() as conn:
            waiting = await conn.scalar(
                text(
                    "SELECT count(*) FROM pg_stat_activity "
                    "WHERE wait_event_type = 'Lock' AND datname = current_database()"
                )
            )
        if waiting:
            return
        await asyncio.sleep(0.02)
    raise AssertionError("the second submission never waited on a lock")


async def _race(db, monkeypatch, actor, module, insert_fn, submits):
    """First submission paused between insert and commit; second queued behind it. Returns both results."""
    original = getattr(module, insert_fn)
    inserted, go = asyncio.Event(), asyncio.Event()
    calls = 0

    async def paused(*args, **kwargs):
        nonlocal calls
        calls += 1
        row = await original(*args, **kwargs)
        if calls == 1:
            inserted.set()
            await go.wait()
        return row

    monkeypatch.setattr(module, insert_fn, paused)
    conns = Connections(3)
    try:
        first = asyncio.create_task(submits[0](conns.sessions[0], await _as(conns.sessions[0], actor)))
        await inserted.wait()
        second = asyncio.create_task(submits[1](conns.sessions[1], await _as(conns.sessions[1], actor)))
        await _waiting_on_a_lock(conns.engines[2], second)
        go.set()
        results = [await first, await second]
    finally:
        await conns.close()
    db.expire_all()
    return results


# --- 27.1: racing submissions at one place: one is created, the other is held ---------------


async def test_racing_new_tickets_create_one(db, monkeypatch):
    """The second new ticket waits for the first, sees its task, and is held."""
    actor = await actor_with(db, Perm.TICKET_ADD)

    async def submit(session, user):
        return await submit_new_ticket(session, actor=user, tasks=[TaskSubmission(**PUMP)], **_ticket())

    results = await _race(db, monkeypatch, actor, ticket_service, "insert_ticket", [submit, submit])

    assert [type(r) for r in results] == [SubmissionCreated, SubmissionHeld]
    assert await _count(db, TicketTask) == 1


async def test_racing_tasks_on_two_tickets_at_one_place_create_one(db, monkeypatch):
    """Same-ticket tasks are not compared (fast-v2 decision 3), so the two go on two tickets."""
    actor = await actor_with(db, Perm.TICKET_ADD, Perm.TICKET_EDIT)
    tickets = [await _existing_ticket(db, actor), await _existing_ticket(db, actor)]

    def submit_to(ticket_uuid):
        async def submit(session, user):
            return await submit_new_task(
                session, actor=user, ticket_uuid=ticket_uuid, task=TaskSubmission(**PUMP)
            )

        return submit

    submits = [submit_to(t) for t in tickets]
    results = await _race(db, monkeypatch, actor, ticket_service, "insert_added_task", submits)

    assert [type(r) for r in results] == [SubmissionCreated, SubmissionHeld]
    assert await _count(db, TicketTask) == 1


async def test_racing_stations_create_one(db, monkeypatch):
    """The second station waits for the first, sees it, and is held."""
    actor = await actor_with(db, Perm.STATION_ADD)

    async def submit(session, user):
        return await submit_new_station(session, actor=user, acknowledged_duplicate_of=None, **_station())

    results = await _race(db, monkeypatch, actor, station_service, "insert_station", [submit, submit])

    assert [type(r) for r in results] == [SubmissionCreated, SubmissionHeld]
    assert await _count(db, Station) == 1


async def test_racing_help_requests_create_one(db, monkeypatch):
    """The site's help request queues like createTicket (ADR-419): the second is held."""
    actor = await actor_with(db, Perm.TICKET_ADD)

    async def submit(session, user):
        return await submit_help_request(session, actor=user, **_help_request(PUMP["task_name"]))

    results = await _race(db, monkeypatch, actor, ticket_service, "insert_help_request", [submit, submit])

    assert [type(r) for r in results] == [SubmissionCreated, SubmissionHeld]
    assert await _count(db, TicketTask) == 1


# --- 27.2 / 27.3: the lock covers the engine's radius ------------------------------------------


async def test_points_within_the_locked_radius_share_a_locked_cell(db):
    """Points AREA_LOCK_MAX_RADIUS_M apart anywhere in Taiwan have cells at most 2 apart.

    Each submission locks its cell and the ring around it, so two lock sets meet exactly then.
    """
    worst = await db.scalar(
        text(
            """
            WITH seed AS (SELECT setseed(0.396)),
            p AS (
                SELECT ST_SetSRID(ST_MakePoint(119.3 + random() * 2.8, 21.8 + random() * 3.6), 4326) AS a,
                       random() * 2 * pi() AS bearing
                FROM seed, generate_series(1, 2000)
            )
            SELECT max(h3_grid_distance(
                h3_lat_lng_to_cell(a, CAST(:res AS int)),
                h3_lat_lng_to_cell(
                    ST_Project(a::geography, CAST(:radius AS float8), bearing)::geometry, CAST(:res AS int)
                )
            ))
            FROM p
            """
        ),
        {"res": dedup_area_lock.AREA_LOCK_H3_RESOLUTION, "radius": AREA_LOCK_MAX_RADIUS_M},
    )
    assert worst <= 2, worst


def test_the_engine_radius_fits_inside_the_lock():
    """If the engine searches further than the lock reaches, racing submissions slip past again."""
    engine = registry.get_engine()
    for kind in ("ticket_task", "station"):
        assert engine.radius_m(kind) <= AREA_LOCK_MAX_RADIUS_M, (
            f"{type(engine).__name__} searches {engine.radius_m(kind):.0f} m for {kind}, beyond "
            f"AREA_LOCK_MAX_RADIUS_M ({AREA_LOCK_MAX_RADIUS_M} m). Coarsen the lock (ADR-396)."
        )


# --- 27.5: a lock it can't get in time does not block the submission --------------------------


async def test_a_lock_held_too_long_is_given_up_and_the_submission_still_goes(db, caplog):
    """Past AREA_LOCK_TIMEOUT_MS the submission goes on unlocked, as before ADR-396, and says so."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    conns = Connections(2)
    try:
        holder = conns.sessions[0]
        await dedup_area_lock.lock_area_at(holder, HERE, kind="ticket")  # held until this session ends
        session = conns.sessions[1]
        started = time.perf_counter()
        with caplog.at_level(logging.WARNING, logger=dedup_area_lock.__name__):
            result = await submit_new_ticket(
                session, actor=await _as(session, actor), tasks=[TaskSubmission(**PUMP)], **_ticket()
            )
        waited = time.perf_counter() - started
        await holder.rollback()
    finally:
        await conns.close()
    db.expire_all()

    assert isinstance(result, SubmissionCreated)
    assert AREA_LOCK_TIMEOUT_MS / 1000 <= waited < AREA_LOCK_TIMEOUT_MS / 1000 + 1.5, waited
    assert "area lock" in caplog.text
    assert await _count(db, TicketTask) == 1


async def test_the_whole_wait_is_capped_not_each_key(db, caplog):
    """Keys freed one by one, each sooner than the cap, still add up past it (ADR-420).

    Waiting key by key, the submission would take every key in turn and never give up.
    """
    keys = await dedup_area_lock.area_keys(db, HERE, kind="ticket")
    conns = Connections(2)
    holder = await conns.engines[0].connect()
    try:
        for key in keys:
            await holder.execute(text("SELECT pg_advisory_lock(:k)"), {"k": key})  # session-level

        async def free_one_by_one():
            for key in keys:
                await asyncio.sleep(AREA_LOCK_TIMEOUT_MS / 1000 / 2)
                await holder.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})

        freeing = asyncio.create_task(free_one_by_one())
        session = conns.sessions[1]
        with caplog.at_level(logging.WARNING, logger=dedup_area_lock.__name__):
            await dedup_area_lock.lock_area_at(session, HERE, kind="ticket")
        await freeing
        await session.rollback()
    finally:
        await holder.close()
        await conns.close()

    assert "area lock not granted" in caplog.text


async def test_the_give_up_log_names_the_area_not_the_point(db, caplog):
    """The exact point is withheld from most readers; the log rounds it to about 250 m (ADR-421)."""
    exact = GeoPoint(121.56037, 23.67113)
    conns = Connections(2)
    try:
        await dedup_area_lock.lock_area_at(conns.sessions[0], exact, kind="ticket")
        with caplog.at_level(logging.WARNING, logger=dedup_area_lock.__name__):
            await dedup_area_lock.lock_area_at(conns.sessions[1], exact, kind="ticket")
        await conns.sessions[0].rollback()
        await conns.sessions[1].rollback()
    finally:
        await conns.close()

    assert "(121.56, 23.67)" in caplog.text
    assert "121.56037" not in caplog.text and "23.67113" not in caplog.text


# --- 27.6: the lock is released ---------------------------------------------------------------


async def _area_is_free(engine, at: GeoPoint) -> bool:
    """Try every ticket key of the area without waiting; true when nobody holds any of them."""
    async with engine.connect() as conn:
        keys = await dedup_area_lock.area_keys(conn, at, kind="ticket")
        taken = [await conn.scalar(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": k}) for k in keys]
        await conn.rollback()
    return all(taken)


async def test_the_lock_is_released_on_commit_on_hold_and_on_rollback(db):
    """Nothing keeps the area after the submission's transaction ends, however it ends."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    conns = Connections(2)
    probe = conns.engines[1]
    session = conns.sessions[0]
    try:
        user = await _as(session, actor)
        created = await submit_new_ticket(session, actor=user, tasks=[TaskSubmission(**PUMP)], **_ticket())
        assert isinstance(created, SubmissionCreated)
        assert await _area_is_free(probe, HERE)

        user = await _as(session, actor)
        held = await submit_new_ticket(session, actor=user, tasks=[TaskSubmission(**PUMP)], **_ticket())
        assert isinstance(held, SubmissionHeld)
        assert await _area_is_free(probe, HERE)

        await dedup_area_lock.lock_area_at(session, HERE, kind="ticket")
        assert not await _area_is_free(probe, HERE)
        await session.rollback()
        assert await _area_is_free(probe, HERE)
    finally:
        await conns.close()


async def test_keys_taken_before_the_timeout_are_released_with_the_savepoint(db):
    """Postgres releases a rolled-back subtransaction's locks; the give-up path relies on that."""
    conns = Connections(3)
    holder, session = conns.sessions[0], conns.sessions[1]
    try:
        keys = await dedup_area_lock.area_keys(await holder.connection(), HERE, kind="ticket")
        await holder.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": keys[-1]})  # only the last
        await dedup_area_lock.lock_area_at(session, HERE, kind="ticket")  # takes the others, then gives up
        async with conns.engines[2].connect() as conn:
            free = [
                await conn.scalar(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": k}) for k in keys[:-1]
            ]
            await conn.rollback()
        await holder.rollback()
        await session.rollback()
    finally:
        await conns.close()

    assert all(free), free


# --- 27.7: another area does not wait --------------------------------------------------------


async def test_a_submission_elsewhere_does_not_wait(db, caplog):
    """A lock held in one area does not hold up a submission about 3 km away.

    Had it waited, it would have given up and logged it; no clock, so a busy runner can't fail it.
    """
    actor = await actor_with(db, Perm.TICKET_ADD)
    conns = Connections(2)
    try:
        holder = conns.sessions[0]
        await dedup_area_lock.lock_area_at(holder, HERE, kind="ticket")
        session = conns.sessions[1]
        far = {"geometry": {"type": "Point", "coordinates": [FAR.lon, FAR.lat]}}
        with caplog.at_level(logging.WARNING, logger=dedup_area_lock.__name__):
            result = await submit_new_ticket(
                session, actor=await _as(session, actor), tasks=[TaskSubmission(**PUMP)], **_ticket(**far)
            )
        await holder.rollback()
    finally:
        await conns.close()

    assert isinstance(result, SubmissionCreated)
    assert "area lock" not in caplog.text


# --- 27.8: stations and tickets never compared, so never queued together ----------------------


async def test_station_and_ticket_keys_never_overlap(db):
    """H3 indexes are positive as bigint; station keys are their negation (ADR-422)."""
    tickets = await dedup_area_lock.area_keys(db, HERE, kind="ticket")
    stations = await dedup_area_lock.area_keys(db, HERE, kind="station")

    assert len(stations) == len(tickets) == 7
    assert all(k > 0 for k in tickets) and all(k < 0 for k in stations)
    assert stations == sorted(stations)


async def test_a_station_does_not_wait_behind_tickets_in_its_area(db, caplog):
    """The engine compares a station only with stations, so a ticket burst need not hold it up."""
    actor = await actor_with(db, Perm.STATION_ADD)
    conns = Connections(2)
    try:
        holder = conns.sessions[0]
        await dedup_area_lock.lock_area_at(holder, HERE, kind="ticket")
        session = conns.sessions[1]
        with caplog.at_level(logging.WARNING, logger=dedup_area_lock.__name__):
            result = await submit_new_station(
                session, actor=await _as(session, actor), acknowledged_duplicate_of=None, **_station()
            )
        await holder.rollback()
    finally:
        await conns.close()

    assert isinstance(result, SubmissionCreated)
    assert "area lock" not in caplog.text
