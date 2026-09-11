"""GraphQL types for the disaster vocabulary and the three property configuration schemas.

`property_name` is the immutable key rows are stored against; `label` is the mutable display
text and is null until someone sets one. `display_label` applies the ADR-095 fallback
(`label or property_name`) server-side so every client renders the same text.
"""

from uuid import UUID

import strawberry

from app.graphql.shared import FieldDataType


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
    data_type: FieldDataType = strawberry.field(
        description="Which control the form renders for this field"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Allowed values for single_select / multi_select, e.g. ['available', 'depleted']"
        ),
    )
    unit: str | None = strawberry.field(
        default=None, description="Unit suffix for a number field, e.g. 'cm'; null otherwise"
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
            property_name=m.property_name, data_type=FieldDataType(m.data_type),
            enum_options=m.enum_options, unit=m.unit,
            disaster_types=list(m.disaster_types or []),
            label=m.label, display_label=m.label or m.property_name,
            sort_order=m.sort_order, is_active=m.is_active,
        )


@strawberry.type
class TaskPropertyConfigType:
    """GraphQL type for a task property config schema (name, data type, enum options)."""

    uuid: UUID
    task_type: str = strawberry.field(description="The task type this config applies to")
    property_name: str = strawberry.field(description="The property key this config defines")
    data_type: FieldDataType = strawberry.field(
        description="Which control the form renders for this field"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None, description="Allowed values for single_select / multi_select"
    )
    unit: str | None = strawberry.field(
        default=None, description="Unit suffix for a number field, e.g. 'cm'; null otherwise"
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
            property_name=m.property_name, data_type=FieldDataType(m.data_type),
            enum_options=m.enum_options, unit=m.unit,
            disaster_types=list(m.disaster_types or []),
            label=m.label, display_label=m.label or m.property_name,
            sort_order=m.sort_order, is_active=m.is_active,
        )


@strawberry.input
class UpsertPropertyConfigInput:
    """Input for creating or updating a property config entry.

    Omitting a field leaves it as it is (or at its column default on insert) — a caller that
    only wants to change `data_type` never resets a field's ordering, and one that only wants
    to set a `label` never blanks an Enum's options (ADR-228). Clearing `enumOptions` is
    therefore spelled `enumOptions: []`, not `null`.

    `dataType` obeys that rule too (ADR-168): retiring a field is `{propertyName, isActive:
    false}`, with no need to restate what the field is. Creating one still requires it — the
    column is NOT NULL — and omitting it there is a client error, not a 500.
    """

    property_name: str = strawberry.field(description="The property key to create or update")
    data_type: FieldDataType | None = strawberry.field(
        default=None,
        description=(
            "Which control the form renders. Required when the field is being created; omit "
            "to leave an existing field's type untouched"
        ),
    )
    enum_options: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Allowed values for single_select / multi_select; omit to leave the stored "
            "options untouched, pass [] to clear them"
        ),
    )
    unit: str | None = strawberry.field(
        default=None, description="Unit suffix for a number field, e.g. 'cm'"
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


@strawberry.type
class TicketPropertyConfigType:
    """GraphQL type for one disaster-specific ticket field definition."""

    uuid: UUID
    property_name: str = strawberry.field(
        description="The immutable field key, e.g. 'water_depth_cm', 'access_blocked'"
    )
    data_type: FieldDataType = strawberry.field(
        description="Which control the form renders for this field"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None, description="Allowed values for single_select / multi_select"
    )
    unit: str | None = strawberry.field(
        default=None, description="Unit suffix for a number field, e.g. 'cm', 'mm'"
    )
    disaster_types: list[str] = strawberry.field(
        default_factory=list,
        description="Disaster type keys this field is enabled for; empty means every type",
    )
    label: str | None = strawberry.field(
        default=None, description="Display text; null when no custom label has been set"
    )
    display_label: str = strawberry.field(
        default="", description="Text to render: the label, falling back to property_name"
    )
    hint: str | None = strawberry.field(
        default=None,
        description=(
            "Guidance shown under the field, including safety limits such as "
            "「不可為了量測進入危險區」. Render it — some of these tell a reporter not to take a risk"
        ),
    )
    is_active: bool = strawberry.field(default=True, description="Whether the field is in use")

    @classmethod
    def from_model(cls, m) -> "TicketPropertyConfigType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, property_name=m.property_name, data_type=FieldDataType(m.data_type),
            enum_options=m.enum_options, unit=m.unit,
            disaster_types=list(m.disaster_types or []),
            label=m.label, display_label=m.label or m.property_name, hint=m.hint,
            is_active=m.is_active,
        )


@strawberry.input
class UpsertTicketPropertyConfigInput:
    """Input for creating or updating a ticket disaster-field definition.

    Its own input rather than a reuse of `UpsertPropertyConfigInput`, because the ticket table
    genuinely has a different shape: no type key (`propertyName` alone is unique), no
    `sortOrder`, and a `hint`. Sharing one input would have meant three fields that are silently
    ignored on one of the three targets.

    Omission semantics are identical to the siblings (ADR-228/168): leaving a field out keeps
    its stored value, so retiring a field is `{propertyName, isActive: false}` and nothing else.
    Clearing the options is `enumOptions: []`, not null.
    """

    property_name: str = strawberry.field(description="The field key to create or update")
    data_type: FieldDataType | None = strawberry.field(
        default=None,
        description=(
            "Which control the form renders. Required when creating; omit to leave an "
            "existing field's type untouched"
        ),
    )
    enum_options: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Allowed values for single_select / multi_select; omit to leave them untouched, "
            "pass [] to clear"
        ),
    )
    unit: str | None = strawberry.field(
        default=None, description="Unit suffix for a number field, e.g. 'cm', 'mm'"
    )
    disaster_types: list[str] | None = strawberry.field(
        default=None,
        description=(
            "Disaster type keys this field applies to; empty list means every type. Each must "
            "be an active key from `disasterTypes` — an unknown one is rejected, not stored"
        ),
    )
    label: str | None = strawberry.field(default=None, description="Display text for the field")
    hint: str | None = strawberry.field(
        default=None, description="Guidance and safety text shown under the field"
    )
    is_active: bool | None = strawberry.field(
        default=None, description="Set false to retire the field without deleting its values"
    )


@strawberry.type
class DisasterTypeType:
    """GraphQL type for one entry in the deployment's disaster vocabulary."""

    uuid: UUID
    key: str = strawberry.field(
        description=(
            "Immutable lower-case English code, e.g. 'flood'. Referenced as a bare string by "
            "tickets and every field config, so it is never renamed — edit `label` instead"
        )
    )
    label: str = strawberry.field(description="Display name, e.g. '水災'")
    is_active: bool = strawberry.field(
        default=True, description="False retires the type: no new writes, existing ones readable"
    )

    @classmethod
    def from_model(cls, m) -> "DisasterTypeType":
        """Build from a SQLAlchemy model instance."""
        return cls(uuid=m.uuid, key=m.key, label=m.label, is_active=m.is_active)


@strawberry.input
class UpsertDisasterTypeInput:
    """Input for adding a disaster type or editing an existing one."""

    key: str = strawberry.field(
        description="The code to create or update; normalized (trimmed, lower-cased)"
    )
    label: str | None = strawberry.field(
        default=None, description="Display name. Required when creating"
    )
    is_active: bool | None = strawberry.field(
        default=None, description="Set false to retire the type; there is no delete"
    )
