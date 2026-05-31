"""Repositories for tickets, ticket tasks, and task properties."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.request import Tickets
from app.models.ticket_task import TaskProperty, TicketTask


class TicketRepository(GenericRepository[Tickets]):
    """Repository for support ticket queries."""

    def __init__(self):
        """Initialize with Tickets as the managed model."""
        super().__init__(Tickets)

    async def list_active(
        self, db: AsyncSession, *,
        bounds=None, status: str | None = None,
        priority: str | None = None, skip: int = 0, limit: int = 50,
    ) -> list[Tickets]:
        """List active tickets with optional bbox, status, and priority filters."""
        query = select(self.model).where(self.model.delete_at.is_(None))
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(self.model.geometry, bbox))
        if status:
            query = query.where(self.model.status == status)
        if priority:
            query = query.where(self.model.priority == priority)
        result = await db.execute(
            query.order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def count_active(
        self, db: AsyncSession, *,
        bounds=None, status: str | None = None, priority: str | None = None,
    ) -> int:
        """Count active tickets with optional bbox, status, and priority filters."""
        query = select(self.model).where(self.model.delete_at.is_(None))
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(self.model.geometry, bbox))
        if status:
            query = query.where(self.model.status == status)
        if priority:
            query = query.where(self.model.priority == priority)
        return await db.scalar(select(func.count()).select_from(query.subquery()))


class TicketTaskRepository(GenericRepository[TicketTask]):
    """Repository for ticket task queries."""

    def __init__(self):
        """Initialize with TicketTask as the managed model."""
        super().__init__(TicketTask)

    async def list_by_ticket(
        self, db: AsyncSession, ticket_uuid: str, *,
        status: str | None = None, skip: int = 0, limit: int = 50,
    ) -> list[TicketTask]:
        """List active tasks for a ticket with optional status filter."""
        query = select(self.model).where(
            self.model.ticket_uuid == ticket_uuid,
            self.model.delete_at.is_(None),
        )
        if status:
            query = query.where(self.model.status == status)
        result = await db.execute(
            query.order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()


class TaskPropertyRepository(GenericRepository[TaskProperty]):
    """Repository for task property queries."""

    def __init__(self):
        """Initialize with TaskProperty as the managed model."""
        super().__init__(TaskProperty)

    async def list_by_task(self, db: AsyncSession, task_uuid: str) -> list[TaskProperty]:
        """List all active properties for a given task."""
        result = await db.execute(
            select(self.model).where(
                self.model.task_uuid == task_uuid,
                self.model.delete_at.is_(None),
            )
        )
        return result.scalars().all()


ticket_repository = TicketRepository()
ticket_task_repository = TicketTaskRepository()
task_property_repository = TaskPropertyRepository()
