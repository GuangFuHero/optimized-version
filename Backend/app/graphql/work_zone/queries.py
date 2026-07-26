"""GraphQL queries for Work Zones.

work_zone.view is not in PUBLIC_PERMS (ADR-036) — zone boundaries are internal
administrative data, not disaster-relief-facing content like stations/tickets/map
overlays, so an anonymous caller gets a plain 403 (ADR-025 default-deny) rather than a
public read. Checkpoint 1 only: in the current seed the holders of work_zone.view are the
`super_admin` platform role and the `admin` team role (scripts/seed_rbac.py), both at
Scope.ALL, so there is no per-row filtering to apply. (The old gov_manager/ngo_manager
role names are gone — ADR-049 folded org type into the team's team.type, not a role name.)
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
        """Fetch a single non-deleted work zone by UUID. Requires work_zone.view permission."""
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        m = await work_zone_repository.get_by_uuid_active(db, uuid)
        return WorkZoneType.from_model(m) if m else None

    @strawberry.field
    async def zones_by_team(
        self, info: strawberry.types.Info, team_uuid: UUID, skip: int = 0, limit: int = 50,
    ) -> WorkZoneConnection:
        """List the work zones delegated to a team, newest first.

        Requires work_zone.view. In the current seed team admins hold that at Scope.ALL, so
        any team admin can inspect any team's delegations. Judged acceptable: knowing which
        team covers which area is a precondition for inter-agency coordination, and no PII is
        involved. To narrow it, drop the admin role's work_zone.view to `team` — a seed/matrix
        change, no code change (design §4.3).
        """
        db = info.context["db"]
        await check_permission(info, Perm.ZONE_VIEW)
        total = await work_zone_repository.count_by_team(db, team_uuid=str(team_uuid))
        items = await work_zone_repository.list_by_team(
            db, team_uuid=str(team_uuid), skip=skip, limit=limit
        )
        return WorkZoneConnection(
            items=[WorkZoneType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )
