"""Repositories for the deployment's project settings row (ADR-090) and its disaster vocabulary."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import normalize_disaster_types
from app.infrastructure.repository.base import GenericRepository
from app.models.disaster_type import DisasterType
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
        self, db: AsyncSession, *, values: dict, current: ProjectSettings | None = None
    ) -> ProjectSettings:
        """Update the single row, creating it if the table is still empty.

        PATCH semantics: only the keys present in `values` are written, so a partial body
        never clears fields it does not mention. Disaster labels are lower-cased on the way
        in so they match the config side, which is normalized the same way — the comparison
        is exact string equality, and a near-miss hides fields instead of erroring.

        `current` is the row the caller has already read, passed in so one PATCH costs one
        read: the service reads it to decide whether `name` is required, and this method used
        to read it again to decide insert-vs-update. Omit it and the row is read here instead.

        Creation requires `name` (the column is NOT NULL); the caller validates that before
        getting here. If two first-time callers race, the singleton index rejects the loser,
        which then re-reads and updates the winner instead of surfacing a 500.
        """
        if "disaster_types" in values:
            values = {**values, "disaster_types": normalize_disaster_types(values["disaster_types"])}
        if current is None:
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


class DisasterTypeRepository(GenericRepository[DisasterType]):
    """Reads and upserts the deployment's disaster-type vocabulary (feature 018, ADR-244)."""

    def __init__(self):
        """Initialize with DisasterType as the managed model."""
        super().__init__(DisasterType)

    async def list_all(
        self, db: AsyncSession, *, include_inactive: bool = False
    ) -> list[DisasterType]:
        """List the vocabulary, ordered by key so the picker never reshuffles.

        Ordered on `key`, not `label`: the keys are ASCII and sort stably everywhere, whereas
        Chinese labels sort by whatever collation the database happens to be running.
        """
        stmt = select(self.model)
        if not include_inactive:
            stmt = stmt.where(self.model.is_active.is_(True))
        result = await db.execute(stmt.order_by(self.model.key))
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *, key: str, label: str | None = None,
        is_active: bool | None = None,
    ) -> DisasterType:
        """Create or update one disaster type, keyed on the normalized `key`.

        `key` is normalized the same way every other disaster label in the system is, so an
        operator typing `" Flood "` updates the existing `flood` rather than creating a
        near-duplicate that would silently match nothing.

        There is no rename: `tickets.disaster_types`, `project_settings.disaster_types` and
        every `*_property_config.disaster_types` reference the key as a bare string with no
        foreign key, so changing it would orphan all three at once. Editing `label` is how you
        change what people see.
        """
        normalized = normalize_disaster_types([key])
        if not normalized:
            raise ValueError("災害型別代碼不可為空白")
        key = normalized[0]

        result = await db.execute(select(self.model).where(self.model.key == key))
        existing = result.scalar_one_or_none()
        values = {k: v for k, v in {"label": label, "is_active": is_active}.items() if v is not None}
        if existing is not None:
            return await self.update(db, db_obj=existing, obj_in=values)
        if not label:
            raise ValueError(f"新增災害型別「{key}」時必須提供顯示名稱 label")
        try:
            return await self.create(db, obj_in={"key": key, **values})
        except IntegrityError:
            # Two operators adding the same type at once: the unique key rejects the loser,
            # which re-reads and updates the winner instead of surfacing a 500. Same
            # convergence rule as the property-config upsert.
            await db.rollback()
            result = await db.execute(select(self.model).where(self.model.key == key))
            existing = result.scalar_one_or_none()
            if existing is None:
                raise
            return await self.update(db, db_obj=existing, obj_in=values)


project_settings_repository = ProjectSettingsRepository()
disaster_type_repository = DisasterTypeRepository()
