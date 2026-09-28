"""Candidate retrieval returns facts only: rows and their distance (Spec 020 §1, ADR-287/288).

Real PostGIS: the radius cut, the open filters and the distance are all SQL.
"""

import os

os.environ["ENV"] = "testing"

from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2 import Geography
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import cast, func, select

from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.repositories.dedup_repository import dedup_candidate_repository

pytestmark = pytest.mark.asyncio

LON, LAT = 121.5601, 23.6701
NOW = datetime(2026, 9, 28, 12, 0, tzinfo=UTC)
# ~0.001° of longitude at this latitude is ~102 m.
DEG_100M = 0.00098


async def _user(db) -> str:
    user = User(name="repo-tests")
    db.add(user)
    await db.flush()
    return str(user.uuid)


async def _ticket(db, owner, *, east_deg=0.0, **overrides) -> str:
    fields = {
        "title": "淹水",
        "status": "pending",
        "priority": "high",
        "visibility": "public",
        "contact_name": "王",
        "created_by": owner,
        "created_at": NOW - timedelta(minutes=5),
    }
    ticket = Tickets(geometry=from_shape(Point(LON + east_deg, LAT), srid=4326), **(fields | overrides))
    db.add(ticket)
    await db.flush()
    return str(ticket.uuid)


async def _station(db, owner, *, east_deg=0.0, **overrides) -> str:
    fields = {
        "name": "收容所",
        "type": "shelter",
        "level": 0,
        "visibility": "public",
        "operational_status": "active",
        "created_by": owner,
    }
    station = Station(geometry=from_shape(Point(LON + east_deg, LAT), srid=4326), **(fields | overrides))
    db.add(station)
    await db.flush()
    return str(station.uuid)


async def _nearby(db, kind, radius_m=300.0) -> dict[str, float]:
    rows = await dedup_candidate_repository.nearby_open_rows(
        db, kind=kind, longitude=LON, latitude=LAT, radius_m=radius_m, now=NOW
    )
    return {str(row.uuid): distance for row, distance in rows}


async def test_only_open_tickets_inside_the_radius_come_back(db):
    """Radius, terminal status and soft delete all cut; nothing else does."""
    owner = await _user(db)
    near = await _ticket(db, owner)
    in_progress = await _ticket(db, owner, east_deg=DEG_100M, status="in_progress")
    await _ticket(db, owner, east_deg=DEG_100M * 5)  # ~500 m, outside 300 m
    await _ticket(db, owner, status="completed")
    await _ticket(db, owner, status="cancelled")
    await _ticket(db, owner, delete_at=NOW)
    await db.commit()

    assert set(await _nearby(db, "ticket")) == {near, in_progress}


async def test_only_serving_stations_inside_the_radius_come_back(db):
    """Permanently closed, soft-deleted and expired temporary stations are not candidates."""
    owner = await _user(db)
    active = await _station(db, owner)
    paused = await _station(db, owner, operational_status="temporarily_closed")
    still_valid = await _station(db, owner, is_temporary=True, expires_at=NOW + timedelta(days=1))
    await _station(db, owner, operational_status="permanently_closed")
    await _station(db, owner, delete_at=NOW)
    await _station(db, owner, is_temporary=True, expires_at=NOW - timedelta(minutes=1))
    await _station(db, owner, east_deg=DEG_100M * 5)
    await db.commit()

    assert set(await _nearby(db, "station")) == {active, paused, still_valid}


async def test_distance_is_postgis_geography_metres(db):
    """The distance handed to the engine is ST_Distance on geography, to the centimetre."""
    owner = await _user(db)
    uuid = await _ticket(db, owner, east_deg=DEG_100M)
    await db.commit()

    reported = (await _nearby(db, "ticket"))[uuid]
    point = cast(func.ST_SetSRID(func.ST_MakePoint(LON, LAT), 4326), Geography)
    expected = (
        await db.execute(
            select(func.ST_Distance(cast(Tickets.geometry, Geography), point)).where(Tickets.uuid == uuid)
        )
    ).scalar_one()
    assert reported == pytest.approx(expected, abs=0.01)
    assert 95 < reported < 110


async def test_row_with_distance_ignores_radius_and_status_but_not_soft_delete(db):
    """The acknowledged target is measured wherever it is and whatever its status; a deleted one is gone."""
    owner = await _user(db)
    far_and_closed = await _ticket(db, owner, east_deg=DEG_100M * 50, status="completed")
    deleted = await _ticket(db, owner, delete_at=NOW)
    await db.commit()

    row, distance = await dedup_candidate_repository.row_with_distance(
        db, kind="ticket", uuid=far_and_closed, longitude=LON, latitude=LAT
    )
    assert str(row.uuid) == far_and_closed
    assert distance > 4000
    assert (
        await dedup_candidate_repository.row_with_distance(
            db, kind="ticket", uuid=deleted, longitude=LON, latitude=LAT
        )
        is None
    )
    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        await dedup_candidate_repository.row_with_distance(
            db, kind="ticket", uuid=missing, longitude=LON, latitude=LAT
        )
        is None
    )


async def test_row_with_distance_rejects_a_malformed_uuid(db):
    """A client-supplied uuid that is not a uuid is 'not found', not a database error."""
    assert (
        await dedup_candidate_repository.row_with_distance(
            db, kind="ticket", uuid="nope", longitude=LON, latitude=LAT
        )
        is None
    )
