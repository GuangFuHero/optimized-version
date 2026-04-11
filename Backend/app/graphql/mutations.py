from datetime import datetime, timezone
from uuid import UUID

import strawberry
from shapely.geometry import shape
from sqlalchemy import select

from app.graphql.scalars import geojson_to_geom
from app.graphql.context import check_permission
from app.graphql.types import (
    ClosureAreaType, CrowdSourcingType, StationPropertyType, StationType, TicketType,
    TicketTaskType, TaskPropertyType, StationPropertyConfigType, TaskPropertyConfigType,
    CreateClosureAreaInput, CreateCrowdSourcingInput, CreateStationInput,
    CreateStationPropertyInput, CreateTicketInput, CreateTicketTaskInput,
    CreateTaskPropertyInput, UpsertPropertyConfigInput,
    UpdateClosureAreaInput, UpdateStationInput, UpdateStationPropertyInput,
    UpdateTicketInput, UpdateTicketTaskInput, UpdateTaskPropertyInput,
)
from app.models.geo import ClosureArea, Station
from app.models.request import Tickets
from app.models.station_property import CrowdSourcing, StationProperty
from app.models.ticket_task import TicketTask, TaskProperty
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig

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
            type=input.type, name=input.name, description=input.description,
            op_hour=input.op_hour, level=input.level, comment=input.comment,
            source=input.source, visibility=input.visibility,
        )
        db.add(station)
        await db.flush()

        if input.secondary_location is not None:
            from app.models.secondary_location import SecondaryLocation
            sl = input.secondary_location
            db.add(SecondaryLocation(
                geometry_uuid=str(station.uuid),
                location_type=sl.location_type,
                county=sl.county, city=sl.city, lane=sl.lane, alley=sl.alley,
                no=sl.no, floor=sl.floor, room=sl.room,
                pole_id=sl.pole_id, pole_type=sl.pole_type, pole_note=sl.pole_note,
            ))

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
        if input.visibility is not None:
            station.visibility = input.visibility
        for field in ("type", "name", "description", "op_hour", "comment"):
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

        result = await db.execute(
            select(StationProperty).where(
                StationProperty.uuid == input.item_uuid,
                StationProperty.station_uuid == input.station_uuid,
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError("Item not found for this station")

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
        ticket = Tickets(
            property_name="request",
            geometry=geojson_to_geom(input.geometry),
            created_by=user_uuid,
            title=input.title, description=input.description,
            contact_name=input.contact_name,
            contact_email=input.contact_email,
            contact_phone=input.contact_phone,
            status="pending", priority=input.priority,
            task_type=input.task_type,
            visibility=input.visibility,
        )
        db.add(ticket)
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
                raise ValueError(f"Cannot transition from '{ticket.status}' to '{input.status}'")
            ticket.status = input.status
        if input.priority is not None:
            ticket.priority = input.priority
        if input.title is not None:
            ticket.title = input.title
        if input.verification_status is not None:
            ticket.verification_status = input.verification_status
        for field in ("description", "review_note"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                setattr(ticket, field, val)

        await db.commit()
        await db.refresh(ticket)
        return TicketType.from_model(ticket)


@strawberry.type
class TicketTaskMutation:

    @strawberry.mutation
    async def create_ticket_task(
        self, info: strawberry.types.Info, input: CreateTicketTaskInput
    ) -> TicketTaskType:
        await check_permission(info, "request", "create")
        db = info.context["db"]
        result = await db.execute(
            select(Tickets).where(Tickets.uuid == input.ticket_uuid, Tickets.delete_at.is_(None))
        )
        if not result.scalar_one_or_none():
            raise ValueError("Ticket not found")
        task = TicketTask(
            ticket_uuid=input.ticket_uuid,
            task_type=input.task_type,
            task_name=input.task_name,
            task_description=input.task_description,
            quantity=input.quantity,
            source=input.source,
            visibility=input.visibility,
            route_uuid=input.route_uuid,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def update_ticket_task(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTicketTaskInput
    ) -> TicketTaskType:
        db = info.context["db"]
        result = await db.execute(
            select(TicketTask).where(TicketTask.uuid == str(uuid), TicketTask.delete_at.is_(None))
        )
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError("Ticket task not found")
        await check_permission(info, "request", "edit")

        if input.status is not None:
            task.status = input.status
        if input.moderation_status is not None:
            task.moderation_status = input.moderation_status
        if input.visibility is not None:
            task.visibility = input.visibility
        for field in ("progress_note", "review_note"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                setattr(task, field, val)

        await db.commit()
        await db.refresh(task)
        return TicketTaskType.from_model(task)

    @strawberry.mutation
    async def create_task_property(
        self, info: strawberry.types.Info, input: CreateTaskPropertyInput
    ) -> TaskPropertyType:
        await check_permission(info, "request", "create")
        db = info.context["db"]
        result = await db.execute(
            select(TicketTask).where(TicketTask.uuid == input.task_uuid, TicketTask.delete_at.is_(None))
        )
        if not result.scalar_one_or_none():
            raise ValueError("Ticket task not found")
        prop = TaskProperty(
            task_uuid=input.task_uuid,
            property_name=input.property_name,
            property_value=input.property_value,
            quantity=input.quantity,
            comment=input.comment,
            created_by=str(info.context["user"].uuid),
        )
        db.add(prop)
        await db.commit()
        await db.refresh(prop)
        return TaskPropertyType.from_model(prop)

    @strawberry.mutation
    async def update_task_property(
        self, info: strawberry.types.Info, uuid: UUID, input: UpdateTaskPropertyInput
    ) -> TaskPropertyType:
        db = info.context["db"]
        result = await db.execute(
            select(TaskProperty).where(TaskProperty.uuid == str(uuid), TaskProperty.delete_at.is_(None))
        )
        prop = result.scalar_one_or_none()
        if not prop:
            raise ValueError("Task property not found")
        await check_permission(info, "request", "edit", owner_uuid=prop.created_by)

        if input.property_value is not None:
            prop.property_value = input.property_value
        if input.status is not None:
            prop.status = input.status
        for field in ("quantity", "comment"):
            val = getattr(input, field)
            if val is not strawberry.UNSET:
                setattr(prop, field, val)

        await db.commit()
        await db.refresh(prop)
        return TaskPropertyType.from_model(prop)


@strawberry.type
class PropertyConfigMutation:

    @strawberry.mutation
    async def upsert_station_property_config(
        self, info: strawberry.types.Info, station_type: str, input: UpsertPropertyConfigInput,
    ) -> StationPropertyConfigType:
        await check_permission(info, "map", "edit")
        db = info.context["db"]
        result = await db.execute(
            select(StationPropertyConfig).where(
                StationPropertyConfig.station_type == station_type,
                StationPropertyConfig.property_name == input.property_name,
            )
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            cfg.data_type = input.data_type
            cfg.enum_options = input.enum_options
        else:
            cfg = StationPropertyConfig(
                station_type=station_type,
                property_name=input.property_name,
                data_type=input.data_type,
                enum_options=input.enum_options,
            )
            db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
        return StationPropertyConfigType.from_model(cfg)

    @strawberry.mutation
    async def upsert_task_property_config(
        self, info: strawberry.types.Info, task_type: str, input: UpsertPropertyConfigInput,
    ) -> TaskPropertyConfigType:
        await check_permission(info, "map", "edit")
        db = info.context["db"]
        result = await db.execute(
            select(TaskPropertyConfig).where(
                TaskPropertyConfig.task_type == task_type,
                TaskPropertyConfig.property_name == input.property_name,
            )
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            cfg.data_type = input.data_type
            cfg.enum_options = input.enum_options
        else:
            cfg = TaskPropertyConfig(
                task_type=task_type,
                property_name=input.property_name,
                data_type=input.data_type,
                enum_options=input.enum_options,
            )
            db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
        return TaskPropertyConfigType.from_model(cfg)
