"""fast-v2: task-level fast layer on the ADR-304 contract, against real PostGIS.

The formula is fast-v1's (tests/dedup_engine/test_fast.py pins it); these cover what changed:
the unit is a task, candidates come from the engine's own queries, and each draft gets at most
one suspect.
"""

import os

os.environ["ENV"] = "testing"

import json
import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.dedup_engine.contract import (
    GeoPoint,
    NewStation,
    NewTask,
    NewTicket,
    StationDraft,
    TaskDraft,
    TicketDraft,
)
from app.dedup_engine.fast import STATION_PARAMETERS, TICKET_PARAMETERS, FastEngine, max_hint_distance_m
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

pytestmark = pytest.mark.asyncio

HERE = GeoPoint(121.5601, 23.6701)
NOW = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)
DEG_100M = 0.00098
MARK = "⟦MARK-7f3a⟧"
PUMP = TaskDraft(task_type="rescue", task_name="一樓淹水需要抽水機", task_description="水深及膝")
SUPPLY = TaskDraft(task_type="supply", task_name="需要飲用水", task_description="二十人份")


async def _owner(db) -> str:
    user = User(name=f"v2-{uuid_mod.uuid4().hex[:6]}")
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


async def _task(db, owner, ticket, *, minutes_ago=10.0, uuid=None, **overrides) -> str:
    fields = {
        "task_type": "rescue",
        "task_name": "一樓淹水需要抽水機",
        "task_description": "水深及膝",
        "status": "pending",
    }
    task = TicketTask(
        uuid=uuid or uuid_mod.uuid4(),
        ticket_uuid=ticket.uuid,
        created_by=owner,
        created_at=NOW - timedelta(minutes=minutes_ago),
        **(fields | overrides),
    )
    db.add(task)
    await db.flush()
    return str(task.uuid)


def _new_ticket(*tasks) -> NewTicket:
    return NewTicket(ticket=TicketDraft(location=HERE, title="民生街淹水"), tasks=tuple(tasks))


async def test_each_task_draft_gets_at_most_one_suspect(db):
    """A two-task submission: only the task that looks like an open one is suspected."""
    owner = await _owner(db)
    ticket = await _ticket(db, owner)
    existing = await _task(db, owner, ticket)

    suspects = await FastEngine().check(db, _new_ticket(SUPPLY, PUMP), NOW)

    assert [(s.draft_ref, s.related_kind, s.related_uuid, s.related_ticket_uuid) for s in suspects] == [
        ("task:1", "ticket_task", existing, str(ticket.uuid))
    ]
    assert suspects[0].similarity >= TICKET_PARAMETERS.hint_threshold


async def test_the_ticket_itself_is_never_compared(db):
    """The unit is the task (Spec 019, 2026-09-29): a ticket with no tasks has nothing to match."""
    owner = await _owner(db)
    await _ticket(db, owner, title="民生街淹水")
    assert await FastEngine().check(db, _new_ticket(), NOW) == []


async def test_best_candidate_wins_and_ties_break_on_uuid(db):
    """Several matches for one draft: the highest, then the lowest uuid."""
    owner = await _owner(db)
    near = await _ticket(db, owner)
    a = await _task(db, owner, near, uuid=uuid_mod.UUID("00000000-0000-0000-0000-00000000000a"))
    await _task(db, owner, near, uuid=uuid_mod.UUID("00000000-0000-0000-0000-00000000000b"))
    await _task(db, owner, await _ticket(db, owner, east_deg=DEG_100M * 0.6))

    (suspect,) = await FastEngine().check(db, _new_ticket(PUMP), NOW)
    assert suspect.related_uuid == a


async def test_unrelated_or_far_tasks_are_not_suspected(db):
    """Different need, or beyond the radius: nothing."""
    owner = await _owner(db)
    await _task(
        db, owner, await _ticket(db, owner), task_type="hr", task_name="搬運物資", task_description=None
    )
    await _task(db, owner, await _ticket(db, owner, east_deg=DEG_100M * 3))
    assert await FastEngine().check(db, _new_ticket(PUMP), NOW) == []


