"""GraphQL query for the dedup fast layer — the pre-submit duplicate check.

Gated on `ticket.add`, not `ticket.view`: the question this answers is "am I about to file a
duplicate?", so the caller is by definition someone who may file one. This is *not* a privacy
gate — tickets are public (`ticket.view` is in PUBLIC_PERMS, so a Guest can already read them
and the map). The gate exists so that (1) a PostGIS + pg_trgm scoring pass is only spent on
callers who can actually go on to create a ticket, and (2) a Guest is not shown a hint for a
submit they cannot complete anyway. `ticket.add` is not in PUBLIC_PERMS, so a Guest gets a
403 (the frontend fails open on it), while every logged-in role in the seed matrix (user /
admin / member / super_admin) holds it at `all`. Whether `ticket.add` is the right gate is on
the team's to-decide list. Checkpoint 1 only: there is no loaded resource to scope-check
against yet.
"""

import strawberry

from app.core.permissions import Perm
from app.graphql.context import check_permission
from app.graphql.dedup.types import (
    StationDedupCheckInput,
    StationDedupHint,
    TicketDedupCheckInput,
    TicketDedupHint,
)
from app.services import dedup as dedup_service
from app.services.dedup_scoring import STATION_FAST_LAYER_PARAMETERS


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

    @strawberry.field
    async def station_dedup_candidates(
        self, info: strawberry.types.Info, input: StationDedupCheckInput
    ) -> list[StationDedupHint]:
        """Check a station that is about to be registered against nearby, still-open stations.

        Same shape as `ticket_dedup_candidates`, scored with `STATION_FAST_LAYER_PARAMETERS`
        (the ticket weights minus the time signal — see app/services/dedup_scoring.py) against
        stations that are `active` or `temporarily_closed`, not soft-deleted, and — if
        temporary — not past their `expiresAt`. `permanently_closed` stations are never
        candidates.

        Gated on `station.add`, the same permission `createStation` checks, for the same
        reason `ticketDedupCandidates` is gated on `ticket.add`: the question this answers is
        "am I about to register a duplicate station?", so the caller is by definition someone
        who may register one.
        """
        await check_permission(info, Perm.STATION_ADD)
        scores = await dedup_service.find_duplicate_hints(
            info.context["db"],
            geometry=input.geometry,
            title=input.name or "",
            description=input.description,
            task_type=input.type,
            entity_kind="station",
            parameters=STATION_FAST_LAYER_PARAMETERS,
        )
        return [StationDedupHint.from_score(s) for s in scores]
