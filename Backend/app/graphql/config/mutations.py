"""GraphQL mutations for station and task property configuration schemas.

Thin per ADR-014: parse input, call the config service function, map the result back to a
GraphQL type. See app/services/config.py.
"""

import strawberry

from app.graphql.config.types import (
    StationPropertyConfigType,
    TaskPropertyConfigType,
    UpsertPropertyConfigInput,
)
from app.graphql.context import require_authenticated
from app.services import config as config_service


@strawberry.type
class PropertyConfigMutation:
    """Mutations for upserting station and task property configuration schemas."""

    @strawberry.mutation
    async def upsert_station_property_config(
        self, info: strawberry.types.Info, station_type: str, input: UpsertPropertyConfigInput,
    ) -> StationPropertyConfigType:
        """Create or update a station property config entry for a given station type and property name.

        Requires dynamic_field.edit permission. Returns the upserted StationPropertyConfigType.
        """
        cfg = await config_service.upsert_station_property_config(
            info.context["db"], actor=require_authenticated(info),
            station_type=station_type, property_name=input.property_name,
            data_type=input.data_type, enum_options=input.enum_options,
        )
        return StationPropertyConfigType.from_model(cfg)

    @strawberry.mutation
    async def upsert_task_property_config(
        self, info: strawberry.types.Info, task_type: str, input: UpsertPropertyConfigInput,
    ) -> TaskPropertyConfigType:
        """Create or update a task property config entry for a given task type and property name.

        Requires dynamic_field.edit permission. Returns the upserted TaskPropertyConfigType.
        """
        cfg = await config_service.upsert_task_property_config(
            info.context["db"], actor=require_authenticated(info),
            task_type=task_type, property_name=input.property_name,
            data_type=input.data_type, enum_options=input.enum_options,
        )
        return TaskPropertyConfigType.from_model(cfg)
