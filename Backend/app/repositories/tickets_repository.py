"""Repositories for tickets, ticket tasks, task properties, and disaster-field values."""

from geoalchemy2 import Geography
from sqlalchemy import Row, and_, case, cast, delete, exists, false, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import like_pattern, matches, normalize_query, search_timeout
from app.db.h3 import (
    COARSE_MAX_H3_RESOLUTION,
    cell_reach_metres,
    coarse_margin_degrees,
    h3_cell_centre,
    h3_cell_text,
    h3_centroid,
)
from app.infrastructure.repository.base import GenericRepository
from app.models.request import Tickets
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from app.services.ticket_status import OPEN_NEED_STATUSES, OPEN_TICKET_STATUSES

# How list_active can order the tickets (TicketListOrder in app/graphql/tickets/types.py, ADR-419).
TICKET_ORDERS = frozenset({"newest", "needs_first"})
# The need type the site list puts first (a need's task_type, TASK_TYPES in app/services/ticket.py).
_RESCUE = "rescue"

# The site colours a ticket urgent unless its priority, trimmed and lowercased, is one of these, or
# it is in progress (`map/site/markers.ts` resolveTicketVariant); priority is not validated on
# write, so anything else counts. The guest map turns a cell red when it holds one (ADR-387).
CALM_PRIORITIES = ("low", "medium")
# A bare `geography` cast, which the `::geography` index on base_geometries matches (see
# app/dedup_engine/candidates.py); geoalchemy2's default renders `geography(GEOMETRY,-1)`, which it doesn't.
_GEOGRAPHY = Geography(geometry_type=None)


