"""GraphQL queries for Work Zones.

work_zone.view is not in PUBLIC_PERMS (ADR-036) — zone boundaries are internal
administrative data, not disaster-relief-facing content like stations/tickets/map
overlays, so an anonymous caller gets a plain 403 (ADR-025 default-deny) rather than a
public read. Checkpoint 1 only: every role granted work_zone.view holds it at Scope.ALL
(gov_manager/ngo_manager/super_admin, scripts/seed_rbac.py), so there is no per-row
filtering to apply.
"""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.context import check_permission
from app.graphql.shared import PageInfo
from app.graphql.work_zone.types import WorkZoneConnection, WorkZoneType
from app.repositories.team_repository import work_zone_repository


@strawberry.type
class WorkZoneQuery:
    """GraphQL queries for work zones."""

    @strawberry.field
    async def work_zones(
        self, info: strawberry.types.Info, skip: int = 0, limit: int = 50,
    ) -> WorkZoneConnection:
        """List work zones, newest first. Requires work_zone.view permission."""
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        total = await work_zone_repository.count_all(db)
        items = await work_zone_repository.list_all(db, skip=skip, limit=limit)
        return WorkZoneConnection(
            items=[WorkZoneType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def work_zone(self, info: strawberry.types.Info, uuid: UUID) -> WorkZoneType | None:
        """Fetch a single work zone by UUID. Requires work_zone.view permission."""
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        m = await work_zone_repository.get_by_uuid(db, uuid)
        return WorkZoneType.from_model(m) if m else None
