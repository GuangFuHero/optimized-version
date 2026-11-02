"""Read-only candidate queries for the fast dedup layer.

Open candidates:

- A task is a candidate if it is not fulfilled, canceled or deleted, and its ticket is not
  deleted or cancelled. A `completed` ticket stays in because it can get new tasks. Cancelling
  a ticket leaves its tasks open, so the query checks the ticket status too.
- A task has no location or phone of its own: distance is measured from its ticket, and the
  phone is the ticket's. So each task comes back with its full `Tickets` row.
- Inside one building, a task whose ticket is on another floor is not a candidate (ADR-451):
  both tickets filed in the same building map, each with its floor, and the floors differ.
- A station is a candidate if it is not deleted, is active or temporarily closed, and is not a
  temporary station past its expiry time. `stations.geometry` is a generic GEOMETRY column, so
  distance is measured from the station's centroid.
"""

import uuid as _uuid
from datetime import datetime
from typing import NamedTuple

from geoalchemy2 import Geography
from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.dedup_engine.contract import GeoPoint
from app.models.geo import BaseGeometry, BuildingMapTicketMap, Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TicketTask

CLOSED_TASK_STATUSES = ("fulfilled", "canceled")
CANCELLED_TICKET_STATUS = "cancelled"
OPEN_STATION_STATUSES = ("active", "temporarily_closed")

# Use a bare `geography` cast. geoalchemy2's default `Geography()` renders
# `geography(GEOMETRY,-1)`, which Postgres does not match against the `::geography`
# expression indexes on base_geometries, so every submission would scan all geometry rows.
_GEOGRAPHY = Geography(geometry_type=None)


def _point(at: GeoPoint):
    return cast(func.ST_SetSRID(func.ST_MakePoint(at.lon, at.lat), 4326), _GEOGRAPHY)


def _ticket_geography():
    """The index `ix_base_geometries_geography` serves this expression."""
    return cast(Tickets.geometry, _GEOGRAPHY)


def _ticket_distance(at: GeoPoint):
    return func.ST_Distance(_ticket_geography(), _point(at)).label("distance_m")


def _station_geography():
    """The index `ix_base_geometries_centroid_geography` serves this expression."""
    return cast(func.ST_Centroid(Station.geometry), _GEOGRAPHY)


def _is_uuid(value: str) -> bool:
    try:
        _uuid.UUID(str(value))
    except ValueError:
        return False
    return True


class TicketAnchor(NamedTuple):
    """Where a new task on an existing ticket is compared from: the ticket's point, phone and floor."""

    location: GeoPoint
    contact_phone: str | None
    building_map_uuid: str | None = None
    floor: str | None = None


async def ticket_anchor(db: AsyncSession, ticket_uuid: str) -> TicketAnchor | None:
    """Return the ticket's point and contact phone, and its building and floor if filed in one.

    Returns None if the ticket does not exist, is deleted or has no point. A building since deleted
    counts as none, as its tickets are untied from it (ADR-386).
    """
    if not _is_uuid(ticket_uuid):
        return None
    # Aliased: a ticket's own row in base_geometries is already in the FROM clause.
    building = aliased(BaseGeometry)
    row = (
        await db.execute(
            select(
                func.ST_X(Tickets.geometry),
                func.ST_Y(Tickets.geometry),
                Tickets.contact_phone,
                building.uuid,
                SecondaryLocation.floor,
            )
            .select_from(Tickets)
            .outerjoin(BuildingMapTicketMap, BuildingMapTicketMap.ticket_uuid == Tickets.uuid)
            .outerjoin(
                building,
                and_(building.uuid == BuildingMapTicketMap.building_map_uuid, building.delete_at.is_(None)),
            )
            .outerjoin(SecondaryLocation, SecondaryLocation.geometry_uuid == Tickets.uuid)
            .where(Tickets.uuid == ticket_uuid, Tickets.delete_at.is_(None), Tickets.geometry.isnot(None))
        )
    ).first()
    if row is None or row[0] is None:
        return None
    building_uuid = None if row[3] is None else str(row[3])
    floor = (row[4] or None) if building_uuid else None
    return TicketAnchor(GeoPoint(float(row[0]), float(row[1])), row[2], building_uuid, floor)


