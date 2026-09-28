"""Two-phase create: hint instead of creating, or create and card the acknowledged pair (ADR-296/299).

A stub engine decides whether there is a match; the database is real, so atomicity and the
fail-open path (which rolls the shared session back) are tested as they run.
"""

import os
import uuid as uuid_mod

os.environ["ENV"] = "testing"

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.dedup_engine import registry
from app.dedup_engine.contract import Match
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.services import dedup as dedup_service
from app.services.dedup_submission import Created, Suspected, submit_station, submit_ticket
from app.services.notification_service import NotificationService
from tests.dedup_helpers import StubEngine, actor_with

pytestmark = pytest.mark.asyncio

LON, LAT = 121.5601, 23.6701
POINT = {"type": "Point", "coordinates": [LON, LAT]}


@pytest.fixture
def engine(monkeypatch) -> StubEngine:
    """Matches the first nearby candidate unless the test says otherwise."""
    stub = StubEngine(matches=lambda cands: [Match(c.snapshot.uuid, 0.95, {}) for c in cands][:1])
    monkeypatch.setattr(registry, "_ENGINE", stub)
    return stub


@pytest.fixture(autouse=True)
def _no_notifications(monkeypatch):
    """Station creation notifies; record instead of sending."""
    sent = []

    async def record(db_, **kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(NotificationService, "dispatch", record)
    return sent


def _ticket_input(**overrides) -> dict:
    fields = {
        "geometry": POINT,
        "title": "民生街淹水需要抽水機",
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


def _station_input(**overrides) -> dict:
    fields = {
        "geometry": POINT,
        "type": "shelter",
        "name": "光復國小臨時收容所",
        "description": "可收容 200 人",
        "op_hour": "24h",
        "level": 0,
        "comment": None,
        "source": "manual",
        "visibility": "public",
    }
    return fields | overrides


async def _existing_ticket(db, actor) -> str:
    """Commit an open ticket at the spot. The test fixture expires on commit, so reload the actor."""
    owner = str(actor.uuid)
    ticket = Tickets(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        title="民生街淹水",
        status="pending",
        priority="high",
        visibility="public",
        contact_name="李",
        created_by=owner,
        created_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    db.add(ticket)
    await db.flush()
    uuid = str(ticket.uuid)
    await db.commit()
    await db.refresh(actor)
    return uuid


async def _existing_station(db, actor) -> str:
    """Commit a serving station at the spot, then reload the actor."""
    owner = str(actor.uuid)
    station = Station(
        geometry=from_shape(Point(LON, LAT), srid=4326),
        name="光復國小收容所",
        type="shelter",
        level=0,
        visibility="public",
        operational_status="active",
        created_by=owner,
    )
    db.add(station)
    await db.flush()
    uuid = str(station.uuid)
    await db.commit()
    await db.refresh(actor)
    return uuid


async def _count(db, model) -> int:
    return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _events(db) -> list[str]:
    return list((await db.execute(select(DedupAuditEvent.event_type))).scalars())


# --- tickets -----------------------------------------------------------------------------


async def test_a_match_returns_the_hint_and_creates_nothing(db, engine):
    """First submission next to an open ticket: Suspected, no new ticket, one hint_shown."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    existing = await _existing_ticket(db, actor)

    result = await submit_ticket(db, actor=actor, acknowledged_duplicate_of=None, **_ticket_input())

    assert result == Suspected(related_uuid=existing)
    await db.rollback()  # proves the audit row was committed
    assert await _count(db, Tickets) == 1
    assert await _events(db) == ["hint_shown"]


async def test_no_match_creates_and_writes_no_dedup_rows(db, engine):
    """Nothing nearby: the ticket is created and dedup leaves no trace."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    result = await submit_ticket(db, actor=actor, acknowledged_duplicate_of=None, **_ticket_input())
    assert isinstance(result, Created)
    ticket_uuid = result.entity.uuid
    await db.rollback()
    assert (
        await db.execute(select(Tickets.status).where(Tickets.uuid == ticket_uuid))
    ).scalar_one() == "pending"
    assert await _count(db, DedupAuditEvent) == 0


async def test_acknowledged_creates_and_cards_the_pair_without_checking_again(db, engine):
    """Filing anyway: created, a dup_ignored card, an ignored_by_submitter event — and rank is not called."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    existing = await _existing_ticket(db, actor)

    result = await submit_ticket(db, actor=actor, acknowledged_duplicate_of=existing, **_ticket_input())

    assert isinstance(result, Created)
    assert engine.rank_calls == []
    await db.rollback()
    assert await _count(db, Tickets) == 2
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert pair.status == "dup_ignored"
    assert await _events(db) == ["ignored_by_submitter"]


async def test_acknowledged_create_is_atomic(db, engine, monkeypatch):
    """If recording the pair fails after the card is written, neither the ticket nor the card survive."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    existing = await _existing_ticket(db, actor)
    original = dedup_service.record_acknowledged

    async def write_then_fail(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("disk full")

    monkeypatch.setattr(dedup_service, "record_acknowledged", write_then_fail)
    with pytest.raises(RuntimeError):
        await submit_ticket(db, actor=actor, acknowledged_duplicate_of=existing, **_ticket_input())
    await db.rollback()
    assert await _count(db, Tickets) == 1
    assert await _count(db, DuplicatePair) == 0
    assert await _count(db, DedupAuditEvent) == 0


@pytest.mark.parametrize(
    ("perms", "overrides", "error"),
    [
        ((), {}, HTTPException),
        ((Perm.TICKET_ADD,), {"geometry": {"type": "Point", "coordinates": [999, 999]}}, ValueError),
        ((Perm.TICKET_ADD,), {"disaster_types": ["meteor"]}, ValueError),
    ],
    ids=["no-permission", "bad-coordinates", "unknown-disaster"],
)
async def test_invalid_input_fails_before_the_duplicate_check(db, engine, perms, overrides, error):
    """A request that could not create never reveals whether a duplicate exists."""
    actor = await actor_with(db, *perms)
    await _existing_ticket(db, actor)
    with pytest.raises(error):
        await submit_ticket(db, actor=actor, acknowledged_duplicate_of=None, **_ticket_input(**overrides))
    assert engine.rank_calls == []
    await db.rollback()
    assert await _count(db, DedupAuditEvent) == 0


async def test_an_engine_failure_still_creates(db, engine):
    """Fail-open on a real session: the rollback does not take the create down with it."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    await _existing_ticket(db, actor)
    engine.fail_rank = True

    result = await submit_ticket(db, actor=actor, acknowledged_duplicate_of=None, **_ticket_input())

    assert isinstance(result, Created)
    await db.rollback()
    assert await _count(db, Tickets) == 2
    assert await _count(db, DedupAuditEvent) == 0


@pytest.mark.parametrize("target", ["missing", "malformed"])
async def test_acknowledging_something_that_is_not_there_still_creates(db, engine, target):
    """Nothing to pair with: created, no card."""
    actor = await actor_with(db, Perm.TICKET_ADD)
    uuid = str(uuid_mod.uuid4()) if target == "missing" else "not-a-uuid"
    result = await submit_ticket(db, actor=actor, acknowledged_duplicate_of=uuid, **_ticket_input())
    assert isinstance(result, Created)
    await db.rollback()
    assert await _count(db, Tickets) == 1
    assert await _count(db, DuplicatePair) == 0


# --- stations ----------------------------------------------------------------------------


async def test_station_match_returns_the_hint_and_does_not_notify(db, engine, _no_notifications):
    """Suspected, nothing created, nobody notified."""
    actor = await actor_with(db, Perm.STATION_ADD)
    existing = await _existing_station(db, actor)
    result = await submit_station(db, actor=actor, acknowledged_duplicate_of=None, **_station_input())
    assert result == Suspected(related_uuid=existing)
    assert _no_notifications == []
    await db.rollback()
    assert await _count(db, Station) == 1


async def test_station_no_match_creates_and_notifies(db, engine, _no_notifications):
    """Created, and the resource_station_updated notice goes out as it does from create_station."""
    actor = await actor_with(db, Perm.STATION_ADD)
    result = await submit_station(db, actor=actor, acknowledged_duplicate_of=None, **_station_input())
    assert isinstance(result, Created)
    assert [n["event_type"] for n in _no_notifications] == ["resource_station_updated"]


async def test_station_acknowledged_creates_cards_and_notifies(db, engine, _no_notifications):
    """Filing a station anyway: created, carded, notified; no second check."""
    actor = await actor_with(db, Perm.STATION_ADD)
    existing = await _existing_station(db, actor)
    result = await submit_station(db, actor=actor, acknowledged_duplicate_of=existing, **_station_input())
    assert isinstance(result, Created)
    assert engine.rank_calls == []
    assert len(_no_notifications) == 1
    await db.rollback()
    pair = (await db.execute(select(DuplicatePair))).scalar_one()
    assert (pair.entity_kind, pair.status) == ("station", "dup_ignored")
