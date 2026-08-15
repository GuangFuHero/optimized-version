"""Station write actions (create/update/delete/property/rating).

Same service layer as auth_account.py: flat functions, `db` first then keyword-only args,
each owns its own authz (require_scope) + validation + persistence so resolvers stay thin
(ADR-014). Repos are pure CRUD (ADR-015); multi-table orchestration (station +
secondary_location) lives here.
"""

from types import SimpleNamespace

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
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService


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
    await require_scope(actor, Perm.STATION_ADD, db)
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

    # 觸發 resource_station_updated 通知
    recipients = await NotificationRecipientResolver.resolve_gov_and_zone_ngo(db, str(station.uuid))
    await NotificationService.dispatch(
        db,
        event_type="resource_station_updated",
        title=f"🏢 新建物資資源站：{station.name or '物資站'}",
        body=f"新建物資資源站「{station.name or station.uuid}」，請留意物資與避難整備狀況。",
        priority="medium",
        actor_uuid=actor.uuid,
        ref_type="station",
        ref_uuid=station.uuid,
        explicit_recipients=recipients,
    )

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

    old_dup = station.is_duplicate
    obj_in = dict(changes)
    if geometry is not None:
        validate_point(geometry)
        obj_in["geometry"] = geojson_to_geom(geometry)
    updated = await station_repository.update(db, db_obj=station, obj_in=obj_in)

    # 觸發通知
    OPERATIONAL_STATUS_FIELDS = {
        "status",
        "is_open",
        "water_level",
        "beds_available",
        "supply_rationed",
        "power_available",
        "capacity_status",
    }

    if ("is_duplicate" in changes and changes["is_duplicate"] and not old_dup) or (
        "dedup_group_id" in changes and changes["dedup_group_id"]
    ):
        dedup_recipients = await NotificationRecipientResolver.resolve_permission(
            db, Perm.AI_DUP_REVIEW.value
        )
        await NotificationService.dispatch(
            db,
            event_type="dedup_flag_station",
            title=f"重複物資站待審核：{updated.name or '物資站'}",
            body=f"物資站「{updated.name or updated.uuid}」已被系統標記為疑似重複項目，請進行審核。",
            priority="medium",
            actor_uuid=actor.uuid,
            ref_type="station",
            ref_uuid=updated.uuid,
            explicit_recipients=dedup_recipients,
        )
    elif any(field in changes for field in OPERATIONAL_STATUS_FIELDS):
        recipients = await NotificationRecipientResolver.resolve_gov_and_zone_ngo(db, str(updated.uuid))
        await NotificationService.dispatch(
            db,
            event_type="resource_station_updated",
            title=f"🏢 資源物資站狀態更新：{updated.name or '物資站'}",
            body=f"物資站「{updated.name or updated.uuid}」營運資訊或物資儲備狀況已更新。",
            priority="medium",
            actor_uuid=actor.uuid,
            ref_type="station",
            ref_uuid=updated.uuid,
            explicit_recipients=recipients,
        )

    return updated


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
    """Add a property to a station — open crowd-sourcing (station.contribute, PR #24 review [5]).

    Capability-only (checkpoint 1): anyone holding station.contribute may attach a property to
    any station; there is deliberately no ownership/zone check (crowd-sourced facility data).
    """
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
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


async def _property_scope_target(db: AsyncSession, prop: StationProperty) -> SimpleNamespace:
    """Scope target for a station property (ADR-052, direction B).

    A StationProperty has no geometry of its own, so `zone` scope could never match it
    directly (in_scope's ZONE branch needs resource.geometry). It borrows its parent
    station's location for the zone check, so a team's `zone`-scoped station.edit reaches
    properties on stations sitting inside its WorkZone. `own` still means the property's
    own creator.
    """
    station = await station_repository.get_by_uuid_active(db, prop.station_uuid)
    return SimpleNamespace(
        created_by=prop.created_by,
        team_uuid=None,
        geometry=station.geometry if station else None,
    )


async def update_station_property(
    db: AsyncSession, *, actor: User, uuid: str, changes: dict
) -> StationProperty:
    """Update a station property (checkpoint 1 station.edit, then checkpoint 2 against it).

    The property has no geometry, so checkpoint 2 borrows the parent station's location for
    `zone` scope (ADR-052); `own` resolves against the property's creator. Without this a
    team role (`station.edit=zone`) could never edit any property, even inside its own zone.
    """
    prop = await station_property_repository.get_by_uuid_active(db, uuid)
    if not prop:
        raise ValueError("Station property not found")
    await require_scope(actor, Perm.STATION_EDIT, db, resource=await _property_scope_target(db, prop))
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
    """Submit or update a crowd-sourced rating for a station property — open (station.contribute).

    Ratings are inherently submitted by non-owners, so this is capability-only (checkpoint 1);
    there is deliberately no ownership check.
    """
    await require_scope(actor, Perm.STATION_CONTRIBUTE, db)

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
