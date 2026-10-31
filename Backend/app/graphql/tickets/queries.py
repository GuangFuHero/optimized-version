"""GraphQL queries for tickets and ticket tasks.

Read-checked per ADR-027/028: ticket.view is public (Guest gets Scope.ALL), authenticated
callers get whatever scope their role grants, applied as a list-level filter (scope_filter)
for the tickets list and an object-level check (in_scope) for ticket detail. ticket_tasks/
task_properties are sub-resources of an already-gated ticket and only need checkpoint 1
(Spec/008-rbac-authorization/decisions.md §7) — see app/graphql/tickets/types.py for PII field redaction.
"""

from typing import Annotated
from uuid import UUID

import strawberry
from sqlalchemy import select
from sqlalchemy.orm import aliased

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, in_scope, scope_filter
from app.core.search import normalize_query, search_timeout, statement_ceiling
from app.core.security import resolve_scope
from app.db.h3 import COARSE_MAX_H3_RESOLUTION, cell_resolution, coarse_resolution, h3_is_valid_cell
from app.db.plans import generic_plan
from app.graphql.context import check_permission, require_authenticated
from app.graphql.geo.types import BoundsInput
from app.graphql.shared import PageInfo
from app.graphql.tickets.types import (
    AuditStatus,
    MyTaskAssignmentType,
    TaskAssignmentType,
    TaskPropertyType,
    TicketAvailability,
    TicketAvailabilityType,
    TicketCellType,
    TicketConnection,
    TicketListOrder,
    TicketStatus,
    TicketTaskType,
    TicketType,
    ticket_detail_visible,
)
from app.models.geo import BaseGeometry, BuildingMapTicketMap
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.repositories.tickets_repository import (
    task_property_repository,
    ticket_repository,
    ticket_task_repository,
)
from app.services import ticket as ticket_service
from app.services.ticket_status import OPEN_NEED_STATUSES

_ZOOM_DESCRIPTION = (
    "Map zoom the result is for. Only affects a caller without ticket.view_detail: sets how "
    "coarse the H3 cell standing in for each point is — coarser as the map zooms out, never "
    "finer than resolution 8 whatever is sent"
)
_STATUSES_DESCRIPTION = (
    "Only tickets in one of these statuses, as the map's filter ticks several; a status given more "
    "than once counts once. Leave it out to match every status, as the site does when its filter means "
    "all of them: an empty list matches none"
)

# The most rows one `tickets` page may ask for: the site's map asks for 200 at a time
# (use-site-map-live-data.ts). Without a ceiling one request could fetch every ticket at once.
TICKET_LIST_MAX_LIMIT = 200


async def _detail_filters(info: strawberry.types.Info) -> list:
    """`scope_filter` of the caller's ticket.view_detail — [] for all rows, [false()] for none.

    The anonymous caller holds no grant at all, and `scope_filter(NONE)` is exactly "no row",
    so it goes through the same path rather than a special case.
    """
    user = info.context["user"]
    scope = (
        Scope.NONE
        if user is None
        else await resolve_scope(
            user, Perm.TICKET_VIEW_DETAIL, info.context["db"], cache=info.context["_rbac_cache"]
        )
    )
    return scope_filter(scope, actor=user, model=Tickets)


def _status_values(statuses: list[TicketStatus] | None) -> list[str] | None:
    """`statuses` as values, each once and in one order.

    Every length of the list is its own SQL statement, planned afresh on each connection, and each
    entry is one driver parameter; repeats would add both without changing a single row.
    """
    return None if statuses is None else sorted({s.value for s in statuses})


async def _in_view_scope(info: strawberry.types.Info, scope: Scope, uuid) -> bool:
    """Whether ticket `uuid` is in the caller's ticket.view `scope`, deleted or not, as `ticket` checks it."""
    if scope == Scope.ALL:
        return True
    # ticket.view is public (ADR-273), so no caller gets here today.
    user, db = info.context["user"], info.context["db"]
    m = await ticket_repository.get_by_uuid(db, uuid)
    return user is not None and await in_scope(scope, actor=user, resource=m, db=db)


