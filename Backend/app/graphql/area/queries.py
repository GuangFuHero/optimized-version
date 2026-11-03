"""GraphQL queries for map areas and team zones.

`areas` serves the public map (map.view) with every hazardous zone and the public mark zones, plus
every team zone and its team names to anyone signed in; hidden mark zones come only to work_zone.view
holders. The team zone queries also return who drew each zone, so they need work_zone.view, which
only super_admin and team admins hold.
"""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.area.types import AreaConnection, AreaKind, AreaType, TeamZoneConnection, TeamZoneType
from app.graphql.context import check_permission
from app.graphql.geo.types import BoundsInput
from app.graphql.shared import PageInfo
from app.models.geo import AreaPolygon
from app.repositories.geo_repository import area_repository
from app.repositories.team_repository import team_zone_repository


def _page_info(total: int, skip: int, limit: int) -> PageInfo:
    """Build the page metadata for a skip/limit page out of `total` rows."""
    return PageInfo(total_count=total, has_next_page=(skip + limit) < total, has_previous_page=skip > 0)


@strawberry.type
class AreaQuery:
    """GraphQL queries for map areas and team zones."""

    @strawberry.field
    async def areas(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        include_private: bool = False,
        skip: int = 0,
        limit: int = 50,
    ) -> AreaConnection:
        """List map areas of every kind inside an optional bounding box, newest first.

        Without includePrivate this is the public map layer: every hazardous zone and the mark zones
        switched to public, and to anyone signed in every team zone too. includePrivate needs
        work_zone.view and adds the hidden mark zones.
        """
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW if include_private else Perm.MAP_VIEW)
        filters = [] if include_private else [AreaPolygon.is_public]
        if info.context["user"] is None:
            # The organisations a team zone is assigned to don't want their exact areas published.
            filters.append(AreaPolygon.property_name != AreaKind.team_zone.value)
        total = await area_repository.count_active(db, bounds=bounds, extra_filters=filters)
        items = await area_repository.list_active(
            db, bounds=bounds, skip=skip, limit=limit, extra_filters=filters
        )
        return AreaConnection(
            items=[AreaType.from_model(m) for m in items], page_info=_page_info(total, skip, limit)
        )

    @strawberry.field
    async def team_zones(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> TeamZoneConnection:
        """List team zones inside an optional bounding box, newest first. Requires work_zone.view."""
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        total = await team_zone_repository.count_active(db, bounds=bounds)
        items = await team_zone_repository.list_active(db, bounds=bounds, skip=skip, limit=limit)
        return TeamZoneConnection(
            items=[TeamZoneType.from_model(m) for m in items], page_info=_page_info(total, skip, limit)
        )

    @strawberry.field
    async def team_zone(self, info: strawberry.types.Info, uuid: UUID) -> TeamZoneType | None:
        """Fetch a single non-deleted team zone by UUID. Requires work_zone.view."""
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        m = await team_zone_repository.get_by_uuid_active(db, uuid)
        return TeamZoneType.from_model(m) if m else None

    @strawberry.field
    async def zones_by_team(
        self,
        info: strawberry.types.Info,
        team_uuid: UUID,
        skip: int = 0,
        limit: int = 50,
    ) -> TeamZoneConnection:
        """List the team zones delegated to a team, newest first. Requires work_zone.view.

        Any work_zone.view holder may inspect any team's zones: knowing which team covers which
        area is needed for coordination, and no PII is involved.
        """
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        total = await team_zone_repository.count_by_team(db, team_uuid=str(team_uuid))
        items = await team_zone_repository.list_by_team(db, team_uuid=str(team_uuid), skip=skip, limit=limit)
        return TeamZoneConnection(
            items=[TeamZoneType.from_model(m) for m in items], page_info=_page_info(total, skip, limit)
        )
