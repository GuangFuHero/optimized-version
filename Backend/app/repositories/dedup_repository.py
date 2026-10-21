"""Repositories for the dedup tables: pair cards and audit events.

Candidate retrieval belongs to the engine (`app/dedup_engine/candidates.py`).
"""

from collections.abc import Collection, Iterable

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.infrastructure.repository.base import GenericRepository
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TicketTask

# What a pair card's `entity_kind` points at.
_ENTITY_MODELS = {"ticket": Tickets, "ticket_task": TicketTask, "station": Station}


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

    async def entity_exists(self, db: AsyncSession, *, entity_kind: str, uuid: str) -> bool:
        """Whether a not-deleted `entity_kind` row has this uuid; used when engine scoring failed."""
        model = _ENTITY_MODELS[entity_kind]
        query = select(exists().where(model.uuid == uuid, model.delete_at.is_(None)))
        return bool((await db.execute(query)).scalar())

    async def list_live(
        self,
        db: AsyncSession,
        *,
        statuses: Collection[str],
        entity_kinds: Collection[str] | None,
        source_layers: Collection[str] | None,
        order_by: Iterable[ColumnElement],
        skip: int,
        limit: int,
    ) -> tuple[list[DuplicatePair], int]:
        """One page of not-deleted cards matching the filters, and how many match in all."""
        conditions = [self.model.delete_at.is_(None), self.model.status.in_(statuses)]
        if entity_kinds is not None:
            conditions.append(self.model.entity_kind.in_(entity_kinds))
        if source_layers is not None:
            conditions.append(self.model.source_layer.in_(source_layers))
        total = (await db.execute(select(func.count()).where(*conditions))).scalar_one()
        rows = await db.execute(
            select(self.model).where(*conditions).order_by(*order_by).offset(skip).limit(limit)
        )
        return list(rows.scalars().all()), total

    async def get_live(self, db: AsyncSession, uuid) -> DuplicatePair | None:
        """The card with this uuid unless it is soft-deleted."""
        result = await db.execute(
            select(self.model).where(self.model.uuid == uuid, self.model.delete_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def entity_summaries(
        self, db: AsyncSession, entity_kind: str, uuids: Collection
    ) -> dict[str, dict]:
        """The comparison fields of the live `entity_kind` rows among `uuids`, keyed by uuid string.

        One query per kind, whatever the number of cards (ADR-340). A uuid missing from the result
        is a deleted (or never existing) entity. Coordinates are the centroid, so a polygon station
        has one point like a ticket does.
        """
        if not uuids:
            return {}
        query = _SUMMARY_QUERIES[entity_kind]().where(_ENTITY_MODELS[entity_kind].uuid.in_(list(uuids)))
        rows = (await db.execute(query)).mappings().all()
        return {str(row["uuid"]): dict(row) for row in rows}


def _point(model):
    """Longitude and latitude of a geometry row's centroid."""
    centroid = func.ST_Centroid(model.geometry)
    return func.ST_X(centroid).label("longitude"), func.ST_Y(centroid).label("latitude")


def _task_summaries():
    """A task with its ticket's title and point; a task of a deleted ticket counts as deleted."""
    return (
        select(
            TicketTask.uuid,
            TicketTask.task_name.label("title"),
            TicketTask.task_type.label("type"),
            TicketTask.status,
            TicketTask.ticket_uuid,
            Tickets.title.label("ticket_title"),
            *_point(Tickets),
            TicketTask.created_by,
            TicketTask.created_at,
        )
        .join(Tickets, Tickets.uuid == TicketTask.ticket_uuid)
        .where(TicketTask.delete_at.is_(None), Tickets.delete_at.is_(None))
    )


def _station_summaries():
    return select(
        Station.uuid,
        Station.name.label("title"),
        Station.type,
        Station.operational_status.label("status"),
        *_point(Station),
        Station.created_by,
        Station.created_at,
    ).where(Station.delete_at.is_(None))


def _ticket_summaries():
    return select(
        Tickets.uuid,
        Tickets.title,
        Tickets.task_type.label("type"),
        Tickets.status,
        *_point(Tickets),
        Tickets.created_by,
        Tickets.created_at,
    ).where(Tickets.delete_at.is_(None))


_SUMMARY_QUERIES = {
    "ticket_task": _task_summaries,
    "station": _station_summaries,
    "ticket": _ticket_summaries,
}


class DedupAuditEventRepository(GenericRepository[DedupAuditEvent]):
    """Repository for dedup decision events (append-only)."""

    def __init__(self):
        """Initialize with DedupAuditEvent as the managed model."""
        super().__init__(DedupAuditEvent)

    async def for_pair(self, db: AsyncSession, pair_uuid) -> list[DedupAuditEvent]:
        """Every event of one card, oldest first."""
        result = await db.execute(
            select(self.model)
            .where(self.model.pair_uuid == pair_uuid)
            .order_by(self.model.created_at, self.model.uuid)
        )
        return list(result.scalars().all())


duplicate_pair_repository = DuplicatePairRepository()
dedup_audit_event_repository = DedupAuditEventRepository()
