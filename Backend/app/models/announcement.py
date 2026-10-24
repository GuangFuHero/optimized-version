"""SQLAlchemy model for site-wide announcements."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Announcement(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a site-wide announcement.

    Each page shows at most one live (active, non-deleted) announcement, and one on "all"
    takes both pages (ADR-363). Publishing replaces what is live (see ``AnnouncementRepository``).

    A new announcement is an inactive draft until first activated. ``published_at`` and
    ``published_by`` (when it last went live, and who did it) tell a draft apart from a deactivated one.
    """

    __tablename__ = "announcements"
    __table_args__ = (
        # One index per page, so a live "all" row counts on both. Every row an index covers has
        # active = true, so being unique on it admits one row. A placement outside the three is
        # read as admin_page (ADR-309), so it takes the admin page here too.
        Index(
            "uq_announcements_live_public_page", "active",
            unique=True,
            postgresql_where=text("active AND delete_at IS NULL AND placement IN ('public_page', 'all')"),
        ),
        Index(
            "uq_announcements_live_admin_page", "active",
            unique=True,
            postgresql_where=text("active AND delete_at IS NULL AND placement <> 'public_page'"),
        ),
    )
    content: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), default=False)
    # Which page shows it: "admin_page", "public_page" or "all" (both).
    placement: Mapped[str] = mapped_column(Text, server_default=text("'all'"), default="all")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    updated_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)
