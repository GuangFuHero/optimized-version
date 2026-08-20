"""Ticket/task analytics aggregation queries backing the Plotly chart endpoints.

Read-only reporting queries spanning tickets + ticket_tasks + task_assignments — they
don't map to a single entity's CRUD, so they live here as plain SQLAlchemy Core
`select()` statements rather than repository methods (ADR-015 keeps repositories pure
per-entity CRUD). Each function returns plain lists of dicts; chart_render.py turns
that into a Plotly figure.

Every function shares the same keyword-only signature —
`(db, *, x, x_granularity, start_date, end_date, tz)` — even where a given metric
ignores some of those (e.g. `get_age_distribution` has no ungrouped/date form, so its
`x`/`x_granularity` are accepted but unused). This keeps app/api/v1/endpoints/
analytics.py's dispatch loop uniform: it always calls every metric function the same
way, and app.services.chart_render.resolve() is what guarantees each function only
ever receives an `x` value that's actually valid for it (see that module's CATALOG).

Grouped rows use a uniform `"x"` output column regardless of what's being grouped by
(day/week bucket, task_type, ...) so chart_render.py never needs per-metric field
lookups.

Per Spec/Docs/er-diagram.md, a ticket has no status of its own that reflects work
progress at the granularity we need here, so every bucket-based metric below (backing
`total_tickets`/`ongoing_tickets`/`unassigned_tickets`/`completed_tickets`) classifies
a ticket by rolling up its `ticket_tasks` (and their `task_assignments`) rather than
reading `tickets.status` directly:

    unassigned  -- zero task_assignments across all of the ticket's tasks (no match yet)
    completed   -- >=1 task, and every non-canceled task.status == 'fulfilled'
    ongoing     -- otherwise (>=1 assignment, not fully fulfilled)
"""

from datetime import date
from zoneinfo import ZoneInfo

from geoalchemy2 import Geography
from sqlalchemy import and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services.analytics_common import category_expr, local_bounds, resolve_granularity

# Duplicate-detection thresholds (ADR: "context flag, not urgency" — tunable, not user-facing).
DUPLICATE_DISTANCE_METERS = 200
DUPLICATE_TIME_WINDOW_HOURS = 24


