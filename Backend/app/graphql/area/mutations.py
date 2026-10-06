"""GraphQL mutations for map areas and team zone assignment.

Thin per ADR-014: parse input, call the area service function, map the result back to a
GraphQL type. See app/services/area.py.
"""

from uuid import UUID

import strawberry

from app.graphql.area.types import (
    AreaType,
    CreateAreaInput,
    PromoteMarkZoneInput,
    UpdateAreaInput,
    ZoneAssignmentType,
    ZoneTeamAssignmentInput,
)
from app.graphql.context import require_authenticated
from app.graphql.geo.types import HazardousZoneType
from app.services import area as area_service


@strawberry.type
class AreaMutation:
    """Mutations for drawing, editing and deleting map areas and assigning team zones."""

    @strawberry.mutation
    async def create_area(self, info: strawberry.types.Info, input: CreateAreaInput) -> AreaType:
        """Draw a map area of any kind. A team zone is created together with its first team.

        Requires work_zone.add (and work_zone.assign for a team zone) on a gov team or platform role.
        """
        area = await area_service.create_area(
            info.context["db"], actor=require_authenticated(info),
            kind=input.type.value, geometry=input.geometry,
            team_uuid=str(input.team_uuid) if input.team_uuid else None,
            name=input.name, note=input.note, is_public=input.is_public,
            status=input.status, information_source=input.information_source,
        )
        return AreaType.from_model(area)

    @strawberry.mutation
    async def update_area(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateAreaInput
    ) -> AreaType:
        """Update a map area. UNSET fields are left unchanged, so `isPublic` alone flips the switch.

        Requires work_zone.edit with scope check, on a gov team or platform role.
        """
        changes = {
            field: getattr(input, field)
            for field in ("name", "note", "information_source")
            if getattr(input, field) is not strawberry.UNSET
        }
        for field in ("is_public", "status"):
            if getattr(input, field) is not None:
                changes[field] = getattr(input, field)

        area = await area_service.update_area(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), geometry=input.geometry, changes=changes,
        )
        return AreaType.from_model(area)

    @strawberry.mutation
    async def delete_area(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a map area of any kind. Requires work_zone.delete. Returns True."""
        await area_service.delete_area(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid),
        )
        return True

    @strawberry.mutation
    async def promote_mark_zone(
        self, info: strawberry.types.Info, uuid: UUID, input: PromoteMarkZoneInput
    ) -> HazardousZoneType:
        """Turn a mark zone into a hazardous zone; there is no way back. Requires work_zone.edit."""
        zone = await area_service.promote_mark_zone(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid),
            status=input.status, information_source=input.information_source,
        )
        return HazardousZoneType.from_model(zone)

    @strawberry.mutation
    async def assign_zone_to_team(
        self, info: strawberry.types.Info, input: ZoneTeamAssignmentInput
    ) -> ZoneAssignmentType:
        """Assign a team zone to a team, establishing `zone` scope for it (ADR-021).

        Requires work_zone.assign. Idempotent — re-assigning an existing link returns that link
        unchanged, so `assignedBy` is the original assigner, not the caller.
        """
        assignment = await area_service.assign_zone_to_team(
            info.context["db"], actor=require_authenticated(info),
            zone_uuid=str(input.zone_uuid), team_uuid=str(input.team_uuid),
        )
        return ZoneAssignmentType.from_model(assignment)

    @strawberry.mutation
    async def remove_zone_from_team(
        self, info: strawberry.types.Info, input: ZoneTeamAssignmentInput
    ) -> bool:
        """Remove a team zone's assignment to a team; the zone's last team cannot be removed.

        Requires work_zone.assign permission. Returns True on success.
        """
        await area_service.remove_zone_from_team(
            info.context["db"], actor=require_authenticated(info),
            zone_uuid=str(input.zone_uuid), team_uuid=str(input.team_uuid),
        )
        return True
