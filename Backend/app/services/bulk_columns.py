"""Column model shared by bulk export and import (feature 015, ADR-118/119).

One definition serves both directions: the exporter writes these headers in this order and
the importer maps an uploaded file back onto them. That is what makes an exported file a
valid import template by construction, rather than by two implementations agreeing.

Dynamic fields come from feature 013's `list_by_type`, so deactivated fields and fields
belonging to another disaster type are filtered out here for free (ADR-091/095) — there is
deliberately no second filter in this module.
"""

from dataclasses import dataclass, replace

from sqlalchemy.ext.asyncio import AsyncSession

from app.graphql.shared import Visibility
from app.repositories.config_repository import (
    station_property_config_repository,
    task_property_config_repository,
)
from app.repositories.project_settings_repository import project_settings_repository
from app.services.ticket import VALID_TRANSITIONS

# Header prefix marking a dynamic (EAV) column, so a config field named `status` can never
# collide with the fixed column of the same name.
DYNAMIC_PREFIX = "prop."

# The config vocabulary (see the seed in migration a2a8e4d8c51d), plus two types only fixed
# columns use. `data_type` is a free-text column, so this is a description of what exists,
# not a constraint the database enforces.
INTEGER = "Integer"
STRING = "String"
TEXT = "Text"
BOOLEAN = "Boolean"
ENUM = "Enum"
ARRAY = "Array"
FLOAT = "Float"  # coordinates and scores; never produced by a config row
TIMESTAMP = "Timestamp"  # export-only columns; never produced by a config row

# ADR-118: `station_properties` has no value column — only `quantity: int` — so a config row
# of any other type has nowhere to put its value. Those fields are skipped rather than turned
# into columns that would fail on the way back in. This is an existing schema gap, not one
# this feature introduces; `task_properties` has a text `property_value` and needs no filter.
STORABLE_STATION_DATA_TYPES = frozenset({INTEGER})
_UNSTORABLE_REASON = "station_properties 目前無法儲存 {data_type} 型別的值"


@dataclass(frozen=True)
class ColumnSpec:
    """One column of a bulk file.

    `writable_on_create` / `writable_on_update` are separate because the two directions
    genuinely differ: a ticket's `status` is meaningless on a new row (`create_ticket` always
    writes "pending") while an address can only be set at creation, since `UpdateStationInput`
    has no `secondary_location`.
    """

    header: str
    field: str
    data_type: str = STRING
    enum_options: tuple[str, ...] | None = None
    is_dynamic: bool = False
    writable_on_create: bool = True
    writable_on_update: bool = True
    required_on_create: bool = False


def _readonly(column: ColumnSpec) -> ColumnSpec:
    """Mark a column as export-only: the platform owns this value, an import never sets it."""
    return replace(column, writable_on_create=False, writable_on_update=False)


def _create_only(column: ColumnSpec) -> ColumnSpec:
    """Mark a column settable at creation but never by an update."""
    return replace(column, writable_on_update=False)


def _c(header: str, data_type: str = STRING, *, field: str | None = None, **kwargs) -> ColumnSpec:
    return ColumnSpec(header=header, field=field or header, data_type=data_type, **kwargs)


_VISIBILITY_OPTIONS = tuple(v.value for v in Visibility)
_TICKET_STATUS_OPTIONS = tuple(VALID_TRANSITIONS)

# A column that is part of the match key can only ever be written with the value that
# matched it (ADR-107/108) — by the time a row is known to be an update, the file's value
# for that column already equals the row's. Writing it back is a guaranteed no-op, so it is
# marked create-only rather than left to look editable.
_MATCH_KEY_NOTE = "match key — see ADR-108"

STATION_COLUMNS: tuple[ColumnSpec, ...] = (
    _readonly(_c("uuid")),
    _create_only(_c("name", required_on_create=True)),  # _MATCH_KEY_NOTE
    _c("type"),
    _c("description", TEXT),
    _c("op_hour"),
    _c("level", INTEGER),
    _c("comment", TEXT),
    _create_only(_c("source")),  # not in UpdateStationInput
    _c("visibility", ENUM, enum_options=_VISIBILITY_OPTIONS),
    _c("latitude", FLOAT, required_on_create=True),
    _c("longitude", FLOAT, required_on_create=True),
    # The address lives in `secondary_locations`, which `UpdateStationInput` cannot reach at
    # all; county/city are also part of the match key.
    _create_only(_c("county")),
    _create_only(_c("city")),
    _create_only(_c("lane")),
    _create_only(_c("alley")),
    _create_only(_c("no")),
    _create_only(_c("floor")),
    _create_only(_c("room")),
    _readonly(_c("verification_status")),
    _readonly(_c("is_official", BOOLEAN)),
    _readonly(_c("confidence_score", FLOAT)),
    _readonly(_c("created_at", TIMESTAMP)),
    _readonly(_c("updated_at", TIMESTAMP)),
)

