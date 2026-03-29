from typing import Optional
from uuid import UUID

import strawberry
from sqlalchemy import func, select

from app.graphql.types import (
    BoundsInput,
    ClosureAreaConnection,
    ClosureAreaType,
    PageInfo,
    StationConnection,
    StationType,
    TicketConnection,
    TicketType,
)
from app.models.geo import ClosureArea, Station
from app.models.request import Tickets


@strawberry.type
class GeoQuery:
    @strawberry.field
    async def stations(
        self, info: strawberry.types.Info,
        bounds: Optional[BoundsInput] = None,
        property_name: Optional[str] = None,
        skip: int = 0, limit: int = 50,
    ) -> StationConnection:
        db = info.context["db"]
        query = select(Station).where(Station.delete_at.is_(None))

        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(Station.geometry, bbox))
        if property_name:
            query = query.where(Station.property_name == property_name)

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
    async def station(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> Optional[StationType]:
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
    async def closure_area(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> Optional[ClosureAreaType]:
        db = info.context["db"]
        result = await db.execute(
            select(ClosureArea).where(
                ClosureArea.uuid == uuid, ClosureArea.delete_at.is_(None)
            )
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
    async def ticket(
        self, info: strawberry.types.Info, uuid: UUID
    ) -> Optional[TicketType]:
        db = info.context["db"]
        result = await db.execute(
            select(Tickets).where(
                Tickets.uuid == uuid, Tickets.delete_at.is_(None)
            )
        )
        m = result.scalar_one_or_none()
        return TicketType.from_model(m) if m else None
