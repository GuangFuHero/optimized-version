from datetime import datetime
from typing import Optional
from uuid import UUID

import strawberry

from app.graphql.scalars import GeoJSON, geom_to_geojson


# --- Pagination ---

@strawberry.input
class BoundsInput:
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float


@strawberry.type
class PageInfo:
    total_count: int
    has_next_page: bool
    has_previous_page: bool


# --- Secondary Location ---

@strawberry.type
class SecondaryLocationType:
    uuid: UUID
    geometry_uuid: str
    location_type: str
    county: Optional[str] = None
    city: Optional[str] = None
    lane: Optional[str] = None
    alley: Optional[str] = None
    no: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    pole_id: Optional[str] = None
    pole_type: Optional[str] = None
    pole_note: Optional[str] = None

    @classmethod
    def from_model(cls, m) -> "SecondaryLocationType":
        return cls(
            uuid=m.uuid, geometry_uuid=m.geometry_uuid,
            location_type=m.location_type,
            county=m.county, city=m.city, lane=m.lane, alley=m.alley,
            no=m.no, floor=m.floor, room=m.room,
            pole_id=m.pole_id, pole_type=m.pole_type, pole_note=m.pole_note,
        )


@strawberry.input
class SecondaryLocationInput:
    location_type: str = "address"
    county: Optional[str] = None
    city: Optional[str] = None
    lane: Optional[str] = None
    alley: Optional[str] = None
    no: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    pole_id: Optional[str] = None
    pole_type: Optional[str] = None
    pole_note: Optional[str] = None


# --- Station ---

