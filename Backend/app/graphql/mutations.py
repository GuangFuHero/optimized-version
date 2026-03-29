from datetime import datetime, timezone
from uuid import UUID

import strawberry
from shapely.geometry import shape
from sqlalchemy import select

from app.graphql.scalars import geojson_to_geom
from app.graphql.context import check_permission
from app.graphql.types import (
    CreateClosureAreaInput, CreateCrowdSourcingInput, CreateStationInput,
    CreateStationPropertyInput, CreateTicketInput, ClosureAreaType,
    CrowdSourcingType, StationPropertyType, StationType, TicketType,
    UpdateClosureAreaInput, UpdateStationInput, UpdateStationPropertyInput,
    UpdateTicketInput,
)
from app.models.geo import ClosureArea, Station
from app.models.request import (
    HRRequirement, HRTaskSpecialty, SupplyRequirement, SupplyTaskItem, Tickets,
)
from app.models.station_property import CrowdSourcing, StationProperty

VALID_TRANSITIONS = {
    "pending": ["in_progress", "cancelled"],
    "in_progress": ["completed", "cancelled"],
    "completed": [],
    "cancelled": [],
}


def _validate_point(geojson: dict) -> None:
    geom = shape(geojson)
    if geom.geom_type != "Point":
        raise ValueError("Station geometry must be a Point")
    x, y = geom.coords[0][:2]
    if not (-180 <= x <= 180 and -90 <= y <= 90):
        raise ValueError("Invalid coordinates")


def _validate_polygon(geojson: dict) -> None:
    geom = shape(geojson)
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("Closure area geometry must be Polygon or MultiPolygon")


