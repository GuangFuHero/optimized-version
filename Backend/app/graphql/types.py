"""GraphQL types for the map API — stations, tickets, tasks, and crowd-sourcing."""

from datetime import datetime
from uuid import UUID

import strawberry

from app.graphql.scalars import GeoJSON, geom_to_geojson

# --- Pagination ---

@strawberry.input
class BoundsInput:
    """Geographic bounding box for spatial filtering."""

    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float


@strawberry.type
class PageInfo:
    """Pagination metadata for list responses."""

    total_count: int
    has_next_page: bool
    has_previous_page: bool


# --- Secondary Location ---

@strawberry.type
class SecondaryLocationType:
    """GraphQL type for secondary address or pole location details."""

    uuid: UUID
    geometry_uuid: str
    location_type: str
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

    location_type: str = "address"
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


# --- Station ---

@strawberry.type
class StationType:
    """GraphQL type representing a map station (shelter, supply point, etc.)."""

    uuid: UUID
    property_name: str
    geometry: GeoJSON | None = None
    created_by: str | None = None
    type: str | None = None
    name: str | None = None
    description: str | None = None
    op_hour: str | None = None
    level: int = 0
    comment: str | None = None
    source: str | None = None
    visibility: str | None = None
    verification_status: str | None = None
    confidence_score: float | None = None
    is_duplicate: bool = False
    is_temporary: bool = False
    is_official: bool = False
    priority_score: float | None = None
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

    geometry: GeoJSON
    type: str | None = None
    name: str | None = None
    description: str | None = None
    op_hour: str | None = None
    level: int = 0
    comment: str | None = None
    source: str = "user"
    visibility: str = "public"
    secondary_location: SecondaryLocationInput | None = None


@strawberry.input
class UpdateStationInput:
    """Input for updating an existing station. UNSET fields are left unchanged."""

    geometry: GeoJSON | None = None
    type: str | None = strawberry.UNSET
    name: str | None = strawberry.UNSET
    description: str | None = strawberry.UNSET
    op_hour: str | None = strawberry.UNSET
    level: int | None = None
    comment: str | None = strawberry.UNSET
    visibility: str | None = None


# --- Closure Area ---

@strawberry.type
class ClosureAreaType:
    """GraphQL type representing a road or area closure."""

    uuid: UUID
    property_name: str
    geometry: GeoJSON | None = None
    created_by: str | None = None
    status: str = ""
    information_source: str | None = None
    comment: str | None = None
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

    geometry: GeoJSON
    status: str
    information_source: str | None = None
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
    station_uuid: str
    property_type: str
    property_name: str
    quantity: int | None = None
    comment: str | None = None
    status: str = "pending"
    weightings: float = 1.0
    created_by: str | None = None
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

    station_uuid: str
    property_type: str
    property_name: str
    quantity: int | None = None
    weightings: float = 1.0


@strawberry.input
class UpdateStationPropertyInput:
    """Input for updating a station property's status, quantity, or weightings."""

    quantity: int | None = strawberry.UNSET
    status: str | None = None
    weightings: float | None = None


# --- CrowdSourcing ---

@strawberry.type
class CrowdSourcingType:
    """GraphQL type for a crowd-sourced rating submitted by a user for a station property."""

    uuid: UUID
    station_uuid: str
    item_uuid: str | None = None
    user_uuid: str = ""
    user_credibility_score: float = 0.0
    rating: str = ""
    distance_from_geometry: float | None = None
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

    station_uuid: str
    item_uuid: str
    rating: str
    distance_from_geometry: float | None = None


# --- Photos ---

@strawberry.type
class PhotoType:
    """GraphQL type representing a photo attached to a station or ticket."""

    uuid: UUID
    ref_uuid: str
    ref_type: str
    url: str
    created_by: str
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "PhotoType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, ref_uuid=m.ref_uuid, ref_type=m.ref_type,
            url=m.url, created_by=m.created_by, created_at=m.created_at,
        )


# --- Ticket Tasks ---

@strawberry.type
class TaskPropertyType:
    """GraphQL type for a structured property attached to a ticket task."""

    uuid: UUID
    task_uuid: str
    property_name: str
    property_value: str
    quantity: int | None = None
    status: str | None = None
    comment: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "TaskPropertyType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_uuid=m.task_uuid,
            property_name=m.property_name, property_value=m.property_value,
            quantity=m.quantity, status=m.status, comment=m.comment,
            created_by=m.created_by, created_at=m.created_at,
        )


@strawberry.type
class TaskAssignmentType:
    """GraphQL type representing a user or group assigned to a ticket task."""

    uuid: UUID
    task_uuid: str
    actor_uuid: str
    role: str | None = None
    assigned_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "TaskAssignmentType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_uuid=m.task_uuid, actor_uuid=m.actor_uuid,
            role=m.role, assigned_at=m.assigned_at,
        )


