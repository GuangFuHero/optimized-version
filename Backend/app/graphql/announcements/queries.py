"""GraphQL queries for announcements."""

from uuid import UUID

import strawberry

from app.graphql.announcements.types import AnnouncementFilter, AnnouncementType
from app.graphql.context import check_permission
from app.repositories.announcements_repository import announcement_repository


@strawberry.type
class AnnouncementQuery:
    """GraphQL queries for site-wide announcements."""

    @strawberry.field
    async def announcements(
        self,
        info: strawberry.types.Info,
        filter: AnnouncementFilter = AnnouncementFilter.ACTIVE,
    ) -> list[AnnouncementType]:
        """List announcements.

        ACTIVE (default) returns only active announcements and is public. ALL also returns
        inactive (non-deleted) announcements and requires content:edit permission.
        """
        if filter is AnnouncementFilter.ALL:
            await check_permission(info, "content", "edit")
        items = await announcement_repository.list_announcements(
            info.context["db"], only_active=(filter is AnnouncementFilter.ACTIVE)
        )
        return [AnnouncementType.from_model(a) for a in items]

    @strawberry.field
    async def announcement(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> AnnouncementType | None:
        """Fetch a single non-deleted announcement by UUID.

        Active announcements are public; reading an inactive one requires content:edit.
        Returns None if not found or soft-deleted.
        """
        m = await announcement_repository.get_by_uuid_active(info.context["db"], uuid)
        if m and not m.active:
            await check_permission(info, "content", "edit")
        return AnnouncementType.from_model(m) if m else None
