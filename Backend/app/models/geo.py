from datetime import datetime
from geoalchemy2 import Geometry
from sqlalchemy import String, ForeignKey, Boolean, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import UUIDPKMixin, TimestampMixin, Base
from typing import Optional


class BaseGeometry(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "base_geometries"
    property_name: Mapped[str] = mapped_column(String(50))
    geometry = mapped_column(Geometry("GEOMETRY", srid=4326))
    created_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.uuid"))

    __mapper_args__ = {
        "polymorphic_on": property_name,
        "polymorphic_identity": "base",
    }


class ClosureArea(BaseGeometry):
    __tablename__ = "closure_areas"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    status: Mapped[str] = mapped_column(String(50))
    information_source: Mapped[Optional[str]] = mapped_column(String)
    comment: Mapped[Optional[str]] = mapped_column(String)

    __mapper_args__ = {
        "polymorphic_identity": "closure_area",
    }


class Station(BaseGeometry):
    __tablename__ = "stations"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    child_station_uuid: Mapped[Optional[str]] = mapped_column(ForeignKey("stations.uuid"), nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(50))
    name: Mapped[Optional[str]] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(String)
    op_hour: Mapped[Optional[str]] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(default=0)
    comment: Mapped[Optional[str]] = mapped_column(String)
    source: Mapped[Optional[str]] = mapped_column(String(50))
    visibility: Mapped[Optional[str]] = mapped_column(String(50))
    verification_status: Mapped[Optional[str]] = mapped_column(String(50))
    confidence_score: Mapped[Optional[float]] = mapped_column(Float)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    dedup_group_id: Mapped[Optional[str]] = mapped_column(String)
    is_temporary: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_score: Mapped[Optional[float]] = mapped_column(Float)
    updated_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.uuid"), nullable=True)

    __mapper_args__ = {
        "polymorphic_identity": "station",
    }

    properties: Mapped[list["StationProperty"]] = relationship(back_populates="station")
