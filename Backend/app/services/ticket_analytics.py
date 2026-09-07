"""Ticket/task analytics aggregation queries backing the Plotly chart endpoints.

Read-only reporting queries spanning tickets + ticket_tasks + task_assignments — they
don't map to a single entity's CRUD, so they live here as plain SQLAlchemy Core
`select()` statements rather than repository methods (ADR-015 keeps repositories pure
per-entity CRUD). Each function returns plain lists of dicts; chart_render.py turns
that into a Plotly figure.

Every function shares the same keyword-only signature —
`(db, *, x, x_granularity, start_date, end_date, tz, extra_filters)` — even where a given
metric ignores some of those (e.g. `get_age_distribution` has no ungrouped/date form, so
its `x`/`x_granularity` are accepted but unused). This keeps app/api/v1/endpoints/
analytics.py's dispatch loop uniform: it always calls every metric function the same
way, and app.services.chart_render.resolve() is what guarantees each function only
ever receives an `x` value that's actually valid for it (see that module's CATALOG).

`extra_filters` is the caller's RBAC row filter — a list of WHERE clauses from
app.core.rbac_scopes.scope_filter against `Tickets`, empty for `all` scope. Every
function must apply it; an aggregate that skips it leaks numbers, if not rows.

Grouped rows use a uniform `"x"` output column regardless of what's being grouped by
(day/week bucket, task_type, ...) so chart_render.py never needs per-metric field
lookups.

Per Spec/Docs/er-diagram.md, `tickets.status` doesn't track work progress at the
granularity needed here, so bucket-based metrics classify a ticket by rolling up its
`ticket_tasks` (and their `task_assignments`) instead. The four buckets are exclusive
and exhaustive:

    unassigned  -- no task_assignments at all: nobody has picked it up yet
    canceled    -- someone did, but every task has since been canceled
    completed   -- >=1 task still standing, and all of them 'fulfilled'
    ongoing     -- anything else: picked up, work still outstanding

`canceled` is an outcome, not a flavour of `ongoing`: such a ticket must leave the
backlog, count toward neither success nor failure, and stop ageing.
"""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

from geoalchemy2 import Geography
from sqlalchemy import and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services.analytics_common import (
    MAX_DUPLICATE_RANGE_DAYS,
    AnalyticsInputError,
    category_expr,
    local_bounds,
    resolve_granularity,
)

# Duplicate-detection thresholds (ADR: "context flag, not urgency" — tunable, not user-facing).
DUPLICATE_DISTANCE_METERS = 200
DUPLICATE_TIME_WINDOW_HOURS = 24

# The two buckets a ticket exits through, and the task column recording when. Per-task, so
# a ticket's own exit date is max() over its tasks. "unassigned"/"ongoing" have no exit date.
_DRAIN_TIMESTAMP = {
    "completed": TicketTask.completed_at,
    "canceled": TicketTask.canceled_at,
}


def _task_rollup_subquery():
    """Per-ticket task/assignment counts feeding the bucket classification in _bucket_expr."""
    return (
        select(
            TicketTask.ticket_uuid.label("ticket_uuid"),
            func.count(func.distinct(TicketTask.uuid))
            .filter(TicketTask.status != "canceled")
            .label("active_tasks"),
            func.count(func.distinct(TicketTask.uuid))
            .filter(TicketTask.status == "fulfilled")
            .label("fulfilled_tasks"),
            func.count(func.distinct(TaskAssignment.uuid)).label("assigned_count"),
        )
        .select_from(TicketTask)
        .outerjoin(TaskAssignment, TaskAssignment.task_uuid == TicketTask.uuid)
        .where(TicketTask.delete_at.is_(None))
        .group_by(TicketTask.ticket_uuid)
        .subquery()
    )


def _bucket_expr(rollup):
    """CASE assigning a ticket one of the module docstring's four buckets.

    `active_tasks` excludes canceled tasks, so it reaches zero exactly when every task was
    called off. That branch must precede "completed": "all active tasks fulfilled" is
    trivially true of zero, so the other order reports withdrawn work as delivered.
    """
    return case(
        (
            (rollup.c.assigned_count.is_(None)) | (rollup.c.assigned_count == 0),
            "unassigned",
        ),
        (
            rollup.c.active_tasks == 0,
            "canceled",
        ),
        (
            and_(rollup.c.active_tasks > 0, rollup.c.fulfilled_tasks == rollup.c.active_tasks),
            "completed",
        ),
        else_="ongoing",
    )