@strawberry.type
class GeoMutation:

    @strawberry.mutation
    async def create_station(self, info: strawberry.types.Info, input: CreateStationInput) -> StationType:
        await check_permission(info, "map", "create")
        db = info.context["db"]
        _validate_point(input.geometry)
        station = Station(
            geometry=geojson_to_geom(input.geometry),
            created_by=str(info.context["user"].uuid),
            county=input.county, city=input.city, lane=input.lane,
            alley=input.alley, no=input.no, floor=input.floor, room=input.room,
            op_hour=input.op_hour, level=input.level, comment=input.comment,
        )
        db.add(station)
        await db.commit()
        await db.refresh(station)
        return StationType.from_model(station)

    @strawberry.mutation
    async def update_station(self, info: strawberry.types.Info, uuid: UUID, input: UpdateStationInput) -> StationType:
        db = info.context["db"]
        result = await db.execute(
            select(Station).where(Station.uuid == str(uuid), Station.delete_at.is_(None))
        )
        station = result.scalar_one_or_none()
        if not station:
            raise ValueError("Station not found")
        await check_permission(info, "map", "edit", owner_uuid=station.created_by)

        if input.geometry is not None:
            _validate_point(input.geometry)
            station.geometry = geojson_to_geom(input.geometry)
        if input.level is not None:
            station.level = input.level
        for field in ("county", "city", "lane", "alley", "no", "floor", "room", "op_hour", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                setattr(station, field, val)

        await db.commit()
        await db.refresh(station)
        return StationType.from_model(station)

    @strawberry.mutation
    async def delete_station(self, info: strawberry.types.Info, uuid: UUID) -> bool:
        db = info.context["db"]
        result = await db.execute(
            select(Station).where(Station.uuid == str(uuid), Station.delete_at.is_(None))
        )
        station = result.scalar_one_or_none()
        if not station:
            raise ValueError("Station not found")
        await check_permission(info, "map", "delete", owner_uuid=station.created_by)
        station.delete_at = datetime.now(timezone.utc)
        await db.commit()
        return True

    @strawberry.mutation
    async def create_closure_area(self, info: strawberry.types.Info, input: CreateClosureAreaInput) -> ClosureAreaType:
        await check_permission(info, "map", "create")
        db = info.context["db"]
        _validate_polygon(input.geometry)
        area = ClosureArea(
            property_name="closure_area",
            geometry=geojson_to_geom(input.geometry),
            created_by=str(info.context["user"].uuid),
            county=input.county, city=input.city,
            status=input.status, information_source=input.information_source,
            comment=input.comment,
        )
        db.add(area)
        await db.commit()
        await db.refresh(area)
        return ClosureAreaType.from_model(area)

    @strawberry.mutation
    async def update_closure_area(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateClosureAreaInput,
    ) -> ClosureAreaType:
        db = info.context["db"]
        result = await db.execute(
            select(ClosureArea).where(ClosureArea.uuid == str(uuid), ClosureArea.delete_at.is_(None))
        )
        area = result.scalar_one_or_none()
        if not area:
            raise ValueError("Closure area not found")
        await check_permission(info, "map", "edit", owner_uuid=area.created_by)

        if input.geometry is not None:
            _validate_polygon(input.geometry)
            area.geometry = geojson_to_geom(input.geometry)
        if input.status is not None:
            area.status = input.status
        for field in ("information_source", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                setattr(area, field, val)

        await db.commit()
        await db.refresh(area)
        return ClosureAreaType.from_model(area)


@strawberry.type
class StationPropertyMutation:

    @strawberry.mutation
    async def create_station_property(
        self, info: strawberry.types.Info, input: CreateStationPropertyInput,
    ) -> StationPropertyType:
        await check_permission(info, "map", "create")
        db = info.context["db"]
        result = await db.execute(
            select(Station).where(Station.uuid == input.station_uuid, Station.delete_at.is_(None))
        )
        if not result.scalar_one_or_none():
            raise ValueError("Station not found")
        prop = StationProperty(
            station_uuid=input.station_uuid,
            property_type=input.property_type,
            property_name=input.property_name,
            quantity=input.quantity,
            weightings=input.weightings,
            status="pending",
            created_by=str(info.context["user"].uuid),
        )
        db.add(prop)
        await db.commit()
        await db.refresh(prop)
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_station_property(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateStationPropertyInput,
    ) -> StationPropertyType:
        db = info.context["db"]
        result = await db.execute(select(StationProperty).where(StationProperty.uuid == str(uuid)))
        prop = result.scalar_one_or_none()
        if not prop:
            raise ValueError("Station property not found")
        await check_permission(info, "map", "edit", owner_uuid=prop.created_by)

        if input.status is not None:
            prop.status = input.status
        if input.weightings is not None:
            prop.weightings = input.weightings
        if input.quantity is not strawberry.UNSET:
            prop.quantity = input.quantity

        await db.commit()
        await db.refresh(prop)
        return StationPropertyType.from_model(prop)

    @strawberry.mutation
    async def create_crowd_sourcing(
        self, info: strawberry.types.Info, input: CreateCrowdSourcingInput,
    ) -> CrowdSourcingType:
        await check_permission(info, "map", "create")
        db = info.context["db"]
        user = info.context["user"]

        # Verify item belongs to the station
        result = await db.execute(
            select(StationProperty).where(
                StationProperty.uuid == input.item_uuid,
                StationProperty.station_uuid == input.station_uuid,
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError("Item not found for this station")

        # Upsert: check existing record
        result = await db.execute(
            select(CrowdSourcing).where(
                CrowdSourcing.user_uuid == str(user.uuid),
                CrowdSourcing.item_uuid == input.item_uuid,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.rating = input.rating
            existing.user_credibility_score = user.credibility_score
            existing.n_updates = existing.n_updates + 1
            if input.distance_from_geometry is not None:
                existing.distance_from_geometry = input.distance_from_geometry
            await db.commit()
            await db.refresh(existing)
            return CrowdSourcingType.from_model(existing)

        cs = CrowdSourcing(
            station_uuid=input.station_uuid,
            item_uuid=input.item_uuid,
            user_uuid=str(user.uuid),
            user_credibility_score=user.credibility_score,
            rating=input.rating,
            n_updates=0,
            distance_from_geometry=input.distance_from_geometry,
        )
        db.add(cs)
        await db.commit()
        await db.refresh(cs)
        return CrowdSourcingType.from_model(cs)


@strawberry.type
class RequestMutation:

    @strawberry.mutation
    async def create_ticket(self, info: strawberry.types.Info, input: CreateTicketInput) -> TicketType:
        await check_permission(info, "request", "create")
        db = info.context["db"]
        user_uuid = str(info.context["user"].uuid)

        if input.ticket_type == "hr":
            ticket = HRRequirement(
                property_name="hr_request",
                geometry=geojson_to_geom(input.geometry),
                created_by=user_uuid,
                title=input.title, description=input.description,
                contact_name=input.contact_name,
                contact_email=input.contact_email,
                contact_phone=input.contact_phone,
                status="pending", priority=input.priority,
            )
            db.add(ticket)
            await db.flush()
            for spec in (input.hr_specialties or []):
                db.add(HRTaskSpecialty(
                    req_uuid=ticket.uuid,
                    specialty_description=spec.specialty_description,
                    quantity=spec.quantity,
                    status="pending",
                ))
        elif input.ticket_type == "supply":
            ticket = SupplyRequirement(
                property_name="supply_request",
                geometry=geojson_to_geom(input.geometry),
                created_by=user_uuid,
                title=input.title, description=input.description,
                contact_name=input.contact_name,
                contact_email=input.contact_email,
                contact_phone=input.contact_phone,
                status="pending", priority=input.priority,
            )
            db.add(ticket)
            await db.flush()
            for item in (input.supply_items or []):
                db.add(SupplyTaskItem(
                    req_uuid=ticket.uuid,
                    item_name=item.item_name,
                    item_description=item.item_description,
                    quantity=item.quantity,
                    status="pending",
                    suggestion=item.suggestion,
                ))
        else:
            raise ValueError("ticket_type must be 'hr' or 'supply'")

        await db.commit()
        await db.refresh(ticket)
        return TicketType.from_model(ticket)

    @strawberry.mutation
    async def update_ticket(self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketInput) -> TicketType:
        db = info.context["db"]
        result = await db.execute(
            select(Tickets).where(Tickets.uuid == str(uuid), Tickets.delete_at.is_(None))
        )
        ticket = result.scalar_one_or_none()
        if not ticket:
            raise ValueError("Ticket not found")
        await check_permission(info, "request", "edit", owner_uuid=ticket.created_by)

        if input.status is not None:
            allowed = VALID_TRANSITIONS.get(ticket.status, [])
            if input.status not in allowed:
                raise ValueError(
                    f"Cannot transition from '{ticket.status}' to '{input.status}'"
                )
            ticket.status = input.status
        if input.priority is not None:
            ticket.priority = input.priority
        if input.title is not None:
            ticket.title = input.title
        if input.description is not strawberry.UNSET:
            ticket.description = input.description

        await db.commit()
        await db.refresh(ticket)
        return TicketType.from_model(ticket)
