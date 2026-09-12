"""Repositories for the dedup fast layer: candidate retrieval, pair cards, audit events."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from geoalchemy2 import Geography
from sqlalchemy import ColumnElement, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.services.dedup_scoring import DedupCandidate

# 未結案 = anything that is not a terminal status. Matches services/ticket.py VALID_TRANSITIONS,
# whose two sinks are exactly these.
CLOSED_TICKET_STATUSES = ("completed", "cancelled")

# Station operational statuses the fast layer compares against. `permanently_closed` is
# excluded on purpose — a station that will never reopen cannot be the live duplicate of a
# station someone is about to register.
OPEN_STATION_OPERATIONAL_STATUSES = ("active", "temporarily_closed")


@dataclass(frozen=True)
class _EntityDedupConfig:
    """What differs between the ticket and station candidate queries.

    Everything else — deriving `age_min` from `created_at`, the `DedupCandidate` shape, the
    retrieval boundary — is shared, so only the per-entity-kind knobs live here: which model,
    which two text columns feed pg_trgm, which column is the "type" signal, whether the
    geometry needs `ST_Centroid` first (`stations.geometry` is a generic `GEOMETRY` column;
    `ST_Centroid` is an identity on a Point, which is all either table ever stores, but
    wrapping it costs nothing and is one less thing to get wrong if that ever changes), and
    the "still worth comparing against" filter, which needs `now` for the station side.
    """

    model: type
    text_field_1: str
    text_field_2: str
    type_field: str
    wrap_centroid: bool
    open_filters: Callable[[datetime], Sequence[ColumnElement]]


def _ticket_open_filters(_now: datetime) -> Sequence[ColumnElement]:
    """A ticket is comparable while it exists and is not yet closed."""
    return (
        Tickets.delete_at.is_(None),
        Tickets.geometry.isnot(None),
        Tickets.status.notin_(CLOSED_TICKET_STATUSES),
    )


def _station_open_filters(now: datetime) -> Sequence[ColumnElement]:
    """A station is comparable while open.

    That means it exists, is not permanently closed, and — if it is a temporary station with
    an expiry — has not expired yet, whatever its `operational_status` still says.
    """
    return (
        Station.delete_at.is_(None),
        Station.geometry.isnot(None),
        Station.operational_status.in_(OPEN_STATION_OPERATIONAL_STATUSES),
        or_(
            Station.is_temporary.is_(False),
            Station.expires_at.is_(None),
            Station.expires_at >= now,
        ),
    )


_ENTITY_CONFIGS: dict[str, _EntityDedupConfig] = {
    "ticket": _EntityDedupConfig(
        model=Tickets,
        text_field_1="title",
        text_field_2="description",
        type_field="task_type",
        wrap_centroid=False,
        open_filters=_ticket_open_filters,
    ),
    "station": _EntityDedupConfig(
        model=Station,
        text_field_1="name",
        text_field_2="description",
        type_field="type",
        wrap_centroid=True,
        open_filters=_station_open_filters,
    ),
}


def _text_of(entity, config: _EntityDedupConfig) -> str:
    """Concatenate an entity's two text fields the same way the SQL side does."""
    parts = (getattr(entity, config.text_field_1), getattr(entity, config.text_field_2))
    return " ".join(part for part in parts if part).strip()


def _geometry_expr(config: _EntityDedupConfig):
    """The geometry column to measure distance against, centroid-wrapped where declared."""
    column = config.model.geometry
    return func.ST_Centroid(column) if config.wrap_centroid else column