class TicketRepository(GenericRepository[Tickets]):
    """Repository for support ticket queries."""

    def __init__(self):
        """Initialize with Tickets as the managed model."""
        super().__init__(Tickets)

    def _search_condition(self, term: str, *, public_only: bool = False):
        """Match the ticket itself, its tasks, or those tasks' properties.

        EXISTS rather than JOIN throughout (ADR-080) — a ticket with three matching task
        properties would otherwise be returned three times, inflating totalCount and
        skipping rows when paging. The task branch nests a second EXISTS so a ticket is
        reachable through a property of one of its tasks.

        A ticket's address (secondary_locations) is deliberately NOT searchable, unlike a
        station's — see ADR-146. The same table means "shelter location" under a station
        and "the requester's home" under a ticket, and ticket.view is public, so searching
        it would let an anonymous caller confirm a street address the API never returns.

        `public_only` applies the same reasoning to the free text (ADR-281): it matches the
        title and the task names — each with its own trigram index — instead of the
        `search_text` columns, which also carry the description and task description a
        caller without ticket.view_detail cannot read. Task properties are structured values
        and match either way.
        """
        pattern = like_pattern(term)
        ticket_text = self.model.title if public_only else self.model.search_text
        task_text = TicketTask.task_name if public_only else TicketTask.search_text
        return or_(
            matches(ticket_text, pattern),
            exists(
                select(1).where(
                    TicketTask.ticket_uuid == self.model.uuid,
                    TicketTask.delete_at.is_(None),
                    or_(
                        matches(task_text, pattern),
                        exists(
                            select(1).where(
                                TaskProperty.task_uuid == TicketTask.uuid,
                                TaskProperty.delete_at.is_(None),
                                matches(TaskProperty.search_text, pattern),
                            )
                        ),
                    ),
                )
            ),
        )

    def _active_conditions(
        self,
        *,
        bounds=None,
        status: str | None = None,
        statuses: list[str] | None = None,
        priority: str | None = None,
        q: str | None = None,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
        coarse_only: bool = False,
        location_cell: str | None = None,
    ) -> list:
        """The single source of truth for "which tickets match this request".

        Both list_active() and count_active() MUST build their WHERE clause from this and
        nothing else. A condition present in one but not the other makes totalCount
        disagree with the rows actually returned, which silently breaks pagination — and
        no existing test would go red.

        `detail_filters` is `scope_filter()` of the caller's ticket.view_detail: the rows
        whose exact point and free text the caller may read ([] = all of them, [false()] =
        none). Required, with no default, so a new caller cannot forget it and fall open.
        Each row is then matched on what that caller can see of it (ADR-282) — otherwise a
        box shrunk around a ticket, or a keyword taken from its description, would give
        back what the fields withhold.

        `coarse_only` keeps just the rows the caller is shown as a cell rather than a point —
        what the guest map draws as cells (ADR-387). `location_cell` keeps those of one cell,
        which must be at `coarse_resolution`: the rows the guest map's cell holds.

        `statuses` keeps the rows in any of them, as the map's filter ticks several; an empty
        list keeps none, so unticking every status shows nothing. With `status` too, both apply.
        """
        conditions = [self.model.delete_at.is_(None), *extra_filters]
        # NULL-safe: `created_by = :me` is NULL on a row with no author, and NOT NULL is
        # still NULL — such a row would match neither branch below and silently vanish.
        seen = func.coalesce(and_(*detail_filters), false()) if detail_filters else None
        if coarse_only or location_cell is not None:
            conditions.append(false() if seen is None else not_(seen))
        if location_cell is not None:
            # The cell is an expression no index can serve, so a pre-filter comes first, as for
            # `bounds`: a point in the cell lies within reach of its centre, which the geography
            # index on `base_geometries` answers. The cell test below still decides every row.
            conditions.append(
                func.ST_DWithin(
                    cast(self.model.geometry, _GEOGRAPHY),
                    cast(h3_cell_centre(location_cell), _GEOGRAPHY),
                    cell_reach_metres(coarse_resolution),
                )
            )
            conditions.append(h3_cell_text(self.model.geometry, coarse_resolution) == location_cell)
        if bounds:
            envelope = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            exact = func.ST_Intersects(self.model.geometry, envelope)
            if seen is None:
                conditions.append(exact)
            else:
                # The coarse branch uses the cell centre at the resolution the caller is
                # shown, so every row returned lies inside the box it asked about. The centre
                # is an expression no index can serve, so a pre-filter comes first: a row
                # whose centre is in the box has its point within one cell of it, and "point
                # in the grown box" is a question the GIST index on `geometry` answers. Only
                # ever a superset — the centre test below still decides every row, so the
                # pre-filter narrows the scan without widening what can be learned (ADR-282).
                dx, dy = coarse_margin_degrees(
                    coarse_resolution, max(abs(bounds.min_lat), abs(bounds.max_lat))
                )
                conditions.append(func.ST_Intersects(self.model.geometry, func.ST_Expand(envelope, dx, dy)))
                coarse = func.ST_Intersects(h3_centroid(self.model.geometry, coarse_resolution), envelope)
                conditions.append(or_(and_(seen, exact), and_(not_(seen), coarse)))
        if status:
            conditions.append(self.model.status == status)
        if statuses is not None:
            conditions.append(self.model.status.in_(statuses) if statuses else false())
        if priority:
            conditions.append(self.model.priority == priority)
        term = normalize_query(q)
        if term is not None:
            if seen is None:
                conditions.append(self._search_condition(term))
            else:
                # The public match is a subset of what the full one matches on the same row,
                # so OR-ing them never loses a row the caller could legitimately find.
                conditions.append(
                    or_(
                        self._search_condition(term, public_only=True),
                        and_(seen, self._search_condition(term)),
                    )
                )
        return conditions

    def _order_by(self, term: str | None, *, public_only: bool = False) -> list:
        """Relevance first when searching, otherwise newest first (ADR-083/147/153).

        Same three-key shape as StationRepository._order_by — "the ticket's own text
        matched" as a boolean first, then similarity() to grade within each group, then
        the standing order. See that docstring for why similarity() alone cannot express
        this for CJK, and for why the standing order ends in `uuid`.

        `public_only` ranks on the title alone (ADR-281): ranking on `search_text` would
        order the rows by how well a description the caller cannot read matched, leaking
        that match one position at a time.
        """
        standing = [self.model.created_at.desc(), self.model.uuid.desc()]
        if term is None:
            return standing
        text_column = self.model.title if public_only else self.model.search_text
        return [
            matches(text_column, like_pattern(term)).desc(),
            func.similarity(text_column, term).desc(),
            *standing,
        ]

    @staticmethod
    def _needs_summary(viewer_uuid: str | None):
        """Each ticket's needs as one row: an open rescue need and, for a viewer, the needs they claimed.

        Grouped once and LEFT JOINed, not an EXISTS per row in the ORDER BY: Postgres costs a
        correlated EXISTS there as if it ran for every row, and from about 8,500 tickets that
        estimate passes `jit_above_cost`, which adds 150–300 ms of JIT compiling to a query that
        takes about 40 ms (ADR-419). Only the rows that can set a flag are grouped.
        """
        rescue = TicketTask.task_type == _RESCUE
        rescue_open = and_(rescue, TicketTask.status.in_(OPEN_NEED_STATUSES))
        columns = [TicketTask.ticket_uuid, func.bool_or(rescue_open).label("rescue_open")]
        source = TicketTask.__table__
        relevant = rescue_open
        if viewer_uuid is not None:
            # A claim is a row in task_assignments; giving the place back deletes it.
            claimed = TaskAssignment.uuid.is_not(None)
            source = source.outerjoin(
                TaskAssignment,
                and_(TaskAssignment.task_uuid == TicketTask.uuid, TaskAssignment.actor_uuid == viewer_uuid),
            )
            columns += [
                func.bool_or(and_(rescue, claimed)).label("rescue_mine"),
                func.bool_or(claimed).label("mine"),
            ]
            relevant = or_(rescue_open, claimed)
        return (
            select(*columns)
            .select_from(source)
            .where(TicketTask.delete_at.is_(None), relevant)
            .group_by(TicketTask.ticket_uuid)
            .subquery("needs")
        )

    def _needs_tier(self, needs, *, viewer: bool):
        """0: a rescue need still taking people. 1: another need still taking people. 2: none.

        The site list's order (ADR-419, prototype `site-data.js:613-650`). A ticket's status says
        whether any need is open (services/ticket_status.py); one cancelled by hand before statuses
        were derived takes nobody, whatever its needs read. A need the viewer claimed counts as
        open for them, as on the site, so taking the last place does not send the ticket down —
        unless the ticket is cancelled, which nobody is working on any more.
        """
        open_ticket = self.model.status.in_(OPEN_TICKET_STATUSES)
        live = self.model.status != "cancelled"
        whens = [(and_(open_ticket, needs.c.rescue_open), 0)]
        if viewer:
            whens += [(and_(live, needs.c.rescue_mine), 0), (or_(open_ticket, and_(live, needs.c.mine)), 1)]
        else:
            whens.append((open_ticket, 1))
        return case(*whens, else_=2)

    async def deletion(self, db: AsyncSession, uuid) -> Row | None:
        """Whether the ticket `uuid` was deleted, and the ticket a merge replaced it with (ADR-444).

        A row of `deleted` and `replaced_by_uuid`; None when no ticket has that uuid. Reads those two
        columns and nothing else, so a caller asking whether a ticket is gone never holds what was in it.
        """
        result = await db.execute(
            select(self.model.delete_at.is_not(None).label("deleted"), self.model.replaced_by_uuid)
            .select_from(self.model)
            .where(self.model.uuid == uuid)
        )
        return result.one_or_none()

    async def list_active(
        self,
        db: AsyncSession,
        *,
        bounds=None,
        status: str | None = None,
        statuses: list[str] | None = None,
        priority: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
        location_cell: str | None = None,
        order: str = "newest",
        viewer_uuid: str | None = None,
    ) -> list[Tickets]:
        """List active tickets with optional bbox/status/priority/keyword filter and RBAC scope.

        `statuses` / `detail_filters` / `coarse_resolution` / `location_cell`: see
        _active_conditions (ADR-281/282/387).

        `order` is one of TICKET_ORDERS. "needs_first" puts _needs_tier ahead of the standing
        order — ahead of relevance too, when searching (ADR-419) — and `viewer_uuid`, the caller
        when signed in, counts the needs they claimed as open.
        """
        if order not in TICKET_ORDERS:
            raise ValueError(f"Unknown ticket order: {order}")
        term = normalize_query(q)
        conditions = self._active_conditions(
            bounds=bounds,
            status=status,
            statuses=statuses,
            priority=priority,
            q=q,
            extra_filters=extra_filters,
            detail_filters=detail_filters,
            coarse_resolution=coarse_resolution,
            location_cell=location_cell,
        )
        query = select(self.model).where(*conditions)
        tiers = []
        if order == "needs_first":
            needs = self._needs_summary(viewer_uuid)
            # At most one summary row per ticket, so the join repeats no ticket.
            query = query.outerjoin(needs, needs.c.ticket_uuid == self.model.uuid)
            tiers = [self._needs_tier(needs, viewer=viewer_uuid is not None)]
        async with search_timeout(db, term):
            result = await db.execute(
                query.order_by(*tiers, *self._order_by(term, public_only=bool(detail_filters)))
                .offset(skip)
                .limit(limit)
            )
        return result.scalars().all()

    async def count_active(
        self,
        db: AsyncSession,
        *,
        bounds=None,
        status: str | None = None,
        statuses: list[str] | None = None,
        priority: str | None = None,
        q: str | None = None,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
        location_cell: str | None = None,
    ) -> int:
        """Count active tickets — MUST use the same conditions as list_active()."""
        conditions = self._active_conditions(
            bounds=bounds,
            status=status,
            statuses=statuses,
            priority=priority,
            q=q,
            extra_filters=extra_filters,
            detail_filters=detail_filters,
            coarse_resolution=coarse_resolution,
            location_cell=location_cell,
        )
        async with search_timeout(db, normalize_query(q)):
            return await db.scalar(
                select(func.count()).select_from(select(self.model).where(*conditions).subquery())
            )

    async def count_by_cell(
        self,
        db: AsyncSession,
        *,
        bounds,
        statuses: list[str] | None = None,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
    ) -> list[tuple[str, int, int]]:
        """Count, per H3 cell, the active tickets the caller is shown as that cell (ADR-387).

        Returns `(cell, tickets, urgent ones)` rows ordered by cell. Built from `_active_conditions`
        and nothing else, so the counts are what paging through list_active() with the same
        arguments and grouping by `locationCell` would give. A caller who sees every exact point has
        no cells, so it costs no query. `statuses`: see _active_conditions.
        """
        if not detail_filters:
            return []
        conditions = self._active_conditions(
            bounds=bounds,
            statuses=statuses,
            extra_filters=extra_filters,
            detail_filters=detail_filters,
            coarse_resolution=coarse_resolution,
            coarse_only=True,
        )
        cell = h3_cell_text(self.model.geometry, coarse_resolution)
        urgent = and_(
            func.lower(func.btrim(self.model.priority)).not_in(CALM_PRIORITIES),
            self.model.status != "in_progress",
        )
        rows = await db.execute(
            select(cell, func.count(), func.count().filter(urgent))
            .where(*conditions)
            .group_by(cell)
            .order_by(cell)
        )
        return [(cell, count, urgent_count) for cell, count, urgent_count in rows]


