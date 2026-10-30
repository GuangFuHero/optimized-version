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

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, Integer, and_, case, cast, column, exists, func, or_, select, true, values
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services.analytics_common import (
    DEFAULT_TREND_DAYS,
    MAX_TREND_DAYS,
    AnalyticsInputError,
    category_expr,
    local_bounds,
    resolve_granularity,
)
from app.services.dedup_review import PENDING_STATUSES
from app.services.ticket_status import OPEN_NEED_STATUSES

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
    db: AsyncSession,
    *,
    bucket: str | None,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
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
        query = select(period.label("x"), func.count(drained.c.ticket_uuid).label("count")).select_from(
            drained
        )
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
    db: AsyncSession,
    *,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
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
    db: AsyncSession,
    *,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
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
    db: AsyncSession,
    *,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
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
    db: AsyncSession,
    *,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
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
        query = select(period.label("x"), func.count(exited.c.ticket_uuid).label("count")).select_from(exited)
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
    db: AsyncSession,
    *,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
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


def _as_of_instants(
    x: str | None, start_date: date | None, end_date: date | None, tz: ZoneInfo
) -> list[tuple[date | None, datetime]]:
    """The instants a volunteer metric is read at, each with the local day it stands for.

    A total is read once: at the end of `end_date`, or now. `x="date"` reads at the end of every
    day from `start_date` (default: the last DEFAULT_TREND_DAYS days) to `end_date` (default:
    today), at most MAX_TREND_DAYS of them.
    """
    _, upper = local_bounds(start_date, end_date, tz)  # also checks both dates are in range
    if x != "date":
        return [(None, upper or datetime.now(UTC))]
    end = end_date or datetime.now(tz).date()
    start = start_date or end - timedelta(days=DEFAULT_TREND_DAYS - 1)
    days = (end - start).days + 1
    if days < 1:
        raise AnalyticsInputError("end_date must be on or after start_date")
    if days > MAX_TREND_DAYS:
        raise AnalyticsInputError(f"x=date range must be at most {MAX_TREND_DAYS} days (got {days})")
    return [
        (day, datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz))
        for day in (start + timedelta(days=i) for i in range(days))
    ]


