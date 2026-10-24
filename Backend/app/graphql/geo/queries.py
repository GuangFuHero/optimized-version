"""GraphQL queries for stations, hazardous zones, and building maps.

Read-checked per ADR-027/028: station.view/map.view are public (Guest gets Scope.ALL),
authenticated callers get whatever scope their role grants, applied as a list-level
filter (scope_filter) for the list queries and an object-level check (in_scope) for the
detail queries.
"""

from uuid import UUID

import strawberry
from sqlalchemy import String, cast, exists, false, or_, select

from app.api.v1.endpoints.auth.deps import consume_rate_limit
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope, scope_filter
from app.core.search import normalize_query, search_timeout
from app.core.security import resolve_scope
from app.graphql.context import check_permission, require_authenticated
from app.graphql.geo.types import (
    AddressLookupType,
    BoundsInput,
    BuildingMapConnection,
    BuildingMapType,
    HazardousZoneConnection,
    HazardousZoneType,
    StationConnection,
    StationOperationalStatus,
    StationType,
)
from app.graphql.shared import PageInfo
from app.models.geo import BuildingMap, HazardousZone, Station
from app.models.station_property import StationProperty, StationUpdateSuggestion
from app.models.team import Team
from app.repositories.geo_repository import (
    building_map_repository,
    hazardous_zone_repository,
    station_repository,
)
from app.services import address as address_service


async def _reviewable_by(info: strawberry.types.Info) -> list:
    """WHERE clauses keeping the stations the caller holds station.review over.

    resolve_scope, not check_permission: a caller without the capability gets an empty list
    rather than an error, and a gov team's `team` scope widens to all (ADR-285).
    """
    user = info.context["user"]
    if user is None:
        return [false()]
    scope = await resolve_scope(
        user, Perm.STATION_REVIEW, info.context["db"], cache=info.context["_rbac_cache"]
    )
    return scope_filter(scope, actor=user, model=Station)


def _has_pending_suggestion():
    """EXISTS clause: the station, or one of its active properties, has a pending suggestion."""
    return exists(
        select(1)
        .select_from(StationUpdateSuggestion)
        .outerjoin(
            StationProperty,
            (cast(StationProperty.uuid, String) == StationUpdateSuggestion.target_uuid)
            & StationProperty.delete_at.is_(None),
        )
        .where(
            StationUpdateSuggestion.status == "pending",
            StationUpdateSuggestion.delete_at.is_(None),
            or_(
                StationUpdateSuggestion.target_uuid == cast(Station.uuid, String),
                StationProperty.station_uuid == Station.uuid,
            ),
        )
        .correlate(Station)
    )


