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


@strawberry.type
class PropertyConfigQuery:
    """GraphQL queries for station and task property configuration schemas."""

    @strawberry.field
    async def station_property_configs(
        self, info: strawberry.types.Info, station_type: str
    ) -> list[StationPropertyConfigType]:
        """List property config entries for a station type (includes universal 'all' configs).

        Requires dynamic_field.view permission.
        """
        await check_permission(info, Perm.FIELD_VIEW)
        items = await station_property_config_repository.list_by_type(
            info.context["db"], station_type
        )
        return [StationPropertyConfigType.from_model(c) for c in items]

    @strawberry.field
    async def task_property_configs(
        self, info: strawberry.types.Info, task_type: str
    ) -> list[TaskPropertyConfigType]:
        """List property config entries for a task type.

        Requires dynamic_field.view permission.
        """
        await check_permission(info, Perm.FIELD_VIEW)
        items = await task_property_config_repository.list_by_type(
            info.context["db"], task_type
        )
        return [TaskPropertyConfigType.from_model(c) for c in items]
