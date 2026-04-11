from typing import Optional
from uuid import UUID

import strawberry
from sqlalchemy import func, select, or_

from app.graphql.types import (
    BoundsInput,
    ClosureAreaConnection, ClosureAreaType,
    PageInfo,
    StationConnection, StationType,
    TicketConnection, TicketType,
    TicketTaskType, TaskPropertyType,
    StationPropertyConfigType, TaskPropertyConfigType,
)
from app.models.geo import ClosureArea, Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask, TaskProperty
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig


@strawberry.type
class GeoQuery:
    @strawberry.field
    async def stations(
        self, info: strawberry.types.Info,
        bounds: Optional[BoundsInput] = None,
        station_type: Optional[str] = None,
        skip: int = 0, limit: int = 50,
    ) -> StationConnection:
        db = info.context["db"]
        query = select(Station).where(Station.delete_at.is_(None))

        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(Station.geometry, bbox))
        if station_type:
            query = query.where(Station.type == station_type)

        total = await db.scalar(select(func.count()).select_from(query.subquery()))
        results = await db.execute(query.offset(skip).limit(limit))
        items = [StationType.from_model(r) for r in results.scalars()]
        return StationConnection(
            items=items,
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def station(self, info: strawberry.types.Info, uuid: UUID) -> Optional[StationType]:
        db = info.context["db"]
        result = await db.execute(
            select(Station).where(Station.uuid == uuid, Station.delete_at.is_(None))
        )
        m = result.scalar_one_or_none()
        return StationType.from_model(m) if m else None

    @strawberry.field
    async def closure_areas(
        self, info: strawberry.types.Info,
        bounds: Optional[BoundsInput] = None,
        skip: int = 0, limit: int = 50,
    ) -> ClosureAreaConnection:
        db = info.context["db"]
        query = select(ClosureArea).where(ClosureArea.delete_at.is_(None))

        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(ClosureArea.geometry, bbox))

        total = await db.scalar(select(func.count()).select_from(query.subquery()))
        results = await db.execute(query.offset(skip).limit(limit))
        items = [ClosureAreaType.from_model(r) for r in results.scalars()]
        return ClosureAreaConnection(
            items=items,
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def closure_area(self, info: strawberry.types.Info, uuid: UUID) -> Optional[ClosureAreaType]:
        db = info.context["db"]
        result = await db.execute(
            select(ClosureArea).where(ClosureArea.uuid == uuid, ClosureArea.delete_at.is_(None))
        )
        m = result.scalar_one_or_none()
        return ClosureAreaType.from_model(m) if m else None


@strawberry.type
class RequestQuery:
    @strawberry.field
    async def tickets(
        self, info: strawberry.types.Info,
        bounds: Optional[BoundsInput] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        skip: int = 0, limit: int = 50,
    ) -> TicketConnection:
        db = info.context["db"]
        query = select(Tickets).where(Tickets.delete_at.is_(None))

        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(Tickets.geometry, bbox))
        if status:
            query = query.where(Tickets.status == status)
        if priority:
            query = query.where(Tickets.priority == priority)

        total = await db.scalar(select(func.count()).select_from(query.subquery()))
        results = await db.execute(query.offset(skip).limit(limit))
        items = [TicketType.from_model(r) for r in results.scalars()]
        return TicketConnection(
            items=items,
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def ticket(self, info: strawberry.types.Info, uuid: UUID) -> Optional[TicketType]:
        db = info.context["db"]
        result = await db.execute(
            select(Tickets).where(Tickets.uuid == uuid, Tickets.delete_at.is_(None))
        )
        m = result.scalar_one_or_none()
        return TicketType.from_model(m) if m else None


@strawberry.type
class TicketTaskQuery:

    @strawberry.field
    async def ticket_tasks(
        self, info: strawberry.types.Info,
        ticket_uuid: str,
        status: Optional[str] = None,
        skip: int = 0, limit: int = 50,
    ) -> list[TicketTaskType]:
        db = info.context["db"]
        query = select(TicketTask).where(
            TicketTask.ticket_uuid == ticket_uuid,
            TicketTask.delete_at.is_(None),
        )
        if status:
            query = query.where(TicketTask.status == status)
        results = await db.execute(query.offset(skip).limit(limit))
        return [TicketTaskType.from_model(t) for t in results.scalars()]

    @strawberry.field
    async def task_properties(
        self, info: strawberry.types.Info, task_uuid: str
    ) -> list[TaskPropertyType]:
        db = info.context["db"]
        results = await db.execute(
            select(TaskProperty).where(
                TaskProperty.task_uuid == task_uuid,
                TaskProperty.delete_at.is_(None),
            )
        )
        return [TaskPropertyType.from_model(p) for p in results.scalars()]


@strawberry.type
class PropertyConfigQuery:

    @strawberry.field
    async def station_property_configs(
        self, info: strawberry.types.Info, station_type: str
    ) -> list[StationPropertyConfigType]:
        db = info.context["db"]
        results = await db.execute(
            select(StationPropertyConfig).where(
                or_(
                    StationPropertyConfig.station_type == station_type,
                    StationPropertyConfig.station_type == "all",
                )
            )
        )
        return [StationPropertyConfigType.from_model(c) for c in results.scalars()]

    @strawberry.field
    async def task_property_configs(
        self, info: strawberry.types.Info, task_type: str
    ) -> list[TaskPropertyConfigType]:
        db = info.context["db"]
        results = await db.execute(
            select(TaskPropertyConfig).where(TaskPropertyConfig.task_type == task_type)
        )
        return [TaskPropertyConfigType.from_model(c) for c in results.scalars()]
