"""GraphQL mutations for the station-update suggestion workflow."""

from uuid import UUID

import strawberry

from app.graphql.context import check_permission
from app.graphql.suggestions.fields import VALID_TARGET_TYPES, coerce_and_validate
from app.graphql.suggestions.types import (
    CreateStationSuggestionInput,
    StationSuggestionType,
)
from app.repositories.geo_repository import (
    station_property_repository,
    station_repository,
    station_suggestion_repository,
)

# Maps a suggestion's target_type to the repository that owns that table.
_TARGET_REPOS = {
    "station": station_repository,
    "station_property": station_property_repository,
}


@strawberry.type
class SuggestionMutation:
    """Mutations for creating and reviewing station-update suggestions."""

    @strawberry.mutation
    async def create_station_suggestion(
        self, info: strawberry.types.Info, input: CreateStationSuggestionInput,
    ) -> StationSuggestionType:
        """Propose a change to one field of a station or station property.

        Open to any logged-in user (gated by map:read, which regular users have — unlike
        map:edit). Verifies the target exists and that the field/value are valid for the
        target type. The suggestion starts in 'pending' until an admin reviews it.
        """
        await check_permission(info, "map", "read")
        db = info.context["db"]

        if input.target_type not in VALID_TARGET_TYPES:
            raise ValueError(f"Unknown target_type '{input.target_type}'")
        target = await _TARGET_REPOS[input.target_type].get_by_uuid_active(
            db, str(input.target_uuid)
        )
        if not target:
            raise ValueError(f"{input.target_type} not found")

        # Validates field is suggestable and value matches its data type; raises on mismatch.
        value = coerce_and_validate(input.target_type, input.field_name, input.new_value)

        suggestion = await station_suggestion_repository.create(db, obj_in={
            "target_type": input.target_type,
            "target_uuid": str(input.target_uuid),
            "field_name": input.field_name,
            "new_value": str(value),
            "comment": input.comment,
            "status": "pending",
            "created_by": str(info.context["user"].uuid),
        })
        return StationSuggestionType.from_model(suggestion)

    @strawberry.mutation
    async def review_station_suggestion(
        self, info: strawberry.types.Info, uuid: UUID, approve: bool,
        review_note: str | None = None,
    ) -> StationSuggestionType:
        """Approve (apply the change) or reject a pending suggestion.

        Requires map:edit (admins / Field Coordinators). On approve, the value is coerced
        to the field's type and written to the target row, then status becomes 'approved'.
        On reject, status becomes 'rejected' and the target is left unchanged. Only pending
        suggestions can be reviewed.
        """
        db = info.context["db"]
        suggestion = await station_suggestion_repository.get_by_uuid_active(db, str(uuid))
        if not suggestion:
            raise ValueError("Suggestion not found")
        if suggestion.status != "pending":
            raise ValueError(f"Suggestion already {suggestion.status}")

        repo = _TARGET_REPOS.get(suggestion.target_type)
        target = await repo.get_by_uuid_active(db, suggestion.target_uuid) if repo else None
        if not target:
            raise ValueError("Target no longer exists")
        # str(): UUID columns load as uuid.UUID; check_permission compares with str(user.uuid).
        await check_permission(info, "map", "edit", owner_uuid=str(target.created_by))
        # Capture before applying the change: that commit expires the session's user object,
        # so reading user.uuid afterwards would trigger a sync lazy-load (MissingGreenlet).
        reviewer_uuid = str(info.context["user"].uuid)

        if approve:
            value = coerce_and_validate(
                suggestion.target_type, suggestion.field_name, suggestion.new_value
            )
            await repo.update(db, db_obj=target, obj_in={suggestion.field_name: value})
            # That commit expired the suggestion's attributes; reload before updating it.
            await db.refresh(suggestion)

        suggestion = await station_suggestion_repository.update(db, db_obj=suggestion, obj_in={
            "status": "approved" if approve else "rejected",
            "reviewed_by": reviewer_uuid,
            "review_note": review_note,
        })
        return StationSuggestionType.from_model(suggestion)
