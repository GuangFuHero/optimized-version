"""Repositories for stations, closure areas, station properties, and crowd sourcing."""

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import like_pattern, matches, normalize_query, search_timeout
from app.infrastructure.repository.base import GenericRepository
from app.models.geo import ClosureArea, Station
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import (
    CrowdSourcing,
    StationProperty,
    StationUpdateSuggestion,
)


class StationRepository(GenericRepository[Station]):
    """Repository for Station queries with spatial filtering (pure CRUD, ADR-015).

    The secondary-location orchestration that used to live here moved to
    app/services/station/create.py, which owns the transaction across both tables.
    """

    def __init__(self):
        """Initialize with Station as the managed model."""
        super().__init__(Station)

    def _search_condition(self, term: str):
        """Match the station itself, its properties, or its address (ADR-079/080).

        The related tables are reached with EXISTS rather than a JOIN: a station with
        three matching properties would otherwise be returned three times, inflating
        totalCount and skipping rows when paging.
        """
        pattern = like_pattern(term)
        return or_(
            matches(self.model.search_text, pattern),
            exists(
                select(1).where(
                    StationProperty.station_uuid == self.model.uuid,
                    StationProperty.delete_at.is_(None),
                    matches(StationProperty.search_text, pattern),
                )
            ),
            exists(
                select(1).where(
                    SecondaryLocation.geometry_uuid == self.model.uuid,
                    matches(SecondaryLocation.search_text, pattern),
                )
            ),
        )

    def _active_conditions(
        self, *, bounds=None, station_type: str | None = None,
        q: str | None = None, extra_filters=(),
    ) -> list:
        """The single source of truth for "which stations match this request".

        Both list_active() and count_active() MUST build their WHERE clause from this and
        nothing else. A condition present in one but not the other makes totalCount
        disagree with the rows actually returned, which silently breaks pagination — and
        no existing test would go red.
        """
        conditions = [self.model.delete_at.is_(None), *extra_filters]
        if bounds:
            conditions.append(
                func.ST_Intersects(
                    self.model.geometry,
                    func.ST_MakeEnvelope(
                        bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
                    ),
                )
            )
        if station_type:
            conditions.append(self.model.type == station_type)
        term = normalize_query(q)
        if term is not None:
            conditions.append(self._search_condition(term))
        return conditions

    def _order_by(self, term: str | None) -> list:
        """Relevance first when searching, otherwise the standing order (ADR-083/147/153).

        Two relevance keys, in this order:

        1. Whether the station's *own* search_text matches — a station named after the
           keyword outranks one that merely stocks it or sits on that street.
        2. similarity(), to grade within each of those two groups.

        The boolean has to come first because similarity() cannot carry this on its own
        for CJK (ADR-147): pg_trgm pads a query to form trigrams, so a keyword that is not
        at the start of the text scores exactly 0 — `similarity('花蓮縣光復鄉救災站',
        '光復')` is 0, indistinguishable from a station reached only through a property.
        """
        # `uuid` last is not decoration: it is the only unique key in the list, and
        # without it a page boundary can fall inside a run of rows that tie on every
        # preceding key — the client then sees a row twice and never sees another
        # (ADR-153). Searching makes ties the common case rather than the exception:
        # every row matched only through a related table ties on BOTH relevance keys
        # (the boolean is false, similarity() is 0 — see the ADR-147 note above), and
        # `created_at` defaults to func.now(), which is transaction-scoped, so a bulk
        # insert leaves a whole block sharing one timestamp.
        standing = [
            self.model.priority_score.desc().nulls_last(),
            self.model.created_at.desc(),
            self.model.uuid.desc(),
        ]
        if term is None:
            return standing
        return [
            matches(self.model.search_text, like_pattern(term)).desc(),
            func.similarity(self.model.search_text, term).desc(),
            *standing,
        ]

    async def list_active(
        self, db: AsyncSession, *,
        bounds=None, station_type: str | None = None, q: str | None = None,
        skip: int = 0, limit: int = 50, extra_filters=(),
    ) -> list[Station]:
        """List active stations with optional bbox/type/keyword filter and RBAC scope conditions."""
        term = normalize_query(q)
        conditions = self._active_conditions(
            bounds=bounds, station_type=station_type, q=q, extra_filters=extra_filters
        )
        async with search_timeout(db, term):
            result = await db.execute(
                select(self.model).where(*conditions)
                .order_by(*self._order_by(term))
                .offset(skip).limit(limit)
            )
        return result.scalars().all()

    async def count_active(
        self, db: AsyncSession, *,
        bounds=None, station_type: str | None = None, q: str | None = None, extra_filters=(),
    ) -> int:
        """Count active stations — MUST use the same conditions as list_active()."""
        conditions = self._active_conditions(
            bounds=bounds, station_type=station_type, q=q, extra_filters=extra_filters
        )
        async with search_timeout(db, normalize_query(q)):
            return await db.scalar(
                select(func.count()).select_from(select(self.model).where(*conditions).subquery())
            )

    async def get_high_level_stations(self, db: AsyncSession, min_level: int) -> list[Station]:
        """Return all stations with a level at or above min_level."""
        result = await db.execute(
            select(self.model).where(self.model.level >= min_level)
        )
        return result.scalars().all()


