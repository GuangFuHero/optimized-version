"""GraphQL queries for tickets and ticket tasks.

Read-checked per ADR-027/028: ticket.view is public (Guest gets Scope.ALL), authenticated
callers get whatever scope their role grants, applied as a list-level filter (scope_filter)
for the tickets list and an object-level check (in_scope) for ticket detail. ticket_tasks/
task_properties are sub-resources of an already-gated ticket and only need checkpoint 1
(Spec/008-rbac-authorization/decisions.md §7) — see app/graphql/tickets/types.py for PII field redaction.
"""

from uuid import UUID

import strawberry

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope, scope_filter
from app.core.search import normalize_query, search_timeout
from app.graphql.context import check_permission
from app.graphql.geo.types import BoundsInput
from app.graphql.shared import PageInfo
from app.graphql.tickets.types import (
    TaskPropertyType,
    TicketConnection,
    TicketTaskType,
    TicketType,
)
from app.models.request import Tickets
from app.repositories.tickets_repository import (
    task_property_repository,
    ticket_repository,
    ticket_task_repository,
)


@strawberry.type
class RequestQuery:
    """GraphQL queries for support tickets."""

    @strawberry.field
    async def tickets(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> TicketConnection:
        """List tickets with optional bbox, status, priority and keyword filters, paginated.

        Requires ticket.view permission (public — Guest may call this). Note: the
        help-request board is public (ADR-027), so the seed grants ticket.view at `all`
        to *every* role including plain citizens — `scope_filter` therefore does not
        narrow anyone's list today; it's the pre-wired hook for a future role granted
        less than `all`. The genuinely per-scope thing is PII (own/zone/all), gated
        separately in tickets/types.py (contact_* resolvers). (gov/ngo scope was removed
        in ADR-049.)

        `q` is a keyword filter over the ticket's title and description, and — via EXISTS
        — its tasks and those tasks' properties (ADR-077/079/080).

        Two things are deliberately NOT searchable. contact_name / contact_email /
        contact_phone, because those fields are masked per-field above and letting them
        feed the search index would make that masking meaningless — anyone could locate a
        ticket by typing its reporter's phone number. And the ticket's address
        (secondary_locations), for the same reason at one remove: the caller here may be
        an anonymous Guest, TicketType returns no address field, so a match would confirm
        a street address the API never shows (ADR-146). A *station's* address is
        searchable — same table, but there it is a shelter's public location.

        2–50 characters; outside that range raises.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.TICKET_VIEW)
        extra_filters = scope_filter(scope, actor=info.context["user"], model=Tickets)
        # One ceiling for the whole request, not one per statement (ADR-162). count and
        # list are two halves of the same search, and search_timeout() is nesting-aware
        # (ADR-157): the windows the repositories open inside see depth > 0 and skip their
        # own set_config/RESET, so this costs two round-trips where it used to cost six.
        async with search_timeout(db, normalize_query(q)):
            total = await ticket_repository.count_active(
                db, bounds=bounds, status=status, priority=priority, q=q,
                extra_filters=extra_filters,
            )
            items = await ticket_repository.list_active(
                db, bounds=bounds, status=status, priority=priority, q=q, skip=skip, limit=limit,
                extra_filters=extra_filters,
            )
        return TicketConnection(
            items=[TicketType.from_model(m) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def ticket(self, info: strawberry.types.Info, uuid: UUID) -> TicketType | None:
        """Fetch a single active ticket by UUID.

        Returns None if not found, soft-deleted, or outside the caller's scope (a scope
        mismatch is indistinguishable from "not found" — no separate error). Contact
        fields are separately redacted per-field regardless of this check — see
        TicketType.contact_name/contact_email/contact_phone.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.TICKET_VIEW)
        m = await ticket_repository.get_by_uuid_active(db, uuid)
        if not m:
            return None
        if scope != Scope.ALL:
            user = info.context["user"]
            if user is None or not await in_scope(scope, actor=user, resource=m, db=db):
                return None
        return TicketType.from_model(m)


@strawberry.type
class TicketTaskQuery:
    """GraphQL queries for ticket tasks and their properties."""

    @strawberry.field
    async def ticket_tasks(
        self, info: strawberry.types.Info,
        ticket_uuid: str,
        status: str | None = None,
        q: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> list[TicketTaskType]:
        """List tasks for a given ticket UUID, with optional status/keyword filters.

        Requires ticket.view permission (public — Guest may call this). Checkpoint 1
        only: TicketTask carries no team_uuid of its own to scope-filter a list by, and
        the caller already had to know the parent ticket_uuid to ask.

        `q` narrows to tasks matching on their own name/description or on any of their
        properties (ADR-079/080). 2–50 characters; outside that range raises.
        """
        await check_permission(info, Perm.TICKET_VIEW)
        items = await ticket_task_repository.list_by_ticket(
            info.context["db"], ticket_uuid, status=status, q=q, skip=skip, limit=limit
        )
        return [TicketTaskType.from_model(t) for t in items]

    @strawberry.field
    async def task_properties(
        self, info: strawberry.types.Info, task_uuid: str
    ) -> list[TaskPropertyType]:
        """List all active properties for a given task UUID.

        Requires ticket.view permission (public — Guest may call this). Checkpoint 1 only.
        """
        await check_permission(info, Perm.TICKET_VIEW)
        items = await task_property_repository.list_by_task(info.context["db"], task_uuid)
        return [TaskPropertyType.from_model(p) for p in items]
