from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import UUIDPKMixin, TimestampMixin, Base


class Photo(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "photos"
    ref_uuid: Mapped[str] = mapped_column(String)
    ref_type: Mapped[str] = mapped_column(String(50))  # ticket/pole
    url: Mapped[str] = mapped_column(String(500))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
