"""Repositories for stations, closure areas, station properties, and crowd sourcing."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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

    async def list_active(
        self, db: AsyncSession, *,
        bounds=None, station_type: str | None = None, operational_status: str | None = None,
        skip: int = 0, limit: int = 50, extra_filters=(),
    ) -> list[Station]:
        """List active stations, filtered by optional bbox/type/operational_status and RBAC scope_filter."""
        query = select(self.model).where(self.model.delete_at.is_(None), *extra_filters)
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(self.model.geometry, bbox))
        if station_type:
            query = query.where(self.model.type == station_type)
        if operational_status:
            query = query.where(self.model.operational_status == operational_status)
        result = await db.execute(
            query.order_by(
                self.model.priority_score.desc().nulls_last(), self.model.created_at.desc()
            ).offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def count_active(
        self, db: AsyncSession, *,
        bounds=None, station_type: str | None = None, operational_status: str | None = None,
        extra_filters=(),
    ) -> int:
        """Count active stations, filtered by optional bbox/type/operational_status and RBAC scope_filter."""
        query = select(self.model).where(self.model.delete_at.is_(None), *extra_filters)
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            query = query.where(func.ST_Intersects(self.model.geometry, bbox))
        if station_type:
            query = query.where(self.model.type == station_type)
        if operational_status:
            query = query.where(self.model.operational_status == operational_status)
        return await db.scalar(select(func.count()).select_from(query.subquery()))

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