class TicketTaskRepository(GenericRepository[TicketTask]):
    """Repository for ticket task queries."""

    def __init__(self):
        """Initialize with TicketTask as the managed model."""
        super().__init__(TicketTask)

    async def list_by_ticket(
        self,
        db: AsyncSession,
        ticket_uuid: str,
        *,
        status: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
        public_only: bool,
    ) -> list[TicketTask]:
        """List active tasks for a ticket with optional status and keyword filters.

        `public_only` — the caller may not read this ticket's detail (ADR-281) — matches `q`
        against the task name instead of `search_text`, which carries the task description
        too. Required, like TicketRepository's `detail_filters`, so no caller falls open.
        """
        query = select(self.model).where(
            self.model.ticket_uuid == ticket_uuid,
            self.model.delete_at.is_(None),
        )
        if status:
            query = query.where(self.model.status == status)
        term = normalize_query(q)
        if term is not None:
            pattern = like_pattern(term)
            task_text = self.model.task_name if public_only else self.model.search_text
            # A task matches on its own name/description or on any of its properties,
            # mirroring how a ticket reaches into its tasks (ADR-080).
            query = query.where(
                or_(
                    matches(task_text, pattern),
                    exists(
                        select(1).where(
                            TaskProperty.task_uuid == self.model.uuid,
                            TaskProperty.delete_at.is_(None),
                            matches(TaskProperty.search_text, pattern),
                        )
                    ),
                )
            )
        # Same total-order rule as the two list_active() paths (ADR-153): created_at comes
        # from server_default=func.now(), which is transaction-scoped, so a batch of tasks
        # created for one ticket in one transaction all share a timestamp. Without the
        # primary key underneath, OFFSET/LIMIT pages over that batch can repeat a row and
        # never return another.
        #
        # search_timeout() for the same reason list_active() has it (ADR-152): when `q` is
        # set this runs a trigram ILIKE plus a correlated EXISTS, and ticket.view is in
        # PUBLIC_PERMS — an anonymous Guest reaches it on an endpoint with no rate limiter.
        # It is a no-op when `term` is None, so the plain list path is unchanged.
        async with search_timeout(db, term):
            result = await db.execute(
                query.order_by(self.model.created_at.desc(), self.model.uuid.desc()).offset(skip).limit(limit)
            )
        return result.scalars().all()


