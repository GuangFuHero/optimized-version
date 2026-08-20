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


def local_bounds(
    start_date: date | None, end_date: date | None, tz: ZoneInfo
) -> tuple[datetime | None, datetime | None]:
    """Convert an inclusive local-calendar date range into a UTC instant range.

    Returns a [start, end) pair suitable for filtering a timestamptz column (see
    Spec/Docs/er-diagram.md Part 1.5: a bare date from the frontend means local midnight
    in `tz`, not UTC midnight).
    """
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
