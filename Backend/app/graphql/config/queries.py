"""GraphQL queries for station and task property configuration schemas.

Read-checked per ADR-027: dynamic_field.view is NOT public (unlike station/ticket) — no
existing behavior requires anonymous access to config schema metadata, so it stays
login-gated. Checkpoint 1 only: these are global schema definitions, not user-owned rows.
"""

import strawberry

from app.core.permissions import Perm
from app.graphql.config.types import StationPropertyConfigType, TaskPropertyConfigType
from app.graphql.context import check_permission
from app.repositories.config_repository import (
    station_property_config_repository,
    task_property_config_repository,
)
from app.repositories.project_settings_repository import project_settings_repository


@strawberry.type
class PropertyConfigQuery:
    """GraphQL queries for station and task property configuration schemas."""

    @strawberry.field
    async def station_property_configs(
        self, info: strawberry.types.Info, station_type: str, include_inactive: bool = False,
    ) -> list[StationPropertyConfigType]:
        """List property config entries for a station type (includes universal 'all' configs).

        Only fields enabled for the deployment's current disaster types and not deactivated
        are returned, ordered by sort_order, property_name, then uuid. Changing the disaster
        types in project settings is reflected here immediately — there is no "apply" step,
        which is exactly what splitting definition from activation bought (ADR-091).

        `includeInactive: true` is the management view (ADR-096): it also returns retired
        fields, which every form path hides, and is what makes a deactivated field
        recoverable at all. It needs dynamic_field.edit — seeing what someone retired belongs
        with the right to retire it, not with the right to fill in a form.

        Requires dynamic_field.view permission.
        """
        await check_permission(info, Perm.FIELD_VIEW)
        if include_inactive:
            await check_permission(info, Perm.FIELD_EDIT)
        db = info.context["db"]
        disaster_types = await project_settings_repository.get_current_disaster_types(db)
        items = await station_property_config_repository.list_by_type(
            db, station_type, disaster_types=disaster_types, include_inactive=include_inactive,
        )
        return [StationPropertyConfigType.from_model(c) for c in items]

    @strawberry.field
    async def task_property_configs(
        self, info: strawberry.types.Info, task_type: str, include_inactive: bool = False,
    ) -> list[TaskPropertyConfigType]:
        """List property config entries for a task type.

        Filtered, ordered and permission-checked on the same rules as
        station_property_configs above, `includeInactive` included.

        Requires dynamic_field.view permission.
        """
        await check_permission(info, Perm.FIELD_VIEW)
        if include_inactive:
            await check_permission(info, Perm.FIELD_EDIT)
        db = info.context["db"]
        disaster_types = await project_settings_repository.get_current_disaster_types(db)
        items = await task_property_config_repository.list_by_type(
            db, task_type, disaster_types=disaster_types, include_inactive=include_inactive,
        )
        return [TaskPropertyConfigType.from_model(c) for c in items]
