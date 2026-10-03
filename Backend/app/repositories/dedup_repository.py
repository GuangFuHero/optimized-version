"""Repositories for the dedup fast layer: candidate retrieval, pair cards, audit events.

The unit compared is a ticket task. A task has no location of its own, so distance is
measured between the parent tickets.
"""

from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import Select, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services.dedup_scoring import DedupCandidate

# A task is open until it is fulfilled or canceled (services/ticket.py::update_ticket_task).
CLOSED_TASK_STATUSES = ("fulfilled", "canceled")
# Cancelling a ticket does not cancel its tasks, so a cancelled ticket's tasks stay pending
# forever; exclude them here. A `completed` ticket stays in: it can take a new task.
CANCELLED_TICKET_STATUS = "cancelled"


class DedupCandidateRepository:
    """Measures ticket tasks against a proposed task: distance in PostGIS, text in pg_trgm."""

    async def list_nearby_open(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        radius_m: float,
        now: datetime,
        exclude_ticket_uuid: str | None = None,
    ) -> list[DedupCandidate]:
        """Every open task whose ticket is within `radius_m`. No row limit: the radius is the only cut.

        `exclude_ticket_uuid` drops that ticket's own tasks (a task added to an existing ticket).
        """
        point = _point(longitude, latitude)
        query = _features_query(point, query_text).where(
            TicketTask.delete_at.is_(None),
            TicketTask.status.notin_(CLOSED_TASK_STATUSES),
            Tickets.delete_at.is_(None),
            Tickets.status != CANCELLED_TICKET_STATUS,
            Tickets.geometry.isnot(None),
            func.ST_DWithin(cast(Tickets.geometry, Geography), point, radius_m),
        )
        if exclude_ticket_uuid:
            query = query.where(Tickets.uuid != exclude_ticket_uuid)
        result = await db.execute(query)
        return [_to_candidate(row, query_text, now) for row in result]

    async def get_candidate_features(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        candidate_uuid: str,
        now: datetime,
    ) -> DedupCandidate | None:
        """Measure one named task, ignoring the radius and open filters."""
        result = await db.execute(
            _features_query(_point(longitude, latitude), query_text).where(TicketTask.uuid == candidate_uuid)
        )
        row = result.first()
        return None if row is None else _to_candidate(row, query_text, now)


def _point(longitude: float, latitude: float):
    return cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)


def _features_query(point, query_text: str) -> Select:
    """SELECT each task with its ticket's distance (metres) and its text similarity to the query."""
    return select(
        TicketTask,
        func.ST_Distance(cast(Tickets.geometry, Geography), point).label("distance_m"),
        func.similarity(
            func.concat_ws(" ", TicketTask.task_name, TicketTask.task_description), query_text
        ).label("text_similarity"),
    ).join(Tickets, TicketTask.ticket_uuid == Tickets.uuid)


def _to_candidate(row, query_text: str, now: datetime) -> DedupCandidate:
    task = row[0]
    # No text on either side means the text signal is unavailable, not a score of 0.
    has_text = bool(query_text.strip()) and bool(
        f"{task.task_name or ''} {task.task_description or ''}".strip()
    )
    return DedupCandidate(
        entity_uuid=str(task.uuid),
        parent_uuid=str(task.ticket_uuid),
        distance_m=float(row.distance_m),
        age_min=max(0.0, (now - task.created_at).total_seconds() / 60),
        task_type=task.task_type,
        text_similarity=float(row.text_similarity) if has_text else None,
    )


class DuplicatePairRepository(GenericRepository[DuplicatePair]):
    """Repository for duplicate pair cards."""

    def __init__(self):
        """Initialize with DuplicatePair as the managed model."""
        super().__init__(DuplicatePair)

    async def get_active_by_entities(
        self, db: AsyncSession, *, entity_kind: str, low_uuid: str, high_uuid: str
    ) -> DuplicatePair | None:
        """The live (not soft-deleted) card for an ordered pair; `uq_duplicate_pairs_entities` allows one."""
        result = await db.execute(
            select(self.model).where(
                self.model.entity_kind == entity_kind,
                self.model.low_uuid == low_uuid,
                self.model.high_uuid == high_uuid,
                self.model.delete_at.is_(None),
            )
        )
        return result.scalar_one_or_none()


class DedupAuditEventRepository(GenericRepository[DedupAuditEvent]):
    """Repository for dedup decision events (append-only)."""

    def __init__(self):
        """Initialize with DedupAuditEvent as the managed model."""
        super().__init__(DedupAuditEvent)


dedup_candidate_repository = DedupCandidateRepository()
duplicate_pair_repository = DuplicatePairRepository()
dedup_audit_event_repository = DedupAuditEventRepository()
