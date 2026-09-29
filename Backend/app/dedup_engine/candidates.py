"""Candidate queries for fast-v2 (ADR-304): read-only, owned by the engine.

What counts as an open candidate is Spec 019's (2026-09-29, task level):

- A task is a candidate while it is neither fulfilled nor canceled and not deleted, under a
  ticket that is not deleted and not cancelled. A `completed` ticket stays in — it can take a
  new task — and cancelling a ticket does not cancel its tasks, hence the ticket check.
- A task has no location of its own: distance is measured from its ticket.
- A station is a candidate while it is not deleted, is active or temporarily closed, and is not
  a temporary station past its expiry. `stations.geometry` is a generic GEOMETRY column, so it
  is measured from its centroid.

Nothing here writes: the backend runs the engine inside a savepoint it always rolls back.
"""

import uuid as _uuid
from datetime import datetime

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


def _point(at: GeoPoint):
    return cast(func.ST_SetSRID(func.ST_MakePoint(at.lon, at.lat), 4326), Geography)


def _ticket_distance(at: GeoPoint):
    return func.ST_Distance(cast(Tickets.geometry, Geography), _point(at)).label("distance_m")


def _station_geography():
    return cast(func.ST_Centroid(Station.geometry), Geography)


def _is_uuid(value: str) -> bool:
    try:
        _uuid.UUID(str(value))
    except ValueError:
        return False
    return True


async def ticket_location(db: AsyncSession, ticket_uuid: str) -> GeoPoint | None:
    """Where a live ticket is, or None if it is missing, deleted or has no point."""
    if not _is_uuid(ticket_uuid):
        return None
    row = (
        await db.execute(
            select(func.ST_X(Tickets.geometry), func.ST_Y(Tickets.geometry)).where(
                Tickets.uuid == ticket_uuid, Tickets.delete_at.is_(None), Tickets.geometry.isnot(None)
            )
        )
    ).first()
    return None if row is None or row[0] is None else GeoPoint(float(row[0]), float(row[1]))


async def open_tasks_near(
    db: AsyncSession, *, at: GeoPoint, radius_m: float, exclude_ticket_uuid: str | None = None
) -> list[tuple[TicketTask, Tickets, float]]:
    """Every open task whose ticket lies within `radius_m` of `at`, with that distance."""
    query = (
        select(TicketTask, Tickets, _ticket_distance(at))
        .join(Tickets, TicketTask.ticket_uuid == Tickets.uuid)
        .where(
            TicketTask.delete_at.is_(None),
            TicketTask.status.notin_(CLOSED_TASK_STATUSES),
            Tickets.delete_at.is_(None),
            Tickets.status != CANCELLED_TICKET_STATUS,
            Tickets.geometry.isnot(None),
            func.ST_DWithin(cast(Tickets.geometry, Geography), _point(at), radius_m),
        )
    )
    if exclude_ticket_uuid:
        query = query.where(Tickets.uuid != exclude_ticket_uuid)
    return [(task, ticket, float(distance)) for task, ticket, distance in (await db.execute(query)).all()]


async def task_with_distance(
    db: AsyncSession, *, task_uuid: str, at: GeoPoint
) -> tuple[TicketTask, Tickets, float] | None:
    """One named task, open or not, unless it or its ticket is deleted."""
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
    """Every serving station within `radius_m` of `at`, with its distance."""
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
    """One named station, serving or not, unless it is deleted."""
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
