"""Ticket/task analytics aggregation queries backing the Plotly chart endpoints.

Read-only reporting queries spanning tickets + ticket_tasks + task_assignments — they
don't map to a single entity's CRUD, so they live here as plain SQLAlchemy Core
`select()` statements rather than repository methods (ADR-015 keeps repositories pure
per-entity CRUD). Each function returns plain lists of dicts; chart_render.py turns
that into a Plotly figure.

Per Spec/Docs/er-diagram.md, a ticket has no status of its own that reflects work
progress at the granularity we need here, so every metric below classifies a ticket by
rolling up its `ticket_tasks` (and their `task_assignments`) rather than reading
`tickets.status` directly:

    unassigned  -- zero task_assignments across all of the ticket's tasks (no match yet)
    completed   -- >=1 task, and every non-canceled task.status == 'fulfilled'
    ongoing     -- otherwise (>=1 assignment, not fully fulfilled)
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from geoalchemy2 import Geography
from sqlalchemy import and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask

# Duplicate-detection thresholds (ADR: "context flag, not urgency" — tunable, not user-facing).
DUPLICATE_DISTANCE_METERS = 200
DUPLICATE_TIME_WINDOW_HOURS = 24


def _local_bounds(
    start_date: date | None, end_date: date | None, tz: ZoneInfo
) -> tuple[datetime | None, datetime | None]:
    """Convert an inclusive local-calendar date range into a UTC instant range.

    Returns a [start, end) pair suitable for filtering a timestamptz column (see Part
    1.5: a bare date from the frontend means local midnight in `tz`, not UTC midnight).
    """
    lower = datetime.combine(start_date, time.min, tzinfo=tz) if start_date else None
    upper = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz) if end_date else None
    return lower, upper


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


async def get_status_breakdown(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Ticket count per bucket (unassigned/ongoing/completed), optionally split by task_type."""
    rollup = _task_rollup_subquery()
    bucket = _bucket_expr(rollup)
    lower, upper = _local_bounds(start_date, end_date, tz)

    cols = [bucket.label("bucket"), func.count(Tickets.uuid).label("count")]
    group_cols = [bucket]
    if group_by == "category":
        cols.insert(1, Tickets.task_type.label("category"))
        group_cols.append(Tickets.task_type)

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
    query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_completion_rate(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Completed / total ticket ratio, overall or per task_type."""
    rollup = _task_rollup_subquery()
    bucket = _bucket_expr(rollup)
    lower, upper = _local_bounds(start_date, end_date, tz)

    cols = [
        func.count(Tickets.uuid).filter(bucket == "completed").label("completed"),
        func.count(Tickets.uuid).label("total"),
    ]
    group_cols = []
    if group_by == "category":
        cols.insert(0, Tickets.task_type.label("category"))
        group_cols.append(Tickets.task_type)

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


async def get_age_distribution(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Non-completed ticket count bucketed by (now() - created_at) age.

    Duration-based, so `tz` is accepted (for start_date/end_date filtering, per Part
    1.5) but doesn't affect the age buckets themselves — a duration is the same in any
    timezone.
    """
    rollup = _task_rollup_subquery()
    bucket = _bucket_expr(rollup)
    lower, upper = _local_bounds(start_date, end_date, tz)

    age_hours = func.extract("epoch", func.now() - Tickets.created_at) / 3600.0
    age_bucket = case(
        (age_hours < 24, "<24h"),
        (age_hours < 48, "24-48h"),
        (age_hours < 72, "48-72h"),
        else_=">72h",
    )

    cols = [age_bucket.label("age_bucket"), func.count(Tickets.uuid).label("count")]
    group_cols = [age_bucket]
    if group_by == "category":
        cols.insert(1, Tickets.task_type.label("category"))
        group_cols.append(Tickets.task_type)

    query = (
        select(*cols)
        .select_from(Tickets)
        .outerjoin(rollup, rollup.c.ticket_uuid == Tickets.uuid)
        .where(Tickets.delete_at.is_(None), bucket != "completed")
    )
    if lower is not None:
        query = query.where(Tickets.created_at >= lower)
    if upper is not None:
        query = query.where(Tickets.created_at < upper)
    query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_time_to_completion(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Avg + median duration (completed_at - created_at) across fulfilled ticket_tasks.

    Task-level per the "these metrics should be based on the task" instruction.
    Duration-based like age_distribution — `tz` only affects the start/end filter.
    """
    lower, upper = _local_bounds(start_date, end_date, tz)
    duration = func.extract("epoch", TicketTask.completed_at - TicketTask.created_at)

    cols = [
        func.avg(duration).label("avg_seconds"),
        func.percentile_cont(0.5).within_group(duration).label("median_seconds"),
        func.count(TicketTask.uuid).label("sample_size"),
    ]
    group_cols = []
    if group_by == "category":
        cols.insert(0, TicketTask.task_type.label("category"))
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


async def get_backlog_trend(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Per day/week: new tickets, completed tickets, and net = new - completed.

    The only ticket metric where local-day bucketing matters (see Part 1.5) — day/week
    boundaries are computed in `tz`, not UTC, via `date_trunc(..., timezone(tz, col))`.
    "New" is grouped by ticket creation day; "completed" is grouped by the day the
    *last* of a ticket's tasks was fulfilled (when the whole ticket finished) — the two
    series are independent, so a ticket created before the window can still show up in
    "completed" if it finished inside it.
    """
    granularity = "week" if group_by == "week" else "day"
    lower, upper = _local_bounds(start_date, end_date, tz)
    rollup = _task_rollup_subquery()
    bucket = _bucket_expr(rollup)

    new_period = func.date_trunc(granularity, func.timezone(tz.key, Tickets.created_at))
    new_query = select(new_period.label("period"), func.count(Tickets.uuid).label("new_count")).where(
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
        .where(Tickets.delete_at.is_(None), TicketTask.delete_at.is_(None), bucket == "completed")
        .group_by(Tickets.uuid)
        .subquery()
    )
    completed_period = func.date_trunc(
        granularity, func.timezone(tz.key, ticket_completion.c.completed_at)
    )
    completed_query = select(
        completed_period.label("period"),
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
        by_period.setdefault(row.period, {"period": row.period, "new_count": 0, "completed_count": 0})
        by_period[row.period]["new_count"] = row.new_count
    for row in completed_rows:
        by_period.setdefault(row.period, {"period": row.period, "new_count": 0, "completed_count": 0})
        by_period[row.period]["completed_count"] = row.completed_count

    result = sorted(by_period.values(), key=lambda r: r["period"])
    for row in result:
        row["net_change"] = row["new_count"] - row["completed_count"]
    return result


async def get_task_completion_distribution(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Completed vs remaining tasks across all tickets in range (task-level, not per-ticket)."""
    lower, upper = _local_bounds(start_date, end_date, tz)
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
        {"label": "completed", "count": completed},
        {"label": "remaining", "count": max(total - completed, 0)},
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
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Count tickets flagged as likely duplicates.

    A ticket is flagged if it has >=1 other ticket sharing task_type/disaster_type
    within the distance/time thresholds above — a context flag, not an urgency signal.
    """
    lower, upper = _local_bounds(start_date, end_date, tz)
    a = aliased(Tickets)
    b = aliased(Tickets)

    flagged = (
        select(a.uuid.label("uuid"), a.task_type.label("category"))
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
    if group_by == "category":
        cols.insert(0, flagged.c.category.label("category"))
        group_cols.append(flagged.c.category)

    query = select(*cols).select_from(flagged)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]
