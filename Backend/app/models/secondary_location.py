"""SQLAlchemy model for secondary address and pole location details linked to a geometry."""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class SecondaryLocation(Base, UUIDPKMixin):
    """ORM model for a secondary address or pole location linked to a geometry."""

    __tablename__ = "secondary_locations"
    geometry_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
    location_type: Mapped[str] = mapped_column(String(50))  # address/pole
    county: Mapped[str | None] = mapped_column(String(50))
    city: Mapped[str | None] = mapped_column(String(50))
    lane: Mapped[str | None] = mapped_column(String(20))
    alley: Mapped[str | None] = mapped_column(String(20))
    no: Mapped[str | None] = mapped_column(String(20))
    floor: Mapped[str | None] = mapped_column(String(20))
    room: Mapped[str | None] = mapped_column(String(20))
    pole_id: Mapped[str | None] = mapped_column(String(50))
    pole_type: Mapped[str | None] = mapped_column(String(50))
    pole_photo_uuid: Mapped[str | None] = mapped_column(String, nullable=True)
    pole_note: Mapped[str | None] = mapped_column(String)
