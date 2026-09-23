"""GraphQL mutations for the station-update suggestion workflow.

Thin per ADR-014: parse input, call the suggestion service function, map the result back
to a GraphQL type. See app/services/suggestion.py.
"""

from uuid import UUID

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.suggestions.types import (
    CreateStationSuggestionInput,
    StationSuggestionMergeType,
    StationSuggestionType,
    SuggestionDecisionInput,
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

        Requires station.contribute. Resubmitting a field you already have pending updates that
        suggestion. Reviewers who can act on the station are notified.
        """
        suggestion = await suggestion_service.create_station_suggestion(
            info.context["db"], actor=require_authenticated(info),
            target_type=input.target_type, target_uuid=str(input.target_uuid),
            field_name=input.field_name, new_value=input.new_value, comment=input.comment,
        )
        return StationSuggestionType.from_model(suggestion)

    @strawberry.mutation
    async def merge_station_suggestions(
        self, info: strawberry.types.Info, station_uuid: UUID,
        decisions: list[SuggestionDecisionInput], review_note: str | None = None,
    ) -> StationSuggestionMergeType:
        """Decide the pending suggestions on the given fields of one station, in one commit.

        Requires station.review on the station. Approved fields take the given value; every
        pending suggestion on a decided field is marked approved or rejected. Fields left out stay pending.
        """
        merge = await suggestion_service.merge_station_suggestions(
            info.context["db"], actor=require_authenticated(info), station_uuid=str(station_uuid),
            decisions=[
                suggestion_service.SuggestionDecision(
                    target_uuid=str(d.target_uuid), field_name=d.field_name,
                    approve=d.approve, value=d.value,
                )
                for d in decisions
            ],
            review_note=review_note,
        )
        return StationSuggestionMergeType.from_model(merge)

    @strawberry.mutation
    async def revoke_station_suggestion_merge(
        self, info: strawberry.types.Info, uuid: UUID,
    ) -> StationSuggestionMergeType:
        """Undo an applied merge by writing its before values back (requires station.revoke).

        Refused when any merged field has changed since the merge.
        """
        merge = await suggestion_service.revoke_station_suggestion_merge(
            info.context["db"], actor=require_authenticated(info), uuid=str(uuid),
        )
        return StationSuggestionMergeType.from_model(merge)
