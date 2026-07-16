"""GraphQL mutations for announcements.

Thin per ADR-AB-02: parse input, call the announcement service, map the result back to a
GraphQL type. Authz + validation live in app/services/announcement.py.
"""

from uuid import UUID

import strawberry

from app.graphql.announcements.types import (
    AnnouncementMoveDirection,
    AnnouncementType,
    CreateAnnouncementInput,
    UpdateAnnouncementInput,
)
from app.graphql.context import require_authenticated
from app.services import announcement as announcement_service


@strawberry.type
class AnnouncementMutation:
    """Mutations for creating, editing, ordering, and removing announcements."""

    @strawberry.mutation
    async def create_announcement(
        self, info: strawberry.types.Info, input: CreateAnnouncementInput
    ) -> AnnouncementType:
        """Create an active announcement appended at the bottom. Requires announcement.publish."""
        a = await announcement_service.create(
            info.context["db"], actor=require_authenticated(info), content=input.content
        )
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def update_announcement(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateAnnouncementInput
    ) -> AnnouncementType:
        """Edit an announcement's content. Requires announcement.edit."""
        a = await announcement_service.update(
            info.context["db"], actor=require_authenticated(info), uuid=uuid, content=input.content
        )
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def move_announcement(
        self, info: strawberry.types.Info, uuid: UUID, direction: AnnouncementMoveDirection
    ) -> AnnouncementType:
        """Move an active announcement up or down one position. Requires announcement.edit."""
        a = await announcement_service.move(
            info.context["db"], actor=require_authenticated(info),
            uuid=uuid, up=(direction is AnnouncementMoveDirection.UP),
        )
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def set_announcement_active(
        self, info: strawberry.types.Info, uuid: UUID, active: bool
    ) -> AnnouncementType:
        """Activate or deactivate an announcement. Requires announcement.edit."""
        a = await announcement_service.set_active(
            info.context["db"], actor=require_authenticated(info), uuid=uuid, active=active
        )
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def delete_announcement(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete an announcement and close the order gap. Requires announcement.delete."""
        await announcement_service.delete(
            info.context["db"], actor=require_authenticated(info), uuid=uuid
        )
        return True
