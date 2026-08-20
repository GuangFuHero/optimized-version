"""Repositories for station and task property configuration schemas.

`list_by_type` answers "which fields should the form show right now": the requested target
type (plus the universal 'all' bucket for stations), narrowed to fields enabled for the
deployment's current disaster types (ADR-091), excluding deactivated fields (ADR-095), in a
stable order. Before feature 013 there was no ORDER BY at all, so the same query could come
back in a different order twice in a row.
"""

from sqlalchemy import ARRAY, String, cast, func, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.core.disaster_types import normalize_disaster_types
from app.infrastructure.repository.base import GenericRepository
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig


def _enabled_for(column, disaster_types: list[str]) -> ColumnElement[bool]:
    """Build the "is this field enabled for the current disaster" predicate.

    A config with an empty `disaster_types` applies to every disaster type (the same
    convention as `station_type = 'all'`). An unconfigured deployment passes `[]`, which
    means "no filter" — every field stays enabled rather than none of them.
    """
    if not disaster_types:
        return true()
    # `&&` is PostgreSQL's array-intersection operator: a mixed disaster is one condition,
    # not a loop over types.
    return or_(
        func.cardinality(column) == 0,
        column.op("&&")(cast(disaster_types, ARRAY(String))),
    )


class StationPropertyConfigRepository(GenericRepository[StationPropertyConfig]):
    """Repository for station property configuration schemas."""

    def __init__(self):
        """Initialize with StationPropertyConfig as the managed model."""
        super().__init__(StationPropertyConfig)

    async def list_by_type(
        self, db: AsyncSession, station_type: str, *, disaster_types: list[str] | None = None
    ) -> list[StationPropertyConfig]:
        """Return active configs for the station type (plus universal 'all' ones), ordered."""
        result = await db.execute(
            select(self.model)
            .where(
                or_(self.model.station_type == station_type, self.model.station_type == "all"),
                _enabled_for(self.model.disaster_types, disaster_types or []),
                self.model.is_active.is_(True),
            )
            .order_by(self.model.sort_order, self.model.property_name)
        )
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *,
        station_type: str, property_name: str, data_type: str, enum_options,
        disaster_types: list[str] | None = None, label: str | None = None,
        sort_order: int | None = None, is_active: bool | None = None,
    ) -> StationPropertyConfig:
        """Create or update a config entry for the given station type and property name.

        `(station_type, property_name)` is the key — `property_name` is immutable (ADR-095),
        so passing a new name creates a new row rather than renaming an existing one.
        """
        async def lookup():
            result = await db.execute(
                select(self.model).where(
                    self.model.station_type == station_type,
                    self.model.property_name == property_name,
                )
            )
            return result.scalar_one_or_none()

        optional = _optional_config_fields(disaster_types, label, sort_order, is_active)
        update_values = {"data_type": data_type, "enum_options": enum_options, **optional}
        return await _upsert_with_conflict_retry(
            self, db, lookup=lookup, update_values=update_values,
            create_values={
                "station_type": station_type, "property_name": property_name, **update_values,
            },
        )


class TaskPropertyConfigRepository(GenericRepository[TaskPropertyConfig]):
    """Repository for task property configuration schemas."""

    def __init__(self):
        """Initialize with TaskPropertyConfig as the managed model."""
        super().__init__(TaskPropertyConfig)

    async def list_by_type(
        self, db: AsyncSession, task_type: str, *, disaster_types: list[str] | None = None
    ) -> list[TaskPropertyConfig]:
        """Return active configs for the given task type, ordered."""
        result = await db.execute(
            select(self.model)
            .where(
                self.model.task_type == task_type,
                _enabled_for(self.model.disaster_types, disaster_types or []),
                self.model.is_active.is_(True),
            )
            .order_by(self.model.sort_order, self.model.property_name)
        )
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *,
        task_type: str, property_name: str, data_type: str, enum_options,
        disaster_types: list[str] | None = None, label: str | None = None,
        sort_order: int | None = None, is_active: bool | None = None,
    ) -> TaskPropertyConfig:
        """Create or update a config entry for the given task type and property name."""
        async def lookup():
            result = await db.execute(
                select(self.model).where(
                    self.model.task_type == task_type,
                    self.model.property_name == property_name,
                )
            )
            return result.scalar_one_or_none()

        optional = _optional_config_fields(disaster_types, label, sort_order, is_active)
        update_values = {"data_type": data_type, "enum_options": enum_options, **optional}
        return await _upsert_with_conflict_retry(
            self, db, lookup=lookup, update_values=update_values,
            create_values={
                "task_type": task_type, "property_name": property_name, **update_values,
            },
        )


async def _upsert_with_conflict_retry(repo, db, *, lookup, create_values, update_values):
    """Run a SELECT→INSERT upsert, converging on the DB's unique key when two callers race.

    The lookup and the insert are not one atomic step, so two concurrent upserts for a
    not-yet-existing key both see `None` and both INSERT. Before feature 013 the loser
    silently produced a duplicate row; now the unique key rejects it, which would surface as
    an unhandled IntegrityError (a 500). Re-reading after the conflict turns the race into
    what the caller asked for: last writer updates the row that won.
    """
    existing = await lookup()
    if existing is not None:
        return await repo.update(db, db_obj=existing, obj_in=update_values)
    try:
        return await repo.create(db, obj_in=create_values)
    except IntegrityError:
        await db.rollback()
        existing = await lookup()
        if existing is None:
            raise  # a different constraint failed; not ours to swallow
        return await repo.update(db, db_obj=existing, obj_in=update_values)


def _optional_config_fields(
    disaster_types: list[str] | None, label: str | None,
    sort_order: int | None, is_active: bool | None,
) -> dict:
    """Keep only the presentation fields the caller actually supplied.

    Omitted fields keep their stored value on update and their column default on insert, so
    a caller that only cares about `data_type` never silently resets a field's ordering or
    disables it.
    """
    supplied = {
        "disaster_types": (
            None if disaster_types is None else normalize_disaster_types(disaster_types)
        ),
        "label": label, "sort_order": sort_order, "is_active": is_active,
    }
    return {k: v for k, v in supplied.items() if v is not None}


station_property_config_repository = StationPropertyConfigRepository()
task_property_config_repository = TaskPropertyConfigRepository()
