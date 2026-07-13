"""GraphQL types, inputs, and enums for announcements."""

from datetime import datetime
from enum import Enum
from uuid import UUID

import strawberry


@strawberry.enum
class AnnouncementFilter(Enum):
    """Filter for listing announcements."""

    ACTIVE = "active"  # only active, non-deleted announcements (public)
    ALL = "all"        # active + inactive non-deleted announcements (admin only)


@strawberry.enum
class AnnouncementMoveDirection(Enum):
    """Direction to move an announcement within the ordered list."""

    UP = "up"
    DOWN = "down"


@strawberry.type
class AnnouncementType:
    """GraphQL type representing a site-wide announcement."""

    uuid: UUID
    content: str
    active: bool
    order: int | None = strawberry.field(
        default=None,
        description="Display position (1 = top) among active announcements; null when inactive",
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who created this announcement"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "AnnouncementType":
        """Build from a SQLAlchemy model instance (maps display_order → order)."""
        return cls(
            uuid=m.uuid, content=m.content, active=m.active,
            order=m.display_order, created_by=m.created_by,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.input
class CreateAnnouncementInput:
    """Input for creating an announcement (created active, appended at the bottom)."""

    content: str = strawberry.field(description="The announcement body text")


@strawberry.input
class UpdateAnnouncementInput:
    """Input for editing an announcement's content."""

    content: str = strawberry.field(description="The new announcement body text")
