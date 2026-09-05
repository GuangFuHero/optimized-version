"""SQLAlchemy models for geospatial entities: BaseGeometry, Station, and ClosureArea."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class BaseGeometry(Base, UUIDPKMixin, TimestampMixin):
    """Base polymorphic ORM model for geospatial geometry entities."""

    __tablename__ = "base_geometries"
    # geoalchemy2 already builds a GIST index on `geometry` itself, but that one cannot serve
    # `ST_DWithin(geometry::geography, ..., metres)` — a geography operand is a different
    # operator class, so the planner falls back to a sequential scan over every geometry row.
    # The dedup fast layer's candidate retrieval is exactly that query (see
    # repositories/dedup_repository.py), and it runs on the submit path, so it needs the
    # matching functional index. Declared here as well as in the migration so a
    # `create_all` schema (which is how the tests build one) matches production.
    __table_args__ = (
        Index(
            "ix_base_geometries_geography",
            text("(geometry::geography)"),
            postgresql_using="gist",
        ),
    )
    property_name: Mapped[str] = mapped_column(String(50))
    geometry = mapped_column(Geometry("GEOMETRY", srid=4326))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))
    # No `team_uuid` here (ADR-049, 乙): a geo resource's jurisdiction is decided by geography
    # — whether its point falls inside a WorkZone polygon assigned to a team (`zone` scope) —
    # not by a stored owning-org. Removed to keep authorization purely capability + own + zone.

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
    contact_name: Mapped[str | None] = mapped_column(String(100))
    contact_email: Mapped[str | None] = mapped_column(String(100))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    operational_status: Mapped[str] = mapped_column(String(20), server_default="active")
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __mapper_args__ = {
        "polymorphic_identity": "station",
    }

    properties: Mapped[list["StationProperty"]] = relationship(back_populates="station")  # noqa: F821
