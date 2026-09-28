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

# The two terminal statuses in services/ticket.py VALID_TRANSITIONS.
CLOSED_TICKET_STATUSES = ("completed", "cancelled")
# A permanently closed station cannot be the live duplicate of a new one.
OPEN_STATION_OPERATIONAL_STATUSES = ("active", "temporarily_closed")


@dataclass(frozen=True)
class DedupEntity:
    """How one entity kind maps onto the candidate query."""

    model: type
    use_centroid: bool  # stations.geometry is a generic GEOMETRY column
    open_filters: Callable[[datetime], tuple[ColumnElement, ...]]

    def geometry(self):
        """The geometry column to measure from."""
        return func.ST_Centroid(self.model.geometry) if self.use_centroid else self.model.geometry


DEDUP_ENTITIES = {
    "ticket": DedupEntity(
        model=Tickets,
        use_centroid=False,
        open_filters=lambda _now: (
            Tickets.delete_at.is_(None),
            Tickets.geometry.isnot(None),
            Tickets.status.notin_(CLOSED_TICKET_STATUSES),
        ),
    ),
    "station": DedupEntity(
        model=Station,
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

    Facts only — the row and its distance. All scoring, text included, is the engine's
    (Spec 020, ADR-288).
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


def _point(longitude: float, latitude: float):
    return cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)


def _distance_query(entity: DedupEntity, point) -> Select:
    """SELECT each entity with its geography distance (metres) to `point`."""
    return select(
        entity.model, func.ST_Distance(cast(entity.geometry(), Geography), point).label("distance_m")
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
