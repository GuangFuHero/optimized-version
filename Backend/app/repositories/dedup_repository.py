"""Repositories for the dedup fast layer: candidate retrieval, pair cards, audit events.

Two entity kinds are compared: ticket tasks and stations. A task has no location of its own,
so its distance is measured from its parent ticket.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import ColumnElement, Select, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services.dedup_scoring import DedupCandidate

# A task is open until it is fulfilled or canceled (services/ticket.py::update_ticket_task).
CLOSED_TASK_STATUSES = ("fulfilled", "canceled")
# Cancelling a ticket does not cancel its tasks, so a cancelled ticket's tasks stay pending
# forever; exclude them here. A `completed` ticket stays in: it can take a new task.
CANCELLED_TICKET_STATUS = "cancelled"
# A permanently closed station cannot be the live duplicate of a new one.
OPEN_STATION_OPERATIONAL_STATUSES = ("active", "temporarily_closed")


@dataclass(frozen=True)
class DedupEntity:
    """How one entity kind maps onto the candidate query."""

    model: type  # the rows compared
    location: type  # the rows that carry the geometry: the parent ticket for a task
    parent_field: str | None  # the model's FK to `location`, or None when they are the same
    text_fields: tuple[str, str]  # concatenated for pg_trgm
    type_field: str  # the task-type signal
    use_centroid: bool  # stations.geometry is a generic GEOMETRY column
    open_filters: Callable[[datetime], tuple[ColumnElement, ...]]

    def texts(self, entity) -> tuple[str | None, str | None]:
        """The entity's two text fields."""
        return tuple(getattr(entity, field) for field in self.text_fields)

    def type_of(self, entity) -> str | None:
        """The entity's type, for the task-type signal."""
        return getattr(entity, self.type_field)

    def geometry(self):
        """The geometry column to measure from."""
        column = self.location.geometry
        return func.ST_Centroid(column) if self.use_centroid else column


DEDUP_ENTITIES = {
    "ticket_task": DedupEntity(
        model=TicketTask,
        location=Tickets,
        parent_field="ticket_uuid",
        text_fields=("task_name", "task_description"),
        type_field="task_type",
        use_centroid=False,
        open_filters=lambda _now: (
            TicketTask.delete_at.is_(None),
            TicketTask.status.notin_(CLOSED_TASK_STATUSES),
            Tickets.delete_at.is_(None),
            Tickets.status != CANCELLED_TICKET_STATUS,
            Tickets.geometry.isnot(None),
        ),
    ),
    "station": DedupEntity(
        model=Station,
        location=Station,
        parent_field=None,
        text_fields=("name", "description"),
        type_field="type",
        use_centroid=True,
        # An expired temporary station is out even if nobody has updated its status.
        open_filters=lambda now: (
            Station.delete_at.is_(None),
            Station.geometry.isnot(None),
            Station.operational_status.in_(OPEN_STATION_OPERATIONAL_STATUSES),
            or_(Station.is_temporary.is_(False), Station.expires_at.is_(None), Station.expires_at >= now),
        ),
    ),
}


class DedupCandidateRepository:
    """Measures entities against a proposed submission: distance in PostGIS, text in pg_trgm."""

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
        entity_kind: str = "ticket_task",
    ) -> list[DedupCandidate]:
        """Every open entity within `radius_m`. No row limit: the radius is the only cut.

        `exclude_ticket_uuid` drops that ticket's own tasks (a task added to an existing ticket).
        """
        entity = DEDUP_ENTITIES[entity_kind]
        point = _point(longitude, latitude)
        query = _features_query(entity, point, query_text).where(
            *entity.open_filters(now),
            func.ST_DWithin(cast(entity.geometry(), Geography), point, radius_m),
        )
        if exclude_ticket_uuid:
            query = query.where(entity.location.uuid != exclude_ticket_uuid)
        result = await db.execute(query)
        return [_to_candidate(entity, row, query_text, now) for row in result]

    async def get_candidate_features(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        candidate_uuid: str,
        now: datetime,
        entity_kind: str = "ticket_task",
    ) -> DedupCandidate | None:
        """Measure one named entity, ignoring the radius and open filters."""
        entity = DEDUP_ENTITIES[entity_kind]
        result = await db.execute(
            _features_query(entity, _point(longitude, latitude), query_text).where(
                entity.model.uuid == candidate_uuid
            )
        )
        row = result.first()
        return None if row is None else _to_candidate(entity, row, query_text, now)


def _point(longitude: float, latitude: float):
    return cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)


def _features_query(entity: DedupEntity, point, query_text: str) -> Select:
    """SELECT each entity with its distance (metres) and text similarity to the query."""
    text_1, text_2 = (getattr(entity.model, field) for field in entity.text_fields)
    query = select(
        entity.model,
        func.ST_Distance(cast(entity.geometry(), Geography), point).label("distance_m"),
        func.similarity(func.concat_ws(" ", text_1, text_2), query_text).label("text_similarity"),
    )
    if entity.parent_field:
        query = query.join(
            entity.location, getattr(entity.model, entity.parent_field) == entity.location.uuid
        )
    return query


def _to_candidate(entity: DedupEntity, row, query_text: str, now: datetime) -> DedupCandidate:
    record = row[0]
    # No text on either side means the text signal is unavailable, not a score of 0.
    has_text = bool(query_text.strip()) and bool(" ".join(t or "" for t in entity.texts(record)).strip())
    return DedupCandidate(
        entity_uuid=str(record.uuid),
        parent_uuid=str(getattr(record, entity.parent_field)) if entity.parent_field else None,
        distance_m=float(row.distance_m),
        age_min=max(0.0, (now - record.created_at).total_seconds() / 60),
        task_type=entity.type_of(record),
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
