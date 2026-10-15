"""Repositories for the dedup tables: pair cards and audit events.

Candidate retrieval belongs to the engine (`app/dedup_engine/candidates.py`).
"""

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

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


class DedupAuditEventRepository(GenericRepository[DedupAuditEvent]):
    """Repository for dedup decision events (append-only)."""

    def __init__(self):
        """Initialize with DedupAuditEvent as the managed model."""
        super().__init__(DedupAuditEvent)


duplicate_pair_repository = DuplicatePairRepository()
dedup_audit_event_repository = DedupAuditEventRepository()
