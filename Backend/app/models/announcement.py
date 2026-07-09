"""SQLAlchemy model for site-wide announcements."""

from sqlalchemy import Boolean, ForeignKey, Integer, Text, text
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
    """

    __tablename__ = "announcements"
    content: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), default=False)
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
