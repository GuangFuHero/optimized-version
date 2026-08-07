"""Pydantic schemas for the analytics chart REST API (Plotly HTML endpoints)."""

from enum import Enum

from pydantic import BaseModel


class TicketMetric(str, Enum):
    """Fixed catalog of ticket/task chart metrics — see app/services/ticket_analytics.py."""

    status_breakdown = "status_breakdown"
    completion_rate = "completion_rate"
    age_distribution = "age_distribution"
    time_to_completion = "time_to_completion"
    backlog_trend = "backlog_trend"
    task_completion_distribution = "task_completion_distribution"
    duplicate_count = "duplicate_count"


class StationMetric(str, Enum):
    """Fixed catalog of station chart metrics — see app/services/station_analytics.py."""

    count_by_type = "count_by_type"
    status_breakdown = "status_breakdown"
    freshness_trend = "freshness_trend"


class ChartGroupBy(str, Enum):
    """Grouping dimension a chart can be pivoted on — acts as the chart's X axis.

    Which values are valid for a given metric is enforced by
    app.services.chart_render.CHART_DEFAULTS, not here (some metrics don't support
    grouping at all; day/week only make sense for the trend metrics).
    """

    day = "day"
    week = "week"
    category = "category"


class ChartType(str, Enum):
    """Plotly chart shape.

    See https://plotly.com/python/bar-charts/, https://plotly.com/python/line-charts/,
    https://plotly.com/python/pie-charts/.
    """

    bar = "bar"
    line = "line"
    pie = "pie"


class ChartTheme(str, Enum):
    """Base Plotly template — https://plotly.com/python/templates/."""

    light = "light"
    dark = "dark"


class ChartResponse(BaseModel):
    """A rendered Plotly chart as a partial HTML div (no embedded plotly.js)."""

    html: str
