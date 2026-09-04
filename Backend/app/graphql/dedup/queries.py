"""GraphQL query for the dedup fast layer — the pre-submit duplicate check.

Gated on `ticket.add`, not `ticket.view`: the question this answers is "am I about to file a
duplicate?", so the caller is by definition someone who may file one. That also gives the
right anonymous behaviour for free — `ticket.add` is not in PUBLIC_PERMS, so a Guest gets a
403 rather than a probe into what has been reported near an arbitrary coordinate, while
every logged-in role in the seed matrix (user / admin / member / super_admin) holds it at
`all`. Checkpoint 1 only: there is no loaded resource to scope-check against yet.
"""

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
        """Check a ticket that is about to be submitted against nearby, still-open tickets.

        Returns at most one hint — the best-scoring candidate, and only when it clears the
        hint threshold; an empty list means "nothing worth interrupting the submitter for".
        A list rather than a nullable single value so a future top-N is additive.

        Fail-open by design: if the check itself errors, this returns an empty list rather
        than an error, so a broken dedup layer can never stop someone reporting a disaster
        (design §四 — 座標缺失或系統出錯一律 fail-open、照常建單). Geometry is parsed inside
        that safety net, in the service, so a caller who sends a string, a null, or a Point
        with no coordinates gets an empty list rather than a 500. Permission failures are
        raised *before* the safety net and still surface as a 403.

        The time signal is measured against the server's clock. There is deliberately no
        `submittedAt` input: it is the one scoring input a caller could otherwise set freely,
        and "when did this request arrive" is not something the client should get to assert.
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
