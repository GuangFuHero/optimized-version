"""Turns pre-aggregated analytics rows into a Plotly figure, rendered as a partial HTML div.

Rows come from ticket_analytics.py / station_analytics.py. Official Plotly Python
docs: https://plotly.com/python/. This is the only module that
imports `plotly` — everything upstream deals in plain dicts/lists (ADR: keep the
charting library isolated to the render boundary).

X/Y model: `y` picks which metric to compute (see CATALOG below — the same set of
values exposed publicly at `GET /api/v1/analytics/catalog`); `x` picks how to slice it
(`"date"` or `"category"`, or omitted for a single aggregate). Not every (y, x,
chart_type) combination is meaningful — CATALOG records each y-metric's `allowed_x`
and `allowed_chart_types`; `resolve()` is the single place that reconciles a request
against it. `chart_type` is validated strictly (an unsupported chart_type for a given
y is a 400); `x` is *not* — an `x` that doesn't apply is silently dropped rather than
rejected (e.g. requesting `x=date` on a pie-only metric, or `chart_type=pie` together
with `x=date` on a metric that allows both individually but not combined).
"""

import plotly.graph_objects as go

from app.schemas.analytics import ChartStyle
from app.services.analytics_common import MAX_DUPLICATE_RANGE_DAYS, AnalyticsInputError

# --- Y-metric catalog. `label`/`unit`/`description` are the zh-TW glossary the dashboard shows
# (the backend is the only source of these — the frontend must not keep its own copy).
# `allowed_x` is an ordered tuple that may contain None (aggregate/no grouping), "date",
# and/or "category" — ordered because resolve() falls back to its first entry for the
# "forced shape" metrics, the ones that are only meaningful grouped one way.
# `requires_date_range` and `max_range_days` (both optional) mark a metric that refuses an
# unbounded or over-wide query. See GET /api/v1/analytics/catalog for the JSON version. ---

