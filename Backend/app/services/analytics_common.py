"""Helpers shared by ticket_analytics.py and station_analytics.py.

Both modules answer the same shape of question (bucket rows by calendar day/week or by
category, over an optional local date range), so the date-bounds/granularity/label
plumbing lives here rather than being copied per domain.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func

# Stand-in label for a NULL category key. A NULL can't be ordered against a str, so it
# would crash chart_render's line-chart sort; giving it a real name also means the chart
# shows an honest "uncategorized" bar instead of a blank one.
UNCATEGORIZED_LABEL = "uncategorized"

# Widest start->end span accepted by ticket_analytics.get_duplicate_count, whose self-join
# grows with the rows in range. With no statement_timeout and no rate limit deployed, this
# cap is the only thing stopping one request from holding a connection indefinitely.
MAX_DUPLICATE_RANGE_DAYS = 120

# Outermost dates local_bounds can convert. Not a domain rule — these are the limits of what
# the conversion and the driver can represent. `end_date + timedelta(days=1)` runs off
# datetime.date at 9999-12-31, and asyncpg encodes a timestamptz via `.astimezone(utc)`
# (pgproto/codecs/datetime.pyx), which underflows for 0001-01-01 under any positive UTC offset,
# so `?start_date=0001-01-01&tz=Asia/Taipei` failed inside the driver rather than here. One day
# of slack at each end covers every zone in tzdata: the widest offset at year 1 is +15:13
# (America/Metlakatla), well under the 24h a full day of slack buys.
MIN_ANALYTICS_DATE = date(1, 1, 2)
MAX_ANALYTICS_DATE = date(9999, 12, 30)


class AnalyticsInputError(ValueError):
    """A bad query parameter; app/api/v1/endpoints/analytics.py turns it into HTTP 400.

    A ValueError subclass so existing `except ValueError` callers still work, but distinct
    enough that the endpoint can 400 on a real client mistake without also blaming the
    caller for an internal bug, which raises a plain ValueError.
    """


def local_bounds(
    start_date: date | None, end_date: date | None, tz: ZoneInfo
) -> tuple[datetime | None, datetime | None]:
    """Convert an inclusive local-calendar date range into a UTC instant range.

    Returns a [start, end) pair suitable for filtering a timestamptz column (see
    Spec/Docs/er-diagram.md Part 1.5: a bare date from the frontend means local midnight
    in `tz`, not UTC midnight).

    Raises AnalyticsInputError outside [MIN_ANALYTICS_DATE, MAX_ANALYTICS_DATE]. FastAPI binds
    both params as bare dates, so the full 0001..9999 range arrives here; the guard belongs in
    this one shared helper rather than on each handler because every metric in both domains
    funnels through it.
    """
    if start_date is not None and start_date < MIN_ANALYTICS_DATE:
        raise AnalyticsInputError(f"start_date must be on or after {MIN_ANALYTICS_DATE}")
    if end_date is not None and end_date > MAX_ANALYTICS_DATE:
        raise AnalyticsInputError(f"end_date must be on or before {MAX_ANALYTICS_DATE}")
    lower = datetime.combine(start_date, time.min, tzinfo=tz) if start_date else None
    upper = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz) if end_date else None
    return lower, upper


def resolve_granularity(x_granularity: str) -> str:
    """Normalize the x_granularity param to a Postgres date_trunc field name."""
    return "week" if x_granularity == "week" else "day"


def category_expr(column):
    """Group-by expression for a nullable category column, with NULLs labelled.

    Use for every `x="category"` grouping on a nullable column — see UNCATEGORIZED_LABEL.
    """
    return func.coalesce(column, UNCATEGORIZED_LABEL)
