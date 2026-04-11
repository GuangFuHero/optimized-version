"""GraphQL types for station and task property configuration schemas."""

from uuid import UUID

import strawberry


@strawberry.type
class StationPropertyConfigType:
    """GraphQL type for a station property config schema (name, data type, enum options)."""

    uuid: UUID
    station_type: str = strawberry.field(
        description="The station type this config applies to, or 'all' for universal properties"
    )
    property_name: str = strawberry.field(
        description="The property key this config defines, e.g. 'water', 'food_ration'"
    )
    data_type: str = strawberry.field(
        description="Expected data type: 'string', 'integer', 'float', or 'enum'"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None,
        description="Allowed values when data_type is 'enum', e.g. ['available', 'depleted']",
    )

    @classmethod
    def from_model(cls, m) -> "StationPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, station_type=m.station_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options,
        )


@strawberry.type
class TaskPropertyConfigType:
    """GraphQL type for a task property config schema (name, data type, enum options)."""

    uuid: UUID
    task_type: str = strawberry.field(description="The task type this config applies to")
    property_name: str = strawberry.field(description="The property key this config defines")
    data_type: str = strawberry.field(
        description="Expected data type: 'string', 'integer', 'float', or 'enum'"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None, description="Allowed values when data_type is 'enum'"
    )

    @classmethod
    def from_model(cls, m) -> "TaskPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_type=m.task_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options,
        )


@strawberry.input
class UpsertPropertyConfigInput:
    """Input for creating or updating a property config entry."""

    property_name: str = strawberry.field(description="The property key to create or update")
    data_type: str = strawberry.field(
        description="Expected data type: 'string', 'integer', 'float', or 'enum'"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None,
        description="Allowed enum values — required when data_type is 'enum', null otherwise",
    )