async def get_volunteer_metric(
    db: AsyncSession,
    *,
    metric: str,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Volunteers needed, matched or still missing, as of now, or as of the end of `end_date`.

    Backs 3 y-metrics via a fixed `metric`. Over the needs that give a quantity (a rescue may not)
    and are not canceled or merged into another (a merge cancels the absorbed need):

        needed   -- sum of quantity
        matched  -- task_assignments with status 'accepted' on those needs
        gap      -- sum of quantity - matched, over the needs still recruiting only: open
                    and not stopped by hand. A full or stopped need has no gap.

    `start_date` does not filter: these are running totals, not what was created in a range.
    `x="category"` groups by the ticket's `task_type`. `x="date"` is a daily trend, each day's
    value as of the end of that day (`x_granularity` is ignored).

    The trend is approximate: quantities and statuses have no history. A past day uses today's
    quantity and status, moved only by the timestamps (created_at, completed_at, canceled_at,
    recruiting_stopped_at, assigned_at), so a need reopened or edited since is wrong before the edit.
    """
    instants = _as_of_instants(x, start_date, end_date, tz)
    days = values(column("t", DateTime(timezone=True)), name="days").data([(t,) for _, t in instants])
    t = days.c.t
    needs = (
        select(
            TicketTask.uuid,
            TicketTask.quantity,
            TicketTask.status,
            TicketTask.created_at,
            TicketTask.completed_at,
            TicketTask.canceled_at,
            TicketTask.delete_at,
            TicketTask.recruiting_stopped_at,
            Tickets.task_type,
        )
        .join(Tickets, Tickets.uuid == TicketTask.ticket_uuid)
        .where(TicketTask.quantity.is_not(None), Tickets.delete_at.is_(None), *(extra_filters or []))
        .subquery()
    )
    c = needs.c
    # Standing at `t`: created by then, and not canceled yet (or never).
    not_canceled = and_(c.delete_at.is_(None), c.status != "canceled")
    live = and_(c.created_at < t, or_(c.canceled_at >= t, not_canceled))
    # Recruiting at `t`: standing, not yet filled, not yet stopped. A need canceled since was
    # still recruiting while it stood, which `live` has already checked.
    recruiting = and_(
        live,
        or_(c.status.in_(OPEN_NEED_STATUSES | {"canceled"}), c.completed_at >= t),
        or_(c.recruiting_stopped_at.is_(None), c.recruiting_stopped_at >= t),
    )
    matched = (
        select(func.count(TaskAssignment.uuid))
        .where(
            TaskAssignment.task_uuid == c.uuid,
            TaskAssignment.status == "accepted",
            TaskAssignment.assigned_at < t,
        )
        .scalar_subquery()
    )
    total = {
        "needed": func.sum(c.quantity).filter(live),
        "matched": func.sum(matched).filter(live),
        "gap": func.sum(c.quantity - matched).filter(recruiting),
    }[metric]

    cols = [func.coalesce(cast(total, Integer), 0).label("count")]
    group_cols = []
    if x == "date":
        cols.insert(0, t.label("t"))
        group_cols.append(t)
    elif x == "category":
        category = category_expr(c.task_type)
        cols.insert(0, category.label("x"))
        group_cols.append(category)
    # Outer, so a total with no needs is a 0 and a day with none is a 0; a category with none is no row.
    query = select(*cols).select_from(days).join(needs, true(), isouter=x != "category")
    if group_cols:
        query = query.group_by(*group_cols)

    rows = [dict(row._mapping) for row in await db.execute(query)]
    if x == "date":
        day_of = {t: datetime.combine(day, time.min) for day, t in instants}
        rows = [{"x": day_of[row["t"]], "count": row["count"]} for row in rows]
    return rows


# Duplicate cards about tickets: a ticket card names two tickets, a need card two needs.
_TICKET_PAIR_KINDS = ("ticket", "ticket_task")


async def get_duplicate_count(
    db: AsyncSession,
    *,
    x: str | None,
    x_granularity: str,
    start_date: date | None,
    end_date: date | None,
    tz: ZoneInfo,
    extra_filters: list | None = None,
) -> list[dict]:
    """Count tickets the AI duplicate review has flagged and nobody has settled yet.

    A ticket counts once, however many cards name it, when at least one card about tickets still
    waits for a reviewer (dedup_review.PENDING_STATUSES) and was not resolved by a merge. A need
    card counts the ticket its need belongs to. The date range filters on the card's `created_at`;
    `x="date"` groups a ticket by its earliest such card, `x="category"` by `task_type`.

    Both tickets of a card must be live and inside `extra_filters`: scoping only the counted side
    would flag a ticket as a duplicate of one the caller isn't allowed to see.
    """
    lower, upper = local_bounds(start_date, end_date, tz)
    granularity = resolve_granularity(x_granularity)
    low_need, high_need = aliased(TicketTask), aliased(TicketTask)
    merged = exists().where(
        DedupAuditEvent.pair_uuid == DuplicatePair.uuid, DedupAuditEvent.event_type == "merged"
    )
    # A ticket card's side is the ticket; a need card's is a need, whose ticket is the join's.
    low_ticket = func.coalesce(low_need.ticket_uuid, DuplicatePair.low_uuid)
    high_ticket = func.coalesce(high_need.ticket_uuid, DuplicatePair.high_uuid)
    pairs = (
        select(
            DuplicatePair.created_at.label("created_at"), low_ticket.label("low"), high_ticket.label("high")
        )
        .select_from(DuplicatePair)
        .outerjoin(low_need, low_need.uuid == DuplicatePair.low_uuid)
        .outerjoin(high_need, high_need.uuid == DuplicatePair.high_uuid)
        .where(
            DuplicatePair.delete_at.is_(None),
            DuplicatePair.entity_kind.in_(_TICKET_PAIR_KINDS),
            DuplicatePair.status.in_(PENDING_STATUSES),
            ~merged,
        )
    )
    if lower is not None:
        pairs = pairs.where(DuplicatePair.created_at >= lower)
    if upper is not None:
        pairs = pairs.where(DuplicatePair.created_at < upper)
    in_scope = (
        select(Tickets.uuid).where(Tickets.delete_at.is_(None), *(extra_filters or [])).scalar_subquery()
    )
    pairs = pairs.where(low_ticket.in_(in_scope), high_ticket.in_(in_scope)).subquery()

    sides = (
        select(pairs.c.low.label("ticket_uuid"), pairs.c.created_at)
        .union_all(select(pairs.c.high, pairs.c.created_at))
        .subquery()
    )
    flagged = (
        select(
            sides.c.ticket_uuid,
            Tickets.task_type.label("category"),
            func.min(sides.c.created_at).label("flagged_at"),
        )
        .join(Tickets, Tickets.uuid == sides.c.ticket_uuid)
        .group_by(sides.c.ticket_uuid, Tickets.task_type)
        .subquery()
    )

    cols = [func.count(flagged.c.ticket_uuid).label("count")]
    group_cols = []
    if x == "date":
        period = func.date_trunc(granularity, func.timezone(tz.key, flagged.c.flagged_at))
        cols.insert(0, period.label("x"))
        group_cols.append(period)
    elif x == "category":
        category = category_expr(flagged.c.category)
        cols.insert(0, category.label("x"))
        group_cols.append(category)

    query = select(*cols).select_from(flagged)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]
