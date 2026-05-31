"""GraphQL queries for geo features, tickets, tasks, and property configs."""

from uuid import UUID

import strawberry
from sqlalchemy import func, or_, select

from app.graphql.types import (
    BoundsInput,
    ClosureAreaConnection,
    ClosureAreaType,
    PageInfo,
    StationConnection,
    StationPropertyConfigType,
    StationType,
    TaskPropertyConfigType,
    TaskPropertyType,
    TicketConnection,
    TicketTaskType,
    TicketType,
)
from app.models.geo import ClosureArea, Station
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.models.request import Tickets
from app.models.ticket_task import TaskProperty, TicketTask


@strawberry.type
class GeoQuery:
    """GraphQL queries for stations and closure areas."""

    @strawberry.field
    async def stations(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        station_type: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> StationConnection:
        """List stations within an optional geographic bounding box.

        Args:
            info: Strawberry resolver context providing the database session.
            bounds: Optional lat/lng bbox to spatially filter results via ST_Intersects.
            station_type: Optional type filter (e.g. 'shelter', 'supply', 'medical').
            skip: Pagination offset.
            limit: Max results per page (default 50).

        Returns:
            StationConnection with items and total count / pagination metadata.
        """
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
    async def station(self, info: strawberry.types.Info, uuid: UUID) -> StationType | None:
        """Fetch a single active station by UUID. Returns None if not found or soft-deleted."""
        db = info.context["db"]
        result = await db.execute(
            select(Station).where(Station.uuid == uuid, Station.delete_at.is_(None))
        )
        m = result.scalar_one_or_none()
        return StationType.from_model(m) if m else None

    @strawberry.field
    async def closure_areas(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        skip: int = 0, limit: int = 50,
    ) -> ClosureAreaConnection:
        """List closure areas within an optional geographic bounding box, paginated."""
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
    async def closure_area(self, info: strawberry.types.Info, uuid: UUID) -> ClosureAreaType | None:
        """Fetch a single active closure area by UUID. Returns None if not found or soft-deleted."""
        db = info.context["db"]
        result = await db.execute(
            select(ClosureArea).where(ClosureArea.uuid == uuid, ClosureArea.delete_at.is_(None))
        )
        m = result.scalar_one_or_none()
        return ClosureAreaType.from_model(m) if m else None


@strawberry.type
class RequestQuery:
    """GraphQL queries for support tickets."""

    @strawberry.field
    async def tickets(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        status: str | None = None,
        priority: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> TicketConnection:
        """List tickets with optional bbox, status, and priority filters, paginated."""
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
    async def ticket(self, info: strawberry.types.Info, uuid: UUID) -> TicketType | None:
        """Fetch a single active ticket by UUID. Returns None if not found or soft-deleted."""
        db = info.context["db"]
        result = await db.execute(
            select(Tickets).where(Tickets.uuid == uuid, Tickets.delete_at.is_(None))
        )
        m = result.scalar_one_or_none()
        return TicketType.from_model(m) if m else None


@strawberry.type
class TicketTaskQuery:
    """GraphQL queries for ticket tasks and their properties."""

    @strawberry.field
    async def ticket_tasks(
        self, info: strawberry.types.Info,
        ticket_uuid: str,
        status: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> list[TicketTaskType]:
        """List tasks for a given ticket UUID, with optional status filter and pagination."""
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
        """List all active properties for a given task UUID."""
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
    """GraphQL queries for station and task property configuration schemas."""

    @strawberry.field
    async def station_property_configs(
        self, info: strawberry.types.Info, station_type: str
    ) -> list[StationPropertyConfigType]:
        """List property config entries for a station type (includes universal 'all' configs)."""
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
        """List property config entries for a task type."""
        db = info.context["db"]
        results = await db.execute(
            select(TaskPropertyConfig).where(TaskPropertyConfig.task_type == task_type)
        )
        return [TaskPropertyConfigType.from_model(c) for c in results.scalars()]
