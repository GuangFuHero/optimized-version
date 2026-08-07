"""Station analytics aggregation queries backing the Plotly chart endpoints.

Same rationale as ticket_analytics.py: read-only reporting queries, plain SQLAlchemy
Core `select()` statements rather than repository methods, returning plain lists of
dicts for chart_render.py to plot.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geo import Station

CLOSED_OPERATIONAL_STATUSES = ("temporarily_closed", "permanently_closed")


def _local_bounds(
    start_date: date | None, end_date: date | None, tz: ZoneInfo
) -> tuple[datetime | None, datetime | None]:
    """Same local-midnight-to-UTC conversion as ticket_analytics._local_bounds (Part 1.5)."""
    lower = datetime.combine(start_date, time.min, tzinfo=tz) if start_date else None
    upper = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz) if end_date else None
    return lower, upper


async def get_count_by_type(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Count of active stations grouped by `type`."""
    lower, upper = _local_bounds(start_date, end_date, tz)
    query = select(Station.type.label("type"), func.count(Station.uuid).label("count")).where(
        Station.delete_at.is_(None)
    )
    if lower is not None:
        query = query.where(Station.created_at >= lower)
    if upper is not None:
        query = query.where(Station.created_at < upper)
    query = query.group_by(Station.type)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_status_breakdown(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Count of active stations grouped by `operational_status`."""
    lower, upper = _local_bounds(start_date, end_date, tz)
    query = select(
        Station.operational_status.label("operational_status"), func.count(Station.uuid).label("count")
    ).where(Station.delete_at.is_(None))
    if lower is not None:
        query = query.where(Station.created_at >= lower)
    if upper is not None:
        query = query.where(Station.created_at < upper)
    query = query.group_by(Station.operational_status)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_freshness_trend(
    db: AsyncSession, *,
    start_date: date | None, end_date: date | None, group_by: str | None, tz: ZoneInfo,
) -> list[dict]:
    """Per day/week: newly added stations vs newly closed stations.

    "Added" uses `created_at`; "closed" uses `status_changed_at` where
    operational_status is one of CLOSED_OPERATIONAL_STATUSES. Local-day bucketing
    matters here (see Part 1.5), same as get_backlog_trend.
    """
    granularity = "week" if group_by == "week" else "day"
    lower, upper = _local_bounds(start_date, end_date, tz)

    added_period = func.date_trunc(granularity, func.timezone(tz.key, Station.created_at))
    added_query = select(
        added_period.label("period"), func.count(Station.uuid).label("added_count")
    ).where(Station.delete_at.is_(None))
    if lower is not None:
        added_query = added_query.where(Station.created_at >= lower)
    if upper is not None:
        added_query = added_query.where(Station.created_at < upper)
    added_query = added_query.group_by(added_period)
    added_rows = (await db.execute(added_query)).all()

    closed_period = func.date_trunc(granularity, func.timezone(tz.key, Station.status_changed_at))
    closed_query = select(
        closed_period.label("period"), func.count(Station.uuid).label("closed_count")
    ).where(Station.delete_at.is_(None), Station.operational_status.in_(CLOSED_OPERATIONAL_STATUSES))
    if lower is not None:
        closed_query = closed_query.where(Station.status_changed_at >= lower)
    if upper is not None:
        closed_query = closed_query.where(Station.status_changed_at < upper)
    closed_query = closed_query.group_by(closed_period)
    closed_rows = (await db.execute(closed_query)).all()

    by_period: dict = {}
    for row in added_rows:
        by_period.setdefault(row.period, {"period": row.period, "added_count": 0, "closed_count": 0})
        by_period[row.period]["added_count"] = row.added_count
    for row in closed_rows:
        by_period.setdefault(row.period, {"period": row.period, "added_count": 0, "closed_count": 0})
        by_period[row.period]["closed_count"] = row.closed_count

    return sorted(by_period.values(), key=lambda r: r["period"])
