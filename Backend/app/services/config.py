"""Dynamic-field config write actions (station / task property config schemas).

Same flat-service style as station.py. These are global schema definitions, not
user-owned resources, so each function is checkpoint 1 only (dynamic_field.edit).
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.models.auth import User
from app.models.property_config import StationPropertyConfig, TaskPropertyConfig
from app.repositories.config_repository import (
    station_property_config_repository,
    task_property_config_repository,
)
from app.services.authz import require_scope


async def upsert_station_property_config(
    db: AsyncSession,
    *,
    actor: User,
    station_type: str,
    property_name: str,
    data_type: str,
    enum_options: list[str] | None,
    disaster_types: list[str] | None = None,
    label: str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
) -> StationPropertyConfig:
    """Create or update a station property config entry (checkpoint 1 only)."""
    await require_scope(actor, Perm.FIELD_EDIT, db)
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
    )


async def upsert_task_property_config(
    db: AsyncSession,
    *,
    actor: User,
    task_type: str,
    property_name: str,
    data_type: str,
    enum_options: list[str] | None,
    disaster_types: list[str] | None = None,
    label: str | None = None,
    sort_order: int | None = None,
    is_active: bool | None = None,
) -> TaskPropertyConfig:
    """Create or update a task property config entry (checkpoint 1 only)."""
    await require_scope(actor, Perm.FIELD_EDIT, db)
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
    )
