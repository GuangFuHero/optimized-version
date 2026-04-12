"""GraphQL types for stations, closure areas, and station properties."""

from datetime import datetime
from uuid import UUID

import strawberry

from app.graphql.scalars import GeoJSON, geom_to_geojson
from app.graphql.shared import PageInfo


@strawberry.input
class BoundsInput:
    """Geographic bounding box for spatial filtering."""

    min_lat: float = strawberry.field(description="South boundary latitude")
    max_lat: float = strawberry.field(description="North boundary latitude")
    min_lng: float = strawberry.field(description="West boundary longitude")
    max_lng: float = strawberry.field(description="East boundary longitude")


@strawberry.type
class SecondaryLocationType:
    """GraphQL type for secondary address or pole location details."""

    uuid: UUID
    geometry_uuid: str = strawberry.field(
        description="UUID of the parent station this location belongs to"
    )
    location_type: str = strawberry.field(
        description="Type of secondary location: 'address' or 'pole'"
    )
    county: str | None = None
    city: str | None = None
    lane: str | None = None
    alley: str | None = None
    no: str | None = None
    floor: str | None = None
    room: str | None = None
    pole_id: str | None = strawberry.field(
        default=None,
        description="Utility pole identifier (only set when location_type is 'pole')",
    )
    pole_type: str | None = strawberry.field(
        default=None,
        description="Type of utility pole, e.g. '電線桿' (electricity pole), '電話線桿' (telephone pole)",
    )
    pole_note: str | None = strawberry.field(
        default=None, description="Additional notes about the pole location"
    )

    @classmethod
    def from_model(cls, m) -> "SecondaryLocationType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, geometry_uuid=m.geometry_uuid,
            location_type=m.location_type,
            county=m.county, city=m.city, lane=m.lane, alley=m.alley,
            no=m.no, floor=m.floor, room=m.room,
            pole_id=m.pole_id, pole_type=m.pole_type, pole_note=m.pole_note,
        )


@strawberry.input
class SecondaryLocationInput:
    """Input for attaching a secondary address or pole location to a station."""

    location_type: str = strawberry.field(
        default="address",
        description="Type of secondary location: 'address' (default) or 'pole'",
    )
    county: str | None = None
    city: str | None = None
    lane: str | None = None
    alley: str | None = None
    no: str | None = None
    floor: str | None = None
    room: str | None = None
    pole_id: str | None = None
    pole_type: str | None = None
    pole_note: str | None = None