class TaskPropertyRepository(GenericRepository[TaskProperty]):
    """Repository for task property queries."""

    def __init__(self):
        """Initialize with TaskProperty as the managed model."""
        super().__init__(TaskProperty)

    async def list_by_task(self, db: AsyncSession, task_uuid: str) -> list[TaskProperty]:
        """List all active properties for a given task."""
        result = await db.execute(
            select(self.model).where(
                self.model.task_uuid == task_uuid,
                self.model.delete_at.is_(None),
            )
        )
        return result.scalars().all()


class TaskAssignmentRepository(GenericRepository[TaskAssignment]):
    """Repository for task assignment queries (people linked to a task)."""

    def __init__(self):
        """Initialize with TaskAssignment as the managed model."""
        super().__init__(TaskAssignment)

    async def list_by_task(self, db: AsyncSession, task_uuid: str) -> list[TaskAssignment]:
        """List all assignments for a given task."""
        result = await db.execute(select(self.model).where(self.model.task_uuid == task_uuid))
        return result.scalars().all()

    async def get_by_task_and_actor(
        self, db: AsyncSession, task_uuid: str, actor_uuid: str
    ) -> TaskAssignment | None:
        """Fetch the assignment linking an actor to a task, if it exists (duplicate guard)."""
        result = await db.execute(
            select(self.model).where(
                self.model.task_uuid == task_uuid,
                self.model.actor_uuid == actor_uuid,
            )
        )
        return result.scalar_one_or_none()


