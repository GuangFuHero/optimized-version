"""Pydantic schemas for the analytics chart REST API (Plotly figure and series JSON).

See app/services/chart_render.py for the full x/y model this API exposes, and
GET /api/v1/analytics/catalog (CatalogResponse below) for its machine-readable form.
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class TicketYMetric(str, Enum):
    """What to measure (the Y axis) for a ticket/task chart — see app/services/ticket_analytics.py."""

    total_tickets = "total_tickets"
    ongoing_tickets = "ongoing_tickets"
    unassigned_tickets = "unassigned_tickets"
    completed_tickets = "completed_tickets"
    canceled_tickets = "canceled_tickets"
    completion_rate = "completion_rate"
    age_distribution = "age_distribution"
    time_to_completion = "time_to_completion"
    net_backlog_change = "net_backlog_change"
    task_completion_distribution = "task_completion_distribution"
    duplicate_count = "duplicate_count"
    volunteers_needed = "volunteers_needed"
    volunteers_matched = "volunteers_matched"
    volunteer_gap = "volunteer_gap"


class StationYMetric(str, Enum):
    """What to measure (the Y axis) for a station chart — see app/services/station_analytics.py."""

    station_count = "station_count"
    station_status_count = "station_status_count"
    station_freshness_trend = "station_freshness_trend"
    operating_station_count = "operating_station_count"


class TicketTaskType(str, Enum):
    """A ticket's task type, for the `task_type` filter — the kinds in app.services.ticket.TASK_TYPES."""

    rescue = "rescue"
    supply = "supply"
    medical = "medical"
    hr = "hr"


class TicketStatus(str, Enum):
    """A ticket's status, for the ticket `status` filter."""

    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class StationStatus(str, Enum):
    """A station's operational status, for the station `status` filter."""

    active = "active"
    temporarily_closed = "temporarily_closed"
    permanently_closed = "permanently_closed"


class ChartX(str, Enum):
    """How to slice the chosen y-metric (the X axis).

    Omit this param entirely for a single aggregate value/pie. A value the chosen y-metric
    does not allow is a 422. See GET /api/v1/analytics/catalog for which x values are
    valid per y-metric.
    """

    date = "date"
    category = "category"


class ChartXGranularity(str, Enum):
    """Bucket size when x=date. Ignored otherwise, and by a metric whose catalog entry lacks it."""

    day = "day"
    week = "week"


class ChartType(str, Enum):
    """Plotly chart shape.

    See https://plotly.com/python/bar-charts/, https://plotly.com/python/line-charts/,
    https://plotly.com/python/pie-charts/. An unsupported chart_type for the chosen
    y-metric is a 400 — see GET /analytics/catalog for each metric's allowed_chart_types.
    """

    bar = "bar"
    line = "line"
    pie = "pie"


HexColor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]


class ChartMargin(BaseModel):
    """Figure margins in px — the space around the plot area for axis labels and legend."""

    model_config = ConfigDict(extra="forbid")

    left: int = Field(48, ge=0)
    right: int = Field(16, ge=0)
    top: int = Field(8, ge=0)
    bottom: int = Field(40, ge=0)


class ChartStyle(BaseModel):
    """Presentation knobs for a rendered chart; defaults reproduce the ops dashboard mock.

    Passed JSON-encoded as the `style` query param. Anything not covered here goes through
    `layout_overrides`, which is applied after this and wins.
    """

    model_config = ConfigDict(extra="forbid")

    palette: list[HexColor] = Field(
        default=["#E3791E", "#2592B9", "#2E7D32", "#8B5CF6", "#D32F2F", "#62BADA", "#F57C00", "#64748B"],
        min_length=1,
        description="Series colours, cycled in trace order (Plotly `colorway`/`piecolorway`).",
    )
    font_family: str = "Inter, Noto Sans TC, sans-serif"
    font_size: int = Field(12, ge=6, le=48)
    font_color: HexColor = "#475569"
    grid_color: HexColor = "#EDF2F7"
    legend: Literal["bottom", "right", "none"] = "bottom"
    line_width: float = Field(2.5, gt=0)
    line_shape: Literal["spline", "linear"] = "spline"
    pie_hole: float = Field(0.5, ge=0, lt=1, description="0 for a full pie, up to <1 for a donut.")
    margin: ChartMargin = ChartMargin()
    modebar: bool = Field(False, description="Show Plotly's hover toolbar (zoom/pan/download).")


class ChartResponse(BaseModel):
    """A Plotly figure as JSON, drawn with `Plotly.react(element, response)`.

    The frontend owns the element and its size; nothing in here is HTML or script.
    """

    data: list[dict[str, Any]] = Field(
        description="Plotly traces (https://plotly.com/javascript/reference/)."
    )
    layout: dict[str, Any] = Field(description="Plotly layout, with `style` and `layout_overrides` applied.")
    config: dict[str, Any] = Field(description="Plotly config: modebar visibility and responsive resizing.")


