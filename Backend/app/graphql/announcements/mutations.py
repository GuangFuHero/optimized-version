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
        """Create a draft announcement; activating it publishes it. Requires announcement.edit."""
        await check_permission(info, Perm.ANN_EDIT)
        actor = str(info.context["user"].uuid)
        a = await announcement_repository.create(
            info.context["db"],
            obj_in={
                "content": input.content,
                "placement": input.placement.value,
                "created_by": actor,
                "updated_by": actor,
            },
        )
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def update_announcement(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateAnnouncementInput
    ) -> AnnouncementType:
        """Edit an announcement's content and, optionally, its placement. Requires announcement.edit.

        A live announcement's edits are public as soon as they're saved, so editing one also requires
        announcement.publish.
        """
        await check_permission(info, Perm.ANN_EDIT)
        db = info.context["db"]
        a = await announcement_repository.get_by_uuid_active(db, uuid, for_update=True)
        if not a:
            raise ValueError("Announcement not found")
        if a.active:
            await check_permission(info, Perm.ANN_PUBLISH)
        changes = {"content": input.content, "updated_by": str(info.context["user"].uuid)}
        if input.placement is not None:
            changes["placement"] = input.placement.value
        a = await announcement_repository.update(db, db_obj=a, obj_in=changes)
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
        """Activate (append at end, which publishes a draft) or deactivate (remove from order).

        Activating requires announcement.publish and deactivating announcement.edit.
        """
        await check_permission(info, Perm.ANN_PUBLISH if active else Perm.ANN_EDIT)
        a = await announcement_repository.set_active(
            info.context["db"], uuid=uuid, active=active, actor_uuid=str(info.context["user"].uuid)
        )
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
