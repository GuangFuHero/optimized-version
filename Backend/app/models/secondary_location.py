from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import UUIDPKMixin, Base
from typing import Optional


class SecondaryLocation(Base, UUIDPKMixin):
    __tablename__ = "secondary_locations"
    geometry_uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"))
    location_type: Mapped[str] = mapped_column(String(50))  # address/pole
    county: Mapped[Optional[str]] = mapped_column(String(50))
    city: Mapped[Optional[str]] = mapped_column(String(50))
    lane: Mapped[Optional[str]] = mapped_column(String(20))
    alley: Mapped[Optional[str]] = mapped_column(String(20))
    no: Mapped[Optional[str]] = mapped_column(String(20))
    floor: Mapped[Optional[str]] = mapped_column(String(20))
    room: Mapped[Optional[str]] = mapped_column(String(20))
    pole_id: Mapped[Optional[str]] = mapped_column(String(50))
    pole_type: Mapped[Optional[str]] = mapped_column(String(50))
    pole_photo_uuid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pole_note: Mapped[Optional[str]] = mapped_column(String)