_TICKET_CATALOG = {
    "total_tickets": {
        "label": "任務單總數", "unit": "件", "description": "期間內建立的任務單",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "ongoing_tickets": {
        "label": "進行中", "unit": "件", "description": "已指派、尚未完成",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "unassigned_tickets": {
        "label": "未指派", "unit": "件", "description": "尚無人接手",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "completed_tickets": {
        "label": "已完成", "unit": "件", "description": "子任務全部完成",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "canceled_tickets": {
        "label": "已取消", "unit": "件", "description": "重複、誤報或不再需要",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "completion_rate": {
        "label": "完成率", "unit": "%", "description": "已完成 ÷（總數 − 已取消）",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line"),
    },
    "age_distribution": {
        "label": "未結案等待時間", "unit": "件", "description": "未完成任務單自建立至今的時長",
        "allowed_x": (None,),  # forced shape: always grouped by age bucket internally
        "default_chart_type": "bar", "allowed_chart_types": ("bar",),
    },
    "time_to_completion": {
        "label": "處理時長", "unit": "天", "description": "建立到完成的平均與中位數",
        "allowed_x": (None, "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar",),
    },
    "net_backlog_change": {
        "label": "積壓變化", "unit": "件", "description": "新增 − 完成 − 取消；大於 0 表示待辦增加",
        "allowed_x": ("date",),  # forced shape: always date-grouped
        "default_chart_type": "line", "allowed_chart_types": ("line", "bar"),
    },
    "task_completion_distribution": {
        "label": "子任務完成比例", "unit": "項", "description": "以子任務計，非任務單",
        "allowed_x": (None,),  # forced shape: fixed completed/remaining pie
        "default_chart_type": "pie", "allowed_chart_types": ("pie",),
    },
    "duplicate_count": {
        "label": "疑似重複", "unit": "件", "description": "位置、類型、時間相近的任務單",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "pie"),
        # Self-join, so cost grows with the rows in range; get_duplicate_count rejects a
        # missing or over-wide range. Published here so the frontend can clamp its date
        # picker rather than discovering the limits through a 400.
        "requires_date_range": True,
        "max_range_days": MAX_DUPLICATE_RANGE_DAYS,
    },
}

_STATION_CATALOG = {
    "station_count": {
        "label": "站點數", "unit": "站", "description": "已登錄的資源站點",
        "allowed_x": (None, "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "pie"),
    },
    "station_status_count": {
        "label": "站點狀態", "unit": "站", "description": "營運中／暫停／永久關閉",
        # Forced shape, like station_freshness_trend below: ungrouped, "how many stations
        # per status" collapses to one 100% slice repeating station_count. So "category" is
        # the only allowed value and any other `x` falls back to it.
        "allowed_x": ("category",),
        "default_chart_type": "pie", "allowed_chart_types": ("pie", "bar"),
    },
    "station_freshness_trend": {
        "label": "站點新增與關閉", "unit": "站", "description": "每期新增與關閉的站點數",
        "allowed_x": ("date",),  # forced shape: always date-grouped
        "default_chart_type": "line", "allowed_chart_types": ("line", "bar"),
    },
}

CATALOG = {"tickets": _TICKET_CATALOG, "stations": _STATION_CATALOG}

# Axis-category display names, keyed by the raw values the data layer emits; unlisted values
# (free-text station `type`, age buckets) render as-is. Insertion order is the line-chart
# axis order, so 未分類 stays last.
_CATEGORY_LABEL = {
    "overall": "總計",
    "rescue": "搜救", "supply": "物資", "medical": "醫療", "hr": "人力",
    "active": "營運中", "temporarily_closed": "暫停營運", "permanently_closed": "永久關閉",
    "completed": "已完成", "remaining": "未完成",
    "shelter": "收容所",
    "uncategorized": "未分類",
}
_CATEGORY_ORDER = {k: i for i, k in enumerate(_CATEGORY_LABEL)}

# Per-metric axis rules the style input must not be able to break.
_METRIC_LAYOUT = {
    "completion_rate": {"yaxis": {"tickformat": ".0%"}},
    "net_backlog_change": {"yaxis": {"rangemode": "normal"}},  # net change goes negative
}


def resolve(domain: str, y: str, x: str | None, chart_type: str | None) -> tuple[str | None, str]:
    """Resolve the effective (x, chart_type) for a (domain, y) request.

    Raises AnalyticsInputError for an unknown y or a chart_type outside that metric's
    allowed_chart_types; the endpoint layer turns that into HTTP 400. Never raises over
    `x` — see the module docstring's "ignore, don't reject" rule.
    """
    catalog = CATALOG.get(domain)
    if catalog is None or y not in catalog:
        raise AnalyticsInputError(f"Unknown metric {y!r} for domain {domain!r}")
    spec = catalog[y]

    resolved_chart_type = chart_type or spec["default_chart_type"]
    if resolved_chart_type not in spec["allowed_chart_types"]:
        raise AnalyticsInputError(f"chart_type={resolved_chart_type!r} is not valid for y={y!r}")

    resolved_x = x
    if resolved_chart_type == "pie" and resolved_x == "date":
        resolved_x = None  # a date trend can't be rendered as pie slices
    if resolved_x not in spec["allowed_x"]:
        # Not applicable to this y — ignore rather than reject, falling back to
        # aggregate (None) where that's allowed, or the metric's one *forced* grouping
        # otherwise (e.g. net_backlog_change/station_freshness_trend always group by
        # date — allowed_x={"date"} with no None — so an irrelevant x still lands on
        # "date", not silently ungrouped).
        # allowed_x is an ordered tuple, so the forced-grouping fallback is deterministic
        # (a set would make [0] arbitrary the moment a metric had two forced values).
        resolved_x = None if None in spec["allowed_x"] else spec["allowed_x"][0]

    return resolved_x, resolved_chart_type


# --- Small pivot/plot helpers ---


def _render_pivoted(
    x_values: list, series: dict[str, list], chart_type: str, style: ChartStyle
) -> go.Figure:
    """Build a bar, line, or pie figure from (x_values, {series_name: [y values]}) data.

    Chart type docs: https://plotly.com/python/bar-charts/,
    https://plotly.com/python/line-charts/, https://plotly.com/python/pie-charts/.
    Series colours are not set per trace; they come from layout.colorway (see _layout_for).
    """
    if chart_type == "line":
        # A line connects points in array order and SQL GROUP BY promises none, so sort
        # here. Known categories follow glossary order; dates and free-text keys share the
        # `unknown` rank and sort by value, so dates stay chronological. None sorts last so
        # a stray NULL can't raise TypeError against str/datetime.
        unknown = len(_CATEGORY_ORDER)
        order = sorted(
            range(len(x_values)),
            key=lambda i: (
                x_values[i] is None,
                _CATEGORY_ORDER.get(x_values[i], unknown),
                x_values[i],
            ),
        )
        x_values = [x_values[i] for i in order]
        series = {name: [values[i] for i in order] for name, values in series.items()}
    x_values = [_CATEGORY_LABEL.get(v, v) if isinstance(v, str) else v for v in x_values]

    if chart_type == "pie":
        values = next(iter(series.values())) if series else []
        return go.Figure(go.Pie(
            labels=x_values, values=values, hole=style.pie_hole,
            textinfo="percent", textposition="inside",
            marker={"line": {"color": "#FFFFFF", "width": 2}},
        ))
    fig = go.Figure()
    if chart_type == "line":
        # A single point has no segment to draw, so show the marker there or the chart is
        # blank (e.g. an ungrouped total or a one-day range).
        mode = "lines+markers" if len(x_values) == 1 else "lines"
        for name, values in series.items():
            fig.add_trace(go.Scatter(
                x=x_values, y=values, mode=mode, name=name,
                line={"width": style.line_width, "shape": style.line_shape, "smoothing": 0.4},
            ))
        return fig
    for name, values in series.items():
        fig.add_trace(go.Bar(x=x_values, y=values, name=name))
    if len(series) > 1:
        fig.update_layout(barmode="group")
    return fig


def _layout_for(style: ChartStyle, chart_type: str) -> dict:
    layout = {
        "template": "plotly_white",
        "colorway": style.palette, "piecolorway": style.palette,
        "font": {"family": style.font_family, "size": style.font_size, "color": style.font_color},
        "margin": {
            "l": style.margin.left, "r": style.margin.right,
            "t": style.margin.top, "b": style.margin.bottom,
        },
        "paper_bgcolor": "rgba(0,0,0,0)", "plot_bgcolor": "rgba(0,0,0,0)",
        "hovermode": "closest" if chart_type == "pie" else "x unified",
        "xaxis": {"gridcolor": style.grid_color},
        "yaxis": {"gridcolor": style.grid_color, "rangemode": "tozero"},
    }
    if style.legend == "none":
        layout["showlegend"] = False
    elif style.legend == "bottom":
        layout["legend"] = {"orientation": "h", "x": 0, "y": -0.2}
    return layout


def _fig_count_metric(
    data: list[dict], chart_type: str, style: ChartStyle, *,
    value_key: str = "count", series_label: str = "value",
) -> go.Figure:
    """Shared figure builder for a metric shaped as an aggregate row or grouped rows.

    Accepts either a single aggregate row or a list of {"x": ..., value_key: ...}
    rows. The DATA shape — not the resolved `x` — decides whether this renders grouped or
    aggregate: a row either has an `"x"` key (grouped, however that grouping was
    produced — day/week, task_type, or a forced shape like age_distribution's age
    bucket) or it doesn't (a single overall aggregate). This one function covers every
    y-metric except the multi-series ones (time_to_completion, net_backlog_change,
    station_freshness_trend), which keep their own builders below.
    """
    if data and "x" in data[0]:
        x_values = [row["x"] for row in data]
        y_values = [row[value_key] for row in data]
    else:
        x_values = ["overall"]
        y_values = [data[0][value_key]] if data else [0]
    return _render_pivoted(x_values, {series_label: y_values}, chart_type, style)


# --- Ticket figure builders (one per key in _TICKET_CATALOG). Series names are the
# legend text, so they are zh-TW here rather than translated later. ---


def _fig_total_tickets(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="任務單")


def _fig_ongoing_tickets(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="進行中")


def _fig_unassigned_tickets(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="未指派")


def _fig_completed_tickets(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="已完成")


def _fig_canceled_tickets(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="已取消")


def _fig_completion_rate(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, value_key="rate", series_label="完成率")


def _fig_age_distribution(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="任務單")


def _fig_time_to_completion(data, chart_type, style):
    x_values = [row["x"] for row in data] if data and "x" in data[0] else ["overall"]
    avg_days = [(row["avg_seconds"] or 0) / 86400 for row in data] if data else [0]
    median_days = [(row["median_seconds"] or 0) / 86400 for row in data] if data else [0]
    return _render_pivoted(
        x_values, {"平均（天）": avg_days, "中位數（天）": median_days}, chart_type, style
    )


def _fig_net_backlog_change(data, chart_type, style):
    # The two ways out of the backlog; both are already subtracted in "淨變化".
    x_values = [row["x"] for row in data]
    series = {
        "新增": [row["new_count"] for row in data],
        "完成": [row["completed_count"] for row in data],
        "取消": [row["canceled_count"] for row in data],
        "淨變化": [row["net_change"] for row in data],
    }
    return _render_pivoted(x_values, series, chart_type, style)


def _fig_task_completion_distribution(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="子任務")


def _fig_duplicate_count(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="疑似重複")


# --- Station figure builders (one per key in _STATION_CATALOG) ---


def _fig_station_count(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="站點")


def _fig_station_status_count(data, chart_type, style):
    return _fig_count_metric(data, chart_type, style, series_label="站點")


def _fig_station_freshness_trend(data, chart_type, style):
    x_values = [row["x"] for row in data]
    series = {
        "新增": [row["added_count"] for row in data],
        "關閉": [row["closed_count"] for row in data],
    }
    return _render_pivoted(x_values, series, chart_type, style)


_FIGURE_BUILDERS = {
    "tickets": {
        "total_tickets": _fig_total_tickets,
        "ongoing_tickets": _fig_ongoing_tickets,
        "unassigned_tickets": _fig_unassigned_tickets,
        "completed_tickets": _fig_completed_tickets,
        "canceled_tickets": _fig_canceled_tickets,
        "completion_rate": _fig_completion_rate,
        "age_distribution": _fig_age_distribution,
        "time_to_completion": _fig_time_to_completion,
        "net_backlog_change": _fig_net_backlog_change,
        "task_completion_distribution": _fig_task_completion_distribution,
        "duplicate_count": _fig_duplicate_count,
    },
    "stations": {
        "station_count": _fig_station_count,
        "station_status_count": _fig_station_status_count,
        "station_freshness_trend": _fig_station_freshness_trend,
    },
}


def render_chart(
    domain: str, y: str, data: list[dict], *,
    x: str | None, chart_type: str | None,
    style: ChartStyle | None = None, width: int | None = None, height: int | None = None,
    layout_overrides: dict | None = None,
) -> str:
    """Build a styled Plotly figure for `y` and return it as a partial HTML div.

    No embedded plotly.js — the frontend loads it once. Styling is layered so each
    stage can override the previous one: `style` (ChartStyle; its defaults are the ops
    dashboard's look) sets colorway/font/legend/grid/margin/hover on top of the
    plotly_white template, then the metric's own axis rules (_METRIC_LAYOUT) and a date
    tick format when x=date, then `width`/`height`
    (https://plotly.com/python/setting-graph-size/), then `layout_overrides` — arbitrary
    keys from the Layout reference (https://plotly.com/python/reference/layout/), applied
    via `update_layout(**...)`. A Plotly figure is pure JSON, not executable code, so
    this passthrough is safe; Plotly's own schema validation rejects unknown keys, which
    this function re-raises as AnalyticsInputError for the endpoint layer to return as 400.

    `data` is expected to already reflect the *resolved* `x` (the caller — the
    analytics endpoint — calls resolve() before querying, so the DB grouping and the
    chart grouping always agree). This function re-resolves internally anyway
    (idempotent, harmless) so it stays safe to call standalone.

    Raises AnalyticsInputError on an unknown y, an unsupported chart_type for it, or an
    invalid layout_overrides key.
    """
    style = style or ChartStyle()
    resolved_x, resolved_chart_type = resolve(domain, y, x, chart_type)
    fig = _FIGURE_BUILDERS[domain][y](data, resolved_chart_type, style)

    fig.update_layout(**_layout_for(style, resolved_chart_type))
    fig.update_layout(**_METRIC_LAYOUT.get(y, {}))
    if resolved_x == "date":
        fig.update_layout(xaxis={"tickformat": "%m/%d", "hoverformat": "%Y-%m-%d"})
    if width is not None or height is not None:
        fig.update_layout(width=width, height=height)
    if layout_overrides:
        # The only caller-supplied data here, so the only thing that can fail through no
        # fault of ours. Re-raised as AnalyticsInputError to keep the 400; a bare ValueError
        # escaping this function means our own bug, and is left to surface as a 500.
        try:
            fig.update_layout(**layout_overrides)
        except ValueError as err:
            raise AnalyticsInputError(f"invalid layout_overrides: {err}") from err

    # plotly.io.to_html reference: https://plotly.com/python-api-reference/generated/plotly.io.to_html.html
    return fig.to_html(
        full_html=False, include_plotlyjs=False,
        config={"displayModeBar": style.modebar, "responsive": True},
    )
