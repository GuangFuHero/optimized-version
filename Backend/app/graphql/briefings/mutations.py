"""GraphQL mutations for briefing templates and briefings."""

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
from app.graphql.context import check_permission
from app.repositories.briefings_repository import (
    briefing_repository,
    briefing_template_repository,
)


def _update_fields(input) -> dict:
    """Collect provided (non-None) content/tags/state fields, mapping the state enum to str."""
    obj_in: dict = {}
    if input.content is not None:
        obj_in["content"] = input.content
    if input.tags is not None:
        obj_in["tags"] = input.tags
    if input.state is not None:
        obj_in["state"] = input.state.value
    return obj_in


@strawberry.type
class BriefingMutation:
    """Mutations for creating, generating, editing, and removing briefings."""

    @strawberry.mutation
    async def create_briefing_template(
        self, info: strawberry.types.Info, input: CreateBriefingTemplateInput
    ) -> BriefingTemplateType:
        """Create a briefing template. Requires briefing:create."""
        await check_permission(info, "briefing", "create")
        t = await briefing_template_repository.create(
            info.context["db"],
            obj_in={
                "content": input.content,
                "tags": input.tags,
                "state": input.state.value,
                "created_by": str(info.context["user"].uuid),
            },
        )
        return BriefingTemplateType.from_model(t)

    @strawberry.mutation
    async def update_briefing_template(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateBriefingTemplateInput
    ) -> BriefingTemplateType:
        """Edit a briefing template. Requires briefing:edit."""
        await check_permission(info, "briefing", "edit")
        db = info.context["db"]
        t = await briefing_template_repository.get_by_uuid_active(db, uuid)
        if not t:
            raise ValueError("Briefing template not found")
        t = await briefing_template_repository.update(db, db_obj=t, obj_in=_update_fields(input))
        return BriefingTemplateType.from_model(t)

    @strawberry.mutation
    async def delete_briefing_template(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> bool:
        """Soft-delete a briefing template. Requires briefing:delete."""
        await check_permission(info, "briefing", "delete")
        db = info.context["db"]
        t = await briefing_template_repository.get_by_uuid_active(db, uuid)
        if not t:
            raise ValueError("Briefing template not found")
        await briefing_template_repository.soft_delete(db, db_obj=t)
        return True

    @strawberry.mutation
    async def generate_briefing(
        self, info: strawberry.types.Info, input: GenerateBriefingInput
    ) -> BriefingType:
        """Generate a briefing, optionally seeded from a template. Requires briefing:create."""
        await check_permission(info, "briefing", "create")
        b = await briefing_repository.generate_briefing(
            info.context["db"],
            created_by=str(info.context["user"].uuid),
            template_uuid=input.template_uuid,
            content=input.content,
            tags=input.tags,
            state=input.state.value if input.state else None,
        )
        return BriefingType.from_model(b)

    @strawberry.mutation
    async def update_briefing(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateBriefingInput
    ) -> BriefingType:
        """Edit a briefing. Requires briefing:edit."""
        await check_permission(info, "briefing", "edit")
        db = info.context["db"]
        b = await briefing_repository.get_by_uuid_active(db, uuid)
        if not b:
            raise ValueError("Briefing not found")
        b = await briefing_repository.update(db, db_obj=b, obj_in=_update_fields(input))
        return BriefingType.from_model(b)

    @strawberry.mutation
    async def delete_briefing(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete a briefing. Requires briefing:delete."""
        await check_permission(info, "briefing", "delete")
        db = info.context["db"]
        b = await briefing_repository.get_by_uuid_active(db, uuid)
        if not b:
            raise ValueError("Briefing not found")
        await briefing_repository.soft_delete(db, db_obj=b)
        return True