class ClosureAreaRepository(GenericRepository[ClosureArea]):
    """Repository for closure area queries."""

    def __init__(self):
        """Initialize with ClosureArea as the managed model."""
        super().__init__(ClosureArea)

    async def list_active(
        self, db: AsyncSession, *, bounds=None, skip: int = 0, limit: int = 50, extra_filters=()
    ) -> list[ClosureArea]:
        """List active closure areas with optional bbox filter and RBAC scope_filter conditions."""
        query = select(self.model).where(self.model.delete_at.is_(None), *extra_filters)
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(self.model.geometry, bbox))
        result = await db.execute(
            query.order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def count_active(self, db: AsyncSession, *, bounds=None, extra_filters=()) -> int:
        """Count active closure areas with optional bbox filter and RBAC scope_filter conditions."""
        query = select(self.model).where(self.model.delete_at.is_(None), *extra_filters)
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(self.model.geometry, bbox))
        return await db.scalar(select(func.count()).select_from(query.subquery()))


class StationPropertyRepository(GenericRepository[StationProperty]):
    """Repository for station property queries."""

    def __init__(self):
        """Initialize with StationProperty as the managed model."""
        super().__init__(StationProperty)


class CrowdSourcingRepository(GenericRepository[CrowdSourcing]):
    """Repository for crowd-sourcing rating queries."""

    def __init__(self):
        """Initialize with CrowdSourcing as the managed model."""
        super().__init__(CrowdSourcing)

    async def upsert(
        self, db: AsyncSession, *,
        station_uuid: str, item_uuid: str, user_uuid: str,
        credibility_score: float, rating: str, distance: float | None,
    ) -> CrowdSourcing:
        """Update an existing rating or create a new one."""
        result = await db.execute(
            select(self.model).where(
                self.model.user_uuid == user_uuid,
                self.model.item_uuid == item_uuid,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.rating = rating
            existing.user_credibility_score = credibility_score
            existing.n_updates = existing.n_updates + 1
            if distance is not None:
                existing.distance_from_geometry = distance
            await db.commit()
            await db.refresh(existing)
            return existing
        return await self.create(db, obj_in={
            "station_uuid": station_uuid, "item_uuid": item_uuid,
            "user_uuid": user_uuid, "user_credibility_score": credibility_score,
            "rating": rating, "n_updates": 0, "distance_from_geometry": distance,
        })


class StationSuggestionRepository(GenericRepository[StationUpdateSuggestion]):
    """Repository for user suggestions to update station / station-property fields."""

    def __init__(self):
        """Initialize with StationUpdateSuggestion as the managed model."""
        super().__init__(StationUpdateSuggestion)

    async def list_active(
        self, db: AsyncSession, *,
        status: str | None = None, target_uuid: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> list[StationUpdateSuggestion]:
        """List non-deleted suggestions, newest first, with optional status/target filters."""
        query = select(self.model).where(self.model.delete_at.is_(None))
        if status:
            query = query.where(self.model.status == status)
        if target_uuid:
            query = query.where(self.model.target_uuid == target_uuid)
        result = await db.execute(
            query.order_by(self.model.created_at.desc()).offset(skip).limit(limit)
        )
        return result.scalars().all()


class SecondaryLocationRepository(GenericRepository[SecondaryLocation]):
    """Repository for secondary address / pole location details (pure CRUD)."""

    def __init__(self):
        """Initialize with SecondaryLocation as the managed model."""
        super().__init__(SecondaryLocation)


station_repository = StationRepository()
closure_area_repository = ClosureAreaRepository()
station_property_repository = StationPropertyRepository()
crowd_sourcing_repository = CrowdSourcingRepository()
station_suggestion_repository = StationSuggestionRepository()
secondary_location_repository = SecondaryLocationRepository()