TICKET_COLUMNS: tuple[ColumnSpec, ...] = (
    _readonly(_c("uuid")),
    _create_only(_c("title", required_on_create=True)),  # _MATCH_KEY_NOTE
    _c("description", TEXT),
    # `create_ticket` always writes "pending", so a status on a new row means nothing; on an
    # update it goes through VALID_TRANSITIONS like any other status change (ADR-122).
    ColumnSpec(
        header="status",
        field="status",
        data_type=ENUM,
        enum_options=_TICKET_STATUS_OPTIONS,
        writable_on_create=False,
    ),
    _c("priority"),
    _c("disaster_type"),
    # PII, and `UpdateTicketInput` carries no contact fields at all; contact_phone is also
    # part of the match key.
    _create_only(_c("contact_name", required_on_create=True)),
    _create_only(_c("contact_email")),
    _create_only(_c("contact_phone")),
    # `UpdateTicketInput` has no geometry, so a ticket's location is fixed once created.
    _create_only(_c("latitude", FLOAT, required_on_create=True)),
    _create_only(_c("longitude", FLOAT, required_on_create=True)),
    _create_only(_c("visibility", ENUM, enum_options=_VISIBILITY_OPTIONS)),
    # One row is one ticket plus one task (ADR-120). task_type + task_name are the task's
    # match key; task_description and task_quantity are absent from UpdateTicketTaskInput.
    _create_only(_c("task_type")),
    _create_only(_c("task_name", required_on_create=True)),
    _create_only(_c("task_description", TEXT)),
    _create_only(_c("task_quantity", INTEGER)),
    _readonly(_c("verification_status")),
    _readonly(_c("review_note", TEXT)),
    _readonly(_c("created_at", TIMESTAMP)),
)


@dataclass(frozen=True)
class SkippedColumn:
    """A configured dynamic field that cannot become a column, and why."""

    property_name: str
    data_type: str
    reason: str


def _dynamic_column(config) -> ColumnSpec:
    """Turn one property config row into a column."""
    return ColumnSpec(
        header=f"{DYNAMIC_PREFIX}{config.property_name}",
        field=config.property_name,
        data_type=config.data_type,
        enum_options=tuple(config.enum_options) if config.enum_options else None,
        is_dynamic=True,
    )


async def _station_configs(db: AsyncSession, station_type: str) -> list:
    disaster_types = await project_settings_repository.get_current_disaster_types(db)
    return await station_property_config_repository.list_by_type(
        db, station_type, disaster_types=disaster_types
    )


async def station_columns(db: AsyncSession, station_type: str) -> tuple[ColumnSpec, ...]:
    """Return the full column list for a station file, fixed columns first.

    Only `Integer` dynamic fields appear (ADR-118); use `dynamic_columns_skipped_for_station`
    to tell the user what was left out and why.
    """
    configs = await _station_configs(db, station_type)
    dynamic = tuple(
        _dynamic_column(c) for c in configs if c.data_type in STORABLE_STATION_DATA_TYPES
    )
    return STATION_COLUMNS + dynamic


async def dynamic_columns_skipped_for_station(
    db: AsyncSession, station_type: str
) -> tuple[SkippedColumn, ...]:
    """Return the configured fields a station file cannot carry, each with its reason.

    `preview` shows these: a file silently missing half a station type's fields reads as data
    loss, when the truth is that those values were never storable in the first place.
    """
    configs = await _station_configs(db, station_type)
    return tuple(
        SkippedColumn(
            property_name=c.property_name,
            data_type=c.data_type,
            reason=_UNSTORABLE_REASON.format(data_type=c.data_type),
        )
        for c in configs
        if c.data_type not in STORABLE_STATION_DATA_TYPES
    )


async def ticket_columns(db: AsyncSession, task_type: str) -> tuple[ColumnSpec, ...]:
    """Return the full column list for a ticket file, fixed columns first.

    Every configured data type appears: `task_properties.property_value` is text, so unlike
    the station side nothing has to be dropped.
    """
    disaster_types = await project_settings_repository.get_current_disaster_types(db)
    configs = await task_property_config_repository.list_by_type(
        db, task_type, disaster_types=disaster_types
    )
    return TICKET_COLUMNS + tuple(_dynamic_column(c) for c in configs)
