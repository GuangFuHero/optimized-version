"""GraphQL types for map areas: 危險區, 責任區 and 標示區 (ADR-311)."""

import enum
from datetime import datetime
from uuid import UUID

import strawberry

from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import PageInfo


@strawberry.type
class AssignedTeamType:
    """A team a team zone has been delegated to, or a station assigned to (ADR-285).

    Deliberately minimal: teams are managed over REST (/admin/teams) and this schema has no
    Team type. Building a full one here would split team reads and writes across two API
    styles; these three fields are all the delegation and station views need.
    """

    uuid: UUID
    name: str
    type: str

    @classmethod
    def from_model(cls, m) -> "AssignedTeamType":
        """Build from a Team model instance."""
        return cls(uuid=m.uuid, name=m.name, type=m.type)


@strawberry.enum
class AreaKind(enum.Enum):
    """The three kinds of map area; each value is the stored discriminator."""

    hazardous_zone = "hazardous_zone"
    team_zone = "team_zone"
    mark_zone = "mark_zone"


@strawberry.type
class AreaType:
    """A map area of any kind, as the public map may see it: it carries no team data."""

    uuid: UUID
    type: str = strawberry.field(description="'hazardous_zone', 'team_zone' or 'mark_zone'")
    name: str | None = None
    geometry: GeoJSON | None = strawberry.field(
        default=None, description="GeoJSON Polygon or MultiPolygon marking the area"
    )
    note: str | None = None
    is_public: bool = strawberry.field(
        default=False, description="Shown on the public map; always true for a hazardous zone"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "AreaType":
        """Build from an AreaPolygon model instance of any kind."""
        return cls(
            uuid=m.uuid, type=m.property_name, name=m.name, geometry=geom_to_geojson(m.geometry),
            note=m.note, is_public=m.is_public, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class AreaConnection:
    """Paginated list of map areas with page metadata."""

    items: list[AreaType]
    page_info: PageInfo


@strawberry.type
class TeamZoneType:
    """責任區: a map area assigned to one or more teams, visible only to work_zone.view holders."""

    uuid: UUID
    name: str | None = None
    geometry: GeoJSON | None = strawberry.field(
        default=None, description="GeoJSON Polygon or MultiPolygon marking the zone boundary"
    )
    note: str | None = None
    is_public: bool = strawberry.field(
        default=False, description="Shown on the public map, without its teams"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the gov user who drew this zone"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field(description="Teams this zone has been delegated to")
    async def assigned_teams(self, info: strawberry.types.Info) -> list[AssignedTeamType]:
        """Resolve the zone's delegated teams via the per-request DataLoader.

        No extra team.view gate: work_zone.view is already non-public, and a team's name and
        type are not PII.
        """
        return await info.context["loaders"]["teams_by_zone"].load(str(self.uuid))

    @classmethod
    def from_model(cls, m) -> "TeamZoneType":
        """Build from a TeamZone model instance."""
        return cls(
            uuid=m.uuid, name=m.name, geometry=geom_to_geojson(m.geometry), note=m.note,
            is_public=m.is_public, created_by=m.created_by,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class TeamZoneConnection:
    """Paginated list of team zones with page metadata."""

    items: list[TeamZoneType]
    page_info: PageInfo


@strawberry.type
class ZoneAssignmentType:
    """A team <-> team zone delegation, with who created it and when.

    `assigned_by` is a user uuid rather than a nested object, because this schema has no User type.
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
class CreateAreaInput:
    """Input for drawing a map area of any kind."""

    type: AreaKind
    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Polygon or MultiPolygon — must not be a Point"
    )
    name: str | None = None
    note: str | None = None
    is_public: bool | None = strawberry.field(
        default=None,
        description="Shown on the public map; a hazardous zone is always public, others default to false",
    )
    team_uuid: UUID | None = strawberry.field(
        default=None, description="Required for a team zone, refused for the other kinds"
    )
    status: str | None = strawberry.field(
        default=None, description="Required for a hazardous zone, refused for the other kinds"
    )
    information_source: str | None = strawberry.field(
        default=None, description="Hazardous zone only: agency name or URL the report came from"
    )


@strawberry.input
class UpdateAreaInput:
    """Input for updating a map area; UNSET fields stay unchanged, so `isPublic` alone flips the switch."""

    name: str | None = strawberry.UNSET
    geometry: GeoJSON | None = None
    note: str | None = strawberry.UNSET
    is_public: bool | None = None
    status: str | None = None
    information_source: str | None = strawberry.UNSET


@strawberry.input
class PromoteMarkZoneInput:
    """Input for turning a mark zone into a hazardous zone."""

    status: str
    information_source: str | None = None


@strawberry.input
class ZoneTeamAssignmentInput:
    """Input naming a (zone, team) pair to link or unlink."""

    zone_uuid: UUID
    team_uuid: UUID
