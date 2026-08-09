"""Pydantic schemas for the analytics chart REST API (Plotly HTML endpoints).

See app/services/chart_render.py for the full x/y model this API exposes, and
GET /api/v1/analytics/catalog (CatalogResponse below) for its machine-readable form.
"""

from enum import Enum

from pydantic import BaseModel, Field


class TicketYMetric(str, Enum):
    """What to measure (the Y axis) for a ticket/task chart — see app/services/ticket_analytics.py."""

    total_tickets = "total_tickets"
    ongoing_tickets = "ongoing_tickets"
    unassigned_tickets = "unassigned_tickets"
    completed_tickets = "completed_tickets"
    completion_rate = "completion_rate"
    age_distribution = "age_distribution"
    time_to_completion = "time_to_completion"
    net_backlog_change = "net_backlog_change"
    task_completion_distribution = "task_completion_distribution"
    duplicate_count = "duplicate_count"


class StationYMetric(str, Enum):
    """What to measure (the Y axis) for a station chart — see app/services/station_analytics.py."""

    station_count = "station_count"
    station_status_count = "station_status_count"
    station_freshness_trend = "station_freshness_trend"


class ChartX(str, Enum):
    """How to slice the chosen y-metric (the X axis).

    Omit this param entirely for a single aggregate value/pie. Whether a given value
    is valid for a given y-metric is enforced by app.services.chart_render.resolve()
    — an inapplicable x is silently ignored (falls back to aggregate, or to the
    metric's forced grouping if it has one), never rejected. See GET
    /api/v1/analytics/catalog for which x values are valid per y-metric.
    """

    date = "date"
    category = "category"


class ChartXGranularity(str, Enum):
    """Bucket size when x=date. Ignored otherwise."""

    day = "day"
    week = "week"


class ChartType(str, Enum):
    """Plotly chart shape.

    See https://plotly.com/python/bar-charts/, https://plotly.com/python/line-charts/,
    https://plotly.com/python/pie-charts/. Unlike `x`, an unsupported chart_type for
    the chosen y-metric is a 400, not silently ignored — see GET /analytics/catalog
    for each metric's allowed_chart_types.
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


class YMetricSpec(BaseModel):
    """One y-metric's valid x-axis values and chart types.

    The machine-readable form of app.services.chart_render.resolve()'s rules — build
    x/y dropdowns from this instead of hardcoding the catalog client-side.
    """

    allowed_x: list[str] = Field(
        description="Valid values for the `x` query param on this y-metric: any of "
        "'date', 'category', 'none' (aggregate/no grouping — omit `x` entirely). An "
        "`x` outside this list is silently ignored (falls back to 'none', or to this "
        "metric's forced value if 'none' isn't in the list), never rejected with 400."
    )
    default_chart_type: str = Field(description="chart_type used when the param is omitted.")
    allowed_chart_types: list[str] = Field(
        description="Valid values for `chart_type` on this y-metric — unlike `x`, an "
        "unsupported chart_type is rejected with 400."
    )


class CatalogResponse(BaseModel):
    """The full y-metric catalog, per domain — source of truth for GET /analytics/catalog."""

    tickets: dict[str, YMetricSpec]
    stations: dict[str, YMetricSpec]
