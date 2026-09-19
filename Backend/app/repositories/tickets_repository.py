"""Repositories for tickets, ticket tasks, task properties, and disaster-field values."""

from sqlalchemy import and_, delete, exists, false, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.search import like_pattern, matches, normalize_query, search_timeout
from app.db.h3 import COARSE_MAX_H3_RESOLUTION, coarse_margin_degrees, h3_centroid
from app.infrastructure.repository.base import GenericRepository
from app.models.request import Tickets
from app.models.ticket_disaster_detail import TicketDisasterDetail
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask


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
        priority: str | None = None,
        q: str | None = None,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
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
        """
        conditions = [self.model.delete_at.is_(None), *extra_filters]
        # NULL-safe: `created_by = :me` is NULL on a row with no author, and NOT NULL is
        # still NULL — such a row would match neither branch below and silently vanish.
        seen = func.coalesce(and_(*detail_filters), false()) if detail_filters else None
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
                conditions.append(
                    func.ST_Intersects(self.model.geometry, func.ST_Expand(envelope, dx, dy))
                )
                coarse = func.ST_Intersects(
                    h3_centroid(self.model.geometry, coarse_resolution), envelope
                )
                conditions.append(or_(and_(seen, exact), and_(not_(seen), coarse)))
        if status:
            conditions.append(self.model.status == status)
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

    async def list_active(
        self,
        db: AsyncSession,
        *,
        bounds=None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        skip: int = 0,
        limit: int = 50,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
    ) -> list[Tickets]:
        """List active tickets with optional bbox/status/priority/keyword filter and RBAC scope.

        `detail_filters` / `coarse_resolution`: see _active_conditions (ADR-281/282).
        """
        term = normalize_query(q)
        conditions = self._active_conditions(
            bounds=bounds, status=status, priority=priority, q=q, extra_filters=extra_filters,
            detail_filters=detail_filters, coarse_resolution=coarse_resolution,
        )
        async with search_timeout(db, term):
            result = await db.execute(
                select(self.model).where(*conditions)
                .order_by(*self._order_by(term, public_only=bool(detail_filters)))
                .offset(skip).limit(limit)
            )
        return result.scalars().all()

    async def count_active(
        self,
        db: AsyncSession,
        *,
        bounds=None,
        status: str | None = None,
        priority: str | None = None,
        q: str | None = None,
        extra_filters=(),
        detail_filters,
        coarse_resolution: int = COARSE_MAX_H3_RESOLUTION,
    ) -> int:
        """Count active tickets — MUST use the same conditions as list_active()."""
        conditions = self._active_conditions(
            bounds=bounds, status=status, priority=priority, q=q, extra_filters=extra_filters,
            detail_filters=detail_filters, coarse_resolution=coarse_resolution,
        )
        async with search_timeout(db, normalize_query(q)):
            return await db.scalar(
                select(func.count()).select_from(select(self.model).where(*conditions).subquery())
            )


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
                query.order_by(self.model.created_at.desc(), self.model.uuid.desc())
                .offset(skip).limit(limit)
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
