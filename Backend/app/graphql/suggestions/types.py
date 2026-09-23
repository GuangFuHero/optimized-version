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
    target_uuid: UUID = strawberry.field(description="UUID of the station/property to change")
    field_name: str = strawberry.field(description="Which field to change (see suggestableFields)")
    new_value: str = strawberry.field(description="Proposed new value as text")
    comment: str | None = strawberry.field(default=None, description="Why the change is suggested")


@strawberry.input
class SuggestionDecisionInput:
    """A reviewer's decision on one suggested field: apply `value`, or reject every suggestion on it."""

    target_uuid: UUID = strawberry.field(description="The station, or one of its properties")
    field_name: str
    approve: bool
    value: str | None = strawberry.field(
        default=None, description="Value to write, possibly edited by the reviewer; required to approve"
    )


@strawberry.type
class SuggestionChangeType:
    """One field a merge applied, with its value before and after (as text)."""

    target_type: str
    target_uuid: str
    field_name: str
    before: str | None
    after: str | None


@strawberry.type
class StationSuggestionMergeType:
    """One reviewer decision that applied suggested values to a station, and whether it was revoked."""

    uuid: UUID
    station_uuid: str
    changes: list[SuggestionChangeType]
    status: str = strawberry.field(description="'applied' or 'revoked'")
    review_note: str | None
    reviewed_by: str
    revoked_by: str | None
    revoked_at: datetime | None
    created_at: datetime | None

    @classmethod
    def from_model(cls, m) -> "StationSuggestionMergeType":
        """Build from a SQLAlchemy model instance."""
        return cls(
            uuid=m.uuid, station_uuid=str(m.station_uuid),
            changes=[
                SuggestionChangeType(
                    target_type=c["target_type"], target_uuid=c["target_uuid"],
                    field_name=c["field_name"],
                    before=None if c["before"] is None else str(c["before"]),
                    after=None if c["after"] is None else str(c["after"]),
                )
                for c in m.changes
            ],
            status=m.status, review_note=m.review_note,
            reviewed_by=str(m.reviewed_by),
            revoked_by=str(m.revoked_by) if m.revoked_by else None,
            revoked_at=m.revoked_at, created_at=m.created_at,
        )


@strawberry.type
class SuggestedFieldType:
    """Every pending suggestion on one field, pooled without saying who made which."""

    target_type: str
    target_uuid: str
    field_name: str
    proposed_values: list[str] = strawberry.field(description="Distinct proposed values, newest first")
    suggestion_count: int
    comments: list[str]
    first_suggested_at: datetime | None
