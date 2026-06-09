"""GraphQL types for station update suggestions."""

from datetime import datetime
from uuid import UUID

import strawberry


@strawberry.type
class SuggestableFieldType:
    """One field a user may suggest a change to, with the metadata the frontend needs."""

    field_name: str
    data_type: str = strawberry.field(
        description="Input widget hint: 'string', 'integer', or 'enum'"
    )
    enum_options: list[str] | None = strawberry.field(
        default=None, description="Allowed values when data_type is 'enum', else null"
    )


@strawberry.type
class StationSuggestionType:
    """A user's proposed change to one field of a station or station property."""

    uuid: UUID
    target_type: str = strawberry.field(
        description="What the suggestion targets: 'station' or 'station_property'"
    )
    target_uuid: str = strawberry.field(description="UUID of the targeted station/property")
    field_name: str
    new_value: str = strawberry.field(description="Proposed value, stored as text")
    comment: str | None = strawberry.field(
        default=None, description="Why the user suggests this change"
    )
    status: str = strawberry.field(
        default="pending", description="'pending', 'approved', or 'rejected'"
    )
    review_note: str | None = strawberry.field(
        default=None, description="Admin's note recorded when approving/rejecting"
    )
    reviewed_by: str | None = strawberry.field(
        default=None, description="UUID of the admin who decided"
    )
    created_by: str | None = strawberry.field(
        default=None, description="UUID of the user who made the suggestion"
    )
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> "StationSuggestionType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, target_type=m.target_type, target_uuid=m.target_uuid,
            field_name=m.field_name, new_value=m.new_value, comment=m.comment,
            status=m.status, review_note=m.review_note,
            reviewed_by=str(m.reviewed_by) if m.reviewed_by else None,
            created_by=str(m.created_by) if m.created_by else None,
            created_at=m.created_at, updated_at=m.updated_at,
        )


@strawberry.input
class CreateStationSuggestionInput:
    """Input for proposing a change to a station or station-property field."""

    target_type: str = strawberry.field(description="'station' or 'station_property'")
    target_uuid: str = strawberry.field(description="UUID of the station/property to change")
    field_name: str = strawberry.field(description="Which field to change (see suggestableFields)")
    new_value: str = strawberry.field(description="Proposed new value as text")
    comment: str | None = strawberry.field(default=None, description="Why the change is suggested")
