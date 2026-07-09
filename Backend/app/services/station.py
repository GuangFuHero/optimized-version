"""Station write actions (create/update/delete/property/rating).

Same service layer as auth_account.py: flat functions, `db` first then keyword-only args,
each owns its own authz (require_scope) + validation + persistence so resolvers stay thin
(ADR-014). Repos are pure CRUD (ADR-015); multi-table orchestration (station +
secondary_location) lives here.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.graphql.scalars import geojson_to_geom
from app.models.auth import User
from app.models.geo import Station
from app.models.station_property import CrowdSourcing, StationProperty
from app.repositories.geo_repository import (
    crowd_sourcing_repository,
    secondary_location_repository,
    station_property_repository,
    station_repository,
)
from app.services.authz import require_scope
from app.services.geo_validation import validate_point


async def create_station(
    db: AsyncSession,
    *,
    actor: User,
    geometry: dict,
    type: str | None,
    name: str | None,
    description: str | None,
    op_hour: str | None,
    level: int,
    comment: str | None,
    source: str,
    visibility: str,
    secondary_location: dict | None = None,
) -> Station:
    """Create a station (checkpoint 1 only — a new station has no prior owner to scope-check).

    Owns the two-table station + secondary_location orchestration and the single commit
    that makes it atomic.
    """
    await require_scope(actor, Perm.STATION_MAKE, db)
    validate_point(geometry)

    station = await station_repository.add(
        db,
        obj_in={
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor.uuid),
            "type": type,
            "name": name,
            "description": description,
            "op_hour": op_hour,
            "level": level,
            "comment": comment,
            "source": source,
            "visibility": visibility,
        },
    )
    if secondary_location:
        await secondary_location_repository.add(
            db, obj_in={"geometry_uuid": str(station.uuid), **secondary_location}
        )

    await db.commit()
    await db.refresh(station)
    return station


async def update_station(
    db: AsyncSession, *, actor: User, uuid: str, geometry: dict | None = None, changes: dict
) -> Station:
    """Update a station (checkpoint 1 station.edit, then checkpoint 2 against the loaded station).

    `changes` is the already-diffed non-geometry field dict (UNSET handling stays in the
    resolver); `geometry` is the raw GeoJSON dict, kept separate as it needs validating.
    """
    station = await station_repository.get_by_uuid_active(db, uuid)
    if not station:
        raise ValueError("Station not found")
    await require_scope(actor, Perm.STATION_EDIT, db, resource=station)

    obj_in = dict(changes)
    if geometry is not None:
        validate_point(geometry)
        obj_in["geometry"] = geojson_to_geom(geometry)
    return await station_repository.update(db, db_obj=station, obj_in=obj_in)


async def delete_station(db: AsyncSession, *, actor: User, uuid: str) -> None:
    """Soft-delete a station (checkpoint 1 station.delete, then checkpoint 2 against it)."""
    station = await station_repository.get_by_uuid_active(db, uuid)
    if not station:
        raise ValueError("Station not found")
    await require_scope(actor, Perm.STATION_DELETE, db, resource=station)
    await station_repository.soft_delete(db, db_obj=station)


async def create_station_property(
    db: AsyncSession,
    *,
    actor: User,
    station_uuid: str,
    property_type: str,
    property_name: str,
    quantity: int | None,
    weightings: float,
) -> StationProperty:
    """Add a property to a station (checkpoint 1 only — no scope check against the parent)."""
    await require_scope(actor, Perm.STATION_EDIT, db)
    if not await station_repository.get_by_uuid_active(db, station_uuid):
        raise ValueError("Station not found")
    return await station_property_repository.create(
        db,
        obj_in={
            "station_uuid": station_uuid,
            "property_type": property_type,
            "property_name": property_name,
            "quantity": quantity,
            "weightings": weightings,
            "status": "pending",
            "created_by": str(actor.uuid),
        },
    )


async def update_station_property(
    db: AsyncSession, *, actor: User, uuid: str, changes: dict
) -> StationProperty:
    """Update a station property (checkpoint 1 station.edit, then checkpoint 2 against it).

    StationProperty carries no team_uuid, so `team`/`gov`/`ngo`/`zone` scope can never match
    it — only `own`/`all` apply (RBAC_V1_DECISIONS.md §2C).
    """
    prop = await station_property_repository.get_by_uuid_active(db, uuid)
    if not prop:
        raise ValueError("Station property not found")
    await require_scope(actor, Perm.STATION_EDIT, db, resource=prop)
    return await station_property_repository.update(db, db_obj=prop, obj_in=changes)


async def rate_station_property(
    db: AsyncSession,
    *,
    actor: User,
    station_uuid: str,
    item_uuid: str | None,
    rating: str,
    distance_from_geometry: float | None,
) -> CrowdSourcing:
    """Submit or update a crowd-sourced rating for a station property (checkpoint 1 only)."""
    await require_scope(actor, Perm.STATION_EDIT, db)

    result = await db.execute(
        select(StationProperty).where(
            StationProperty.uuid == item_uuid,
            StationProperty.station_uuid == station_uuid,
        )
    )
    if not result.scalar_one_or_none():
        raise ValueError("Item not found for this station")

    return await crowd_sourcing_repository.upsert(
        db,
        station_uuid=station_uuid,
        item_uuid=item_uuid,
        user_uuid=str(actor.uuid),
        credibility_score=actor.credibility_score,
        rating=rating,
        distance=distance_from_geometry,
    )
