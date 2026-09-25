"""GraphQL query for the dedup fast layer: the pre-submit duplicate check."""

import strawberry

from app.core.permissions import Perm
from app.graphql.context import check_permission
from app.graphql.dedup.types import TicketDedupCheckInput, TicketDedupHint
from app.services import dedup as dedup_service


@strawberry.type
class DedupQuery:
    """GraphQL queries for ticket deduplication."""

    @strawberry.field
    async def ticket_dedup_candidates(
        self, info: strawberry.types.Info, input: TicketDedupCheckInput
    ) -> list[TicketDedupHint]:
        """Return at most one existing ticket that looks like the one being filed.

        Gated on `ticket.add` (cost, not privacy: tickets are public). Errors return `[]`.
        """
        await check_permission(info, Perm.TICKET_ADD)
        scores = await dedup_service.find_duplicate_hints(
            info.context["db"],
            geometry=input.geometry,
            title=input.title,
            description=input.description,
            task_type=input.task_type,
        )
        return [TicketDedupHint.from_score(s) for s in scores]