async def get_ticket_count(
    db: AsyncSession, *,
    bucket: str | None, x: str | None, x_granularity: str,
    start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Ticket count for one bucket, optionally grouped by date/week or category.

    Backs 5 y-metrics via a fixed `bucket`: `None` counts every ticket ("total_tickets"),
    the four bucket names narrow to that bucket. `x="category"` groups by `task_type`,
    labelling NULLs (analytics_common.UNCATEGORIZED_LABEL).

    `x="date"` groups by whichever date the metric is really about. The two exit buckets
    (completed, canceled) group by the day the ticket left — `max()` of the relevant task
    timestamp — matching get_net_backlog_change's exit series; the rest group by
    `Tickets.created_at`, since they haven't left.

    The exit-date path needs a timestamp, not just a status, so it drops tickets whose
    columns are NULL. Migration a1b2c3d4e5f6 backfills pre-existing rows, so in practice
    the two paths agree. It is also point-in-time, not history: services/ticket.py clears
    those timestamps when a task leaves 'fulfilled'/'canceled', so re-opening one erases
    its exit day and the same query run twice can report a different past. Faithful
    history needs a status-transition table, out of scope here.
    """
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)

    if bucket in _DRAIN_TIMESTAMP and x == "date":
        stamp = _DRAIN_TIMESTAMP[bucket]
        drained = (
            select(
                Tickets.uuid.label("ticket_uuid"),
                func.max(stamp).label("stamp"),
            )
            .select_from(Tickets)
            .join(rollup, rollup.c.ticket_uuid == Tickets.uuid)
            .join(TicketTask, TicketTask.ticket_uuid == Tickets.uuid)
            .where(
                Tickets.delete_at.is_(None),
                TicketTask.delete_at.is_(None),
                bucket_expr == bucket,
                # No exit timestamp, no day to plot it on. Without this the NULL survives
                # max() and the caller's sort raises TypeError comparing it to a datetime.
                stamp.is_not(None),
                *(extra_filters or []),
            )
            .group_by(Tickets.uuid)
            .subquery()
        )
        period = func.date_trunc(granularity, func.timezone(tz.key, drained.c.stamp))
        query = select(
            period.label("x"), func.count(drained.c.ticket_uuid).label("count")
        ).select_from(drained)
        if lower is not None:
            query = query.where(drained.c.stamp >= lower)
        if upper is not None:
            query = query.where(drained.c.stamp < upper)
        query = query.group_by(period)
        result = await db.execute(query)
        return [dict(row._mapping) for row in result]

    cols = [func.count(Tickets.uuid).label("count")]
    group_cols = []
    if x == "date":
        period = func.date_trunc(granularity, func.timezone(tz.key, Tickets.created_at))
        cols.insert(0, period.label("x"))
        group_cols.append(period)
    elif x == "category":
        category = category_expr(Tickets.task_type)
        cols.insert(0, category.label("x"))
        group_cols.append(category)

    query = (
        select(*cols)
        .select_from(Tickets)
        .outerjoin(rollup, rollup.c.ticket_uuid == Tickets.uuid)
        .where(Tickets.delete_at.is_(None), *(extra_filters or []))
    )
    if bucket is not None:
        query = query.where(bucket_expr == bucket)
    if lower is not None:
        query = query.where(Tickets.created_at >= lower)
    if upper is not None:
        query = query.where(Tickets.created_at < upper)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_completion_rate(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Completed / total ticket ratio, overall, per task_type, or per creation day/week.

    Canceled tickets are excluded from both halves: in the denominator they would read as
    work we failed to deliver, when it was called off.

    `x="date"` is a cohort rate — grouped by creation day, but reflecting each ticket's
    *current* status, not the rate as of that day.
    """
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)

    cols = [
        func.count(Tickets.uuid).filter(bucket_expr == "completed").label("completed"),
        func.count(Tickets.uuid).filter(bucket_expr != "canceled").label("total"),
    ]
    group_cols = []
    if x == "date":
        period = func.date_trunc(granularity, func.timezone(tz.key, Tickets.created_at))
        cols.insert(0, period.label("x"))
        group_cols.append(period)
    elif x == "category":
        category = category_expr(Tickets.task_type)
        cols.insert(0, category.label("x"))
        group_cols.append(category)

    query = (
        select(*cols)
        .select_from(Tickets)
        .outerjoin(rollup, rollup.c.ticket_uuid == Tickets.uuid)
        .where(Tickets.delete_at.is_(None), *(extra_filters or []))
    )
    if lower is not None:
        query = query.where(Tickets.created_at >= lower)
    if upper is not None:
        query = query.where(Tickets.created_at < upper)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    rows = [dict(row._mapping) for row in result]
    for row in rows:
        row["rate"] = (row["completed"] / row["total"]) if row["total"] else 0.0
    return rows


