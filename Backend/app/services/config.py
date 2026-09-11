"""Dynamic-field config write actions (station / task / ticket property config schemas).

Same flat-service style as station.py. These are global schema definitions, not
user-owned resources, so each function is checkpoint 1 only (dynamic_field.edit).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.disaster_types import validate_disaster_types
from app.core.permissions import Perm
from app.models.auth import User
from app.models.property_config import (
    StationPropertyConfig,
    TaskPropertyConfig,
    TicketPropertyConfig,
)
from app.repositories.config_repository import (
    station_property_config_repository,
    task_property_config_repository,
    ticket_property_config_repository,
)
from app.services.authz import require_scope


async def upsert_station_property_config(
    db: AsyncSession,
    *,
    actor: User,
    station_type: str,
    property_name: str,
    data_type: str | None = None,
    enum_options: list[str] | None = None,
    disaster_types: list[str] | None = None,
    label: str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
    unit: str | None = None,
) -> StationPropertyConfig:
    """Create or update a station property config entry (checkpoint 1 only).

    Every field except the key is optional and omitting one leaves it unchanged (ADR-228/099),
    so retiring a field is `is_active=False` alone. `data_type` is required only when the
    entry does not exist yet.

    `disaster_types` is validated against the vocabulary table: a field scoped to a disaster
    that does not exist stores cleanly and then shows up for nobody. Only an explicit write is
    checked — omitting the key leaves the stored value untouched, so a row carrying a stale
    label is not re-validated on an unrelated edit.
    """
    await require_scope(actor, Perm.FIELD_EDIT, db)
    if disaster_types is not None:
        disaster_types = await validate_disaster_types(db, disaster_types)
    return await station_property_config_repository.upsert(
        db,
        station_type=station_type,
        property_name=property_name,
        data_type=data_type,
        enum_options=enum_options,
        disaster_types=disaster_types,
        label=label,
        sort_order=sort_order,
        is_active=is_active,
        unit=unit,
    )


async def upsert_task_property_config(
    db: AsyncSession,
    *,
    actor: User,
    task_type: str,
    property_name: str,
    data_type: str | None = None,
    enum_options: list[str] | None = None,
    disaster_types: list[str] | None = None,
    label: str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
    unit: str | None = None,
) -> TaskPropertyConfig:
    """Create or update a task property config entry (checkpoint 1 only).

    Same partial-update semantics as the station side, and the same `disaster_types`
    validation against the vocabulary table.
    """
    await require_scope(actor, Perm.FIELD_EDIT, db)
    if disaster_types is not None:
        disaster_types = await validate_disaster_types(db, disaster_types)
    return await task_property_config_repository.upsert(
        db,
        task_type=task_type,
        property_name=property_name,
        data_type=data_type,
        enum_options=enum_options,
        disaster_types=disaster_types,
        label=label,
        sort_order=sort_order,
        is_active=is_active,
        unit=unit,
    )


async def upsert_ticket_property_config(
    db: AsyncSession,
    *,
    actor: User,
    property_name: str,
    data_type: str | None = None,
    enum_options: list[str] | None = None,
    disaster_types: list[str] | None = None,
    label: str | None = None,
    hint: str | None = None,
    unit: str | None = None,
    is_active: bool | None = None,
) -> TicketPropertyConfig:
    """Create or update a ticket disaster-field definition (checkpoint 1 only).

    This is the "add a column to a disaster" surface: an operator defines the field once and
    scopes it with `disaster_types`. Same partial-update semantics as the two siblings
    (ADR-228/099) — omitting a key leaves it untouched, so retiring a field is
    `is_active=False` on its own.

    Unlike the siblings there is no type argument, because `property_name` alone is the key
    (ADR-247), and there is no `sort_order`, because the ticket table does not have one
    (ADR-248).

    `disaster_types` is validated against the vocabulary table rather than merely lower-cased:
    scoping a field to a disaster that does not exist would store cleanly and then show the
    field to nobody, which is the exact silent failure ADR-169 could only warn about before
    the vocabulary was closed.
    """
    await require_scope(actor, Perm.FIELD_EDIT, db)
    if disaster_types is not None:
        disaster_types = await validate_disaster_types(db, disaster_types)
    return await ticket_property_config_repository.upsert(
        db,
        property_name=property_name,
        data_type=data_type,
        enum_options=enum_options,
        disaster_types=disaster_types,
        label=label,
        hint=hint,
        unit=unit,
        is_active=is_active,
    )