class ChartSeries(BaseModel):
    """One line, bar group or pie of a chart."""

    name: str = Field(description="Legend text (zh-TW), e.g. '任務單' or '平均（天）'.")
    values: list[int | float] = Field(
        description="One per `x_values` entry, in the metric's catalog `unit`; completion_rate is 0–100."
    )


class DataResponse(BaseModel):
    """The numbers a chart of the metric plots, for a frontend that draws its own."""

    x: str | None = Field(
        description="The grouping actually applied: 'date', 'category', 'age_bucket' or 'completion' "
        "(the two metrics with a built-in grouping), or null for one aggregate. "
        "It differs from the request only when `x` is omitted on a metric with a built-in grouping."
    )
    x_values: list[str | datetime | None] = Field(
        description="Axis values in display order: bucket starts as wall-clock time in the request's `tz`, "
        "with no UTC offset, when x is 'date'; otherwise category or bucket names (zh-TW where the glossary "
        "has them), or ['總計'] for an aggregate."
    )
    series: list[ChartSeries]


class ValueResponse(BaseModel):
    """A metric's single ungrouped aggregate — the number a KPI card shows."""

    value: int | float = Field(description="In the metric's catalog `unit`; completion_rate is 0–100.")


class YMetricSpec(BaseModel):
    """One y-metric's display glossary plus its valid x-axis values and chart types.

    The machine-readable form of app.services.chart_render.resolve()'s rules — build
    x/y dropdowns from this instead of hardcoding the catalog client-side.
    """

    label: str = Field(description="Display name (zh-TW).")
    unit: str = Field(description="Unit of the `/value` and `/data` numbers, e.g. '件', '%', '天'.")
    description: str = Field(description="One-line explanation of what the metric measures.")
    allowed_x: list[str] = Field(
        description="Valid values for the `x` query param on this y-metric: any of "
        "'date', 'category', 'none' (aggregate/no grouping — omit `x` entirely). An "
        "`x` outside this list is rejected with 422; omitting `x` gives 'none', or this "
        "metric's forced value if 'none' isn't in the list."
    )
    allowed_x_granularities: list[str] = Field(
        description="Bucket sizes `x_granularity` can take for this y-metric's `x=date` trend. A "
        "size outside this list is not rejected: the trend is drawn at the first one listed."
    )
    default_chart_type: str = Field(description="chart_type used when the param is omitted.")
    allowed_chart_types: list[str] = Field(
        description="Valid values for `chart_type` on this y-metric; an unsupported one is rejected with 400."
    )
    requires_date_range: bool = Field(
        description="When true, `start_date` and `end_date` are mandatory for this "
        "y-metric and omitting either is a 400. No metric needs it now; the field stays "
        "so existing clients keep reading it."
    )
    max_range_days: int | None = Field(
        default=None,
        description="Most days, both ends included, between `start_date` and `end_date` for this "
        "y-metric's `x=date` trend; a longer range is a 400. Null means no limit. It applies "
        "whether or not `requires_date_range` is set, so read it on its own to clamp the date picker.",
    )


class FilterOption(BaseModel):
    """One allowed value of a filter, with the zh-TW name to show for it."""

    value: str = Field(description="What to send as the query param.")
    label: str = Field(description="Display name (zh-TW); the value itself when it has no glossary entry.")


class AreaTown(BaseModel):
    """A 鄉鎮市區 and the 村里 in it."""

    town: str
    villages: list[str]


class AreaCounty(BaseModel):
    """A 縣市 and the 鄉鎮市區 in it."""

    county: str
    towns: list[AreaTown]


class DomainFilters(BaseModel):
    """The values a domain's filter params accept, drawn from the rows the caller may chart."""

    types: list[FilterOption] = Field(
        description="Values for `task_type` (tickets) or `station_type` (stations)."
    )
    statuses: list[FilterOption] = Field(description="Values for `status`.")
    areas: list[AreaCounty] = Field(
        description="Values for `county`, `town` and `village`. A 村里 name can repeat across "
        "towns, so send `town` (and `county`) with it to pin one."
    )


class CatalogResponse(BaseModel):
    """The full y-metric catalog, per domain — source of truth for GET /analytics/catalog."""

    tickets: dict[str, YMetricSpec]
    stations: dict[str, YMetricSpec]
    filters: dict[str, DomainFilters] = Field(
        description="Allowed filter values per domain ('tickets', 'stations')."
    )
    default_style: ChartStyle = Field(
        description="What the chart endpoints render with when `style` is omitted."
    )