def _task_rollup_subquery():
    """Per-ticket task/assignment counts feeding the unassigned/ongoing/completed bucket."""
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
    """CASE expression classifying a ticket as unassigned/completed/ongoing (see module docstring)."""
    return case(
        (
            (rollup.c.assigned_count.is_(None)) | (rollup.c.assigned_count == 0),
            "unassigned",
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
) -> list[dict]:
    """Ticket count for one bucket, optionally grouped by creation date/week or category.

    Backs 4 y-metrics via a fixed `bucket`: `bucket=None` = all tickets
    ("total_tickets"); `"unassigned"`/`"ongoing"`/`"completed"` filter to that bucket.
    `x="date"` groups by `Tickets.created_at` EXCEPT when `bucket == "completed"`,
    which groups by each ticket's own completion day (`max(completed_at)` across its
    tasks) instead — "how many tickets finished on day X", matching
    get_net_backlog_change's "completed" series. `x="category"` groups by `task_type`,
    with NULLs labelled (see analytics_common.UNCATEGORIZED_LABEL).

    Note the two paths classify differently: the ungrouped/`x="category"` path counts
    via `_bucket_expr` (i.e. `ticket_tasks.status`), while the `bucket="completed",
    x="date"` path counts only tickets that actually carry a completion timestamp — a
    row with no `completed_at` can't be placed on a time axis at all. Migration
    a1b2c3d4e5f6 backfills `completed_at` for rows that predate the column, so the two
    agree; without that backfill the date series would undercount.
    """
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)

    if bucket == "completed" and x == "date":
        completion = (
            select(
                Tickets.uuid.label("ticket_uuid"),
                func.max(TicketTask.completed_at).label("completed_at"),
            )
            .select_from(Tickets)
            .join(rollup, rollup.c.ticket_uuid == Tickets.uuid)
            .join(TicketTask, TicketTask.ticket_uuid == Tickets.uuid)
            .where(
                Tickets.delete_at.is_(None),
                TicketTask.delete_at.is_(None),
                bucket_expr == "completed",
                # No completion timestamp -> no day to plot it on. Without this the NULL
                # survives max(), date_trunc returns NULL, and the caller's sort blows up
                # comparing None to datetime.
                TicketTask.completed_at.is_not(None),
            )
            .group_by(Tickets.uuid)
            .subquery()
        )
        period = func.date_trunc(granularity, func.timezone(tz.key, completion.c.completed_at))
        query = select(
            period.label("x"), func.count(completion.c.ticket_uuid).label("count")
        ).select_from(completion)
        if lower is not None:
            query = query.where(completion.c.completed_at >= lower)
        if upper is not None:
            query = query.where(completion.c.completed_at < upper)
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
        .where(Tickets.delete_at.is_(None))
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
) -> list[dict]:
    """Completed / total ticket ratio, overall, per task_type, or per creation day/week.

    `x="date"` is a cohort rate: tickets are grouped by creation day, and the rate
    reflects their *current* completion status, not the rate as of that day — same
    caveat get_net_backlog_change already has for its "completed" series.
    """
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)

    cols = [
        func.count(Tickets.uuid).filter(bucket_expr == "completed").label("completed"),
        func.count(Tickets.uuid).label("total"),
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
        .where(Tickets.delete_at.is_(None))
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
) -> list[dict]:
    """Non-completed ticket count bucketed by (now - created_at) age.

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
        .where(Tickets.delete_at.is_(None), bucket_expr != "completed")
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
) -> list[dict]:
    """Avg + median duration (completed_at - created_at) across fulfilled ticket_tasks.

    Task-level per the "these metrics should be based on the task" instruction.
    `x="category"` splits by task_type; no date form (task-level durations aren't
    naturally date-groupable without further design), so `x_granularity` is unused.
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
) -> list[dict]:
    """Per day/week: new tickets, completed tickets, and net = new - completed.

    Always date-grouped regardless of what's passed for `x` — chart_render.py's
    catalog marks this `allowed_x={"date"}`, so resolve() guarantees `x="date"`
    reaches here; `x_granularity` (day/week) is the only thing that actually varies
    this query's shape. "New" is grouped by ticket creation day; "completed" is
    grouped by the day the *last* of a ticket's tasks was fulfilled (when the whole
    ticket finished) — the two series are independent, so a ticket created before the
    window can still show up in "completed" if it finished inside it.

    A fully-fulfilled ticket whose tasks carry no `completed_at` is absent from the
    "completed" series (it has no day to be attributed to) — migration a1b2c3d4e5f6
    backfills those, so in practice the series is complete.
    """
    granularity = resolve_granularity(x_granularity)
    lower, upper = local_bounds(start_date, end_date, tz)
    rollup = _task_rollup_subquery()
    bucket_expr = _bucket_expr(rollup)

    new_period = func.date_trunc(granularity, func.timezone(tz.key, Tickets.created_at))
    new_query = select(new_period.label("x"), func.count(Tickets.uuid).label("new_count")).where(
        Tickets.delete_at.is_(None)
    )
    if lower is not None:
        new_query = new_query.where(Tickets.created_at >= lower)
    if upper is not None:
        new_query = new_query.where(Tickets.created_at < upper)
    new_query = new_query.group_by(new_period)
    new_rows = (await db.execute(new_query)).all()

    ticket_completion = (
        select(Tickets.uuid.label("ticket_uuid"), func.max(TicketTask.completed_at).label("completed_at"))
        .select_from(Tickets)
        .join(rollup, rollup.c.ticket_uuid == Tickets.uuid)
        .join(TicketTask, TicketTask.ticket_uuid == Tickets.uuid)
        .where(
            Tickets.delete_at.is_(None),
            TicketTask.delete_at.is_(None),
            bucket_expr == "completed",
            # See get_ticket_count: a task with no completed_at has no day to land on.
            TicketTask.completed_at.is_not(None),
        )
        .group_by(Tickets.uuid)
        .subquery()
    )
    completed_period = func.date_trunc(
        granularity, func.timezone(tz.key, ticket_completion.c.completed_at)
    )
    completed_query = select(
        completed_period.label("x"),
        func.count(ticket_completion.c.ticket_uuid).label("completed_count"),
    ).select_from(ticket_completion)
    if lower is not None:
        completed_query = completed_query.where(ticket_completion.c.completed_at >= lower)
    if upper is not None:
        completed_query = completed_query.where(ticket_completion.c.completed_at < upper)
    completed_query = completed_query.group_by(completed_period)
    completed_rows = (await db.execute(completed_query)).all()

    by_period: dict = {}
    for row in new_rows:
        by_period.setdefault(row.x, {"x": row.x, "new_count": 0, "completed_count": 0})
        by_period[row.x]["new_count"] = row.new_count
    for row in completed_rows:
        by_period.setdefault(row.x, {"x": row.x, "new_count": 0, "completed_count": 0})
        by_period[row.x]["completed_count"] = row.completed_count

    result = sorted(by_period.values(), key=lambda r: r["x"])
    for row in result:
        row["net_change"] = row["new_count"] - row["completed_count"]
    return result


