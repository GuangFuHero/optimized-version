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
from app.services.geo_validation import normalize_contact_fields, validate_point
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

# `station_properties.property_name` values whose changes are operational status updates
# worth notifying Gov/NGO about (PRD §3 `resource_station_updated`).
#
# These are EAV rows, NOT columns on `stations` — a station's live status is stored in
# `station_properties` (Backend/Spec/Docs/mapping-stations.csv). The previous whitelist
# lived in update_station() and tested keys of the station mutation's `changes` dict, so
# it could never match; it also listed `status` / `power_available` / `capacity_status`,
# none of which exist anywhere in the schema. Every name below is a real row in
# station_property_config (alembic a2a8e4d8c51d).
#
# Deliberately narrow: fast-changing situational-awareness values only. Static descriptors
# (capacity_total, pet_friendly, fuel_types, price, ...) stay silent so the Gov inbox is not
# flooded. Widening this list is a product decision — see PRD Q11.
#
# Which write path reaches which name: a property's value lives in `quantity` (Integer
# properties) or in `comment` (Boolean/Enum properties — see scripts/seed_mock_scenarios.sql).
# UpdateStationPropertyInput exposes only quantity/status/weightings, so the four
# comment-backed names below change exclusively through the suggestion workflow
# (SUGGESTABLE_FIELDS in app/graphql/suggestions/fields.py). Both paths notify.
OPERATIONAL_PROPERTY_NAMES = {
    "beds_available",  # shelter — 剩餘床位 (Integer → quantity)
    "capacity_available",  # medical — 可收治量 (Integer → quantity)
    "water_level",  # water — 供水充足程度 (Enum → comment)
    "is_open",  # gas_station — 是否營業 (Boolean → comment)
    "supply_rationed",  # supply — 是否限量 (Boolean → comment)
    "power_stable",  # power — 供電是否穩定 (Boolean → comment)
}


async def notify_operational_status_change(
    db: AsyncSession, *, station_uuid: str, property_name: str, actor_uuid: str | None
) -> None:
    """Tell Gov staff and the covering NGO admins that a station's live status changed.

    Shared by the two write paths that can change an operational value: direct property
    edits (update_station_property) and approved suggestions
    (suggestion.review_station_suggestion).

    Callers must commit their own write first and pass plain values, never ORM attributes —
    dispatch() commits, and the test suite runs sessions with expire_on_commit=True
    (tests/conftest.py), so anything read off an ORM object afterwards would be stale.
    """
    station = await station_repository.get_by_uuid_active(db, station_uuid)
    station_name = (station.name if station else None) or "物資站"
    recipients = await NotificationRecipientResolver.resolve_gov_and_zone_ngo(db, station_uuid)
    await NotificationService.dispatch(
        db,
        event_type="resource_station_updated",
        title=f"🏢 資源物資站狀態更新：{station_name}",
        body=f"物資站「{station_name}」的「{property_name}」已更新，請留意最新營運狀況。",
        priority="medium",
        actor_uuid=actor_uuid,
        ref_type="station",
        ref_uuid=station_uuid,
        explicit_recipients=recipients,
    )


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
    contact_name: str | None = None,
    contact_email: str | None = None,
    contact_phone: str | None = None,
    secondary_location: dict | None = None,
) -> Station:
    """Create a station (checkpoint 1 only — a new station has no prior owner to scope-check).

    Owns the two-table station + secondary_location orchestration and the single commit
    that makes it atomic.
    """
    await require_scope(actor, Perm.STATION_ADD, db)
    validate_point(geometry)
    actor_uid = actor.uuid
    contacts = normalize_contact_fields(
        {
            "contact_name": contact_name,
            "contact_email": contact_email,
            "contact_phone": contact_phone,
        }
    )

    station = await station_repository.add(
        db,
        obj_in={
            "geometry": geojson_to_geom(geometry),
            "created_by": str(actor_uid),
            "type": type,
            "name": name,
            "description": description,
            "op_hour": op_hour,
            "level": level,
            "comment": comment,
            "source": source,
            "visibility": visibility,
            # Spread the normalized values, never the raw arguments: the length check ran
            # against the stripped strings, so storing the originals is what round 3 of the
            # PR #40 review found leaking the INSERT.
            **contacts,
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
        actor_uuid=actor_uid,
        ref_type="station",
        ref_uuid=station.uuid,
        explicit_recipients=recipients,
    )
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
    actor_uid = actor.uuid

    old_dup = station.is_duplicate
    obj_in = normalize_contact_fields(changes)
    if geometry is not None:
        validate_point(geometry)
        obj_in["geometry"] = geojson_to_geom(geometry)
    updated = await station_repository.update(db, db_obj=station, obj_in=obj_in)

    # 觸發通知
    #
    # No operational-status branch here on purpose: a station's live status
    # (beds_available, water_level, is_open, ...) is not a column on `stations`, so those
    # names can never appear in `changes`. `resource_station_updated` for status changes
    # fires from update_station_property() instead.
    #
    # NOTE: the dedup branch below is likewise unreachable today — UpdateStationInput
    # exposes no is_duplicate / dedup_group_id field, so nothing can set them. It is left
    # in place for the dedup feature that will write them (PRD Q2).
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
            actor_uuid=actor_uid,
            ref_type="station",
            ref_uuid=updated.uuid,
            explicit_recipients=dedup_recipients,
        )

    await db.refresh(updated)
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

    Changing an operational value (OPERATIONAL_PROPERTY_NAMES) also fires
    `resource_station_updated` to all Gov staff plus the NGO admins whose work zone covers
    the station — those values are EAV rows here, not columns on `stations`. This mutation
    only reaches the Integer ones (it writes `quantity`); the Boolean/Enum ones live in
    `comment` and are changed through the suggestion workflow, which notifies too.
    """
    prop = await station_property_repository.get_by_uuid_active(db, uuid)
    if not prop:
        raise ValueError("Station property not found")
    await require_scope(actor, Perm.STATION_EDIT, db, resource=await _property_scope_target(db, prop))

    # Hoist everything the notification needs before the write. Production sessions use
    # expire_on_commit=False (app/db/session.py), but the test suite deliberately runs with
    # SQLAlchemy's default True (tests/conftest.py) so this class of bug cannot hide; under
    # that setting repository.update() and dispatch() both expire every loaded object.
    property_name = prop.property_name
    station_uuid = str(prop.station_uuid)
    actor_uid = actor.uuid
    old_value = (prop.quantity, prop.comment)

    updated = await station_property_repository.update(db, db_obj=prop, obj_in=changes)

    # `comment` cannot change here — UpdateStationPropertyInput has no such field — but it is
    # part of the comparison so this stays correct if the input ever gains one.
    if (
        property_name in OPERATIONAL_PROPERTY_NAMES
        and updated.status != "rejected"
        and (updated.quantity, updated.comment) != old_value
    ):
        await notify_operational_status_change(
            db, station_uuid=station_uuid, property_name=property_name, actor_uuid=actor_uid
        )
        await db.refresh(updated)

    return updated


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
