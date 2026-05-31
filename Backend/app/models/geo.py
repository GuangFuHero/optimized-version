"""SQLAlchemy models for geospatial entities: BaseGeometry, Station, and ClosureArea."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class BaseGeometry(Base, UUIDPKMixin, TimestampMixin):
    """Base polymorphic ORM model for geospatial geometry entities."""

    __tablename__ = "base_geometries"
    property_name: Mapped[str] = mapped_column(String(50))
    geometry = mapped_column(Geometry("GEOMETRY", srid=4326))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))

    __mapper_args__ = {
        "polymorphic_on": property_name,
        "polymorphic_identity": "base",
    }


class ClosureArea(BaseGeometry):
    """ORM model for a road or area closure with status and source information."""

    __tablename__ = "closure_areas"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    status: Mapped[str] = mapped_column(String(50))
    information_source: Mapped[str | None] = mapped_column(String)
    comment: Mapped[str | None] = mapped_column(String)

    __mapper_args__ = {
        "polymorphic_identity": "closure_area",
    }


class Station(BaseGeometry):
    """ORM model for a disaster relief station with type, location, and operational metadata."""

    __tablename__ = "stations"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    child_station_uuid: Mapped[str | None] = mapped_column(ForeignKey("stations.uuid"), nullable=True)
    type: Mapped[str | None] = mapped_column(String(50))
    name: Mapped[str | None] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)
    op_hour: Mapped[str | None] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(default=0)
    comment: Mapped[str | None] = mapped_column(String)
    source: Mapped[str | None] = mapped_column(String(50))
    visibility: Mapped[str | None] = mapped_column(String(50))
    verification_status: Mapped[str | None] = mapped_column(String(50))
    confidence_score: Mapped[float | None] = mapped_column(Float)
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    dedup_group_id: Mapped[str | None] = mapped_column(String)
    is_temporary: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_score: Mapped[float | None] = mapped_column(Float)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)

    __mapper_args__ = {
        "polymorphic_identity": "station",
    }

    properties: Mapped[list["StationProperty"]] = relationship(back_populates="station")  # noqa: F821
