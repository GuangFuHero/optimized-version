"""GraphQL mutations for announcements."""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.announcements.types import (
    AnnouncementMoveDirection,
    AnnouncementType,
    CreateAnnouncementInput,
    UpdateAnnouncementInput,
)
from app.graphql.context import check_permission
from app.repositories.announcements_repository import announcement_repository


@strawberry.type
class AnnouncementMutation:
    """Mutations for creating, editing, ordering, and removing announcements."""

    @strawberry.mutation
    async def create_announcement(
        self, info: strawberry.types.Info, input: CreateAnnouncementInput
    ) -> AnnouncementType:
        """Create an active announcement appended at the bottom of the list.

        Requires announcement.publish. Returns the created AnnouncementType.
        """
        await check_permission(info, Perm.ANN_PUBLISH)
        a = await announcement_repository.create_at_end(
            info.context["db"],
            content=input.content,
            created_by=str(info.context["user"].uuid),
        )
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def update_announcement(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateAnnouncementInput
    ) -> AnnouncementType:
        """Edit an announcement's content. Requires announcement.edit."""
        await check_permission(info, Perm.ANN_EDIT)
        db = info.context["db"]
        a = await announcement_repository.get_by_uuid_active(db, uuid)
        if not a:
            raise ValueError("Announcement not found")
        a = await announcement_repository.update(db, db_obj=a, obj_in={"content": input.content})
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def move_announcement(
        self, info: strawberry.types.Info, uuid: UUID, direction: AnnouncementMoveDirection
    ) -> AnnouncementType:
        """Move an active announcement up or down one position. Requires announcement.edit."""
        await check_permission(info, Perm.ANN_EDIT)
        a = await announcement_repository.move(
            info.context["db"], uuid=uuid, up=(direction is AnnouncementMoveDirection.UP)
        )
        if a is None:
            raise ValueError("Announcement not found or not active")
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def set_announcement_active(
        self, info: strawberry.types.Info, uuid: UUID, active: bool
    ) -> AnnouncementType:
        """Activate (append at end) or deactivate (remove from order) an announcement.

        Requires announcement.edit. Returns the updated AnnouncementType.
        """
        await check_permission(info, Perm.ANN_EDIT)
        a = await announcement_repository.set_active(info.context["db"], uuid=uuid, active=active)
        if a is None:
            raise ValueError("Announcement not found")
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def delete_announcement(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        """Soft-delete an announcement and close the order gap. Requires announcement.delete."""
        await check_permission(info, Perm.ANN_DELETE)
        ok = await announcement_repository.soft_delete_announcement(info.context["db"], uuid=uuid)
        if not ok:
            raise ValueError("Announcement not found")
        return True