@strawberry.type
class GeoQuery:
    """GraphQL queries for stations, hazardous zones, and building maps."""

    @strawberry.field
    async def stations(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        station_type: str | None = None,
        operational_status: StationOperationalStatus | None = None,
        q: str | None = None,
        assigned_team_uuid: UUID | None = None,
        unassigned_only: bool = False,
        has_pending_suggestions: bool = False,
        reviewable_only: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> StationConnection:
        """List stations within an optional geographic bounding box.

        Requires station.view permission (public — Guest may call this). Rows are
        filtered to the caller's resolved scope (own/team/gov/ngo/zone/all).

        Args:
            info: Strawberry resolver context providing the database session.
            bounds: Optional lat/lng bbox to spatially filter results via ST_Intersects.
            station_type: Optional type filter (e.g. 'shelter', 'supply', 'medical').
            operational_status: Optional filter, one of the StationOperationalStatus
                enum values. An enum rather than a str so a typo is a GraphQL validation
                error instead of a silently-empty result set.
            q: Optional keyword filter over the station's own name and description, its
                properties, and its address — including the full secondary-location
                address and pole_id (ADR-077/079/080). 2–50 characters; outside that range
                raises. Composes with every other filter rather than replacing them.
            assigned_team_uuid: Optional — only the stations assigned to this team (ADR-285).
            unassigned_only: Only the stations no team runs yet — gov's queue to hand out.
                Mutually exclusive with assigned_team_uuid.
            has_pending_suggestions: When true, only stations with a pending suggestion on
                themselves or one of their properties. Public, like pendingSuggestedFields.
            reviewable_only: Only the stations the caller holds station.review over; with
                has_pending_suggestions, the caller's own review queue (WG-168). Empty for a
                caller without station.review, including a guest.
            skip: Pagination offset.
            limit: Max results per page (default 50).

        Returns:
            StationConnection with items and total count / pagination metadata.
        """
        db = info.context["db"]
        status_value = operational_status.value if operational_status is not None else None
        if assigned_team_uuid is not None and unassigned_only:
            raise ValueError("assignedTeamUuid and unassignedOnly cannot be combined")
        scope = await check_permission(info, Perm.STATION_VIEW)
        extra_filters = scope_filter(scope, actor=info.context["user"], model=Station)
        # Appended to extra_filters, which both count_active and list_active build from, so
        # totalCount keeps agreeing with the rows returned. "Assigned" means to a live team:
        # a station still pointing at a soft-deleted one reads as unassigned on
        # StationType.assignedTeam (ADR-285 decision 8), so it belongs in gov's queue here too.
        runs_it = exists(select(1).where(Team.uuid == Station.team_uuid, Team.delete_at.is_(None)))
        if assigned_team_uuid is not None:
            extra_filters += [Station.team_uuid == assigned_team_uuid, runs_it]
        if unassigned_only:
            extra_filters.append(~runs_it)
        if has_pending_suggestions:
            extra_filters.append(_has_pending_suggestion())
        if reviewable_only:
            extra_filters += await _reviewable_by(info)
        # One ceiling for the whole request, not one per statement (ADR-176). count and
        # list are two halves of the same search, and search_timeout() is nesting-aware
        # (ADR-157): the windows the repositories open inside see depth > 0 and skip their
        # own set_config/RESET, so this costs two round-trips where it used to cost six.
        async with search_timeout(db, normalize_query(q)):
            total = await station_repository.count_active(
                db,
                bounds=bounds,
                station_type=station_type,
                q=q,
                operational_status=status_value,
                extra_filters=extra_filters,
            )
            items = await station_repository.list_active(
                db,
                bounds=bounds,
                station_type=station_type,
                q=q,
                operational_status=status_value,
                skip=skip,
                limit=limit,
                extra_filters=extra_filters,
            )
        return StationConnection(
            items=[StationType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def station(self, info: strawberry.types.Info, uuid: UUID) -> StationType | None:
        """Fetch a single active station by UUID.

        Returns None if not found, soft-deleted, or outside the caller's scope (a scope
        mismatch is indistinguishable from "not found" — no separate error).
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.STATION_VIEW)
        m = await station_repository.get_by_uuid_active(db, uuid)
        if not m:
            return None
        if scope != Scope.ALL:
            user = info.context["user"]
            if user is None or not await in_scope(scope, actor=user, resource=m, db=db):
                return None
        return StationType.from_model(m)

    @strawberry.field
    async def hazardous_zones(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> HazardousZoneConnection:
        """List hazardous zones within an optional geographic bounding box, paginated.

        Requires map.view permission (public — Guest may call this).
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.MAP_VIEW)
        extra_filters = scope_filter(scope, actor=info.context["user"], model=HazardousZone)
        total = await hazardous_zone_repository.count_active(db, bounds=bounds, extra_filters=extra_filters)
        items = await hazardous_zone_repository.list_active(
            db, bounds=bounds, skip=skip, limit=limit, extra_filters=extra_filters
        )
        return HazardousZoneConnection(
            items=[HazardousZoneType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def hazardous_zone(self, info: strawberry.types.Info, uuid: UUID) -> HazardousZoneType | None:
        """Fetch a single active hazardous zone by UUID.

        Returns None if not found, soft-deleted, or outside the caller's scope.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.MAP_VIEW)
        m = await hazardous_zone_repository.get_by_uuid_active(db, uuid)
        if not m:
            return None
        if scope != Scope.ALL:
            user = info.context["user"]
            if user is None or not await in_scope(scope, actor=user, resource=m, db=db):
                return None
        return HazardousZoneType.from_model(m)

    @strawberry.field
    async def building_maps(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> BuildingMapConnection:
        """List building maps within an optional geographic bounding box, paginated.

        Requires map.view permission (public — Guest may call this).
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.MAP_VIEW)
        extra_filters = scope_filter(scope, actor=info.context["user"], model=BuildingMap)
        total = await building_map_repository.count_active(db, bounds=bounds, extra_filters=extra_filters)
        items = await building_map_repository.list_active(
            db, bounds=bounds, skip=skip, limit=limit, extra_filters=extra_filters
        )
        return BuildingMapConnection(
            items=[BuildingMapType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def building_map(self, info: strawberry.types.Info, uuid: UUID) -> BuildingMapType | None:
        """Fetch a single active building map by UUID.

        Returns None if not found, soft-deleted, or outside the caller's scope.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.MAP_VIEW)
        m = await building_map_repository.get_by_uuid_active(db, uuid)
        if not m:
            return None
        if scope != Scope.ALL:
            user = info.context["user"]
            if user is None or not await in_scope(scope, actor=user, resource=m, db=db):
                return None
        return BuildingMapType.from_model(m)

    @strawberry.field(
        description=(
            "Look a typed address up in TGOS before saving it (exact matches only). Pass the map pin "
            "as lat/lng to check the two agree. Signed-in callers only, 30 lookups a minute shared "
            "with reverseGeocode"
        )
    )
    async def normalize_address(
        self,
        info: strawberry.types.Info,
        address: str,
        lat: float | None = None,
        lng: float | None = None,
    ) -> AddressLookupType:
        """Look a typed address up in TGOS before saving it; pass the pin to check they agree."""
        await _allow_lookup(info)
        if (lat is None) != (lng is None):
            raise ValueError("lat and lng must be provided together")
        pin = _checked_point(lat, lng) if lat is not None else None
        return AddressLookupType.from_lookup(await address_service.lookup_address(address, pin))

    @strawberry.field(
        description=(
            "The nearest 門牌 to a map pin, within 500 m. Signed-in callers only, 30 lookups a minute "
            "shared with normalizeAddress"
        )
    )
    async def reverse_geocode(self, info: strawberry.types.Info, lat: float, lng: float) -> AddressLookupType:
        """The nearest 門牌 to a pin, within 500 m."""
        await _allow_lookup(info)
        return AddressLookupType.from_lookup(await address_service.reverse_geocode(*_checked_point(lat, lng)))


_LOOKUPS_PER_MINUTE = 30


async def _allow_lookup(info: strawberry.types.Info) -> None:
    """Signed-in callers only, each held to 30 lookups a minute so no one caller spends the quota."""
    user = require_authenticated(info)
    redis = info.context["request"].app.state.redis
    if not await consume_rate_limit(redis, f"ratelimit:address_lookup:{user.uuid}", _LOOKUPS_PER_MINUTE, 60):
        raise ValueError("Too many address lookups; try again in a minute")


def _checked_point(lat: float, lng: float) -> tuple[float, float]:
    """The (lat, lng) pair, or ValueError when it is off the globe."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError("Invalid coordinates")
    return lat, lng
