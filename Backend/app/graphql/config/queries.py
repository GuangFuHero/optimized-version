"""GraphQL queries for station and task property configuration schemas."""

import strawberry

from app.graphql.config.types import StationPropertyConfigType, TaskPropertyConfigType
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
        """List property config entries for a station type (includes universal 'all' configs)."""
        items = await station_property_config_repository.list_by_type(
            info.context["db"], station_type
        )
        return [StationPropertyConfigType.from_model(c) for c in items]

    @strawberry.field
    async def task_property_configs(
        self, info: strawberry.types.Info, task_type: str
    ) -> list[TaskPropertyConfigType]:
        """List property config entries for a task type."""
        items = await task_property_config_repository.list_by_type(
            info.context["db"], task_type
        )
        return [TaskPropertyConfigType.from_model(c) for c in items]
