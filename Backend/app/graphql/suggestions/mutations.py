"""GraphQL mutations for the station-update suggestion workflow.

Thin per ADR-014: parse input, call the suggestion service function, map the result back
to a GraphQL type. See app/services/suggestion.py.
"""

from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.suggestions.types import (
    CreateStationSuggestionInput,
    StationSuggestionType,
)
from app.services import suggestion as suggestion_service


@strawberry.type
class SuggestionMutation:
    """Mutations for creating and reviewing station-update suggestions."""

    @strawberry.mutation
    async def create_station_suggestion(
        self, info: strawberry.types.Info, input: CreateStationSuggestionInput,
    ) -> StationSuggestionType:
        """Propose a change to one field of a station or station property.

        Open to any logged-in user (gated by station.view, which regular users have —
        unlike station.review). Verifies the target exists and that the field/value are
        valid for the target type. The suggestion starts in 'pending' until an admin reviews it.
        """
        suggestion = await suggestion_service.create_station_suggestion(
            info.context["db"], actor=require_authenticated(info),
            target_type=input.target_type, target_uuid=str(input.target_uuid),
            field_name=input.field_name, new_value=input.new_value, comment=input.comment,
        )
        return StationSuggestionType.from_model(suggestion)

    @strawberry.mutation
    async def review_station_suggestion(
        self, info: strawberry.types.Info, uuid: UUID, approve: bool,
        review_note: str | None = None,
    ) -> StationSuggestionType:
        """Approve (apply the change) or reject a pending suggestion.

        Requires station.review (admins / Field Coordinators), scope-checked against the
        target. On approve, the value is coerced to the field's type and written to the
        target row, then status becomes 'approved'. On reject, status becomes 'rejected'
        and the target is left unchanged. Only pending suggestions can be reviewed.
        """
        suggestion = await suggestion_service.review_station_suggestion(
            info.context["db"], actor=require_authenticated(info),
            uuid=str(uuid), approve=approve, review_note=review_note,
        )
        return StationSuggestionType.from_model(suggestion)
