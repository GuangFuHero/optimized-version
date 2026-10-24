"""GraphQL mutations for announcements."""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.announcements.types import (
    AnnouncementType,
    CreateAnnouncementInput,
    UpdateAnnouncementInput,
)
from app.graphql.context import check_permission
from app.repositories.announcements_repository import announcement_repository


@strawberry.type
class AnnouncementMutation:
    """Mutations for creating, editing, publishing, and removing announcements."""

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
        announcement.publish, and moving one onto a page replaces what is live there.
        """
        await check_permission(info, Perm.ANN_EDIT)
        a = await announcement_repository.edit(
            info.context["db"],
            uuid=uuid,
            content=input.content,
            placement=input.placement.value if input.placement is not None else None,
            actor_uuid=str(info.context["user"].uuid),
            check_live=lambda: check_permission(info, Perm.ANN_PUBLISH),
        )
        if not a:
            raise ValueError("Announcement not found")
        return AnnouncementType.from_model(a)

    @strawberry.mutation
    async def set_announcement_active(
        self, info: strawberry.types.Info, uuid: UUID, active: bool
    ) -> AnnouncementType:
        """Activate (publishing it, and replacing what is live on its pages) or deactivate.

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
        """Soft-delete an announcement, taking it down if live. Requires announcement.delete."""
        await check_permission(info, Perm.ANN_DELETE)
        ok = await announcement_repository.soft_delete_announcement(info.context["db"], uuid=uuid)
        if not ok:
            raise ValueError("Announcement not found")
        return True
