"""GraphQL queries for stations and closure areas."""

from uuid import UUID

import strawberry

from app.graphql.geo.types import (
    BoundsInput,
    ClosureAreaConnection,
    ClosureAreaType,
    StationConnection,
    StationType,
)
from app.graphql.shared import PageInfo
from app.repositories.geo_repository import closure_area_repository, station_repository


@strawberry.type
class GeoQuery:
    """GraphQL queries for stations and closure areas."""

    @strawberry.field
    async def stations(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        station_type: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> StationConnection:
        """List stations within an optional geographic bounding box.

        Args:
            info: Strawberry resolver context providing the database session.
            bounds: Optional lat/lng bbox to spatially filter results via ST_Intersects.
            station_type: Optional type filter (e.g. 'shelter', 'supply', 'medical').
            skip: Pagination offset.
            limit: Max results per page (default 50).

        Returns:
            StationConnection with items and total count / pagination metadata.
        """
        db = info.context["db"]
        total = await station_repository.count_active(db, bounds=bounds, station_type=station_type)
        items = await station_repository.list_active(
            db, bounds=bounds, station_type=station_type, skip=skip, limit=limit
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
        """Fetch a single active station by UUID. Returns None if not found or soft-deleted."""
        m = await station_repository.get_by_uuid_active(info.context["db"], uuid)
        return StationType.from_model(m) if m else None

    @strawberry.field
    async def closure_areas(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        skip: int = 0, limit: int = 50,
    ) -> ClosureAreaConnection:
        """List closure areas within an optional geographic bounding box, paginated."""
        db = info.context["db"]
        total = await closure_area_repository.count_active(db, bounds=bounds)
        items = await closure_area_repository.list_active(db, bounds=bounds, skip=skip, limit=limit)
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
        """Fetch a single active closure area by UUID. Returns None if not found or soft-deleted."""
        m = await closure_area_repository.get_by_uuid_active(info.context["db"], uuid)
        return ClosureAreaType.from_model(m) if m else None
