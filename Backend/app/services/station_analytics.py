"""Station analytics aggregation queries backing the Plotly chart endpoints.

Same rationale as ticket_analytics.py: read-only reporting queries, plain SQLAlchemy
Core `select()` statements rather than repository methods, returning plain lists of
dicts for chart_render.py to plot. Every function shares the uniform keyword-only
`(db, *, x, x_granularity, start_date, end_date, tz)` signature described in
ticket_analytics.py's module docstring, even where a metric ignores some of those
(get_station_freshness_trend ignores `x`; the others ignore `x_granularity`).
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


def _granularity(x_granularity: str) -> str:
    """Normalize the x_granularity param to a Postgres date_trunc field name."""
    return "week" if x_granularity == "week" else "day"


async def get_station_count(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
) -> list[dict]:
    """Count of active stations, overall or grouped by `type` (x="category")."""
    lower, upper = _local_bounds(start_date, end_date, tz)
    cols = [func.count(Station.uuid).label("count")]
    group_cols = []
    if x == "category":
        cols.insert(0, Station.type.label("x"))
        group_cols.append(Station.type)

    query = select(*cols).where(Station.delete_at.is_(None))
    if lower is not None:
        query = query.where(Station.created_at >= lower)
    if upper is not None:
        query = query.where(Station.created_at < upper)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_station_status_count(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
) -> list[dict]:
    """Count of active stations, overall or grouped by `operational_status` (x="category")."""
    lower, upper = _local_bounds(start_date, end_date, tz)
    cols = [func.count(Station.uuid).label("count")]
    group_cols = []
    if x == "category":
        cols.insert(0, Station.operational_status.label("x"))
        group_cols.append(Station.operational_status)

    query = select(*cols).where(Station.delete_at.is_(None))
    if lower is not None:
        query = query.where(Station.created_at >= lower)
    if upper is not None:
        query = query.where(Station.created_at < upper)
    if group_cols:
        query = query.group_by(*group_cols)

    result = await db.execute(query)
    return [dict(row._mapping) for row in result]


async def get_station_freshness_trend(
    db: AsyncSession, *,
    x: str | None, x_granularity: str, start_date: date | None, end_date: date | None, tz: ZoneInfo,
) -> list[dict]:
    """Per day/week: newly added stations vs newly closed stations.

    Always date-grouped regardless of what's passed for `x` (catalog marks this
    `allowed_x={"date"}`, same forced-shape pattern as get_net_backlog_change).
    "Added" uses `created_at`; "closed" uses `status_changed_at` where
    operational_status is one of CLOSED_OPERATIONAL_STATUSES.
    """
    granularity = _granularity(x_granularity)
    lower, upper = _local_bounds(start_date, end_date, tz)

    added_period = func.date_trunc(granularity, func.timezone(tz.key, Station.created_at))
    added_query = select(
        added_period.label("x"), func.count(Station.uuid).label("added_count")
    ).where(Station.delete_at.is_(None))
    if lower is not None:
        added_query = added_query.where(Station.created_at >= lower)
    if upper is not None:
        added_query = added_query.where(Station.created_at < upper)
    added_query = added_query.group_by(added_period)
    added_rows = (await db.execute(added_query)).all()

    closed_period = func.date_trunc(granularity, func.timezone(tz.key, Station.status_changed_at))
    closed_query = select(
        closed_period.label("x"), func.count(Station.uuid).label("closed_count")
    ).where(Station.delete_at.is_(None), Station.operational_status.in_(CLOSED_OPERATIONAL_STATUSES))
    if lower is not None:
        closed_query = closed_query.where(Station.status_changed_at >= lower)
    if upper is not None:
        closed_query = closed_query.where(Station.status_changed_at < upper)
    closed_query = closed_query.group_by(closed_period)
    closed_rows = (await db.execute(closed_query)).all()

    by_period: dict = {}
    for row in added_rows:
        by_period.setdefault(row.x, {"x": row.x, "added_count": 0, "closed_count": 0})
        by_period[row.x]["added_count"] = row.added_count
    for row in closed_rows:
        by_period.setdefault(row.x, {"x": row.x, "added_count": 0, "closed_count": 0})
        by_period[row.x]["closed_count"] = row.closed_count

    return sorted(by_period.values(), key=lambda r: r["x"])
