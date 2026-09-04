"""GraphQL mutation for the dedup fast layer — recording what a hint achieved.

Thin per ADR-014: parse input, call the dedup service (which owns authz, validation, and
persistence), map the result back to a GraphQL type. See app/services/dedup.py.
"""

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
        """Record the submitter's response to a duplicate hint.

        Writes `ticket_dedup_audit_events` always, and `ticket_duplicate_pairs.hint_outcome`
        when a second ticket exists to pair with (i.e. the submitter filed anyway). Requires
        ticket.add — the same capability that let them reach the hint.

        Not fail-open, unlike the check itself: the user has already acted, so failing loudly
        costs them nothing and silently dropping the record would corrupt the only measure of
        how many duplicates the fast layer actually prevented.
        """
        pair, event_uuid = await dedup_service.record_hint_outcome(
            info.context["db"], actor=require_authenticated(info),
            candidate_ticket_uuid=input.candidate_ticket_uuid,
            outcome=input.outcome.value,
            submitted_ticket_uuid=input.submitted_ticket_uuid,
        )
        return RecordDedupHintOutcomeResult(
            audit_event_uuid=event_uuid,
            hint_outcome=(
                "ignored_hint"
                if input.outcome.value not in dedup_service.ACCEPTED_HINT_CHOICES
                else "accepted_hint"
            ),
            pair_uuid=str(pair.uuid) if pair else None,
        )
