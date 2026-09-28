"""Repositories for the dedup fast layer: candidate retrieval, pair cards, audit events."""

import uuid as _uuid
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
from app.services.dedup_scoring import DedupCandidate

# The two terminal statuses in services/ticket.py VALID_TRANSITIONS.
CLOSED_TICKET_STATUSES = ("completed", "cancelled")
# A permanently closed station cannot be the live duplicate of a new one.
OPEN_STATION_OPERATIONAL_STATUSES = ("active", "temporarily_closed")


@dataclass(frozen=True)
class DedupEntity:
    """How one entity kind maps onto the candidate query."""

    model: type
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
        return func.ST_Centroid(self.model.geometry) if self.use_centroid else self.model.geometry


DEDUP_ENTITIES = {
    "ticket": DedupEntity(
        model=Tickets,
        text_fields=("title", "description"),
        type_field="task_type",
        use_centroid=False,
        open_filters=lambda _now: (
            Tickets.delete_at.is_(None),
            Tickets.geometry.isnot(None),
            Tickets.status.notin_(CLOSED_TICKET_STATUSES),
        ),
    ),
    "station": DedupEntity(
        model=Station,
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
    """Finds and measures entities near a proposed submission.

    `nearby_open_rows` / `row_with_distance` return facts only — the row and its distance — for
    the Spec 020 engine, which does all scoring itself. `list_nearby_open` /
    `get_candidate_features` are Spec 019's pg_trgm-scoring versions, kept until the service
    moves to the engine (plan Task 9) and removed with it.
    """

    async def nearby_open_rows(
        self,
        db: AsyncSession,
        *,
        kind: str,
        longitude: float,
        latitude: float,
        radius_m: float,
        now: datetime,
    ) -> list[tuple[Tickets | Station, float]]:
        """Every open entity of `kind` within `radius_m`, with its distance in metres.

        No row limit: the radius is the only cut, and the engine guarantees nothing outside it
        can match (ADR-292).
        """
        entity = DEDUP_ENTITIES[kind]
        point = _point(longitude, latitude)
        result = await db.execute(
            _distance_query(entity, point).where(
                *entity.open_filters(now),
                func.ST_DWithin(cast(entity.geometry(), Geography), point, radius_m),
            )
        )
        return [(row[0], float(row.distance_m)) for row in result]

    async def row_with_distance(
        self, db: AsyncSession, *, kind: str, uuid: str, longitude: float, latitude: float
    ) -> tuple[Tickets | Station, float] | None:
        """One named entity and its distance, ignoring radius and status; None if absent or deleted.

        Used for the entity a submitter acknowledged as a duplicate, which may have closed or
        moved since the hint. A deleted one has nothing left to pair with.
        """
        try:
            _uuid.UUID(str(uuid))
        except ValueError:
            return None  # the uuid came from a client; a malformed one is simply not found
        entity = DEDUP_ENTITIES[kind]
        result = await db.execute(
            _distance_query(entity, _point(longitude, latitude)).where(
                entity.model.uuid == uuid, entity.model.delete_at.is_(None)
            )
        )
        row = result.first()
        return None if row is None else (row[0], float(row.distance_m))

    async def list_nearby_open(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        radius_m: float,
        now: datetime,
        entity_kind: str = "ticket",
    ) -> list[DedupCandidate]:
        """Every open entity within `radius_m`. No row limit: the radius is the only cut."""
        entity = DEDUP_ENTITIES[entity_kind]
        point = _point(longitude, latitude)
        result = await db.execute(
            _features_query(entity, point, query_text).where(
                *entity.open_filters(now),
                func.ST_DWithin(cast(entity.geometry(), Geography), point, radius_m),
            )
        )
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
        entity_kind: str = "ticket",
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


def _distance_query(entity: DedupEntity, point) -> Select:
    """SELECT each entity with its geography distance (metres) to `point`."""
    return select(
        entity.model, func.ST_Distance(cast(entity.geometry(), Geography), point).label("distance_m")
    )


def _features_query(entity: DedupEntity, point, query_text: str) -> Select:
    """SELECT each entity with its distance (metres) and text similarity to the query."""
    text_1, text_2 = (getattr(entity.model, field) for field in entity.text_fields)
    return select(
        entity.model,
        func.ST_Distance(cast(entity.geometry(), Geography), point).label("distance_m"),
        func.similarity(func.concat_ws(" ", text_1, text_2), query_text).label("text_similarity"),
    )


def _to_candidate(entity: DedupEntity, row, query_text: str, now: datetime) -> DedupCandidate:
    record = row[0]
    # No text on either side means the text signal is unavailable, not a score of 0.
    has_text = bool(query_text.strip()) and bool(" ".join(t or "" for t in entity.texts(record)).strip())
    return DedupCandidate(
        entity_uuid=str(record.uuid),
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