async def test_adding_to_a_ticket_skips_its_own_tasks(db):
    """NewTask: located at its ticket, and that ticket's tasks are not candidates (019 decision 3)."""
    owner = await _owner(db)
    mine = await _ticket(db, owner)
    await _task(db, owner, mine)
    other = await _ticket(db, owner, east_deg=DEG_100M * 0.2)
    theirs = await _task(db, owner, other)

    (suspect,) = await FastEngine().check(db, NewTask(ticket_uuid=str(mine.uuid), task=PUMP), NOW)
    assert (suspect.draft_ref, suspect.related_uuid) == ("task:0", theirs)


async def test_adding_to_a_missing_ticket_suspects_nothing(db):
    """No location to search from; the create path reports the missing ticket itself."""
    assert await FastEngine().check(db, NewTask(ticket_uuid=str(uuid_mod.uuid4()), task=PUMP), NOW) == []


async def test_station_matches_have_no_time_component(db):
    """Stations: name/description/type, however old."""
    owner = await _owner(db)
    station = Station(
        geometry=from_shape(Point(HERE.lon, HERE.lat), srid=4326),
        name="光復國小臨時收容所",
        description="可收容 200 人",
        type="shelter",
        level=0,
        visibility="public",
        operational_status="active",
        created_by=owner,
    )
    db.add(station)
    await db.flush()
    draft = StationDraft(
        location=HERE, name="光復國小臨時收容所", description="可收容 200 人", type="shelter"
    )

    (suspect,) = await FastEngine().check(db, NewStation(station=draft), NOW + timedelta(days=3650))

    assert (suspect.draft_ref, suspect.related_kind, suspect.related_uuid) == (
        "station",
        "station",
        str(station.uuid),
    )
    assert [c["name"] for c in suspect.evidence["components"]] == ["distance", "task_type", "text"]


async def test_score_rates_one_named_pair_without_a_threshold(db):
    """For an acknowledged duplicate: the pair's score even if it would not have been suspected."""
    owner = await _owner(db)
    far = await _ticket(db, owner, east_deg=DEG_100M * 20)
    closed = await _task(db, owner, far, status="fulfilled", task_type="hr", task_name="搬運物資")
    engine = FastEngine()

    suspect = await engine.score(db, _new_ticket(PUMP), "task:0", "ticket_task", closed, NOW)
    assert suspect.related_uuid == closed and suspect.related_ticket_uuid == str(far.uuid)
    assert suspect.similarity < TICKET_PARAMETERS.hint_threshold

    assert (
        await engine.score(db, _new_ticket(PUMP), "task:0", "ticket_task", str(uuid_mod.uuid4()), NOW) is None
    )
    assert (
        await engine.score(db, _new_ticket(PUMP), "task:0", "station", closed, NOW) is None
    )  # kind mismatch
    assert (
        await engine.score(db, _new_ticket(PUMP), "task:5", "ticket_task", closed, NOW) is None
    )  # no such draft


async def test_evidence_never_echoes_submitted_text(db):
    """ADR-295."""
    owner = await _owner(db)
    await _task(db, owner, await _ticket(db, owner), task_name=f"{MARK}淹水", task_description=f"{MARK}抽水")
    draft = TaskDraft(task_type="rescue", task_name=f"{MARK}淹水", task_description=f"{MARK}抽水")
    (suspect,) = await FastEngine().check(db, _new_ticket(draft), NOW)
    assert MARK not in json.dumps(suspect.evidence, ensure_ascii=False)


async def test_check_writes_nothing(db):
    """Read-only (ADR-304): the session has nothing pending after a check."""
    owner = await _owner(db)
    await _task(db, owner, await _ticket(db, owner))
    await db.commit()
    await FastEngine().check(db, _new_ticket(PUMP), NOW)
    assert not (db.new or db.dirty or db.deleted)


def test_version_and_radius():
    """fast-v2; the radius is fast-v1's boundary per kind, with the rounding margin."""
    engine = FastEngine()
    assert engine.version == "fast-v2"
    assert engine.radius_m("ticket_task") == pytest.approx(max_hint_distance_m(TICKET_PARAMETERS) * 1.1)
    assert engine.radius_m("station") == pytest.approx(max_hint_distance_m(STATION_PARAMETERS) * 1.1)
