"""GraphQL mutations for station and task property configuration schemas."""

import strawberry

from app.graphql.config.types import (
    StationPropertyConfigType,
    TaskPropertyConfigType,
    UpsertPropertyConfigInput,
)
from app.graphql.context import check_permission
from app.repositories.config_repository import (
    station_property_config_repository,
    task_property_config_repository,
)


@strawberry.type
class PropertyConfigMutation:
    """Mutations for upserting station and task property configuration schemas."""

    @strawberry.mutation
    async def upsert_station_property_config(
        self, info: strawberry.types.Info, station_type: str, input: UpsertPropertyConfigInput,
    ) -> StationPropertyConfigType:
        """Create or update a station property config entry for a given station type and property name.

        Requires map:edit permission. Returns the upserted StationPropertyConfigType.
        """
        await check_permission(info, "map", "edit")
        cfg = await station_property_config_repository.upsert(
            info.context["db"],
            station_type=station_type,
            property_name=input.property_name,
            data_type=input.data_type,
            enum_options=input.enum_options,
        )
        return StationPropertyConfigType.from_model(cfg)

    @strawberry.mutation
    async def upsert_task_property_config(
        self, info: strawberry.types.Info, task_type: str, input: UpsertPropertyConfigInput,
    ) -> TaskPropertyConfigType:
        """Create or update a task property config entry for a given task type and property name.

        Requires map:edit permission. Returns the upserted TaskPropertyConfigType.
        """
        await check_permission(info, "map", "edit")
        cfg = await task_property_config_repository.upsert(
            info.context["db"],
            task_type=task_type,
            property_name=input.property_name,
            data_type=input.data_type,
            enum_options=input.enum_options,
        )
        return TaskPropertyConfigType.from_model(cfg)