@strawberry.type
class StationType:
    uuid: UUID
    property_name: str
    geometry: Optional[GeoJSON] = None
    created_by: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    op_hour: Optional[str] = None
    level: int = 0
    comment: Optional[str] = None
    source: Optional[str] = None
    visibility: Optional[str] = None
    verification_status: Optional[str] = None
    confidence_score: Optional[float] = None
    is_duplicate: bool = False
    is_temporary: bool = False
    is_official: bool = False
    priority_score: Optional[float] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @strawberry.field
    async def secondary_location(self, info: strawberry.types.Info) -> Optional[SecondaryLocationType]:
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
        from sqlalchemy import select
        from app.models.station_property import StationProperty
        db = info.context["db"]
        result = await db.execute(
            select(StationProperty).where(StationProperty.station_uuid == str(self.uuid))
        )
        return [StationPropertyType.from_model(p) for p in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "StationType":
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
    items: list[StationType]
    page_info: PageInfo


@strawberry.input
class CreateStationInput:
    geometry: GeoJSON
    type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    op_hour: Optional[str] = None
    level: int = 0
    comment: Optional[str] = None
    source: str = "user"
    visibility: str = "public"
    secondary_location: Optional[SecondaryLocationInput] = None


@strawberry.input
class UpdateStationInput:
    geometry: Optional[GeoJSON] = None
    type: Optional[str] = strawberry.UNSET
    name: Optional[str] = strawberry.UNSET
    description: Optional[str] = strawberry.UNSET
    op_hour: Optional[str] = strawberry.UNSET
    level: Optional[int] = None
    comment: Optional[str] = strawberry.UNSET
    visibility: Optional[str] = None


# --- Closure Area ---

@strawberry.type
class ClosureAreaType:
    uuid: UUID
    property_name: str
    geometry: Optional[GeoJSON] = None
    created_by: Optional[str] = None
    status: str = ""
    information_source: Optional[str] = None
    comment: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_model(cls, m) -> "ClosureAreaType":
        return cls(
            uuid=m.uuid, property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry), created_by=m.created_by,
            status=m.status, information_source=m.information_source,
            comment=m.comment, created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class ClosureAreaConnection:
    items: list[ClosureAreaType]
    page_info: PageInfo


@strawberry.input
class CreateClosureAreaInput:
    geometry: GeoJSON
    status: str
    information_source: Optional[str] = None
    comment: Optional[str] = None


@strawberry.input
class UpdateClosureAreaInput:
    geometry: Optional[GeoJSON] = None
    status: Optional[str] = None
    information_source: Optional[str] = strawberry.UNSET
    comment: Optional[str] = strawberry.UNSET


# --- Station Property ---

@strawberry.type
class StationPropertyType:
    uuid: UUID
    station_uuid: str
    property_type: str
    property_name: str
    quantity: Optional[int] = None
    comment: Optional[str] = None
    status: str = "pending"
    weightings: float = 1.0
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    @strawberry.field
    async def crowd_sourcings(self, info: strawberry.types.Info) -> list["CrowdSourcingType"]:
        from sqlalchemy import select
        from app.models.station_property import CrowdSourcing
        db = info.context["db"]
        result = await db.execute(
            select(CrowdSourcing).where(CrowdSourcing.item_uuid == str(self.uuid))
        )
        return [CrowdSourcingType.from_model(c) for c in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "StationPropertyType":
        return cls(
            uuid=m.uuid, station_uuid=m.station_uuid,
            property_type=m.property_type, property_name=m.property_name,
            quantity=m.quantity, comment=m.comment, status=m.status,
            weightings=m.weightings, created_by=m.created_by,
            created_at=m.created_at,
        )


@strawberry.input
class CreateStationPropertyInput:
    station_uuid: str
    property_type: str
    property_name: str
    quantity: Optional[int] = None
    weightings: float = 1.0


@strawberry.input
class UpdateStationPropertyInput:
    quantity: Optional[int] = strawberry.UNSET
    status: Optional[str] = None
    weightings: Optional[float] = None


# --- CrowdSourcing ---

@strawberry.type
class CrowdSourcingType:
    uuid: UUID
    station_uuid: str
    item_uuid: Optional[str] = None
    user_uuid: str = ""
    user_credibility_score: float = 0.0
    rating: str = ""
    distance_from_geometry: Optional[float] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_model(cls, m) -> "CrowdSourcingType":
        return cls(
            uuid=m.uuid, station_uuid=m.station_uuid,
            item_uuid=m.item_uuid, user_uuid=m.user_uuid,
            user_credibility_score=m.user_credibility_score,
            rating=m.rating, distance_from_geometry=m.distance_from_geometry,
            created_at=m.created_at,
        )


@strawberry.input
class CreateCrowdSourcingInput:
    station_uuid: str
    item_uuid: str
    rating: str
    distance_from_geometry: Optional[float] = None


# --- Photos ---

@strawberry.type
class PhotoType:
    uuid: UUID
    ref_uuid: str
    ref_type: str
    url: str
    created_by: str
    created_at: Optional[datetime] = None

    @classmethod
    def from_model(cls, m) -> "PhotoType":
        return cls(
            uuid=m.uuid, ref_uuid=m.ref_uuid, ref_type=m.ref_type,
            url=m.url, created_by=m.created_by, created_at=m.created_at,
        )


# --- Ticket Tasks ---

@strawberry.type
class TaskPropertyType:
    uuid: UUID
    task_uuid: str
    property_name: str
    property_value: str
    quantity: Optional[int] = None
    status: Optional[str] = None
    comment: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_model(cls, m) -> "TaskPropertyType":
        return cls(
            uuid=m.uuid, task_uuid=m.task_uuid,
            property_name=m.property_name, property_value=m.property_value,
            quantity=m.quantity, status=m.status, comment=m.comment,
            created_by=m.created_by, created_at=m.created_at,
        )


@strawberry.type
class TaskAssignmentType:
    uuid: UUID
    task_uuid: str
    actor_uuid: str
    role: Optional[str] = None
    assigned_at: Optional[datetime] = None

    @classmethod
    def from_model(cls, m) -> "TaskAssignmentType":
        return cls(
            uuid=m.uuid, task_uuid=m.task_uuid, actor_uuid=m.actor_uuid,
            role=m.role, assigned_at=m.assigned_at,
        )


@strawberry.type
class TicketTaskType:
    uuid: UUID
    ticket_uuid: str
    task_type: str
    task_name: str
    task_description: Optional[str] = None
    quantity: Optional[int] = None
    status: str = "pending"
    source: str = "user"
    progress_note: Optional[str] = None
    visibility: str = "public"
    moderation_status: str = "pending_review"
    review_note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @strawberry.field
    async def properties(self, info: strawberry.types.Info) -> list[TaskPropertyType]:
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
        from sqlalchemy import select
        from app.models.ticket_task import TaskAssignment
        db = info.context["db"]
        result = await db.execute(
            select(TaskAssignment).where(TaskAssignment.task_uuid == str(self.uuid))
        )
        return [TaskAssignmentType.from_model(a) for a in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "TicketTaskType":
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
    ticket_uuid: str
    task_type: str
    task_name: str
    task_description: Optional[str] = None
    quantity: Optional[int] = None
    source: str = "user"
    visibility: str = "public"
    route_uuid: Optional[str] = None


@strawberry.input
class UpdateTicketTaskInput:
    status: Optional[str] = None
    progress_note: Optional[str] = strawberry.UNSET
    review_note: Optional[str] = strawberry.UNSET
    moderation_status: Optional[str] = None
    visibility: Optional[str] = None


@strawberry.input
class CreateTaskPropertyInput:
    task_uuid: str
    property_name: str
    property_value: str
    quantity: Optional[int] = None
    comment: Optional[str] = None


@strawberry.input
class UpdateTaskPropertyInput:
    property_value: Optional[str] = None
    quantity: Optional[int] = strawberry.UNSET
    status: Optional[str] = None
    comment: Optional[str] = strawberry.UNSET


# --- Tickets ---

@strawberry.type
class TicketType:
    uuid: UUID
    property_name: str
    geometry: Optional[GeoJSON] = None
    title: str = ""
    description: Optional[str] = None
    contact_name: str = ""
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    status: str = ""
    priority: str = ""
    task_type: Optional[str] = None
    visibility: Optional[str] = None
    verification_status: Optional[str] = None
    review_note: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @strawberry.field
    async def photos(self, info: strawberry.types.Info) -> list[PhotoType]:
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
    items: list[TicketType]
    page_info: PageInfo


@strawberry.input
class CreateTicketInput:
    title: str
    description: Optional[str] = None
    geometry: GeoJSON
    contact_name: str
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    priority: str = "low"
    task_type: Optional[str] = None
    visibility: str = "public"


@strawberry.input
class UpdateTicketInput:
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = strawberry.UNSET
    review_note: Optional[str] = strawberry.UNSET
    verification_status: Optional[str] = None


# --- Property Config ---

@strawberry.type
class StationPropertyConfigType:
    uuid: UUID
    station_type: str
    property_name: str
    data_type: str
    enum_options: Optional[list[str]] = None

    @classmethod
    def from_model(cls, m) -> "StationPropertyConfigType":
        return cls(
            uuid=m.uuid, station_type=m.station_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options,
        )


@strawberry.type
class TaskPropertyConfigType:
    uuid: UUID
    task_type: str
    property_name: str
    data_type: str
    enum_options: Optional[list[str]] = None

    @classmethod
    def from_model(cls, m) -> "TaskPropertyConfigType":
        return cls(
            uuid=m.uuid, task_type=m.task_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options,
        )


@strawberry.input
class UpsertPropertyConfigInput:
    property_name: str
    data_type: str
    enum_options: Optional[list[str]] = None
