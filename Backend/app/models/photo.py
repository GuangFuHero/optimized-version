"""SQLAlchemy model for photos attached to geo entities or tickets."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Photo(Base, UUIDPKMixin, TimestampMixin):
    """ORM model for a photo attached to a ticket or geo entity."""

    __tablename__ = "photos"
    ref_uuid: Mapped[str] = mapped_column(String)
    ref_type: Mapped[str] = mapped_column(String(50))  # ticket/pole
    url: Mapped[str] = mapped_column(String(500))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
