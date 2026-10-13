"""SQLAlchemy models for teams and team zones (RBAC v1, Spec/008-rbac-authorization/decisions.md §2B)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPKMixin
from app.models.geo import AreaPolygon


class Team(Base, UUIDPKMixin, TimestampMixin):
    """A gov or NGO organization.

    A team IS its own scope boundary (ADR-053): team-scope filters key on its own uuid,
    not a team_uuid column.
    """

    __tablename__ = "teams"
    # ADR-053: team-scope resources filter on this column; Team's boundary is its own uuid.
    __team_scope_attr__ = "uuid"
    name: Mapped[str] = mapped_column(String(100))
    # "gov" | "ngo". Organizational kind, NOT a scope: the Scope enum is
    # none/own/team/zone/all (app/core/rbac_scopes.py) and has never carried a gov or ngo
    # value. Both kinds resolve through `team` scope, keyed on this row's own uuid above.
    type: Mapped[str] = mapped_column(String(10))
    tax_id: Mapped[str | None] = mapped_column(String(8), nullable=True)  # 統一編號 (UBN), 8 碼
    status: Mapped[str] = mapped_column(String(20), default="active")


class TeamZone(AreaPolygon):
    """責任區: the only area a team can be assigned to, and so the only source of `zone` scope."""

    __tablename__ = "team_zones"
    uuid: Mapped[str] = mapped_column(ForeignKey("area_polygons.uuid"), primary_key=True)

    __mapper_args__ = {"polymorphic_identity": "team_zone"}


class TeamZoneAssign(Base, UUIDPKMixin):
    """Junction table: a gov assigns a TeamZone to a Team, which grants that team `zone` scope.

    `created_at` / `assigned_by` are copied from audit_logs for cheap display; audit_logs stays
    the history, since these columns vanish with the row on unassign.
    """

    __tablename__ = "team_zone_assign"
    __table_args__ = (UniqueConstraint("team_uuid", "zone_uuid", name="uq_team_zone"),)
    team_uuid: Mapped[str] = mapped_column(ForeignKey("teams.uuid"), index=True)
    zone_uuid: Mapped[str] = mapped_column(ForeignKey("team_zones.uuid"), index=True)
    # server_default is required, not optional: tests build the schema with
    # Base.metadata.create_all (tests/test_graphql/conftest.py), never through alembic.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    assigned_by: Mapped[str] = mapped_column(ForeignKey("users.uuid"))
