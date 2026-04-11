"""Repository for Station geo queries."""

from app.infrastructure.repository.base import GenericRepository
from app.models.geo import Station


class StationRepository(GenericRepository[Station]):
    """Repository for Station geo queries with spatial filtering helpers."""

    def __init__(self):
        """Initialize with Station as the managed model."""
        super().__init__(Station)

    # 這裡可以加入針對 Station 的特殊查詢
    # 例如：查詢特定 Level 以上的站點
    async def get_high_level_stations(self, db, min_level: int):
        """Return all stations with a level at or above min_level."""
        from sqlalchemy import select
        query = select(self.model).where(self.model.level >= min_level)
        result = await db.execute(query)
        return result.scalars().all()


station_repository = StationRepository()
