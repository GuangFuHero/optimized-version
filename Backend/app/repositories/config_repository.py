"""Repositories for station and task property configuration schemas.

`list_by_type` answers "which fields should the form show right now": the requested target
type (plus the universal 'all' bucket for stations), narrowed to fields enabled for the
deployment's current disaster types (ADR-091), excluding deactivated fields (ADR-095), in a
totally ordered list. Before feature 013 there was no ORDER BY at all, so the same query
could come back in a different order twice in a row. Pass `include_inactive=True` for the
management view that can still see retired fields (ADR-096).
"""

from sqlalchemy import ARRAY, String, cast, func, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.core.disaster_types import normalize_disaster_types
from app.infrastructure.repository.base import GenericRepository
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig


class PropertyConfigValidationError(ValueError):
    """Raised when an upsert cannot be carried out as asked.

    Subclasses ValueError so the message survives the GraphQL masking extension
    (`app/graphql/schema.py` allow-lists ValueError); re-parenting it onto a bare Exception
    would turn it into "Unexpected error." on the way out.
    """


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
        self, db: AsyncSession, station_type: str, *, disaster_types: list[str] | None = None,
        include_inactive: bool = False,
    ) -> list[StationPropertyConfig]:
        """Return active configs for the station type (plus universal 'all' ones), ordered.

        `include_inactive` is the management view (ADR-096): retired fields are invisible to
        every form path, so without it a deactivated field could never be found again.

        The order ends on `uuid` because this query unions the type's own rows with the 'all'
        bucket, where `(sort_order, property_name)` is NOT unique — `('all', 'crowd_level')`
        and `('shelter', 'crowd_level')` both sit at sort_order 0 and would otherwise come
        back in whatever order the plan produced (ADR-097).
        """
        conditions = [
            or_(self.model.station_type == station_type, self.model.station_type == "all"),
            _enabled_for(self.model.disaster_types, disaster_types or []),
        ]
        if not include_inactive:
            conditions.append(self.model.is_active.is_(True))
        result = await db.execute(
            select(self.model)
            .where(*conditions)
            .order_by(self.model.sort_order, self.model.property_name, self.model.uuid)
        )
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *,
        station_type: str, property_name: str, data_type: str | None = None,
        enum_options: list[str] | None = None,
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

        update_values = _optional_config_fields(
            data_type, enum_options, disaster_types, label, sort_order, is_active
        )
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
        self, db: AsyncSession, task_type: str, *, disaster_types: list[str] | None = None,
        include_inactive: bool = False,
    ) -> list[TaskPropertyConfig]:
        """Return active configs for the given task type, ordered.

        `include_inactive` is the management view (ADR-096), as on the station side. The
        order ends on `uuid` for the same reason there — here it is already total (this query
        has no 'all' bucket, and `(task_type, property_name)` is unique), so it is only
        belt-and-braces, but it keeps the two queries reading identically.
        """
        conditions = [
            self.model.task_type == task_type,
            _enabled_for(self.model.disaster_types, disaster_types or []),
        ]
        if not include_inactive:
            conditions.append(self.model.is_active.is_(True))
        result = await db.execute(
            select(self.model)
            .where(*conditions)
            .order_by(self.model.sort_order, self.model.property_name, self.model.uuid)
        )
        return result.scalars().all()

    async def upsert(
        self, db: AsyncSession, *,
        task_type: str, property_name: str, data_type: str | None = None,
        enum_options: list[str] | None = None,
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

        update_values = _optional_config_fields(
            data_type, enum_options, disaster_types, label, sort_order, is_active
        )
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
    if "data_type" not in create_values:
        raise PropertyConfigValidationError(
            "新增動態欄位時必須提供 data_type（既有欄位才可以省略）"
        )
    try:
        return await repo.create(db, obj_in=create_values)
    except IntegrityError:
        await db.rollback()
        existing = await lookup()
        if existing is None:
            raise  # a different constraint failed; not ours to swallow
        return await repo.update(db, db_obj=existing, obj_in=update_values)


def _optional_config_fields(
    data_type: str | None, enum_options: list[str] | None, disaster_types: list[str] | None,
    label: str | None, sort_order: int | None, is_active: bool | None,
) -> dict:
    """Keep only the fields the caller actually supplied.

    Omitted fields keep their stored value on update and their column default on insert, so
    a caller that only cares about `data_type` never silently resets a field's ordering or
    disables it.

    `enum_options` obeys the same rule (ADR-098): editing an Enum field's label used to blank
    its options, because the update always carried the input's default `None`. Clearing the
    options is spelled `enum_options=[]` — an empty list is supplied, not omitted.

    `data_type` follows the same rule as of ADR-100, and it is the one that made the rule
    matter: it used to be written unconditionally, so retiring a field — which needs nothing
    but `is_active: false` — forced the caller to restate what the field *is*, and a stale or
    guessed value silently redefined it. Creation still requires it (the column is NOT NULL);
    that is enforced in `_upsert_with_conflict_retry`, which is where the insert-vs-update
    decision is actually made.
    """
    supplied = {
        "data_type": data_type,
        "enum_options": enum_options,
        "disaster_types": (
            None if disaster_types is None else normalize_disaster_types(disaster_types)
        ),
        "label": label, "sort_order": sort_order, "is_active": is_active,
    }
    return {k: v for k, v in supplied.items() if v is not None}


async def disaster_types_in_use(db: AsyncSession) -> set[str]:
    """Every disaster label that at least one config row is scoped to.

    The vocabulary of real disaster types lives in PM-Scure's spec, not in this repository
    (ADR-091), so there is nothing to validate a label against. What *is* knowable is which
    labels the configured fields actually use, and that is enough to tell an operator that
    the label they just saved matches none of them — the difference between a typo and a
    disaster nobody has configured fields for yet (ADR-101).

    Rows with an empty `disaster_types` are universal ("every type") and contribute no label,
    which is correct here: they stay enabled whatever the deployment is set to, so they can
    never be the thing a mistyped label was meant to reach.
    """
    labels: set[str] = set()
    for model in (StationPropertyConfig, TaskPropertyConfig):
        result = await db.execute(select(func.unnest(model.disaster_types)).distinct())
        labels.update(result.scalars().all())
    return labels


station_property_config_repository = StationPropertyConfigRepository()
task_property_config_repository = TaskPropertyConfigRepository()
