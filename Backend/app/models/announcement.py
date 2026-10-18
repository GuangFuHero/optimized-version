"""SQLAlchemy model for site-wide announcements."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Announcement(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a site-wide announcement.

    Ordering invariant: ``display_order IS NOT NULL`` iff the row is active and not
    soft-deleted. Live (active, non-deleted) rows hold a contiguous ``1..N`` sequence
    (1 = top of the list); deactivating or deleting nulls the order and closes the gap.
    Order uniqueness is enforced in the application layer (see ``AnnouncementRepository``),
    not by a DB constraint — consistent with the rest of the schema.

    ``display_order`` is named that way (not ``order``) because ``order`` is a SQL reserved
    word; it is exposed as the ``order`` field in GraphQL.

    A new announcement is an inactive draft until first activated. ``published_at`` (when it
    last went live) is what tells a draft apart from a deactivated announcement.
    """

    __tablename__ = "announcements"
    content: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), default=False)
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Which page shows it: "admin_page", "public_page" or "all" (both).
    placement: Mapped[str] = mapped_column(Text, server_default=text("'all'"), default="all")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