_AGE_BUCKET_ORDER = ["<24h", "24-48h", "48-72h", ">72h"]


async def get_age_distribution(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Open ticket count bucketed by (now - created_at) age — how long work has been waiting.

    Completed and canceled tickets are excluded — a closed ticket that kept ageing would
    show as an ever-growing pile of overdue work nobody owes.

    Always grouped by age bucket (<24h/24-48h/48-72h/>72h) — this metric has no
    ungrouped form, so `x`/`x_granularity` are accepted (for dispatch-signature
    uniformity, see module docstring) but unused; chart_render.py's catalog marks it
    `allowed_x={None}`, a fixed shape like get_task_completion_distribution. Duration-
    based, so `tz` only affects start/end filtering, not the buckets themselves.
    """
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)
    lower, upper = local_bounds(start_date, end_date, tz)

    age_hours = func.extract("epoch", func.now() - Tickets.created_at) / 3600.0
    age_bucket = case(
        (age_hours < 24, "<24h"),
        (age_hours < 48, "24-48h"),
        (age_hours < 72, "48-72h"),
        else_=">72h",
    )

    query = (
        select(age_bucket.label("x"), func.count(Tickets.uuid).label("count"))
        .select_from(Tickets)
        .outerjoin(rollup, rollup.c.ticket_uuid == Tickets.uuid)
        .where(
            Tickets.delete_at.is_(None),
            bucket_expr.notin_(("completed", "canceled")),
            *(extra_filters or []),
        )
    )
    if lower is not None:
        query = query.where(Tickets.created_at >= lower)
    if upper is not None:
        query = query.where(Tickets.created_at < upper)
    query = query.group_by(age_bucket)

    result = await db.execute(query)
    rows = [dict(row._mapping) for row in result]
    order = {b: i for i, b in enumerate(_AGE_BUCKET_ORDER)}
    rows.sort(key=lambda r: order.get(r["x"], len(order)))
    return rows


async def get_time_to_completion(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Avg + median duration (completed_at - created_at) across fulfilled ticket_tasks.

    Task-level per the "these metrics should be based on the task" instruction.
    `x="category"` splits by task_type; no date form (task-level durations aren't
    naturally date-groupable without further design), so `x_granularity` is unused.

    Point-in-time, not history: services/ticket.py clears `completed_at` when a task leaves
    'fulfilled', so re-opening one retroactively removes it from this sample.
    """
    lower, upper = local_bounds(start_date, end_date, tz)
    duration = func.extract("epoch", TicketTask.completed_at - TicketTask.created_at)

    cols = [
        func.avg(duration).label("avg_seconds"),
        func.percentile_cont(0.5).within_group(duration).label("median_seconds"),
        func.count(TicketTask.uuid).label("sample_size"),
    ]
    group_cols = []
    if x == "category":
        cols.insert(0, TicketTask.task_type.label("x"))
        group_cols.append(TicketTask.task_type)

    query = select(*cols).where(TicketTask.delete_at.is_(None), TicketTask.completed_at.is_not(None))
    if extra_filters:
        # Rooted at TicketTask, but the filters are written against Tickets, so reach the
        # parent row. Repointing them at TicketTask would be wrong, not just awkward: its
        # `created_by` is the task's author rather than the ticket's owner, and it has no
        # geometry — so `own` would answer a different question and `zone` would match none.
        query = query.join(Tickets, Tickets.uuid == TicketTask.ticket_uuid).where(*extra_filters)
    if lower is not None:
        query = query.where(TicketTask.completed_at >= lower)
    if upper is not None:
        query = query.where(TicketTask.completed_at < upper)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_net_backlog_change(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Per day/week: tickets entering the backlog, tickets leaving it, and the net change.

    Four series: `new_count`, `completed_count`, `canceled_count`, and `net_change` =
    new - completed - canceled. Both exits are subtracted — a ticket leaves the backlog
    whether the work was delivered or called off, and omitting cancellations would leave
    them counted as backlog forever.

    Always date-grouped whatever `x` says (catalog marks it `allowed_x={"date"}`), so
    `x_granularity` is the only param that varies this query's shape.

    The three series are independent: "new" groups by creation day, each exit series by
    the day the ticket's last task reached that state. A ticket created before the window
    can still appear as an exit inside it.

    Exits with no timestamp are missing from their series (a1b2c3d4e5f6 backfills the
    pre-existing ones), and the timestamps are mutable — see get_ticket_count for both
    caveats.
    """
    granularity = resolve_granularity(x_granularity)
    lower, upper = local_bounds(start_date, end_date, tz)
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)
    empty_row = {"new_count": 0, "completed_count": 0, "canceled_count": 0}

    new_period = func.date_trunc(granularity, func.timezone(tz.key, Tickets.created_at))
    new_query = select(new_period.label("x"), func.count(Tickets.uuid).label("count")).where(
        Tickets.delete_at.is_(None), *(extra_filters or [])
    )
    if lower is not None:
        new_query = new_query.where(Tickets.created_at >= lower)
    if upper is not None:
        new_query = new_query.where(Tickets.created_at < upper)
    new_query = new_query.group_by(new_period)
    new_rows = (await db.execute(new_query)).all()

    async def _exit_rows(bucket: str):
        """Per-period count of tickets that left the backlog via `bucket`.

        Both exits have the same shape, so this runs twice instead of being written twice.
        """
        stamp = _DRAIN_TIMESTAMP[bucket]
        exited = (
            select(Tickets.uuid.label("ticket_uuid"), func.max(stamp).label("stamp"))
            .select_from(Tickets)
            .join(rollup, rollup.c.ticket_uuid == Tickets.uuid)
            .join(TicketTask, TicketTask.ticket_uuid == Tickets.uuid)
            .where(
                Tickets.delete_at.is_(None),
                TicketTask.delete_at.is_(None),
                bucket_expr == bucket,
                stamp.is_not(None),  # see get_ticket_count: no timestamp, no day
                *(extra_filters or []),
            )
            .group_by(Tickets.uuid)
            .subquery()
        )
        period = func.date_trunc(granularity, func.timezone(tz.key, exited.c.stamp))
        query = select(
            period.label("x"), func.count(exited.c.ticket_uuid).label("count")
        ).select_from(exited)
        if lower is not None:
            query = query.where(exited.c.stamp >= lower)
        if upper is not None:
            query = query.where(exited.c.stamp < upper)
        return (await db.execute(query.group_by(period))).all()

    completed_rows = await _exit_rows("completed")
    canceled_rows = await _exit_rows("canceled")

    by_period: dict = {}
    for key, rows in (
        ("new_count", new_rows),
        ("completed_count", completed_rows),
        ("canceled_count", canceled_rows),
    ):
        for row in rows:
            by_period.setdefault(row.x, {"x": row.x, **empty_row})
            by_period[row.x][key] = row.count

    result = sorted(by_period.values(), key=lambda r: r["x"])
    for row in result:
        row["net_change"] = row["new_count"] - row["completed_count"] - row["canceled_count"]
    return result


async def get_task_completion_distribution(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Completed vs remaining tasks across all tickets in range (task-level, not per-ticket).

    Always a fixed 2-row shape (completed/remaining) — no x form, so `x`/
    `x_granularity` are accepted (dispatch-signature uniformity) but unused; catalog
    marks this `allowed_x={None}`.
    """
    lower, upper = local_bounds(start_date, end_date, tz)
    query = select(
        func.count(TicketTask.uuid).filter(TicketTask.status == "fulfilled").label("completed"),
        func.count(TicketTask.uuid).filter(TicketTask.status != "canceled").label("total"),
    ).where(TicketTask.delete_at.is_(None))
    if extra_filters:
        # Reach the parent row, same reasoning as get_time_to_completion above.
        query = query.join(Tickets, Tickets.uuid == TicketTask.ticket_uuid).where(*extra_filters)
    if lower is not None:
        query = query.where(TicketTask.created_at >= lower)
    if upper is not None:
        query = query.where(TicketTask.created_at < upper)

    row = (await db.execute(query)).one()
    completed, total = row.completed, row.total
    return [
        {"x": "completed", "count": completed},
        {"x": "remaining", "count": max(total - completed, 0)},
    ]


def _duplicate_pair_condition(a, b, *, lower=None, upper=None):
    """Join condition flagging tickets `a` and `b` as likely duplicates of each other.

    Same task_type/disaster_type, and within DUPLICATE_DISTANCE_METERS and
    DUPLICATE_TIME_WINDOW_HOURS of one another.

    Pass `lower`/`upper` (the caller's date range) to bound `b` as well as `a`: worth ~20%,
    measured 1.42s -> 1.11s over 3000 co-located tickets across 120 days. It does not fix
    the query's shape — `tickets` inherits from `base_geometries`, so the date sits on the
    parent and task_type on the child, and Postgres still merge-joins the undated child
    first. The span cap in get_duplicate_count is what keeps cost finite.

    Bounding `b` changes no results: the range is widened by the pairing window first, so
    anything it excludes already fails the timestamp predicate below.
    """
    conds = [
        a.uuid != b.uuid,
        a.delete_at.is_(None), b.delete_at.is_(None),
        a.task_type.is_not(None), a.task_type == b.task_type,
        func.coalesce(a.disaster_type, "") == func.coalesce(b.disaster_type, ""),
        func.ST_DWithin(cast(a.geometry, Geography), cast(b.geometry, Geography), DUPLICATE_DISTANCE_METERS),
        func.abs(func.extract("epoch", a.created_at - b.created_at)) <= DUPLICATE_TIME_WINDOW_HOURS * 3600,
    ]
    pad = timedelta(hours=DUPLICATE_TIME_WINDOW_HOURS)
    if lower is not None:
        conds.append(b.created_at >= lower - pad)
    if upper is not None:
        conds.append(b.created_at < upper + pad)
    return and_(*conds)


async def get_duplicate_count(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Count tickets flagged as likely duplicates.

    A ticket is flagged if it has >=1 other ticket sharing task_type/disaster_type
    within the distance/time thresholds above — a context flag, not an urgency signal.
    `x="date"` groups flagged tickets by their own creation day/week; `x="category"`
    by task_type.

    Alone among these metrics, `start_date`/`end_date` are required and their span is
    capped at MAX_DUPLICATE_RANGE_DAYS. Being a self-join, cost grows with (tickets in
    range) x (tickets in table) — measured on 3000 co-located tickets: 0.14s for 7 days,
    0.46s for 30, 1.11s for 120. No index helps: the `::geography` cast rules out
    `gist(geometry)` for ST_DWithin, and an expression index on `(geometry::geography)`
    wouldn't either, since disaster tickets cluster in one area so most pairs genuinely
    are within range — the cost is the answer's size, not the scan's. Capping the span is
    the only control, and the only one at all: there is no statement_timeout or rate limit.

    Bad input raises AnalyticsInputError -> HTTP 400. `chart_render.CATALOG` publishes both
    rules (`requires_date_range`, `max_range_days`) so the frontend can enforce them.
    """
    if start_date is None or end_date is None:
        raise AnalyticsInputError("duplicate_count requires both start_date and end_date")
    span_days = (end_date - start_date).days
    if span_days < 0:
        raise AnalyticsInputError("duplicate_count requires end_date on or after start_date")
    if span_days > MAX_DUPLICATE_RANGE_DAYS:
        raise AnalyticsInputError(
            f"duplicate_count range must be at most {MAX_DUPLICATE_RANGE_DAYS} days "
            f"(got {span_days})"
        )
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)
    a = aliased(Tickets)
    b = aliased(Tickets)

    flagged = (
        select(a.uuid.label("uuid"), a.task_type.label("category"), a.created_at.label("created_at"))
        .select_from(a)
        .join(b, _duplicate_pair_condition(a, b, lower=lower, upper=upper))
        .where(a.delete_at.is_(None))
    )
    if lower is not None:
        flagged = flagged.where(a.created_at >= lower)
    if upper is not None:
        flagged = flagged.where(a.created_at < upper)
    if extra_filters:
        # The filters name the Tickets class, but this query has only the aliases `a`/`b`,
        # so adding them directly would drag the un-aliased table into FROM and cross-join
        # it. Restrict by uuid instead, on both sides — scoping only `a` would flag a
        # ticket as a duplicate of one the caller isn't allowed to see.
        in_scope = (
            select(Tickets.uuid)
            .where(Tickets.delete_at.is_(None), *extra_filters)
            .scalar_subquery()
        )
        flagged = flagged.where(a.uuid.in_(in_scope), b.uuid.in_(in_scope))
    flagged = flagged.distinct().subquery()

    cols = [func.count(func.distinct(flagged.c.uuid)).label("count")]
    group_cols = []
    if x == "date":
        period = func.date_trunc(granularity, func.timezone(tz.key, flagged.c.created_at))
        cols.insert(0, period.label("x"))
        group_cols.append(period)
    elif x == "category":
        cols.insert(0, flagged.c.category.label("x"))
        group_cols.append(flagged.c.category)

    query = select(*cols).select_from(flagged)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]