@strawberry.type
class StationType:
    """GraphQL type representing a map station (shelter, supply point, etc.)."""

    uuid: UUID
    property_name: str = strawberry.field(
        description="Internal polymorphic discriminator — always 'station'"
    )
    geometry: GeoJSON | None = strawberry.field(
        default=None,
        description="GeoJSON geometry — Point for a station location, Polygon/MultiPolygon for an area",
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who created this station"
    )
    type: str | None = strawberry.field(
        default=None, description="Station category, e.g. 'shelter', 'supply', 'medical'"
    )
    name: str | None = None
    description: str | None = None
    op_hour: str | None = strawberry.field(
        default=None,
        description="Operating hours in free-text format, e.g. '09:00–18:00' or '24h'",
    )
    level: int = strawberry.field(
        default=0, description="Importance level used for map rendering priority (0 = default)"
    )
    comment: str | None = strawberry.field(
        default=None, description="Internal admin comment, not shown to the public"
    )
    source: str | None = strawberry.field(
        default=None, description="Data source of this record: 'user' or 'official'"
    )
    visibility: str | None = strawberry.field(
        default=None, description="Who can see this station: 'public' or 'restricted'"
    )
    verification_status: str | None = strawberry.field(
        default=None, description="Review state: 'unverified', 'ai_verified', or 'human_verified'"
    )
    confidence_score: float | None = strawberry.field(
        default=None,
        description="Aggregate credibility score based on crowd-sourced ratings [0.0–1.0]",
    )
    is_duplicate: bool = strawberry.field(
        default=False,
        description="True if this station has been flagged as a duplicate entry",
    )
    is_temporary: bool = strawberry.field(
        default=False,
        description="True if this is a temporary station (e.g. emergency shelter)",
    )
    is_official: bool = strawberry.field(
        default=False,
        description="True if this station is operated by a government or official body",
    )
    priority_score: float | None = strawberry.field(
        default=None,
        description="Computed urgency score used for display ordering — higher is more urgent",
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field
    async def secondary_location(self, info: strawberry.types.Info) -> SecondaryLocationType | None:
        """Resolve the secondary address or pole location for this station."""
        from sqlalchemy import select

        from app.models.secondary_location import SecondaryLocation
        db = info.context["db"]
        result = await db.execute(
            select(SecondaryLocation).where(SecondaryLocation.geometry_uuid == str(self.uuid))
        )
        m = result.scalar_one_or_none()
        return SecondaryLocationType.from_model(m) if m else None

    @strawberry.field
    async def properties(self, info: strawberry.types.Info) -> list["StationPropertyType"]:
        """Resolve all properties (supply items, services) attached to this station."""
        from sqlalchemy import select

        from app.models.station_property import StationProperty
        db = info.context["db"]
        result = await db.execute(
            select(StationProperty).where(StationProperty.station_uuid == str(self.uuid))
        )
        return [StationPropertyType.from_model(p) for p in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "StationType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry), created_by=m.created_by,
            type=m.type, name=m.name, description=m.description,
            op_hour=m.op_hour, level=m.level, comment=m.comment,
            source=m.source, visibility=m.visibility,
            verification_status=m.verification_status,
            confidence_score=m.confidence_score,
            is_duplicate=m.is_duplicate, is_temporary=m.is_temporary,
            is_official=m.is_official, priority_score=m.priority_score,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class StationConnection:
    """Paginated list of stations with page metadata."""

    items: list[StationType]
    page_info: PageInfo


@strawberry.input
class CreateStationInput:
    """Input for creating a new map station."""

    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Point — must be a valid Point within lon/lat bounds"
    )
    type: str | None = strawberry.field(
        default=None, description="Station category, e.g. 'shelter', 'supply', 'medical'"
    )
    name: str | None = None
    description: str | None = None
    op_hour: str | None = strawberry.field(
        default=None, description="Operating hours in free-text format"
    )
    level: int = strawberry.field(
        default=0, description="Importance level for map rendering (0 = default)"
    )
    comment: str | None = None
    source: str = strawberry.field(
        default="user", description="Data origin: 'user' (default) or 'official'"
    )
    visibility: str = strawberry.field(
        default="public", description="Visibility: 'public' (default) or 'restricted'"
    )
    secondary_location: SecondaryLocationInput | None = strawberry.field(
        default=None,
        description="Optional secondary address or pole location to attach to this station",
    )


@strawberry.input
class UpdateStationInput:
    """Input for updating an existing station. UNSET fields are left unchanged."""

    geometry: GeoJSON | None = strawberry.field(
        default=None, description="New GeoJSON Point — replaces existing geometry if provided"
    )
    type: str | None = strawberry.UNSET
    name: str | None = strawberry.UNSET
    description: str | None = strawberry.UNSET
    op_hour: str | None = strawberry.UNSET
    level: int | None = strawberry.field(default=None, description="Updated importance level")
    comment: str | None = strawberry.UNSET
    visibility: str | None = strawberry.field(
        default=None, description="Updated visibility: 'public' or 'restricted'"
    )


# --- Closure Area ---

@strawberry.type
class ClosureAreaType:
    """GraphQL type representing a road or area closure."""

    uuid: UUID
    property_name: str = strawberry.field(
        description="Internal polymorphic discriminator — always 'closure_area'"
    )
    geometry: GeoJSON | None = strawberry.field(
        default=None, description="GeoJSON Polygon or MultiPolygon marking the closed area"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who reported this closure"
    )
    status: str = strawberry.field(
        default="", description="Current closure status: 'dangerous', 'block'"
    )
    information_source: str | None = strawberry.field(
        default=None,
        description="Source of the closure report, e.g. agency name or URL",
    )
    comment: str | None = strawberry.field(
        default=None, description="Additional notes about this closure"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "ClosureAreaType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry), created_by=m.created_by,
            status=m.status, information_source=m.information_source,
            comment=m.comment, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class ClosureAreaConnection:
    """Paginated list of closure areas with page metadata."""

    items: list[ClosureAreaType]
    page_info: PageInfo


@strawberry.input
class CreateClosureAreaInput:
    """Input for creating a new closure area."""

    geometry: GeoJSON = strawberry.field(
        description="GeoJSON Polygon or MultiPolygon — must not be a Point"
    )
    status: str = strawberry.field(
        description="Initial closure status: 'active', 'cleared', or 'unknown'"
    )
    information_source: str | None = strawberry.field(
        default=None, description="Source of the closure report, e.g. agency name or URL"
    )
    comment: str | None = None


@strawberry.input
class UpdateClosureAreaInput:
    """Input for updating an existing closure area. UNSET fields are left unchanged."""

    geometry: GeoJSON | None = None
    status: str | None = None
    information_source: str | None = strawberry.UNSET
    comment: str | None = strawberry.UNSET


# --- Station Property ---

@strawberry.type
class StationPropertyType:
    """GraphQL type representing a property (supply item, service) on a station."""

    uuid: UUID
    station_uuid: str = strawberry.field(
        description="UUID of the parent station this property belongs to"
    )
    property_type: str = strawberry.field(
        description="Category of this property, e.g. 'supply', 'service', 'equipment'"
    )
    property_name: str = strawberry.field(
        description="Specific item name, e.g. 'water', 'food_ration', 'medical_kit'"
    )
    quantity: int | None = strawberry.field(
        default=None, description="Available quantity — null means unknown"
    )
    comment: str | None = None
    status: str = strawberry.field(
        default="pending", description="Review state: 'pending', 'verified', or 'rejected'"
    )
    weightings: float = strawberry.field(
        default=1.0,
        description="Credibility weight applied during score aggregation [0.0–2.0], default 1.0",
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who added this property"
    )
    created_at: datetime | None = None

    @strawberry.field
    async def crowd_sourcings(self, info: strawberry.types.Info) -> list["CrowdSourcingType"]:
        """Resolve crowd-sourcing entries submitted for this property."""
        from sqlalchemy import select

        from app.models.station_property import CrowdSourcing
        db = info.context["db"]
        result = await db.execute(
            select(CrowdSourcing).where(CrowdSourcing.item_uuid == str(self.uuid))
        )
        return [CrowdSourcingType.from_model(c) for c in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "StationPropertyType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, station_uuid=m.station_uuid,
            property_type=m.property_type, property_name=m.property_name,
            quantity=m.quantity, comment=m.comment, status=m.status,
            weightings=m.weightings, created_by=m.created_by,
            created_at=m.created_at,
        )


@strawberry.input
class CreateStationPropertyInput:
    """Input for adding a new property to a station."""

    station_uuid: str = strawberry.field(
        description="UUID of the station to attach this property to"
    )
    property_type: str = strawberry.field(
        description="Category: 'supply', 'service', or 'equipment'"
    )
    property_name: str = strawberry.field(
        description="Specific item name matching the property config schema"
    )
    quantity: int | None = None
    weightings: float = strawberry.field(
        default=1.0, description="Initial credibility weight [0.0–2.0], default 1.0"
    )


@strawberry.input
class UpdateStationPropertyInput:
    """Input for updating a station property's status, quantity, or weightings."""

    quantity: int | None = strawberry.UNSET
    status: str | None = strawberry.field(
        default=None, description="New review state: 'pending', 'verified', or 'rejected'"
    )
    weightings: float | None = strawberry.field(
        default=None, description="Updated credibility weight [0.0–2.0]"
    )


# --- CrowdSourcing ---

@strawberry.type
class CrowdSourcingType:
    """GraphQL type for a crowd-sourced rating submitted by a user for a station property."""

    uuid: UUID
    station_uuid: str = strawberry.field(description="UUID of the station being rated")
    item_uuid: str | None = strawberry.field(
        default=None, description="UUID of the specific StationProperty being rated"
    )
    user_uuid: str = strawberry.field(
        default="", description="UUID of the user who submitted this rating"
    )
    user_credibility_score: float = strawberry.field(
        default=0.0, description="Credibility score of the submitter at the time of submission"
    )
    rating: str = strawberry.field(
        default="", description="User-submitted rating: 'up', 'neutral', or 'down'"
    )
    distance_from_geometry: float | None = strawberry.field(
        default=None,
        description="Distance in meters between the user's location and the station at submission time",
    )
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "CrowdSourcingType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, station_uuid=m.station_uuid,
            item_uuid=m.item_uuid, user_uuid=m.user_uuid,
            user_credibility_score=m.user_credibility_score,
            rating=m.rating, distance_from_geometry=m.distance_from_geometry,
            created_at=m.created_at,
        )


@strawberry.input
class CreateCrowdSourcingInput:
    """Input for submitting or updating a crowd-sourced rating for a station property."""

    station_uuid: str = strawberry.field(description="UUID of the station being rated")
    item_uuid: str | None = strawberry.field(
        default=None,
        description="UUID of the StationProperty being rated — null for a general station rating",
    )
    rating: str = strawberry.field(
        description="Rating value: 'up', 'neutral', or 'down'"
    )
    distance_from_geometry: float | None = strawberry.field(
        default=None,
        description="Distance in meters from the user to the station at time of submission",
    )
