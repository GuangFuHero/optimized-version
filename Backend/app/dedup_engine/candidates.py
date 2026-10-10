"""Candidate queries for the fast layer (ADR-304). The engine owns the queries. All queries are read-only.

Spec 019 (2026-09-29, task level) defines an open candidate:

- A task is a candidate if all of these are true:
  - The task is not fulfilled, not canceled and not deleted.
  - Its ticket is not deleted and not cancelled.
  A `completed` ticket stays in, because it can get a new task. When a ticket is cancelled, its
  tasks stay open. Thus, the query also checks the ticket status.
- A task does not have its own location. The query measures distance from the ticket of the
  task. The contact phone of a task is the contact phone of its ticket. Thus, each task comes
  back with its full `Tickets` row.
- A station is a candidate if all of these are true:
  - The station is not deleted.
  - Its status is active or temporarily closed.
  - It is not a temporary station after its expiry time.
  `stations.geometry` is a generic GEOMETRY column. Thus, the query measures distance from
  the centroid of the station.

The queries in this module do not write. The backend runs the engine inside a savepoint, and
always rolls the savepoint back.
"""

import uuid as _uuid
from datetime import datetime
from typing import NamedTuple

from geoalchemy2 import Geography
from sqlalchemy import cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup_engine.contract import GeoPoint
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

CLOSED_TASK_STATUSES = ("fulfilled", "canceled")
CANCELLED_TICKET_STATUS = "cancelled"
OPEN_STATION_STATUSES = ("active", "temporarily_closed")

# Use a bare `geography` cast. The default `Geography()` of geoalchemy2 renders
# `geography(GEOMETRY,-1)`. Postgres does not match that cast against the `::geography`
# expression indexes on base_geometries. Then each submission scans all geometry rows (ADR-305).
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
    """The start point for a new task on a ticket that exists: the point and phone of the ticket."""

    location: GeoPoint
    contact_phone: str | None


async def ticket_anchor(db: AsyncSession, ticket_uuid: str) -> TicketAnchor | None:
    """Use `ticket_uuid` to find the point and contact phone of the ticket.

    Returns None if the ticket does not exist, is deleted or does not have a point.
    """
    if not _is_uuid(ticket_uuid):
        return None
    row = (
        await db.execute(
            select(func.ST_X(Tickets.geometry), func.ST_Y(Tickets.geometry), Tickets.contact_phone).where(
                Tickets.uuid == ticket_uuid, Tickets.delete_at.is_(None), Tickets.geometry.isnot(None)
            )
        )
    ).first()
    if row is None or row[0] is None:
        return None
    return TicketAnchor(GeoPoint(float(row[0]), float(row[1])), row[2])


async def open_tasks_near(
    db: AsyncSession, *, at: GeoPoint, radius_m: float, exclude_ticket_uuid: str | None = None
) -> list[tuple[TicketTask, Tickets, float]]:
    """Find all open tasks whose ticket is within `radius_m` of `at`. Each result includes the distance."""
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
    return [(task, ticket, float(distance)) for task, ticket, distance in (await db.execute(query)).all()]


async def task_with_distance(
    db: AsyncSession, *, task_uuid: str, at: GeoPoint
) -> tuple[TicketTask, Tickets, float] | None:
    """Use `task_uuid` to find one task and its ticket, open or closed. Each result includes the distance.

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
    """Find all serving stations within `radius_m` of `at`. Each result includes the distance."""
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
    """Use `station_uuid` to find one station, serving or not. The result includes the distance.

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