async def get_task_completion_distribution(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
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


def _duplicate_pair_condition(a, b):
    """Join condition flagging `a` and `b` as likely duplicates.

    Same task_type/disaster_type, within DUPLICATE_DISTANCE_METERS and
    DUPLICATE_TIME_WINDOW_HOURS of each other.
    """
    return and_(
        a.uuid != b.uuid,
        a.delete_at.is_(None), b.delete_at.is_(None),
        a.task_type.is_not(None), a.task_type == b.task_type,
        func.coalesce(a.disaster_type, "") == func.coalesce(b.disaster_type, ""),
        func.ST_DWithin(cast(a.geometry, Geography), cast(b.geometry, Geography), DUPLICATE_DISTANCE_METERS),
        func.abs(func.extract("epoch", a.created_at - b.created_at)) <= DUPLICATE_TIME_WINDOW_HOURS * 3600,
    )


async def get_duplicate_count(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
) -> list[dict]:
    """Count tickets flagged as likely duplicates.

    A ticket is flagged if it has >=1 other ticket sharing task_type/disaster_type
    within the distance/time thresholds above — a context flag, not an urgency signal.
    `x="date"` groups flagged tickets by their own creation day/week; `x="category"`
    by task_type.

    `start_date` and `end_date` are REQUIRED here, unlike every other metric. This is a
    self-join: without a bound it pairs the whole `tickets` table against itself, which
    is O(n^2), and the `::geography` cast means the `gist(geometry)` index can't serve
    the ST_DWithin predicate (it degrades to a join filter). An expression index on
    `(geometry::geography)` doesn't rescue it either — in a disaster-response dataset
    tickets cluster in one area, so nearly every pair genuinely is within the distance
    threshold and the cost is the size of the result set, which no index can prune.
    Bounding the input is the only fix that works. The endpoint layer turns this
    ValueError into a 400; `chart_render.CATALOG` advertises it as `requires_date_range`
    so the frontend can enforce it up front.
    """
    if start_date is None or end_date is None:
        raise ValueError("duplicate_count requires both start_date and end_date")
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)
    a = aliased(Tickets)
    b = aliased(Tickets)

    flagged = (
        select(a.uuid.label("uuid"), a.task_type.label("category"), a.created_at.label("created_at"))
        .select_from(a)
        .join(b, _duplicate_pair_condition(a, b))
        .where(a.delete_at.is_(None))
    )
    if lower is not None:
        flagged = flagged.where(a.created_at >= lower)
    if upper is not None:
        flagged = flagged.where(a.created_at < upper)
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
