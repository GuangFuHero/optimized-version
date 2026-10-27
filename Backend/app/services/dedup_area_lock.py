"""Queue submissions in one area so the later one sees the earlier one (ADR-396).

The two-phase create asks the engine, then inserts, then commits. Two submissions at the same
place that both ask before either commits see nothing and are both created. Taking a lock on the
area first makes the second wait until the first has committed, so its check finds it.

The area is the submission point's H3 cell and the ring around it. Two points closer than
`AREA_LOCK_MAX_RADIUS_M` have cells at most 2 apart, so their lock sets share a cell. Keys are
taken in ascending order, so two submissions never hold each other's keys.

Transaction-scoped advisory locks: released by the submission's commit (including the commit of
a held submission's `hint_shown`) or rollback. Waiting is capped at `AREA_LOCK_TIMEOUT_MS`; past
that the submission goes on unlocked (fail-open), which is the behaviour before the lock.
"""

import logging

from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.dedup_engine.contract import GeoPoint
from app.models.request import Tickets
from app.services.dedup import AREA_LOCK_TIMEOUT_MS

logger = logging.getLogger(__name__)

# About 1 km across (app/db/h3.py); with the ring, comfortably wider than any engine radius so far.
AREA_LOCK_H3_RESOLUTION = 8

_LOCK_NOT_AVAILABLE = "55P03"

_AREA_KEYS_SQL = text(
    "SELECT c::bigint FROM h3_grid_disk(h3_lat_lng_to_cell("
    "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :res), 1) AS c ORDER BY 1"
)


async def area_keys(conn: AsyncConnection | AsyncSession, at: GeoPoint) -> list[int]:
    """The advisory-lock keys of the area around `at`, in the order they are taken."""
    rows = await conn.execute(_AREA_KEYS_SQL, {"lon": at.lon, "lat": at.lat, "res": AREA_LOCK_H3_RESOLUTION})
    return list(rows.scalars())


async def lock_area_at(db: AsyncSession, at: GeoPoint) -> None:
    """Hold the area around `at` until this transaction ends, or give up after the cap."""
    keys = await area_keys(db, at)
    try:
        async with db.begin_nested():
            # Local to the savepoint: rolled back with it on a timeout, restored below otherwise.
            previous = await db.scalar(text("SELECT current_setting('lock_timeout')"))
            await db.execute(
                text("SELECT set_config('lock_timeout', :v, true)"), {"v": f"{AREA_LOCK_TIMEOUT_MS}ms"}
            )
            for key in keys:
                await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})
            await db.execute(text("SELECT set_config('lock_timeout', :v, true)"), {"v": previous})
    except DBAPIError as err:
        if _sqlstate(err) != _LOCK_NOT_AVAILABLE:
            raise
        # Rolling back the savepoint released the keys it had taken.
        logger.warning(
            "dedup area lock not granted within %d ms at (%s, %s); submitting without it",
            AREA_LOCK_TIMEOUT_MS,
            at.lon,
            at.lat,
        )


async def lock_area_of_ticket(db: AsyncSession, ticket_uuid: str) -> None:
    """`lock_area_at` the ticket's position, as `app/db/h3.py` places a ticket."""
    surface = func.ST_PointOnSurface(Tickets.geometry)
    lon, lat = (
        await db.execute(select(func.ST_X(surface), func.ST_Y(surface)).where(Tickets.uuid == ticket_uuid))
    ).one()
    await lock_area_at(db, GeoPoint(lon, lat))


def _sqlstate(err: DBAPIError) -> str | None:
    return getattr(err.orig, "sqlstate", None) or getattr(err.orig, "pgcode", None)