class DedupCandidateRepository:
    """Reads nearby, still-open entities and measures them against a proposed submission.

    Distance (PostGIS, metres over the spheroid) and text similarity (pg_trgm) are computed
    in SQL because both need an index-backed operator to stay cheap; age is derived in Python
    from `created_at`, which needs no database help. Ticket and station share this one
    implementation, parametrized by `_EntityDedupConfig` — see `entity_kind`.
    """

    def _feature_columns(
        self, config: _EntityDedupConfig, *, longitude: float, latitude: float, query_text: str
    ):
        """Build the (distance, text-similarity) expression pair shared by both queries."""
        point = cast(func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326), Geography)
        distance = func.ST_Distance(
            cast(_geometry_expr(config), Geography), point
        ).label("distance_m")
        text_col_1 = getattr(config.model, config.text_field_1)
        text_col_2 = getattr(config.model, config.text_field_2)
        text_similarity = func.similarity(
            func.concat_ws(" ", text_col_1, text_col_2), query_text
        ).label("text_similarity")
        return point, distance, text_similarity

    def _to_candidate(
        self,
        config: _EntityDedupConfig,
        entity,
        distance_m: float,
        text_similarity,
        now: datetime,
        *,
        query_has_text: bool,
    ) -> DedupCandidate:
        """Turn one result row into the scoring layer's DedupCandidate.

        `text_similarity` is dropped (left None, i.e. "signal unavailable") whenever *either*
        side has no text — the candidate's two text fields are both empty, or the submission
        being checked is. Scoring it 0.0 instead would penalise an entity for a field nobody
        filled in, and a blank query would drag every candidate's total down by the text
        weight, which is the same failure the task-type/type signal already avoids by leaving
        the average rather than scoring zero.
        """
        age_min = max(0.0, (now - entity.created_at).total_seconds() / 60)
        has_text = query_has_text and bool(_text_of(entity, config))
        return DedupCandidate(
            entity_uuid=str(entity.uuid),
            distance_m=float(distance_m),
            age_min=age_min,
            task_type=getattr(entity, config.type_field),
            text_similarity=float(text_similarity) if has_text else None,
        )

    async def list_nearby_open(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        radius_m: float,
        now: datetime | None = None,
        entity_kind: str = "ticket",
    ) -> list[DedupCandidate]:
        """Fetch every still-open entity of `entity_kind` within `radius_m` of a point.

        No row limit and no ordering. `radius_m` is derived from the scoring parameters (see
        `dedup_scoring.max_hint_distance_m`), so it already excludes exactly the candidates
        that cannot clear the hint threshold and nothing else; adding a `LIMIT` on top would
        drop candidates for a reason that has nothing to do with the formula — in a dense
        disaster zone, the nearest fifty are not necessarily the fifty most similar. Ranking
        is the scoring layer's job and it sorts deterministically, so ordering here is waste.
        """
        config = _ENTITY_CONFIGS[entity_kind]
        now = now or datetime.now(UTC)
        point, distance, text_similarity = self._feature_columns(
            config, longitude=longitude, latitude=latitude, query_text=query_text
        )
        result = await db.execute(
            select(config.model, distance, text_similarity)
            .where(
                *config.open_filters(now),
                func.ST_DWithin(cast(_geometry_expr(config), Geography), point, radius_m),
            )
        )
        return [
            self._to_candidate(
                config, row[0], row.distance_m, row.text_similarity, now,
                query_has_text=bool(query_text.strip()),
            )
            for row in result
        ]

    async def get_candidate_features(
        self,
        db: AsyncSession,
        *,
        longitude: float,
        latitude: float,
        query_text: str,
        candidate_uuid: str,
        now: datetime | None = None,
        entity_kind: str = "ticket",
    ) -> DedupCandidate | None:
        """Measure one named entity against a point + text, ignoring distance and status filters.

        Used when re-scoring a pair after both entities exist (the hint-outcome path): the
        candidate is already known, so the retrieval boundary must not apply — otherwise a
        candidate that closed in the seconds between hint and submission would silently lose
        its score snapshot.
        """
        config = _ENTITY_CONFIGS[entity_kind]
        now = now or datetime.now(UTC)
        _point, distance, text_similarity = self._feature_columns(
            config, longitude=longitude, latitude=latitude, query_text=query_text
        )
        result = await db.execute(
            select(config.model, distance, text_similarity).where(config.model.uuid == candidate_uuid)
        )
        row = result.first()
        if row is None:
            return None
        return self._to_candidate(
            config, row[0], row.distance_m, row.text_similarity, now,
            query_has_text=bool(query_text.strip()),
        )


class DuplicatePairRepository(GenericRepository[DuplicatePair]):
    """Repository for duplicate pair cards."""

    def __init__(self):
        """Initialize with DuplicatePair as the managed model."""
        super().__init__(DuplicatePair)

    async def get_active_by_entities(
        self, db: AsyncSession, *, entity_kind: str, low_uuid: str, high_uuid: str
    ) -> DuplicatePair | None:
        """Fetch the one live card for an ordered entity pair, if any.

        Mirrors `uq_duplicate_pairs_entities`, the partial UNIQUE index that guarantees at
        most one non-soft-deleted card exists per (entity_kind, pair).
        """
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
