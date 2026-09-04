"""Repositories for the dedup fast layer: candidate retrieval, pair cards, audit events."""

from datetime import UTC, datetime

from geoalchemy2 import Geography
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.dedup import TicketDedupAuditEvent, TicketDuplicatePair
from app.models.request import Tickets
from app.services.dedup_scoring import DedupCandidate

# 未結案 = anything that is not a terminal status. Matches services/ticket.py VALID_TRANSITIONS,
# whose two sinks are exactly these.
CLOSED_TICKET_STATUSES = ("completed", "cancelled")

# Candidate retrieval boundary, not a similarity threshold: it only bounds how much work the
# query does. Deliberately generous relative to the scoring parameters — at
# distance_half_m=200 a candidate needs to be within ~147 m to clear hint_threshold=0.8 even
# with every other signal perfect, so nothing scoreable is cut off by this radius.
DEFAULT_CANDIDATE_RADIUS_M = 500.0
DEFAULT_CANDIDATE_LIMIT = 50


def _text_of(ticket: Tickets) -> str:
    """Concatenate a ticket's title and description the same way the SQL side does."""
    return " ".join(part for part in (ticket.title, ticket.description) if part).strip()


class DedupCandidateRepository:
    """Reads nearby, still-open tickets and measures them against a proposed submission.

    Distance (PostGIS, metres over the spheroid) and text similarity (pg_trgm) are computed
    in SQL because both need an index-backed operator to stay cheap; age is derived in Python
    from `created_at`, which needs no database help.
    """

    def _feature_columns(self, *, longitude: float, latitude: float, query_text: str):
        """Build the (distance, text-similarity) expression pair shared by both queries."""
        point = cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)
        distance = func.ST_Distance(cast(Tickets.geometry, Geography), point).label("distance_m")
        text_similarity = func.similarity(
            func.concat_ws(" ", Tickets.title, Tickets.description), query_text
        ).label("text_similarity")
        return point, distance, text_similarity

    def _to_candidate(self, ticket: Tickets, distance_m: float, text_similarity, now: datetime):
        """Turn one result row into the scoring layer's DedupCandidate.

        `text_similarity` is dropped (left None, i.e. "signal unavailable") when the candidate
        carries no text at all — scoring it 0.0 would penalise a ticket for a field nobody
        filled in, which is the same rule the task-type signal already follows.
        """
        age_min = max(0.0, (now - ticket.created_at).total_seconds() / 60)
        return DedupCandidate(
            ticket_uuid=str(ticket.uuid),
            distance_m=float(distance_m),
            age_min=age_min,
            task_type=ticket.task_type,
            text_similarity=None if not _text_of(ticket) else float(text_similarity),
        )

    async def list_nearby_open(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        now: datetime | None = None,
        radius_m: float = DEFAULT_CANDIDATE_RADIUS_M,
        limit: int = DEFAULT_CANDIDATE_LIMIT,
    ) -> list[DedupCandidate]:
        """Fetch the nearest still-open tickets around a point, closest first."""
        now = now or datetime.now(UTC)
        point, distance, text_similarity = self._feature_columns(
            longitude=longitude, latitude=latitude, query_text=query_text
        )
        result = await db.execute(
            select(Tickets, distance, text_similarity)
            .where(
                Tickets.delete_at.is_(None),
                Tickets.geometry.isnot(None),
                Tickets.status.notin_(CLOSED_TICKET_STATUSES),
                func.ST_DWithin(cast(Tickets.geometry, Geography), point, radius_m),
            )
            .order_by(distance)
            .limit(limit)
        )
        return [self._to_candidate(row[0], row.distance_m, row.text_similarity, now) for row in result]

    async def get_candidate_features(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        candidate_uuid: str,
        now: datetime | None = None,
    ) -> DedupCandidate | None:
        """Measure one named ticket against a point + text, ignoring distance and status filters.

        Used when re-scoring a pair after both tickets exist (the hint-outcome path): the
        candidate is already known, so the retrieval boundary must not apply — otherwise a
        candidate that closed in the seconds between hint and submission would silently lose
        its score snapshot.
        """
        now = now or datetime.now(UTC)
        _point, distance, text_similarity = self._feature_columns(
            longitude=longitude, latitude=latitude, query_text=query_text
        )
        result = await db.execute(
            select(Tickets, distance, text_similarity).where(Tickets.uuid == candidate_uuid)
        )
        row = result.first()
        if row is None:
            return None
        return self._to_candidate(row[0], row.distance_m, row.text_similarity, now)


class TicketDuplicatePairRepository(GenericRepository[TicketDuplicatePair]):
    """Repository for duplicate pair cards."""

    def __init__(self):
        """Initialize with TicketDuplicatePair as the managed model."""
        super().__init__(TicketDuplicatePair)

    async def get_active_by_tickets(
        self, db: AsyncSession, *, ticket_low_id: str, ticket_high_id: str
    ) -> TicketDuplicatePair | None:
        """Fetch the one live card for an ordered ticket pair, if any.

        Mirrors `uq_ticket_duplicate_pairs_tickets`, the partial UNIQUE index that guarantees
        at most one non-soft-deleted card exists per pair.
        """
        result = await db.execute(
            select(self.model).where(
                self.model.ticket_low_id == ticket_low_id,
                self.model.ticket_high_id == ticket_high_id,
                self.model.delete_at.is_(None),
            )
        )
        return result.scalar_one_or_none()


class TicketDedupAuditEventRepository(GenericRepository[TicketDedupAuditEvent]):
    """Repository for dedup decision events (append-only)."""

    def __init__(self):
        """Initialize with TicketDedupAuditEvent as the managed model."""
        super().__init__(TicketDedupAuditEvent)


dedup_candidate_repository = DedupCandidateRepository()
ticket_duplicate_pair_repository = TicketDuplicatePairRepository()
ticket_dedup_audit_event_repository = TicketDedupAuditEventRepository()
