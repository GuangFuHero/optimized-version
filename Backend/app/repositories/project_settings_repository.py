"""Repository for the single-row project settings table (ADR-090)."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import normalize_disaster_types
from app.infrastructure.repository.base import GenericRepository
from app.models.project_settings import ProjectSettings


class ProjectSettingsRepository(GenericRepository[ProjectSettings]):
    """Reads and upserts the deployment's one settings row."""

    def __init__(self):
        """Initialize with ProjectSettings as the managed model."""
        super().__init__(ProjectSettings)

    async def get_singleton(self, db: AsyncSession) -> ProjectSettings | None:
        """Return the one settings row, or None when the deployment is unconfigured."""
        result = await db.execute(select(self.model).limit(1))
        return result.scalar_one_or_none()

    async def get_current_disaster_types(self, db: AsyncSession) -> list[str]:
        """Return the disaster types this deployment is responding to.

        An unconfigured deployment (no row, or an empty array) yields `[]`, which callers
        read as "no filter" — every dynamic field stays enabled.
        """
        result = await db.execute(select(self.model.disaster_types).limit(1))
        return result.scalar_one_or_none() or []

    async def upsert(
        self, db: AsyncSession, *, values: dict
    ) -> ProjectSettings:
        """Update the single row, creating it if the table is still empty.

        PATCH semantics: only the keys present in `values` are written, so a partial body
        never clears fields it does not mention. Disaster labels are lower-cased on the way
        in so they match the config side, which is normalized the same way — the comparison
        is exact string equality, and a near-miss hides fields instead of erroring.

        Creation requires `name` (the column is NOT NULL); the caller validates that before
        getting here. If two first-time callers race, the singleton index rejects the loser,
        which then re-reads and updates the winner instead of surfacing a 500.
        """
        if "disaster_types" in values:
            values = {**values, "disaster_types": normalize_disaster_types(values["disaster_types"])}
        current = await self.get_singleton(db)
        if current is not None:
            return await self.update(db, db_obj=current, obj_in=values)
        try:
            return await self.create(db, obj_in=values)
        except IntegrityError:
            await db.rollback()
            current = await self.get_singleton(db)
            if current is None:
                raise  # a different constraint failed; not ours to swallow
            return await self.update(db, db_obj=current, obj_in=values)


project_settings_repository = ProjectSettingsRepository()
