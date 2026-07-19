"""SQLAlchemy models for teams and work zones (RBAC v1, Spec/008-rbac-authorization/decisions.md §2B)."""

from geoalchemy2 import Geometry
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin


class Team(Base, UUIDPKMixin, TimestampMixin):
    """A gov or NGO organization.

    A team IS its own scope boundary (ADR-053): team-scope filters key on its own uuid,
    not a team_uuid column.
    """

    __tablename__ = "teams"
    # ADR-053: team-scope resources filter on this column; Team's boundary is its own uuid.
    __team_scope_attr__ = "uuid"
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(10))  # "gov" | "ngo" — drives gov/ngo scope
    tax_id: Mapped[str | None] = mapped_column(String(8), nullable=True)  # 統一編號 (UBN), 8 碼
    status: Mapped[str] = mapped_column(String(20), default="active")


class WorkZone(Base, UUIDPKMixin, TimestampMixin):
    """A gov-drawn polygon defining a disaster response area (ADR-021)."""

    __tablename__ = "work_zones"
    name: Mapped[str] = mapped_column(String(100))
    geometry = mapped_column(Geometry("MULTIPOLYGON", srid=4326))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)


class TeamZoneAssign(Base, UUIDPKMixin):
    """Junction table: a gov assigns a WorkZone to a Team for `zone` scope."""

    __tablename__ = "team_zone_assign"
    __table_args__ = (UniqueConstraint("team_uuid", "zone_uuid", name="uq_team_zone"),)
    team_uuid: Mapped[str] = mapped_column(ForeignKey("teams.uuid"), index=True)
    zone_uuid: Mapped[str] = mapped_column(ForeignKey("work_zones.uuid"), index=True)
