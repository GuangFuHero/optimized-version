"""SQLAlchemy models for geospatial entities: BaseGeometry, Station, and the map areas."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Computed, DateTime, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.search import search_text_expression, search_text_index, truncated


class BaseGeometry(Base, UUIDPKMixin, TimestampMixin):
    """Base polymorphic ORM model for geospatial geometry entities."""

    __tablename__ = "base_geometries"
    property_name: Mapped[str] = mapped_column(String(50))
    geometry = mapped_column(Geometry("GEOMETRY", srid=4326))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"))
    # No `team_uuid` here (ADR-049, 乙): a ticket's jurisdiction is decided by geography —
    # whether its point falls inside a TeamZone polygon assigned to a team (`zone` scope).
    # Stations are the exception and carry their own `team_uuid` (ADR-285).

    __mapper_args__ = {
        "polymorphic_on": property_name,
        "polymorphic_identity": "base",
    }


class AreaPolygon(BaseGeometry):
    """A drawn map area; its geometry is always a Polygon or MultiPolygon, checked on write."""

    __tablename__ = "area_polygons"
    uuid: Mapped[str] = mapped_column(ForeignKey("base_geometries.uuid"), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(100))
    note: Mapped[str | None] = mapped_column(String)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    __mapper_args__ = {"polymorphic_abstract": True}


class HazardousZone(AreaPolygon):
    """危險區: a no-entry area that is always public and never has a team."""

    __tablename__ = "hazardous_zones"
    uuid: Mapped[str] = mapped_column(ForeignKey("area_polygons.uuid"), primary_key=True)
    status: Mapped[str] = mapped_column(String(50))
    information_source: Mapped[str | None] = mapped_column(String)

    # Loaded inline so a query on AreaPolygon also fetches `status`; async code cannot lazy-load it.
    __mapper_args__ = {"polymorphic_identity": "hazardous_zone", "polymorphic_load": "inline"}


class MarkZone(AreaPolygon):
    """標示區: a marker area with no team; it has no columns of its own, so it has no table."""

    __mapper_args__ = {"polymorphic_identity": "mark_zone"}


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
    is_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    dedup_group_id: Mapped[str | None] = mapped_column(String)
    is_temporary: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)
    # The one team that runs this station, assigned by hand; null = unassigned (ADR-285). This is
    # what `team` scope compares against for stations, instead of the TeamZone geometry tickets use.
    team_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("teams.uuid", ondelete="SET NULL"), nullable=True, index=True
    )
    contact_name: Mapped[str | None] = mapped_column(String(100))
    contact_email: Mapped[str | None] = mapped_column(String(100))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    operational_status: Mapped[str] = mapped_column(String(20), server_default="active")
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Keyword-search column, maintained by PostgreSQL (ADR-079/081). The field list here
    # IS the positive list — see app/models/search.py before changing it.
    # `name` is truncated, not plain(): it is an unbounded String with no length
    # validation on CreateStationInput, so a single pasted document would put one trigram
    # entry per character into the GIN index (ADR-151).
    search_text: Mapped[str] = mapped_column(
        String,
        Computed(search_text_expression(truncated("name"), truncated("description")), persisted=True),
        deferred=True,
    )

    __mapper_args__ = {
        "polymorphic_identity": "station",
    }

    __table_args__ = (search_text_index("stations"),)

    properties: Mapped[list["StationProperty"]] = relationship(back_populates="station")  # noqa: F821
