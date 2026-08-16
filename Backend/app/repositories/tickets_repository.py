"""Repositories for tickets, ticket tasks, and task properties."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import build_search_condition
from app.infrastructure.repository.base import GenericRepository
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask


class TicketRepository(GenericRepository[Tickets]):
    """Repository for support ticket queries."""

    def __init__(self):
        """Initialize with Tickets as the managed model."""
        super().__init__(Tickets)

    def _active_conditions(
        self,
        *,
        bounds=None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        extra_filters=(),
    ) -> list:
        """The single source of truth for "which tickets match this request".

        Both list_active() and count_active() MUST build their WHERE clause from this and
        nothing else. A condition present in one but not the other makes totalCount
        disagree with the rows actually returned, which silently breaks pagination — and
        no existing test would go red.
        """
        conditions = [self.model.delete_at.is_(None), *extra_filters]
        if bounds:
            conditions.append(
                func.ST_Intersects(
                    self.model.geometry,
                    func.ST_MakeEnvelope(
                        bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
                    ),
                )
            )
        if status:
            conditions.append(self.model.status == status)
        if priority:
            conditions.append(self.model.priority == priority)
        conditions.extend(build_search_condition(q, self.model.search_text))
        return conditions

    async def list_active(
        self,
        db: AsyncSession,
        *,
        bounds=None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
        extra_filters=(),
    ) -> list[Tickets]:
        """List active tickets with optional bbox/status/priority/keyword filter and RBAC scope."""
        conditions = self._active_conditions(
            bounds=bounds, status=status, priority=priority, q=q, extra_filters=extra_filters
        )
        result = await db.execute(
            select(self.model).where(*conditions)
            .order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def count_active(
        self,
        db: AsyncSession,
        *,
        bounds=None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        extra_filters=(),
    ) -> int:
        """Count active tickets — MUST use the same conditions as list_active()."""
        conditions = self._active_conditions(
            bounds=bounds, status=status, priority=priority, q=q, extra_filters=extra_filters
        )
        return await db.scalar(
            select(func.count()).select_from(select(self.model).where(*conditions).subquery())
        )


class TicketTaskRepository(GenericRepository[TicketTask]):
    """Repository for ticket task queries."""

    def __init__(self):
        """Initialize with TicketTask as the managed model."""
        super().__init__(TicketTask)

    async def list_by_ticket(
        self,
        db: AsyncSession,
        ticket_uuid: str,
        *,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[TicketTask]:
        """List active tasks for a ticket with optional status filter."""
        query = select(self.model).where(
            self.model.ticket_uuid == ticket_uuid,
            self.model.delete_at.is_(None),
        )
        if status:
            query = query.where(self.model.status == status)
        result = await db.execute(query.order_by(self.model.created_at.desc()).offset(skip).limit(limit))
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


class TaskAssignmentRepository(GenericRepository[TaskAssignment]):
    """Repository for task assignment queries (people linked to a task)."""

    def __init__(self):
        """Initialize with TaskAssignment as the managed model."""
        super().__init__(TaskAssignment)

    async def list_by_task(self, db: AsyncSession, task_uuid: str) -> list[TaskAssignment]:
        """List all assignments for a given task."""
        result = await db.execute(select(self.model).where(self.model.task_uuid == task_uuid))
        return result.scalars().all()

    async def get_by_task_and_actor(
        self, db: AsyncSession, task_uuid: str, actor_uuid: str
    ) -> TaskAssignment | None:
        """Fetch the assignment linking an actor to a task, if it exists (duplicate guard)."""
        result = await db.execute(
            select(self.model).where(
                self.model.task_uuid == task_uuid,
                self.model.actor_uuid == actor_uuid,
            )
        )
        return result.scalar_one_or_none()


ticket_repository = TicketRepository()
ticket_task_repository = TicketTaskRepository()
task_property_repository = TaskPropertyRepository()
task_assignment_repository = TaskAssignmentRepository()
