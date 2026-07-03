"""Repositories for tickets, ticket tasks, and task properties."""

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.h3 import GUEST_MAX_H3_RESOLUTION, h3_centroid_column, zoom_to_h3_resolution
from app.infrastructure.repository.base import GenericRepository
from app.models.request import Tickets
from app.models.ticket_task import TaskProperty, TicketTask


def _guest_resolution(zoom: float | None) -> int:
    """Resolution for guest geometry masking: from zoom, but never finer than the server cap."""
    requested = zoom_to_h3_resolution(zoom) if zoom is not None else GUEST_MAX_H3_RESOLUTION
    return min(requested, GUEST_MAX_H3_RESOLUTION)


class TicketRepository(GenericRepository[Tickets]):
    """Repository for support ticket queries."""

    def __init__(self):
        """Initialize with Tickets as the managed model."""
        super().__init__(Tickets)

    async def create_with_secondary_location(
        self, db: AsyncSession, *, obj_in: dict, secondary_location: dict | None = None
    ) -> Tickets:
        """Create a ticket, flushing first so UUID is available for secondary location."""
        from app.models.secondary_location import SecondaryLocation
        ticket = Tickets(**obj_in)
        db.add(ticket)
        await db.flush()
        if secondary_location:
            db.add(SecondaryLocation(geometry_uuid=str(ticket.uuid), **secondary_location))
        await db.commit()
        await db.refresh(ticket)
        return ticket

    async def set_secondary_location(
        self, db: AsyncSession, *, geometry_uuid: str, secondary_location: dict | None
    ) -> None:
        """Replace this ticket's secondary location: drop any existing row, insert the new one."""
        from app.models.secondary_location import SecondaryLocation
        await db.execute(
            delete(SecondaryLocation).where(SecondaryLocation.geometry_uuid == geometry_uuid)
        )
        if secondary_location:
            db.add(SecondaryLocation(geometry_uuid=geometry_uuid, **secondary_location))
        await db.commit()

    async def list_active(
        self, db: AsyncSession, *,
        bounds=None, status: str | None = None,
        priority: str | None = None, skip: int = 0, limit: int = 50,
        is_guest: bool = False, zoom: float | None = None,
    ) -> list[Tickets]:
        """List active tickets with optional bbox, status, and priority filters.

        For guests, `geometry` is replaced with its H3 cell centroid (server-capped
        resolution) instead of the exact point.
        """
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
        query = query.order_by(self.model.created_at.desc()).offset(skip).limit(limit)

        if not is_guest:
            result = await db.execute(query)
            return result.scalars().all()

        resolution = _guest_resolution(zoom)
        query = query.add_columns(
            h3_centroid_column(self.model.geometry, resolution).label("masked_geometry")
        )
        rows = (await db.execute(query)).all()
        tickets = []
        for ticket, masked_geometry in rows:
            ticket.masked_geometry = masked_geometry
            tickets.append(ticket)
        return tickets

    async def get_by_uuid_active_display(
        self, db: AsyncSession, uuid, *, is_guest: bool = False, zoom: float | None = None,
    ) -> Tickets | None:
        """Fetch a single active ticket for display, with guest-aware geometry masking.

        Separate from the inherited `get_by_uuid_active` (used by mutations for ownership
        checks, which must always see the exact geometry).
        """
        query = select(self.model).where(
            self.model.uuid == uuid, self.model.delete_at.is_(None)
        )
        if not is_guest:
            result = await db.execute(query)
            return result.scalar_one_or_none()

        resolution = _guest_resolution(zoom)
        query = query.add_columns(
            h3_centroid_column(self.model.geometry, resolution).label("masked_geometry")
        )
        row = (await db.execute(query)).first()
        if row is None:
            return None
        ticket, masked_geometry = row
        ticket.masked_geometry = masked_geometry
        return ticket

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