async def open_tasks_near(
    db: AsyncSession,
    *,
    at: GeoPoint,
    radius_m: float,
    exclude_ticket_uuid: str | None = None,
    building_map_uuid: str | None = None,
    floor: str | None = None,
) -> list[tuple[TicketTask, Tickets, float]]:
    """Open tasks whose ticket is within `radius_m` of `at`, each with its distance in meters.

    Given the building and floor the submission is filed on, a ticket filed in that building on
    another floor is left out (ADR-451). One that gives no floor is kept, as is every ticket when
    the submission gives none or is not in a building.
    """
    query = (
        select(TicketTask, Tickets, _ticket_distance(at))
        .join(Tickets, TicketTask.ticket_uuid == Tickets.uuid)
        .where(
            TicketTask.delete_at.is_(None),
            TicketTask.status.notin_(CLOSED_TASK_STATUSES),
            Tickets.delete_at.is_(None),
            Tickets.status != CANCELLED_TICKET_STATUS,
            Tickets.geometry.isnot(None),
            func.ST_DWithin(_ticket_geography(), _point(at), radius_m),
        )
    )
    if exclude_ticket_uuid:
        query = query.where(Tickets.uuid != exclude_ticket_uuid)
    if building_map_uuid and floor:
        another_floor = (
            select(BuildingMapTicketMap.ticket_uuid)
            .join(SecondaryLocation, SecondaryLocation.geometry_uuid == BuildingMapTicketMap.ticket_uuid)
            .where(
                BuildingMapTicketMap.ticket_uuid == Tickets.uuid,
                BuildingMapTicketMap.building_map_uuid == building_map_uuid,
                SecondaryLocation.floor.is_not(None),
                SecondaryLocation.floor != "",
                SecondaryLocation.floor != floor,
            )
        )
        query = query.where(~another_floor.exists())
    return [(task, ticket, float(distance)) for task, ticket, distance in (await db.execute(query)).all()]


async def task_with_distance(
    db: AsyncSession, *, task_uuid: str, at: GeoPoint
) -> tuple[TicketTask, Tickets, float] | None:
    """One task (open or closed), its ticket, and the distance in meters.

    Returns None if the task or its ticket does not exist or is deleted.
    """
    if not _is_uuid(task_uuid):
        return None
    row = (
        await db.execute(
            select(TicketTask, Tickets, _ticket_distance(at))
            .join(Tickets, TicketTask.ticket_uuid == Tickets.uuid)
            .where(TicketTask.uuid == task_uuid, TicketTask.delete_at.is_(None), Tickets.delete_at.is_(None))
        )
    ).first()
    return None if row is None else (row[0], row[1], float(row[2]))


async def open_stations_near(
    db: AsyncSession, *, at: GeoPoint, radius_m: float, now: datetime
) -> list[tuple[Station, float]]:
    """Serving stations within `radius_m` of `at`, each with its distance in meters."""
    geography = _station_geography()
    query = select(Station, func.ST_Distance(geography, _point(at)).label("distance_m")).where(
        Station.delete_at.is_(None),
        Station.geometry.isnot(None),
        Station.operational_status.in_(OPEN_STATION_STATUSES),
        or_(Station.is_temporary.is_(False), Station.expires_at.is_(None), Station.expires_at >= now),
        func.ST_DWithin(geography, _point(at), radius_m),
    )
    return [(station, float(distance)) for station, distance in (await db.execute(query)).all()]


async def station_with_distance(
    db: AsyncSession, *, station_uuid: str, at: GeoPoint
) -> tuple[Station, float] | None:
    """One station (serving or not) and its distance in meters.

    Returns None if the station does not exist or is deleted.
    """
    if not _is_uuid(station_uuid):
        return None
    row = (
        await db.execute(
            select(Station, func.ST_Distance(_station_geography(), _point(at))).where(
                Station.uuid == station_uuid, Station.delete_at.is_(None)
            )
        )
    ).first()
    return None if row is None else (row[0], float(row[1]))
