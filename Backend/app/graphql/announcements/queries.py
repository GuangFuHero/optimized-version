"""GraphQL queries for announcements."""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.announcements.types import (
    AnnouncementFilter,
    AnnouncementPlacement,
    AnnouncementType,
)
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
        placement: AnnouncementPlacement = AnnouncementPlacement.PUBLIC_PAGE,
    ) -> list[AnnouncementType]:
        """List announcements shown on `placement`; only PUBLIC_PAGE (default) is open to guests.

        ADMIN_PAGE and ALL (every placement) need announcement.view_admin, and filter ALL
        (inactive ones too) needs announcement.edit.
        """
        if placement is not AnnouncementPlacement.PUBLIC_PAGE:
            await check_permission(info, Perm.ANN_VIEW_ADMIN)
        if filter is AnnouncementFilter.ALL:
            await check_permission(info, Perm.ANN_EDIT)
        items = await announcement_repository.list_announcements(
            info.context["db"],
            only_active=(filter is AnnouncementFilter.ACTIVE),
            placement=placement.value,
        )
        return [AnnouncementType.from_model(a) for a in items]

    @strawberry.field
    async def announcement(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> AnnouncementType | None:
        """Fetch a single non-deleted announcement by UUID, or None if missing or soft-deleted.

        Admin-page announcements need announcement.view_admin, and inactive ones need
        announcement.edit.
        """
        m = await announcement_repository.get_by_uuid_active(info.context["db"], uuid)
        if m and m.placement == AnnouncementPlacement.ADMIN_PAGE.value:
            await check_permission(info, Perm.ANN_VIEW_ADMIN)
        if m and not m.active:
            await check_permission(info, Perm.ANN_EDIT)
        return AnnouncementType.from_model(m) if m else None
