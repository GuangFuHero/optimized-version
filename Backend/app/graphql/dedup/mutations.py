"""GraphQL mutation for the dedup fast layer: record what the submitter did with a hint."""

import strawberry

from app.graphql.context import require_authenticated
from app.graphql.dedup.types import (
    DedupEntityKind,
    RecordDedupHintOutcomeInput,
    RecordDedupHintOutcomeResult,
)
from app.services import dedup as dedup_service


@strawberry.type
class DedupMutation:
    """Mutations for ticket and station deduplication."""

    @strawberry.mutation
    async def record_dedup_hint_outcome(
        self,
        info: strawberry.types.Info,
        input: RecordDedupHintOutcomeInput,
        entity_kind: DedupEntityKind = DedupEntityKind.ticket,
    ) -> RecordDedupHintOutcomeResult:
        """Record the submitter's response to a duplicate hint. Only the submitter may call it.

        For `entityKind: station`, the `*TicketUuid` input fields carry station uuids.
        """
        pair, event_uuid = await dedup_service.record_hint_outcome(
            info.context["db"],
            actor=require_authenticated(info),
            candidate_ticket_uuid=input.candidate_ticket_uuid,
            outcome=input.outcome.value,
            submitted_ticket_uuid=input.submitted_ticket_uuid,
            entity_kind=entity_kind.value,
        )
        return RecordDedupHintOutcomeResult(
            audit_event_uuid=event_uuid,
            hint_outcome=input.outcome.value,
            pair_uuid=str(pair.uuid) if pair else None,
        )
