"""GraphQL mutations for Work Zones and their team assignment.

Thin per ADR-014: parse input, call the work_zone service function, map the result back to
a GraphQL type. See app/services/work_zone.py.
"""

from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.work_zone.types import (
    CreateWorkZoneInput,
    UpdateWorkZoneInput,
    WorkZoneType,
    ZoneTeamAssignmentInput,
)
from app.services import work_zone as work_zone_service


@strawberry.type
class WorkZoneMutation:
    """Mutations for creating/updating work zones and assigning them to teams."""

    @strawberry.mutation
    async def create_work_zone(
        self, info: strawberry.types.Info, input: CreateWorkZoneInput
    ) -> WorkZoneType:
        """Draw a new work zone. Validates the geometry as a Polygon/MultiPolygon.

        Requires work_zone.make permission. Returns the created zone.
        """
        zone = await work_zone_service.create_work_zone(
            info.context["db"], actor=require_authenticated(info),
            name=input.name, geometry=input.geometry,
        )
        return WorkZoneType.from_model(zone)

    @strawberry.mutation
    async def update_work_zone(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateWorkZoneInput
    ) -> WorkZoneType:
        """Update a work zone's name or boundary. UNSET fields are left unchanged.

        Requires work_zone.edit permission with scope check. Returns the updated zone.
        """
        changes = {}
        if input.name is not strawberry.UNSET:
            changes["name"] = input.name

        zone = await work_zone_service.update_work_zone(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), geometry=input.geometry, changes=changes,
        )
        return WorkZoneType.from_model(zone)

    @strawberry.mutation
    async def assign_zone_to_team(
        self, info: strawberry.types.Info, input: ZoneTeamAssignmentInput
    ) -> bool:
        """Assign a work zone to a team, establishing `zone` scope for it (ADR-021).

        Requires work_zone.assign permission. Idempotent if already assigned. Returns True.
        """
        await work_zone_service.assign_zone_to_team(
            info.context["db"], actor=require_authenticated(info),
            zone_uuid=str(input.zone_uuid), team_uuid=str(input.team_uuid),
        )
        return True

    @strawberry.mutation
    async def remove_zone_from_team(
        self, info: strawberry.types.Info, input: ZoneTeamAssignmentInput
    ) -> bool:
        """Remove a work zone's assignment to a team.

        Requires work_zone.assign permission. Returns True on success.
        """
        await work_zone_service.remove_zone_from_team(
            info.context["db"], actor=require_authenticated(info),
            zone_uuid=str(input.zone_uuid), team_uuid=str(input.team_uuid),
        )
        return True
