"""GraphQL mutations for station and task property configuration schemas.

Thin per ADR-014: parse input, call the config service function, map the result back to a
GraphQL type. See app/services/config.py.
"""

import strawberry

from app.graphql.config.types import (
    DisasterTypeType,
    StationPropertyConfigType,
    TaskPropertyConfigType,
    TicketPropertyConfigType,
    UpsertDisasterTypeInput,
    UpsertPropertyConfigInput,
    UpsertTicketPropertyConfigInput,
)
from app.graphql.context import require_authenticated
from app.services import config as config_service
from app.services import project_settings as project_settings_service


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
            data_type=input.data_type.value if input.data_type else None,
            enum_options=input.enum_options, unit=input.unit,
            disaster_types=input.disaster_types, label=input.label,
            sort_order=input.sort_order, is_active=input.is_active,
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
            data_type=input.data_type.value if input.data_type else None,
            enum_options=input.enum_options, unit=input.unit,
            disaster_types=input.disaster_types, label=input.label,
            sort_order=input.sort_order, is_active=input.is_active,
        )
        return TaskPropertyConfigType.from_model(cfg)

    @strawberry.mutation
    async def upsert_ticket_property_config(
        self, info: strawberry.types.Info, input: UpsertTicketPropertyConfigInput,
    ) -> TicketPropertyConfigType:
        """Add a disaster-specific ticket field, or edit an existing one.

        No type argument, unlike the station and task mutations: `propertyName` alone is the
        key, and `disasterTypes` is what decides where the field appears. That is what lets
        one `access_blocked` definition serve both 水災 and 土石流 without the two being able
        to drift apart.

        Requires dynamic_field.edit. Returns the upserted TicketPropertyConfigType.
        """
        cfg = await config_service.upsert_ticket_property_config(
            info.context["db"], actor=require_authenticated(info),
            property_name=input.property_name,
            data_type=input.data_type.value if input.data_type else None,
            enum_options=input.enum_options, unit=input.unit,
            disaster_types=input.disaster_types, label=input.label, hint=input.hint,
            is_active=input.is_active,
        )
        return TicketPropertyConfigType.from_model(cfg)

    @strawberry.mutation
    async def upsert_disaster_type(
        self, info: strawberry.types.Info, input: UpsertDisasterTypeInput,
    ) -> DisasterTypeType:
        """Add a disaster type to the deployment's vocabulary, or edit one.

        The vocabulary is a table rather than an enum precisely so this mutation can exist: a
        disaster nobody planned for costs an operator one call, not a deploy.

        There is no delete and no rename. Tickets reference `key` as a bare string with no
        foreign key, so both would orphan them — retire with `isActive: false`, rename by
        editing `label`.

        Requires project.edit. Returns the upserted DisasterTypeType.
        """
        disaster_type = await project_settings_service.upsert_disaster_type(
            info.context["db"], actor=require_authenticated(info),
            key=input.key, label=input.label, is_active=input.is_active,
        )
        return DisasterTypeType.from_model(disaster_type)