@strawberry.type
class TicketTaskType:
    """GraphQL type representing a task under a support ticket (rescue, HR, supply, etc.)."""

    uuid: UUID
    ticket_uuid: str
    task_type: str
    task_name: str
    task_description: str | None = None
    quantity: int | None = None
    status: str = "pending"
    source: str = "user"
    progress_note: str | None = None
    visibility: str = "public"
    moderation_status: str = "pending_review"
    review_note: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field
    async def properties(self, info: strawberry.types.Info) -> list[TaskPropertyType]:
        """Resolve structured properties (skills, cargo type, etc.) for this task."""
        from sqlalchemy import select

        from app.models.ticket_task import TaskProperty
        db = info.context["db"]
        result = await db.execute(
            select(TaskProperty).where(
                TaskProperty.task_uuid == str(self.uuid),
                TaskProperty.delete_at.is_(None),
            )
        )
        return [TaskPropertyType.from_model(p) for p in result.scalars()]

    @strawberry.field
    async def assignments(self, info: strawberry.types.Info) -> list[TaskAssignmentType]:
        """Resolve actors (volunteers, responders) assigned to this task."""
        from sqlalchemy import select

        from app.models.ticket_task import TaskAssignment
        db = info.context["db"]
        result = await db.execute(
            select(TaskAssignment).where(TaskAssignment.task_uuid == str(self.uuid))
        )
        return [TaskAssignmentType.from_model(a) for a in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "TicketTaskType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, ticket_uuid=m.ticket_uuid,
            task_type=m.task_type, task_name=m.task_name,
            task_description=m.task_description, quantity=m.quantity,
            status=m.status, source=m.source, progress_note=m.progress_note,
            visibility=m.visibility, moderation_status=m.moderation_status,
            review_note=m.review_note,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.input
class CreateTicketTaskInput:
    """Input for creating a new task under a support ticket."""

    ticket_uuid: str
    task_type: str
    task_name: str
    task_description: str | None = None
    quantity: int | None = None
    source: str = "user"
    visibility: str = "public"
    route_uuid: str | None = None


@strawberry.input
class UpdateTicketTaskInput:
    """Input for updating a ticket task's status, visibility, or review notes."""

    status: str | None = None
    progress_note: str | None = strawberry.UNSET
    review_note: str | None = strawberry.UNSET
    moderation_status: str | None = None
    visibility: str | None = None


@strawberry.input
class CreateTaskPropertyInput:
    """Input for adding a structured property to a ticket task."""

    task_uuid: str
    property_name: str
    property_value: str
    quantity: int | None = None
    comment: str | None = None


@strawberry.input
class UpdateTaskPropertyInput:
    """Input for updating a task property's value, quantity, status, or comment."""

    property_value: str | None = None
    quantity: int | None = strawberry.UNSET
    status: str | None = None
    comment: str | None = strawberry.UNSET


# --- Tickets ---

@strawberry.type
class TicketType:
    """GraphQL type representing a disaster relief support ticket."""

    uuid: UUID
    property_name: str
    geometry: GeoJSON | None = None
    title: str = ""
    description: str | None = None
    contact_name: str = ""
    contact_email: str | None = None
    contact_phone: str | None = None
    status: str = ""
    priority: str = ""
    task_type: str | None = None
    visibility: str | None = None
    verification_status: str | None = None
    review_note: str | None = None
    created_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @strawberry.field
    async def photos(self, info: strawberry.types.Info) -> list[PhotoType]:
        """Resolve photos attached to this ticket."""
        from sqlalchemy import select

        from app.models.photo import Photo
        db = info.context["db"]
        result = await db.execute(
            select(Photo).where(
                Photo.ref_uuid == str(self.uuid),
                Photo.ref_type == "ticket",
                Photo.delete_at.is_(None),
            )
        )
        return [PhotoType.from_model(p) for p in result.scalars()]

    @strawberry.field
    async def tasks(self, info: strawberry.types.Info) -> list[TicketTaskType]:
        """Resolve all active tasks under this ticket."""
        from sqlalchemy import select

        from app.models.ticket_task import TicketTask
        db = info.context["db"]
        result = await db.execute(
            select(TicketTask).where(
                TicketTask.ticket_uuid == str(self.uuid),
                TicketTask.delete_at.is_(None),
            )
        )
        return [TicketTaskType.from_model(t) for t in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "TicketType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry),
            title=m.title, description=m.description,
            contact_name=m.contact_name, contact_email=m.contact_email,
            contact_phone=m.contact_phone, status=m.status, priority=m.priority,
            task_type=m.task_type, visibility=m.visibility,
            verification_status=m.verification_status, review_note=m.review_note,
            created_by=m.created_by, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class TicketConnection:
    """Paginated list of tickets with page metadata."""

    items: list[TicketType]
    page_info: PageInfo


@strawberry.input
class CreateTicketInput:
    """Input for creating a new support ticket."""

    title: str
    description: str | None = None
    geometry: GeoJSON
    contact_name: str
    contact_email: str | None = None
    contact_phone: str | None = None
    priority: str = "low"
    task_type: str | None = None
    visibility: str = "public"


@strawberry.input
class UpdateTicketInput:
    """Input for updating a ticket's status, priority, or review notes."""

    status: str | None = None
    priority: str | None = None
    title: str | None = None
    description: str | None = strawberry.UNSET
    review_note: str | None = strawberry.UNSET
    verification_status: str | None = None


# --- Property Config ---

@strawberry.type
class StationPropertyConfigType:
    """GraphQL type for a station property config schema (name, data type, enum options)."""

    uuid: UUID
    station_type: str
    property_name: str
    data_type: str
    enum_options: list[str] | None = None

    @classmethod
    def from_model(cls, m) -> "StationPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, station_type=m.station_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options,
        )


@strawberry.type
class TaskPropertyConfigType:
    """GraphQL type for a task property config schema (name, data type, enum options)."""

    uuid: UUID
    task_type: str
    property_name: str
    data_type: str
    enum_options: list[str] | None = None

    @classmethod
    def from_model(cls, m) -> "TaskPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_type=m.task_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options,
        )


@strawberry.input
class UpsertPropertyConfigInput:
    """Input for creating or updating a property config entry."""

    property_name: str
    data_type: str
    enum_options: list[str] | None = None
