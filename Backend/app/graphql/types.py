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


# --- Station ---

@strawberry.type
class StationType:
    uuid: UUID
    property_name: str
    geometry: Optional[GeoJSON] = None
    created_by: Optional[str] = None
    county: Optional[str] = None
    city: Optional[str] = None
    lane: Optional[str] = None
    alley: Optional[str] = None
    no: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    op_hour: Optional[str] = None
    level: int = 0
    comment: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
            county=m.county, city=m.city, lane=m.lane, alley=m.alley,
            no=m.no, floor=m.floor, room=m.room,
            op_hour=m.op_hour, level=m.level, comment=m.comment,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.type
class StationConnection:
    items: list[StationType]
    page_info: PageInfo


@strawberry.input
class CreateStationInput:
    geometry: GeoJSON
    county: Optional[str] = None
    city: Optional[str] = None
    lane: Optional[str] = None
    alley: Optional[str] = None
    no: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    op_hour: Optional[str] = None
    level: int = 0
    comment: Optional[str] = None


@strawberry.input
class UpdateStationInput:
    geometry: Optional[GeoJSON] = None
    county: Optional[str] = strawberry.UNSET
    city: Optional[str] = strawberry.UNSET
    lane: Optional[str] = strawberry.UNSET
    alley: Optional[str] = strawberry.UNSET
    no: Optional[str] = strawberry.UNSET
    floor: Optional[str] = strawberry.UNSET
    room: Optional[str] = strawberry.UNSET
    op_hour: Optional[str] = strawberry.UNSET
    level: Optional[int] = None
    comment: Optional[str] = strawberry.UNSET


# --- Closure Area ---

@strawberry.type
class ClosureAreaType:
    uuid: UUID
    property_name: str
    geometry: Optional[GeoJSON] = None
    created_by: Optional[str] = None
    county: Optional[str] = None
    city: Optional[str] = None
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
            county=m.county, city=m.city,
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
    county: Optional[str] = None
    city: Optional[str] = None


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


# --- Tickets ---

@strawberry.type
class HRTaskSpecialtyType:
    uuid: UUID
    req_uuid: str
    specialty_description: str
    quantity: int
    status: str

    @classmethod
    def from_model(cls, m) -> "HRTaskSpecialtyType":
        return cls(
            uuid=m.uuid, req_uuid=m.req_uuid,
            specialty_description=m.specialty_description,
            quantity=m.quantity, status=m.status,
        )


@strawberry.type
class SupplyTaskItemType:
    uuid: UUID
    req_uuid: str
    item_name: str
    item_description: Optional[str] = None
    quantity: int = 0
    status: str = ""
    suggestion: Optional[str] = None

    @classmethod
    def from_model(cls, m) -> "SupplyTaskItemType":
        return cls(
            uuid=m.uuid, req_uuid=m.req_uuid,
            item_name=m.item_name, item_description=m.item_description,
            quantity=m.quantity, status=m.status, suggestion=m.suggestion,
        )


@strawberry.type
class RequestPhotoType:
    uuid: UUID
    req_uuid: str
    url: str
    created_by: str

    @classmethod
    def from_model(cls, m) -> "RequestPhotoType":
        return cls(uuid=m.uuid, req_uuid=m.req_uuid, url=m.url, created_by=m.created_by)


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
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @strawberry.field
    async def photos(self, info: strawberry.types.Info) -> list[RequestPhotoType]:
        from sqlalchemy import select
        from app.models.request import RequestPhoto
        db = info.context["db"]
        result = await db.execute(
            select(RequestPhoto).where(RequestPhoto.req_uuid == str(self.uuid))
        )
        return [RequestPhotoType.from_model(p) for p in result.scalars()]

    @strawberry.field
    async def task_specialties(self, info: strawberry.types.Info) -> list[HRTaskSpecialtyType]:
        from sqlalchemy import select
        from app.models.request import HRTaskSpecialty
        db = info.context["db"]
        result = await db.execute(
            select(HRTaskSpecialty).where(HRTaskSpecialty.req_uuid == str(self.uuid))
        )
        return [HRTaskSpecialtyType.from_model(s) for s in result.scalars()]

    @strawberry.field
    async def task_items(self, info: strawberry.types.Info) -> list[SupplyTaskItemType]:
        from sqlalchemy import select
        from app.models.request import SupplyTaskItem
        db = info.context["db"]
        result = await db.execute(
            select(SupplyTaskItem).where(SupplyTaskItem.req_uuid == str(self.uuid))
        )
        return [SupplyTaskItemType.from_model(i) for i in result.scalars()]

    @classmethod
    def from_model(cls, m) -> "TicketType":
        return cls(
            uuid=m.uuid, property_name=m.property_name,
            geometry=geom_to_geojson(m.geometry),
            title=m.title, description=m.description,
            contact_name=m.contact_name, contact_email=m.contact_email,
            contact_phone=m.contact_phone, status=m.status, priority=m.priority,
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
    priority: str = "nominal"
    ticket_type: str = "hr"  # "hr" or "supply"
    hr_specialties: Optional[list["HRSpecialtyInput"]] = None
    supply_items: Optional[list["SupplyItemInput"]] = None


@strawberry.input
class HRSpecialtyInput:
    specialty_description: str
    quantity: int


@strawberry.input
class SupplyItemInput:
    item_name: str
    item_description: Optional[str] = None
    quantity: int
    suggestion: Optional[str] = None


@strawberry.input
class UpdateTicketInput:
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = strawberry.UNSET
