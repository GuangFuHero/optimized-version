"""GraphQL mutation for the dedup fast layer: record what the submitter did with a hint."""

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.dedup.types import RecordDedupHintOutcomeInput, RecordDedupHintOutcomeResult
from app.services import dedup as dedup_service


@strawberry.type
class DedupMutation:
    """Mutations for ticket deduplication."""

    @strawberry.mutation
    async def record_dedup_hint_outcome(
        self, info: strawberry.types.Info, input: RecordDedupHintOutcomeInput
    ) -> RecordDedupHintOutcomeResult:
        """Record the submitter's response to a duplicate hint. Only the submitter may call it."""
        pair, event_uuid = await dedup_service.record_hint_outcome(
            info.context["db"],
            actor=require_authenticated(info),
            candidate_ticket_uuid=input.candidate_ticket_uuid,
            outcome=input.outcome.value,
            submitted_ticket_uuid=input.submitted_ticket_uuid,
        )
        return RecordDedupHintOutcomeResult(
            audit_event_uuid=event_uuid,
            hint_outcome=input.outcome.value,
            pair_uuid=str(pair.uuid) if pair else None,
        )
