"""Repositories for the dedup fast layer: candidate retrieval, pair cards, audit events."""

from datetime import datetime

from geoalchemy2 import Geography
from sqlalchemy import Select, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.services.dedup_scoring import DedupCandidate

# The two terminal statuses in services/ticket.py VALID_TRANSITIONS.
CLOSED_TICKET_STATUSES = ("completed", "cancelled")


class DedupCandidateRepository:
    """Measures tickets against a proposed submission: distance in PostGIS, text in pg_trgm."""

    async def list_nearby_open(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        radius_m: float,
        now: datetime,
    ) -> list[DedupCandidate]:
        """Every open ticket within `radius_m`. No row limit: the radius is the only cut."""
        point = _point(longitude, latitude)
        result = await db.execute(
            _features_query(point, query_text).where(
                Tickets.delete_at.is_(None),
                Tickets.geometry.isnot(None),
                Tickets.status.notin_(CLOSED_TICKET_STATUSES),
                func.ST_DWithin(cast(Tickets.geometry, Geography), point, radius_m),
            )
        )
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
        """Measure one named ticket, ignoring the radius and status filters."""
        result = await db.execute(
            _features_query(_point(longitude, latitude), query_text).where(Tickets.uuid == candidate_uuid)
        )
        row = result.first()
        return None if row is None else _to_candidate(row, query_text, now)


def _point(longitude: float, latitude: float):
    return cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)


def _features_query(point, query_text: str) -> Select:
    """SELECT each ticket with its distance (metres) and text similarity to the query."""
    return select(
        Tickets,
        func.ST_Distance(cast(Tickets.geometry, Geography), point).label("distance_m"),
        func.similarity(func.concat_ws(" ", Tickets.title, Tickets.description), query_text).label(
            "text_similarity"
        ),
    )


def _to_candidate(row, query_text: str, now: datetime) -> DedupCandidate:
    ticket = row[0]
    # No text on either side means the text signal is unavailable, not a score of 0.
    has_text = bool(query_text.strip()) and bool(f"{ticket.title or ''} {ticket.description or ''}".strip())
    return DedupCandidate(
        entity_uuid=str(ticket.uuid),
        distance_m=float(row.distance_m),
        age_min=max(0.0, (now - ticket.created_at).total_seconds() / 60),
        task_type=ticket.task_type,
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