def _list_filters(need_type: str | None, open_needs_only: bool, audit_status: AuditStatus | None) -> list:
    """The need-type and audit-status filters of the `tickets` list, as conditions on Tickets.

    A need taken off never matches. Both read only what the list shows anyone: each need's type,
    and the public audit status.
    """
    conditions = []
    if need_type is not None:
        need = select(TicketTask.uuid).where(
            TicketTask.ticket_uuid == Tickets.uuid,
            TicketTask.delete_at.is_(None),
            TicketTask.task_type == need_type,
        )
        if open_needs_only:
            need = need.where(TicketTask.status.in_(OPEN_NEED_STATUSES))
        conditions.append(need.exists())
    if audit_status is not None:
        conditions.append(Tickets.audit_status == audit_status.value)
    return conditions


@strawberry.type
class RequestQuery:
    """GraphQL queries for support tickets."""

    @strawberry.field
    async def tickets(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
        zoom: Annotated[float | None, strawberry.argument(description=_ZOOM_DESCRIPTION)] = None,
        need_type: Annotated[
            str | None,
            strawberry.argument(
                description=(
                    "Only tickets with a need of this type, e.g. 'rescue' or 'supply'. A string, "
                    "not an enum: the back office can configure kinds of its own"
                )
            ),
        ] = None,
        open_needs_only: Annotated[
            bool,
            strawberry.argument(
                description="With needType: only a need still taking volunteers counts. Ignored without it"
            ),
        ] = False,
        audit_status: Annotated[
            AuditStatus | None, strawberry.argument(description="Only tickets at this audit status")
        ] = None,
        order: Annotated[
            TicketListOrder,
            strawberry.argument(
                description=(
                    "NEWEST (default): newest first, best match first when searching. NEEDS_FIRST: "
                    "tickets still taking people first, one with an open rescue need ahead, then as "
                    "NEWEST; a need the signed-in caller claimed counts as open"
                )
            ),
        ] = TicketListOrder.NEWEST,
        location_cell: Annotated[
            str | None,
            strawberry.argument(
                description=(
                    "Only the tickets this caller is shown as this H3 cell — a `locationCell` value, as "
                    "the guest map draws it. The cell's resolution, 8 or coarser, then sets how coarse "
                    "every row is, in place of `zoom`. A ticket the caller sees exactly is in no cell"
                )
            ),
        ] = None,
        statuses: Annotated[
            list[TicketStatus] | None, strawberry.argument(description=_STATUSES_DESCRIPTION)
        ] = None,
    ) -> TicketConnection:
        """List tickets with optional bbox, status, priority, need-type, audit and keyword filters, paginated.

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
        an anonymous Guest, who gets no address (TicketType.secondary_location is behind
        ticket.view_detail, ADR-281), so a match would confirm a street address the API
        does not show them (ADR-146). A *station's* address is searchable — same table,
        but there it is a shelter's public location.

        2–50 characters; outside that range raises.

        Without ticket.view_detail, `bounds` matches a row by the cell centre the caller is
        shown and `q` by its title and task names only (ADR-281/282) — each row on what
        this caller can read of it, so neither filter recovers what the fields withhold.

        At most TICKET_LIST_MAX_LIMIT rows a page. A row reads whom to call as `ticket` does —
        to the requester, the coordinators and whoever claimed one of its needs (ADR-286 point 1)
        — and its triage answers take ticket.view_history besides ticket.view_pii (point 6).

        `order` NEEDS_FIRST is the site list's (ADR-419). It reads only what the list already shows
        anyone — each ticket's status, each need's type and status — and the caller's own claims.

        `locationCell` lists the tickets a `ticketCells` row counts (ADR-387). A cell finer than
        COARSE_MAX_H3_RESOLUTION is refused: matching on one would place a point the cell is
        there to withhold. So is one naming no real cell, which h3-pg would raise on. A valid one
        is rewritten as h3-pg prints it, so a zero-padded or upper-case spelling still matches.
        `statuses` filters as it does on `ticketCells`, so a cell's list matches its count.
        """
        if limit > TICKET_LIST_MAX_LIMIT:
            raise ValueError(f"limit must be at most {TICKET_LIST_MAX_LIMIT}")
        if limit < 0 or skip < 0:
            raise ValueError("limit and skip must not be negative")
        db = info.context["db"]
        user = info.context["user"]
        resolution = coarse_resolution(zoom)
        if location_cell is not None:
            resolution = cell_resolution(location_cell)
            if resolution is not None:
                location_cell = f"{int(location_cell, 16):x}"
            if (
                resolution is None
                or resolution > COARSE_MAX_H3_RESOLUTION
                or not await db.scalar(select(h3_is_valid_cell(location_cell)))
            ):
                raise ValueError(
                    f"locationCell must be an H3 cell of resolution {COARSE_MAX_H3_RESOLUTION} or coarser"
                )
        scope = await check_permission(info, Perm.TICKET_VIEW)
        extra_filters = [
            *scope_filter(scope, actor=info.context["user"], model=Tickets),
            *_list_filters(need_type, open_needs_only, audit_status),
        ]
        detail_filters = await _detail_filters(info)
        status_values = _status_values(statuses)
        # One ceiling for the whole request, not one per statement (ADR-176). count and
        # list are two halves of the same search, and search_timeout() is nesting-aware
        # (ADR-157): the windows the repositories open inside see depth > 0 and skip their
        # own set_config/RESET, so this costs two round-trips where it used to cost six.
        # A box the caller sees cells in tests cell centres, as `ticketCells` does, so it is planned
        # generically from a connection's first run too (ADR-437).
        cells_in_box = bounds is not None and bool(detail_filters)
        async with generic_plan(db, needed=cells_in_box), search_timeout(db, normalize_query(q)):
            total = await ticket_repository.count_active(
                db,
                bounds=bounds,
                status=status,
                statuses=status_values,
                priority=priority,
                q=q,
                extra_filters=extra_filters,
                detail_filters=detail_filters,
                coarse_resolution=resolution,
                location_cell=location_cell,
            )
            items = await ticket_repository.list_active(
                db,
                bounds=bounds,
                status=status,
                statuses=status_values,
                priority=priority,
                q=q,
                skip=skip,
                limit=limit,
                extra_filters=extra_filters,
                detail_filters=detail_filters,
                coarse_resolution=resolution,
                location_cell=location_cell,
                order=order.value,
                viewer_uuid=None if user is None else str(user.uuid),
            )
        return TicketConnection(
            items=[TicketType.from_model(m, coarse_resolution=resolution, listed=True) for m in items],
            page_info=PageInfo(
                total_count=total,
                has_next_page=(skip + limit) < total,
                has_previous_page=skip > 0,
            ),
        )

    @strawberry.field
    async def ticket_cells(
        self,
        info: strawberry.types.Info,
        bounds: BoundsInput,
        zoom: Annotated[float | None, strawberry.argument(description=_ZOOM_DESCRIPTION)] = None,
        statuses: Annotated[
            list[TicketStatus] | None, strawberry.argument(description=_STATUSES_DESCRIPTION)
        ] = None,
    ) -> list[TicketCellType]:
        """Ticket counts per H3 cell, for the tickets this caller is shown as a cell (ADR-387).

        The guest map draws such tickets as their cells with a count in each, and a page of
        `tickets` holds only so many; this counts them all in Postgres instead. Each row is matched
        as `tickets(bounds:, zoom:)` matches it — by the cell centre, at the resolution `zoom` gives
        (ADR-282) — so it says nothing a page of `tickets` does not. A ticket the caller sees exactly
        is a pin, not a cell, so a caller holding ticket.view_detail on every ticket gets none.

        Anonymous and called on every pan, so the count runs under keyword search's statement
        ceiling: past it the caller is asked to zoom in rather than holding a connection. It is
        planned generically from a connection's first run, which is what keeps a fresh connection
        under that ceiling (ADR-437).
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.TICKET_VIEW)
        detail_filters = await _detail_filters(info)
        refusal = "這個範圍的單太多，計算逾時已中止，請放大地圖再試"
        async with generic_plan(db, needed=bool(detail_filters)), statement_ceiling(db, refusal=refusal):
            rows = await ticket_repository.count_by_cell(
                db,
                bounds=bounds,
                statuses=_status_values(statuses),
                extra_filters=scope_filter(scope, actor=info.context["user"], model=Tickets),
                detail_filters=detail_filters,
                coarse_resolution=coarse_resolution(zoom),
            )
        return [
            TicketCellType(cell=cell, ticket_count=count, urgent_count=urgent) for cell, count, urgent in rows
        ]

    @strawberry.field(
        description=(
            "Whether ticket(uuid) gives this ticket, and if not, whether it was merged into another, "
            "deleted, or never was, so a share link can say which and send a merged one on. Ask it "
            "beside ticket(uuid). The state and the kept ticket's uuid alone, nothing of the ticket "
            "(ADR-444)"
        )
    )
    async def ticket_availability(self, info: strawberry.types.Info, uuid: UUID) -> TicketAvailabilityType:
        """`available` exactly when `ticket` returns it; else read from `delete_at` and `replaced_by_uuid`.

        Scope comes before deletion, so a ticket out of it reads `not_found` whether deleted or not.
        A merged ticket follows `replaced_by_uuid` on to the first one still there; each was live when
        a merge pointed at it and a deleted ticket never comes back, so the trail cannot loop.
        """
        db = info.context["db"]
        scope = await check_permission(info, Perm.TICKET_VIEW)
        gone = await ticket_repository.deletion(db, uuid)
        if gone is None or not await _in_view_scope(info, scope, uuid):
            return TicketAvailabilityType(status=TicketAvailability.not_found)
        if not gone.deleted:
            return TicketAvailabilityType(status=TicketAvailability.available)
        kept = gone.replaced_by_uuid
        while kept is not None and await _in_view_scope(info, scope, kept):
            gone = await ticket_repository.deletion(db, kept)
            if not gone.deleted:
                return TicketAvailabilityType(status=TicketAvailability.merged, replaced_by_uuid=kept)
            kept = gone.replaced_by_uuid
        return TicketAvailabilityType(status=TicketAvailability.deleted)

    @strawberry.field
    async def ticket(
        self,
        info: strawberry.types.Info,
        uuid: UUID,
        zoom: Annotated[float | None, strawberry.argument(description=_ZOOM_DESCRIPTION)] = None,
    ) -> TicketType | None:
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
        return TicketType.from_model(m, coarse_resolution=coarse_resolution(zoom))

    @strawberry.field
    async def my_tickets(self, info: strawberry.types.Info) -> list[TicketType]:
        """The tickets the caller filed, newest first — 「我的任務 › 我建立的」.

        Sign-in only, no capability: every row is the caller's own ticket. Every status is
        listed; deleted tickets drop off. Each ticket's `tasks` carry the quantity, status and
        headcount its progress is counted from, and its fields follow the same per-field rules
        as anywhere else.
        """
        tickets = await ticket_service.list_my_tickets(info.context["db"], actor=require_authenticated(info))
        return [TicketType.from_model(ticket) for ticket in tickets]

    @strawberry.field
    async def building_map_tickets(
        self,
        info: strawberry.types.Info,
        building_map_uuid: UUID,
        skip: int = 0,
        limit: int = 100,
    ) -> list[TicketType]:
        """List the tickets filed under a building map, newest first.

        Only rows whose detail the caller may see are returned, because naming a ticket's
        building reveals its exact location; an anonymous caller gets an empty list.

        At most TICKET_LIST_MAX_LIMIT rows a page, as `tickets`. A deleted building lists none: its
        tickets stay, untied from it, as their `buildingMapUuid` says.
        """
        if limit > TICKET_LIST_MAX_LIMIT:
            raise ValueError(f"limit must be at most {TICKET_LIST_MAX_LIMIT}")
        if limit < 0 or skip < 0:
            raise ValueError("limit and skip must not be negative")
        scope = await check_permission(info, Perm.TICKET_VIEW)
        # Aliased: a ticket's own row in base_geometries is already in the FROM clause.
        building = aliased(BaseGeometry)
        query = (
            select(Tickets)
            .join(BuildingMapTicketMap, BuildingMapTicketMap.ticket_uuid == Tickets.uuid)
            .join(building, building.uuid == BuildingMapTicketMap.building_map_uuid)
            .where(
                BuildingMapTicketMap.building_map_uuid == building_map_uuid,
                building.delete_at.is_(None),
                Tickets.delete_at.is_(None),
                *scope_filter(scope, actor=info.context["user"], model=Tickets),
                *await _detail_filters(info),
            )
            .order_by(Tickets.created_at.desc(), Tickets.uuid.desc())
            .offset(skip)
            .limit(limit)
        )
        return [TicketType.from_model(m) for m in await info.context["db"].scalars(query)]


@strawberry.type
class TicketTaskQuery:
    """GraphQL queries for ticket tasks and their properties."""

    @strawberry.field
    async def ticket_tasks(
        self,
        info: strawberry.types.Info,
        ticket_uuid: str,
        status: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[TicketTaskType]:
        """List tasks for a given ticket UUID, with optional status/keyword filters.

        Requires ticket.view permission (public — Guest may call this). Checkpoint 1
        only: TicketTask carries no team_uuid of its own to scope-filter a list by, and
        the caller already had to know the parent ticket_uuid to ask.

        `q` narrows to tasks matching on their own name/description or on any of their
        properties (ADR-079/080). 2–50 characters; outside that range raises. The
        description only counts when the caller may read it (ADR-281) — the parent
        ticket's detail decides, the same one that decides the task fields.

        A deleted ticket lists no needs, whatever their own rows say: deleteTicket takes a
        ticket's needs with it now, but tickets deleted before it did left theirs live.
        """
        await check_permission(info, Perm.TICKET_VIEW)
        if not await ticket_repository.get_by_uuid_active(info.context["db"], ticket_uuid):
            return []
        public_only = normalize_query(q) is not None and not await ticket_detail_visible(info, ticket_uuid)
        items = await ticket_task_repository.list_by_ticket(
            info.context["db"],
            ticket_uuid,
            status=status,
            q=q,
            skip=skip,
            limit=limit,
            public_only=public_only,
        )
        return [TicketTaskType.from_model(t) for t in items]

    @strawberry.field
    async def my_task_assignments(self, info: strawberry.types.Info) -> list[MyTaskAssignmentType]:
        """The needs the caller claimed, newest first — 「我的任務 › 我承接的」.

        Sign-in only, no capability: every row is the caller's own claim. Canceled and
        fulfilled needs stay listed; deleted ones drop off. Each ticket follows the same
        per-field rules as anywhere else, by which the claim is what lets the volunteer read
        whom to call (ADR-286 point 1).
        """
        rows = await ticket_service.list_my_claims(info.context["db"], actor=require_authenticated(info))
        return [
            MyTaskAssignmentType(
                assignment=TaskAssignmentType.from_model(assignment),
                task=TicketTaskType.from_model(task),
                ticket=TicketType.from_model(ticket),
            )
            for assignment, task, ticket in rows
        ]

    @strawberry.field
    async def task_properties(self, info: strawberry.types.Info, task_uuid: str) -> list[TaskPropertyType]:
        """List all active properties for a given task UUID.

        Requires ticket.view permission (public — Guest may call this). Checkpoint 1 only.
        A deleted need, or a need of a deleted ticket, has none to show.
        """
        await check_permission(info, Perm.TICKET_VIEW)
        db = info.context["db"]
        task = await ticket_task_repository.get_by_uuid_active(db, task_uuid)
        if not task or not await ticket_repository.get_by_uuid_active(db, task.ticket_uuid):
            return []
        items = await task_property_repository.list_by_task(db, task_uuid)
        return [TaskPropertyType.from_model(p) for p in items]
