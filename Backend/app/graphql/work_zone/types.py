"""GraphQL types for Work Zones (gov-drawn disaster response boundaries, ADR-021)."""

from datetime import datetime
from uuid import UUID

import strawberry

from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import PageInfo


@strawberry.type
class WorkZoneType:
    """GraphQL type representing a Work Zone."""

    uuid: UUID
    name: str
    geometry: GeoJSON | None = strawberry.field(
        default=None, description="GeoJSON Polygon or MultiPolygon marking the zone boundary"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the gov user who drew this zone"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "WorkZoneType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, name=m.name, geometry=geom_to_geojson(m.geometry),
            created_by=m.created_by, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class WorkZoneConnection:
    """Paginated list of work zones with page metadata."""

    items: list[WorkZoneType]
    page_info: PageInfo


@strawberry.type
class ZoneAssignmentType:
    """A team <-> work zone delegation, with who created it and when.

    `assigned_by` is the user uuid as a scalar rather than a nested user object: GraphQL has
    no User type in this schema, and adding one would widen this change considerably. Mirrors
    WorkZoneType.created_by.
    """

    zone_uuid: UUID
    team_uuid: UUID
    assigned_at: datetime | None = None
    assigned_by: str | None = None

    @classmethod
    def from_model(cls, m) -> "ZoneAssignmentType":
        """Build from a TeamZoneAssign model instance."""
        return cls(
            zone_uuid=m.zone_uuid,
            team_uuid=m.team_uuid,
            assigned_at=m.created_at,
            assigned_by=str(m.assigned_by) if m.assigned_by else None,
        )


@strawberry.input
class CreateWorkZoneInput:
    """Input for creating a new work zone."""

    name: str
    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Polygon or MultiPolygon — must not be a Point"
    )


@strawberry.input
class UpdateWorkZoneInput:
    """Input for updating an existing work zone. UNSET fields are left unchanged."""

    name: str | None = strawberry.UNSET
    geometry: GeoJSON | None = None


@strawberry.input
class ZoneTeamAssignmentInput:
    """Input naming a (zone, team) pair to link or unlink."""

    zone_uuid: UUID
    team_uuid: UUID