class TicketDisasterDetailRepository(GenericRepository[TicketDisasterDetail]):
    """Repository for the per-ticket values of disaster-specific dynamic fields."""

    def __init__(self):
        """Initialize with TicketDisasterDetail as the managed model."""
        super().__init__(TicketDisasterDetail)

    async def list_by_ticket(self, db: AsyncSession, ticket_uuid: str) -> list[TicketDisasterDetail]:
        """List a ticket's disaster-field values, ordered so a multi-select reads stably.

        Ordered on `(property_name, value)` rather than insertion: a `multi_select` is several
        rows and the caller renders them as one field, so an unordered result would reshuffle
        the checkbox list between reads for no reason.
        """
        result = await db.execute(
            select(self.model)
            .where(self.model.ticket_uuid == ticket_uuid, self.model.delete_at.is_(None))
            .order_by(self.model.property_name, self.model.value)
        )
        return result.scalars().all()

    async def delete_for_ticket(self, db: AsyncSession, ticket_uuid: str) -> None:
        """Hard-delete every value row for a ticket, without committing.

        Hard, not soft: these rows are a *replacement* set, and a soft-deleted row would still
        occupy `uq_ticket_disaster_detail_value`, so re-selecting a value the reporter had
        previously cleared would hit a unique violation. The audit trigger records the DELETE,
        so nothing is lost — the trail lives in `audit_logs`, not in tombstones here.

        No commit: the caller owns the transaction so that clearing and re-inserting is one
        atomic swap.
        """
        await db.execute(delete(self.model).where(self.model.ticket_uuid == ticket_uuid))


ticket_repository = TicketRepository()
ticket_task_repository = TicketTaskRepository()
task_property_repository = TaskPropertyRepository()
task_assignment_repository = TaskAssignmentRepository()
ticket_disaster_detail_repository = TicketDisasterDetailRepository()
