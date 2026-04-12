"""Repositories for station and task property configuration schemas."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig


class StationPropertyConfigRepository(GenericRepository[StationPropertyConfig]):
    """Repository for station property configuration schemas."""

    def __init__(self):
        """Initialize with StationPropertyConfig as the managed model."""
        super().__init__(StationPropertyConfig)

    async def list_by_type(
        self, db: AsyncSession, station_type: str
    ) -> list[StationPropertyConfig]:
        """Return configs for the given station type plus universal 'all' configs."""
        result = await db.execute(
            select(self.model).where(
                or_(self.model.station_type == station_type, self.model.station_type == "all")
            )
        )
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *,
        station_type: str, property_name: str, data_type: str, enum_options,
    ) -> StationPropertyConfig:
        """Create or update a config entry for the given station type and property name."""
        result = await db.execute(
            select(self.model).where(
                self.model.station_type == station_type,
                self.model.property_name == property_name,
            )
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            return await self.update(db, db_obj=cfg, obj_in={
                "data_type": data_type, "enum_options": enum_options,
            })
        return await self.create(db, obj_in={
            "station_type": station_type, "property_name": property_name,
            "data_type": data_type, "enum_options": enum_options,
        })


class TaskPropertyConfigRepository(GenericRepository[TaskPropertyConfig]):
    """Repository for task property configuration schemas."""

    def __init__(self):
        """Initialize with TaskPropertyConfig as the managed model."""
        super().__init__(TaskPropertyConfig)

    async def list_by_type(self, db: AsyncSession, task_type: str) -> list[TaskPropertyConfig]:
        """Return configs for the given task type."""
        result = await db.execute(
            select(self.model).where(self.model.task_type == task_type)
        )
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *,
        task_type: str, property_name: str, data_type: str, enum_options,
    ) -> TaskPropertyConfig:
        """Create or update a config entry for the given task type and property name."""
        result = await db.execute(
            select(self.model).where(
                self.model.task_type == task_type,
                self.model.property_name == property_name,
            )
        )
        cfg = result.scalar_one_or_none()
        if cfg:
            return await self.update(db, db_obj=cfg, obj_in={
                "data_type": data_type, "enum_options": enum_options,
            })
        return await self.create(db, obj_in={
            "task_type": task_type, "property_name": property_name,
            "data_type": data_type, "enum_options": enum_options,
        })


station_property_config_repository = StationPropertyConfigRepository()
task_property_config_repository = TaskPropertyConfigRepository()
