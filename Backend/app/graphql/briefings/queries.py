"""GraphQL queries for briefing templates and briefings."""

from uuid import UUID

import strawberry

from app.graphql.briefings.types import BriefingState, BriefingTemplateType, BriefingType
from app.graphql.context import check_permission
from app.repositories.briefings_repository import (
    briefing_repository,
    briefing_template_repository,
)


@strawberry.type
class BriefingQuery:
    """GraphQL queries for briefing templates and generated briefings."""

    @strawberry.field
    async def briefing_templates(
        self,
        info: strawberry.types.Info,
        state: BriefingState | None = None,
        tag: str | None = None,
    ) -> list[BriefingTemplateType]:
        """List non-deleted templates, optionally filtered by state and/or tag.

        Requires briefing:read.
        """
        await check_permission(info, "briefing", "read")
        items = await briefing_template_repository.list_templates(
            info.context["db"], state=state.value if state else None, tag=tag
        )
        return [BriefingTemplateType.from_model(t) for t in items]

    @strawberry.field
    async def briefing_template(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> BriefingTemplateType | None:
        """Fetch a single non-deleted template by UUID. Requires briefing:read."""
        await check_permission(info, "briefing", "read")
        m = await briefing_template_repository.get_by_uuid_active(info.context["db"], uuid)
        return BriefingTemplateType.from_model(m) if m else None

    @strawberry.field
    async def briefings(
        self,
        info: strawberry.types.Info,
        state: BriefingState | None = None,
        tag: str | None = None,
    ) -> list[BriefingType]:
        """List non-deleted briefings, optionally filtered by state and/or tag.

        Requires briefing:read.
        """
        await check_permission(info, "briefing", "read")
        items = await briefing_repository.list_briefings(
            info.context["db"], state=state.value if state else None, tag=tag
        )
        return [BriefingType.from_model(b) for b in items]

    @strawberry.field
    async def briefing(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> BriefingType | None:
        """Fetch a single non-deleted briefing by UUID. Requires briefing:read."""
        await check_permission(info, "briefing", "read")
        m = await briefing_repository.get_by_uuid_active(info.context["db"], uuid)
        return BriefingType.from_model(m) if m else None
