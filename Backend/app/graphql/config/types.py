"""GraphQL types for station and task property configuration schemas.

`property_name` is the immutable key rows are stored against; `label` is the mutable display
text and is null until someone sets one. `display_label` applies the ADR-095 fallback
(`label or property_name`) server-side so every client renders the same text.
"""

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
    disaster_types: list[str] = strawberry.field(
        default_factory=list,
        description="Disaster types this field is enabled for; empty means every type",
    )
    label: str | None = strawberry.field(
        default=None, description="Display text; null when no custom label has been set"
    )
    display_label: str = strawberry.field(
        default="", description="Text to render: the label, falling back to property_name"
    )
    sort_order: int = strawberry.field(default=0, description="Field order within the form")
    is_active: bool = strawberry.field(default=True, description="Whether the field is in use")

    @classmethod
    def from_model(cls, m) -> "StationPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, station_type=m.station_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options, disaster_types=list(m.disaster_types or []),
            label=m.label, display_label=m.label or m.property_name,
            sort_order=m.sort_order, is_active=m.is_active,
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
    disaster_types: list[str] = strawberry.field(
        default_factory=list,
        description="Disaster types this field is enabled for; empty means every type",
    )
    label: str | None = strawberry.field(
        default=None, description="Display text; null when no custom label has been set"
    )
    display_label: str = strawberry.field(
        default="", description="Text to render: the label, falling back to property_name"
    )
    sort_order: int = strawberry.field(default=0, description="Field order within the form")
    is_active: bool = strawberry.field(default=True, description="Whether the field is in use")

    @classmethod
    def from_model(cls, m) -> "TaskPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, task_type=m.task_type,
            property_name=m.property_name, data_type=m.data_type,
            enum_options=m.enum_options, disaster_types=list(m.disaster_types or []),
            label=m.label, display_label=m.label or m.property_name,
            sort_order=m.sort_order, is_active=m.is_active,
        )


@strawberry.input
class UpsertPropertyConfigInput:
    """Input for creating or updating a property config entry.

    Omitting a field leaves it as it is (or at its column default on insert) — a caller that
    only wants to change `data_type` never resets a field's ordering, and one that only wants
    to set a `label` never blanks an Enum's options (ADR-098). Clearing `enumOptions` is
    therefore spelled `enumOptions: []`, not `null`.
    """

    property_name: str = strawberry.field(description="The property key to create or update")
    data_type: str = strawberry.field(
        description="Expected data type: 'string', 'integer', 'float', or 'enum'"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Allowed enum values when data_type is 'enum'; omit to leave the stored options "
            "untouched, pass [] to clear them"
        ),
    )
    disaster_types: list[str] | None = strawberry.field(
        default=None,
        description="Disaster types this field is enabled for; empty list means every type",
    )
    label: str | None = strawberry.field(default=None, description="Display text for the field")
    sort_order: int | None = strawberry.field(default=None, description="Field order in the form")
    is_active: bool | None = strawberry.field(
        default=None, description="Set false to retire the field without deleting its data"
    )
