"""GraphQL mutations for briefing templates and briefings.

Thin per ADR-AB-02: parse input, call the briefing service, map the result back to a GraphQL
type. Authz + validation + the generate-from-template rule live in app/services/briefing.py.
"""

from uuid import UUID

import strawberry

from app.graphql.briefings.types import (
    BriefingTemplateType,
    BriefingType,
    CreateBriefingTemplateInput,
    GenerateBriefingInput,
    UpdateBriefingInput,
    UpdateBriefingTemplateInput,
)
from app.graphql.context import require_authenticated
from app.services import briefing as briefing_service


@strawberry.type
class BriefingMutation:
    """Mutations for creating, generating, editing, and removing briefings."""

    @strawberry.mutation
    async def create_briefing_template(
        self, info: strawberry.types.Info, input: CreateBriefingTemplateInput
    ) -> BriefingTemplateType:
        """Create a briefing template. Requires briefing.create."""
        t = await briefing_service.create_template(
            info.context["db"], actor=require_authenticated(info),
            content=input.content, tags=input.tags, state=input.state.value,
        )
        return BriefingTemplateType.from_model(t)

    @strawberry.mutation
    async def update_briefing_template(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateBriefingTemplateInput
    ) -> BriefingTemplateType:
        """Edit a briefing template. Requires briefing.edit."""
        t = await briefing_service.update_template(
            info.context["db"], actor=require_authenticated(info), uuid=uuid,
            content=input.content, tags=input.tags,
            state=input.state.value if input.state else None,
        )
        return BriefingTemplateType.from_model(t)

    @strawberry.mutation
    async def delete_briefing_template(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> bool:
        """Soft-delete a briefing template. Requires briefing.delete."""
        await briefing_service.delete_template(
            info.context["db"], actor=require_authenticated(info), uuid=uuid
        )
        return True

    @strawberry.mutation
    async def generate_briefing(
        self, info: strawberry.types.Info, input: GenerateBriefingInput
    ) -> BriefingType:
        """Generate a briefing, optionally seeded from a template. Requires briefing.create."""
        b = await briefing_service.generate(
            info.context["db"], actor=require_authenticated(info),
            template_uuid=input.template_uuid, content=input.content, tags=input.tags,
            state=input.state.value if input.state else None,
        )
        return BriefingType.from_model(b)

    @strawberry.mutation
    async def update_briefing(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateBriefingInput
    ) -> BriefingType:
        """Edit a briefing. Requires briefing.edit."""
        b = await briefing_service.update(
            info.context["db"], actor=require_authenticated(info), uuid=uuid,
            content=input.content, tags=input.tags,
            state=input.state.value if input.state else None,
        )
        return BriefingType.from_model(b)

    @strawberry.mutation
    async def delete_briefing(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a briefing. Requires briefing.delete."""
        await briefing_service.delete(
            info.context["db"], actor=require_authenticated(info), uuid=uuid
        )
        return True
