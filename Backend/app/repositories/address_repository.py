"""Queries against the address reference tables (pure data access, ADR-015).

No grading, no status decisions, no error vocabulary — this layer answers "what does the
reference data say" and `app/services/address.py` decides what that means. Every text argument
must already be folded (`app.core.address.fold`); these functions do not fold for you, because
the stored rows were folded at import time and a caller that forgets would silently get zero
matches instead of an error.
"""

from geoalchemy2 import Geography
from sqlalchemy import Float, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.reference import OsmAddressPoint, ReferenceDataset, RefRoad, RefVillage

# pg_trgm's default similarity_threshold. Named here so the fuzzy road query returns the same
# rows the `%` operator's index scan does, rather than depending on a session GUC.
_SIMILARITY_THRESHOLD = 0.3


def _point(lat: float, lng: float):
    """Build a WGS84 point. Note the argument order: ST_MakePoint takes (x=lng, y=lat)."""
    return func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)


async def village_at_point(db: AsyncSession, *, lat: float, lng: float) -> RefVillage | None:
    """Return the 村里 polygon containing this coordinate, or None if it is outside Taiwan.

    This is the only lookup with complete coverage, so it is the floor every reverse lookup
    falls back to when no address point is nearby.
    """
    stmt = select(RefVillage).where(func.ST_Contains(RefVillage.geom, _point(lat, lng))).limit(1)
    return (await db.execute(stmt)).scalars().first()


async def road_exists(db: AsyncSession, *, county: str, town: str, road: str) -> bool:
    """True if this exact road is published for this town in 全國路名資料."""
    stmt = (
        select(RefRoad.road)
        .where(RefRoad.county == county, RefRoad.town == town, RefRoad.road == road)
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None


async def similar_roads(db: AsyncSession, *, county: str, town: str, road: str, limit: int = 3) -> list[str]:
    """Return published roads in this town that trigram-match `road`, best first.

    Feeds the "corrected" status: 中興街 → 中興路. Restricted to one town first, so the trigram
    comparison runs over a few hundred rows rather than all 35.8k.
    """
    score = func.similarity(RefRoad.road, road)
    stmt = (
        select(RefRoad.road)
        .where(
            RefRoad.county == county,
            RefRoad.town == town,
            score >= _SIMILARITY_THRESHOLD,
        )
        .order_by(score.desc(), RefRoad.road)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def roads_in_town(db: AsyncSession, *, county: str, town: str) -> list[str]:
    """Every published road in one town. Used to re-test a 巷-suffixed road name (竹田1巷)."""
    stmt = select(RefRoad.road).where(RefRoad.county == county, RefRoad.town == town)
    return list((await db.execute(stmt)).scalars().all())


# Beyond this, the "nearest" address point is not this pin's address in any useful sense, and
# an unbounded KNN would happily answer a coordinate in the Pacific with a street in 光復鄉.
# 500 m matches `_FAR_FROM_PIN_M` in services/address.py — well past GPS error, still inside a
# rural 村; past it, callers fall back to the 村里 polygon.
SEARCH_RADIUS_M = 500.0


async def nearest_address_points(
    db: AsyncSession, *, lat: float, lng: float, limit: int = 5
) -> list[tuple[OsmAddressPoint, float]]:
    """Return OSM address points within `SEARCH_RADIUS_M` as (row, metres), nearest first.

    `ORDER BY geom <-> point` is the GiST KNN operator — it walks the index rather than scoring
    every row, so this stays cheap as the table grows. ST_DWithin on geography is index-assisted
    too, so bounding the search costs nothing and stops a pin outside Taiwan from being answered
    with the closest address on the island.
    """
    pt = _point(lat, lng)
    distance = func.ST_DistanceSphere(OsmAddressPoint.geom, pt).cast(Float)
    stmt = (
        select(OsmAddressPoint, distance)
        .where(
            OsmAddressPoint.geom.isnot(None),
            func.ST_DWithin(
                func.cast(OsmAddressPoint.geom, Geography),
                func.cast(pt, Geography),
                SEARCH_RADIUS_M,
            ),
        )
        .order_by(OsmAddressPoint.geom.op("<->")(pt))
        .limit(limit)
    )
    return [(row[0], row[1]) for row in (await db.execute(stmt)).all()]


async def address_point_for(
    db: AsyncSession, *, county: str | None, town: str | None, road: str, no: str
) -> OsmAddressPoint | None:
    """Return the OSM point for an exact 路 + 號, or None when OSM has not mapped it.

    A miss means "unverified", never "does not exist" — OSM is dense in Taiwan (~9.2M address
    nodes) but is neither authoritative nor guaranteed complete.
    """
    stmt = select(OsmAddressPoint).where(OsmAddressPoint.road == road, OsmAddressPoint.no == no)
    if county:
        stmt = stmt.where(OsmAddressPoint.county == county)
    if town:
        stmt = stmt.where(OsmAddressPoint.town == town)
    return (await db.execute(stmt.limit(1))).scalars().first()


async def distance_to_point(db: AsyncSession, *, point: OsmAddressPoint, lat: float, lng: float) -> float:
    """Metres between a matched address point and a supplied pin."""
    stmt = select(func.ST_DistanceSphere(point.geom, _point(lat, lng)).cast(Float))
    return float((await db.execute(stmt)).scalar_one())


async def loaded_datasets(db: AsyncSession) -> set[str]:
    """Names of the datasets currently marked ready.

    The import is detached from deploy, so "no reference data yet" is the normal state for the
    first minutes after a release. Callers use this to explain themselves instead of returning
    an empty result that looks like "no such address".
    """
    stmt = select(ReferenceDataset.name).where(ReferenceDataset.status == "ready")
    return set((await db.execute(stmt)).scalars().all())


async def dataset_statuses(db: AsyncSession) -> list[ReferenceDataset]:
    """Every import status row, for the `referenceData` query."""
    stmt = select(ReferenceDataset).order_by(ReferenceDataset.name)
    return list((await db.execute(stmt)).scalars().all())
