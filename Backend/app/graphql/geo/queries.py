"""GraphQL queries for stations and closure areas.

Read-checked per ADR-027/028: station.view/map.view are public (Guest gets Scope.ALL),
authenticated callers get whatever scope their role grants, applied as a list-level
filter (scope_filter) for the list queries and an object-level check (in_scope) for the
detail queries.
"""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope, scope_filter
from app.core.search import normalize_query, search_timeout
from app.graphql.context import check_permission
from app.graphql.geo.types import (
    BoundsInput,
    ClosureAreaConnection,
    ClosureAreaType,
    StationConnection,
    StationType,
)
from app.graphql.shared import PageInfo
from app.models.geo import ClosureArea, Station
from app.repositories.geo_repository import closure_area_repository, station_repository


@strawberry.type
class GeoQuery:
    """GraphQL queries for stations and closure areas."""

    @strawberry.field
    async def stations(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        station_type: str | None = None,
        q: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> StationConnection:
        """List stations within an optional geographic bounding box.

        Requires station.view permission (public — Guest may call this). Rows are
        filtered to the caller's resolved scope (own/team/gov/ngo/zone/all).

        Args:
            info: Strawberry resolver context providing the database session.
            bounds: Optional lat/lng bbox to spatially filter results via ST_Intersects.
            station_type: Optional type filter (e.g. 'shelter', 'supply', 'medical').
            q: Optional keyword filter over the station's own name and description, its
                properties, and its address — including the full secondary-location
                address and pole_id (ADR-077/079/080). 2–50 characters; outside that range
                raises. Composes with every other filter rather than replacing them.
            skip: Pagination offset.
            limit: Max results per page (default 50).

        Returns:
            StationConnection with items and total count / pagination metadata.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.STATION_VIEW)
        extra_filters = scope_filter(scope, actor=info.context["user"], model=Station)
        # One ceiling for the whole request, not one per statement (ADR-161). count and
        # list are two halves of the same search, and search_timeout() is nesting-aware
        # (ADR-157): the windows the repositories open inside see depth > 0 and skip their
        # own set_config/RESET, so this costs two round-trips where it used to cost six.
        async with search_timeout(db, normalize_query(q)):
            total = await station_repository.count_active(
                db, bounds=bounds, station_type=station_type, q=q, extra_filters=extra_filters
            )
            items = await station_repository.list_active(
                db, bounds=bounds, station_type=station_type, q=q, skip=skip, limit=limit,
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
    async def closure_areas(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        skip: int = 0, limit: int = 50,
    ) -> ClosureAreaConnection:
        """List closure areas within an optional geographic bounding box, paginated.

        Requires map.view permission (public — Guest may call this).
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.MAP_VIEW)
        extra_filters = scope_filter(scope, actor=info.context["user"], model=ClosureArea)
        total = await closure_area_repository.count_active(db, bounds=bounds, extra_filters=extra_filters)
        items = await closure_area_repository.list_active(
            db, bounds=bounds, skip=skip, limit=limit, extra_filters=extra_filters
        )
        return ClosureAreaConnection(
            items=[ClosureAreaType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def closure_area(self, info: strawberry.types.Info, uuid: UUID) -> ClosureAreaType | None:
        """Fetch a single active closure area by UUID.

        Returns None if not found, soft-deleted, or outside the caller's scope.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.MAP_VIEW)
        m = await closure_area_repository.get_by_uuid_active(db, uuid)
        if not m:
            return None
        if scope != Scope.ALL:
            user = info.context["user"]
            if user is None or not await in_scope(scope, actor=user, resource=m, db=db):
                return None
        return ClosureAreaType.from_model(m)
