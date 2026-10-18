"""GraphQL types, inputs, and enums for announcements."""

from datetime import datetime
from enum import Enum
from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.graphql.shared import UserRefType, staff_user_ref


@strawberry.enum
class AnnouncementFilter(Enum):
    """Filter for listing announcements."""

    ACTIVE = "active"  # only active, non-deleted announcements (public)
    DRAFT = "draft"  # never-published drafts (admin only)
    ALL = "all"  # active + inactive + draft non-deleted announcements (admin only)


@strawberry.enum
class AnnouncementMoveDirection(Enum):
    """Direction to move an announcement within the ordered list."""

    UP = "up"
    DOWN = "down"


@strawberry.enum
class AnnouncementPlacement(Enum):
    """Which page shows an announcement: the admin site, the public site, or both."""

    admin_page = "admin_page"
    public_page = "public_page"
    all = "all"


@strawberry.type
class AnnouncementType:
    """GraphQL type representing a site-wide announcement."""

    uuid: UUID
    content: str
    active: bool
    placement: str = strawberry.field(description="admin_page, public_page, or all (both pages)")
    order: int | None = strawberry.field(
        default=None,
        description="Display position (1 = top) among active announcements; null when inactive",
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who created this announcement"
    )
    status: str = strawberry.field(default="active", description="'draft', 'active' or 'inactive'")
    published_at: datetime | None = strawberry.field(
        default=None, description="When it last went live; null while a draft"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None
    _updated_by: strawberry.Private[str | None] = None

    @strawberry.field(description="Who created it. Null unless the caller holds announcement.edit")
    async def creator(self, info: strawberry.types.Info) -> UserRefType | None:
        """The announcement's author, to editors only."""
        return await staff_user_ref(info, self.created_by, Perm.ANN_EDIT)

    @strawberry.field(description="Who last changed it. Null unless the caller holds announcement.edit")
    async def updater(self, info: strawberry.types.Info) -> UserRefType | None:
        """The last editor, to editors only."""
        return await staff_user_ref(info, self._updated_by, Perm.ANN_EDIT)

    @classmethod
    def from_model(cls, m) -> "AnnouncementType":
        """Build from a SQLAlchemy model instance (maps display_order → order)."""
        status = "draft" if m.published_at is None else "active" if m.active else "inactive"
        return cls(
            uuid=m.uuid,
            content=m.content,
            active=m.active,
            placement=m.placement,
            order=m.display_order,
            created_by=m.created_by,
            status=status,
            published_at=m.published_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
            _updated_by=m.updated_by,
        )


@strawberry.input
class CreateAnnouncementInput:
    """Input for creating a draft announcement."""

    content: str = strawberry.field(description="The announcement body text")
    placement: AnnouncementPlacement = strawberry.field(
        default=AnnouncementPlacement.all, description="Which page shows it; defaults to both"
    )


@strawberry.input
class UpdateAnnouncementInput:
    """Input for editing an announcement's content and, optionally, its placement."""

    content: str = strawberry.field(description="The new announcement body text")
    placement: AnnouncementPlacement | None = strawberry.field(
        default=None, description="Which page shows it; omit to keep the current placement"
    )
