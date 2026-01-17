from app.infrastructure.repository.base import GenericRepository
from app.models.geo import Station


class StationRepository(GenericRepository[Station]):
    def __init__(self):
        super().__init__(Station)

    # 這裡可以加入針對 Station 的特殊查詢
    # 例如：查詢特定 Level 以上的站點
    async def get_high_level_stations(self, db, min_level: int):
        from sqlalchemy import select
        query = select(self.model).where(self.model.level >= min_level)
        result = await db.execute(query)
        return result.scalars().all()


station_repository = StationRepository()
