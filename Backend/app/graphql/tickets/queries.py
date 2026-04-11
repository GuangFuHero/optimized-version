"""GraphQL queries for tickets and ticket tasks."""

from uuid import UUID

import strawberry

from app.graphql.geo.types import BoundsInput
from app.graphql.shared import PageInfo
from app.graphql.tickets.types import (
    TaskPropertyType,
    TicketConnection,
    TicketTaskType,
    TicketType,
)
from app.repositories.tickets_repository import (
    task_property_repository,
    ticket_repository,
    ticket_task_repository,
)


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
        total = await ticket_repository.count_active(
            db, bounds=bounds, status=status, priority=priority
        )
        items = await ticket_repository.list_active(
            db, bounds=bounds, status=status, priority=priority, skip=skip, limit=limit
        )
        return TicketConnection(
            items=[TicketType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def ticket(self, info: strawberry.types.Info, uuid: UUID) -> TicketType | None:
        """Fetch a single active ticket by UUID. Returns None if not found or soft-deleted."""
        m = await ticket_repository.get_by_uuid_active(info.context["db"], uuid)
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
        items = await ticket_task_repository.list_by_ticket(
            info.context["db"], ticket_uuid, status=status, skip=skip, limit=limit
        )
        return [TicketTaskType.from_model(t) for t in items]

    @strawberry.field
    async def task_properties(
        self, info: strawberry.types.Info, task_uuid: str
    ) -> list[TaskPropertyType]:
        """List all active properties for a given task UUID."""
        items = await task_property_repository.list_by_task(info.context["db"], task_uuid)
        return [TaskPropertyType.from_model(p) for p in items]
