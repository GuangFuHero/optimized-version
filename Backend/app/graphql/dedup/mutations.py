"""GraphQL mutation for the dedup fast layer — recording what a hint achieved.

Thin per ADR-014: parse input, call the dedup service (which owns authz, validation, and
persistence), map the result back to a GraphQL type. See app/services/dedup.py.
"""

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
        """Record the submitter's response to a duplicate hint.

        Writes `dedup_audit_events` always, and `duplicate_pairs.hint_outcome` when a second
        entity exists to pair with (i.e. the submitter filed/registered anyway). Requires
        `ticket.add` (default) or `station.add` when `entityKind: station` — the same
        capability that let the caller reach the hint in the first place.

        `entityKind` defaults to `ticket` so existing callers are unaffected; `input`'s
        `candidateTicketUuid`/`submittedTicketUuid` fields carry either a ticket or a station
        uuid depending on `entityKind` — their names stay as-is rather than being renamed
        per entity kind.

        Not fail-open, unlike the check itself: the user has already acted, so failing loudly
        costs them nothing and silently dropping the record would corrupt the only measure of
        how many duplicates the fast layer actually prevented.
        """
        pair, event_uuid = await dedup_service.record_hint_outcome(
            info.context["db"], actor=require_authenticated(info),
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
