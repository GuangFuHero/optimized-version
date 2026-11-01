"""Turns pre-aggregated analytics rows into chart series, and those into Plotly figure JSON.

This is the only module that imports `plotly` (https://plotly.com/python/), so everything
upstream deals in plain dicts and lists.

X/Y model: `y` picks which metric to compute (see CATALOG below — the same set of
values exposed publicly at `GET /api/v1/analytics/catalog`); `x` picks how to slice it
(`"date"` or `"category"`, or omitted for a single aggregate). Not every (y, x,
chart_type) combination is meaningful — CATALOG records each y-metric's `allowed_x`
and `allowed_chart_types`; `resolve()` is the single place that reconciles a request
against it. `chart_type` is validated strictly (an unsupported chart_type for a given
y is a 400), and so is an `x` the metric's `allowed_x` lacks (the endpoint layer, a 422). Only
two cases are reconciled rather than rejected: an omitted `x` on a forced-shape metric, and
`chart_type=pie` together with `x=date`, which has no pie form.

For a ticket-level metric, `"category"` is the type of each of the ticket's live needs: a ticket
counts once per type, so the categories can sum to more than the total.
"""

import html
import json
from functools import partial

import plotly.graph_objects as go

from app.schemas.analytics import ChartStyle
from app.services.analytics_common import MAX_TREND_DAYS, AnalyticsInputError

# --- Y-metric catalog. `label`/`unit`/`description` are the zh-TW glossary the dashboard shows
# (the backend is the only source of these — the frontend must not keep its own copy).
# `allowed_x` is an ordered tuple that may contain None (aggregate/no grouping), "date",
# and/or "category" — ordered because resolve() falls back to its first entry for the
# "forced shape" metrics, the ones that are only meaningful grouped one way.
# `requires_date_range` and `max_range_days` (both optional) mark a metric that refuses an
# unbounded or over-wide query; `allowed_x_granularities` (optional, day and week by default)
# lists the bucket sizes its `x=date` trend honours. See GET /api/v1/analytics/catalog for the JSON version.
# Descriptions say what the dashboard shows: it opens on the last 30 days, so a metric over a
# range says so, and a running total says it counts up to today. ---

_TICKET_CATALOG = {
    "total_tickets": {
        "label": "任務單總數",
        "unit": "件",
        "description": "期間內建立的任務單；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line", "pie"),
    },
    "ongoing_tickets": {
        "label": "進行中",
        "unit": "件",
        "description": "已指派、尚未完成；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line", "pie"),
    },
    "unassigned_tickets": {
        "label": "未指派",
        "unit": "件",
        "description": "尚無人接手；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line", "pie"),
    },
    "completed_tickets": {
        "label": "已完成",
        "unit": "件",
        "description": "需求都已額滿、停止招募或刪除；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line", "pie"),
    },
    "canceled_tickets": {
        "label": "已取消",
        "unit": "件",
        "description": "重複、誤報或不再需要；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line", "pie"),
    },
    "completion_rate": {
        "label": "完成率",
        "unit": "%",
        "description": "已完成 ÷（總數 − 已取消）；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line"),
    },
    "age_distribution": {
        "label": "未結案等待時間",
        "unit": "件",
        "description": "未完成任務單自建立至今的時長；預設近 30 天",
        "allowed_x": (None,),  # forced shape: always grouped by age bucket internally
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar",),
        "grouping": "age_bucket",  # /data's `x`, since x=None still returns grouped rows
    },
    "time_to_completion": {
        "label": "處理時長",
        "unit": "天",
        "description": "建立到完成的平均與中位數；預設近 30 天",
        "allowed_x": (None, "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar",),
    },
    "net_backlog_change": {
        "label": "積壓變化",
        "unit": "件",
        "description": "新增 − 完成 − 取消；大於 0 表示待辦增加；預設近 30 天",
        "allowed_x": ("date",),  # forced shape: always date-grouped
        "default_chart_type": "line",
        "allowed_chart_types": ("line", "bar"),
    },
    "task_completion_distribution": {
        "label": "子任務完成比例",
        "unit": "項",
        "description": "以子任務計，非任務單；預設近 30 天",
        "allowed_x": (None,),  # forced shape: fixed completed/remaining pie
        "default_chart_type": "pie",
        "allowed_chart_types": ("pie",),
        "grouping": "completion",  # /data's `x`, since x=None still returns grouped rows
    },
    "duplicate_count": {
        "label": "疑似重複的單",
        "unit": "件",
        "description": "AI 重複審核標出、還沒審完的任務單，一張只算一次；預設近 30 天",
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "pie"),
    },
    "volunteers_needed": {
        "label": "志工需求人數",
        "unit": "人",
        "description": "未取消任務的志工需求人數加總（沒填人數的不計）；截至查詢期間最後一天，未指定則為今日",
        "allowed_x": (None, "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "pie"),
    },
    "volunteers_matched": {
        "label": "已媒合志工人數",
        "unit": "人",
        "description": (
            "未取消任務上所有志工的人數，含已出發與已完成（沒填人數的任務不計）；"
            "截至查詢期間最後一天，未指定則為今日"
        ),
        "allowed_x": (None, "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "pie"),
    },
    "volunteer_gap": {
        "label": "志工缺口",
        "unit": "人",
        "description": (
            "還在招募的任務尚缺幾人；截至查詢期間最後一天，未指定則為今日。"
            "趨勢固定按天，為每天結束時的缺口，依異動紀錄還原當天的任務與志工"
        ),
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "line", "pie"),
        # The trend is one point per day whatever x_granularity says, so only day is published.
        "allowed_x_granularities": ("day",),
        # Only the daily trend is capped; the other shapes read one instant.
        "max_range_days": MAX_TREND_DAYS,
    },
}

_STATION_CATALOG = {
    "station_count": {
        "label": "站點數",
        "unit": "站",
        "description": "已登錄的資源站點；預設近 30 天",
        "allowed_x": (None, "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "pie"),
    },
    "station_status_count": {
        "label": "站點狀態",
        "unit": "站",
        "description": "營運中／暫停／永久關閉；預設近 30 天",
        # Forced shape, like station_freshness_trend below: ungrouped, "how many stations
        # per status" collapses to one 100% slice repeating station_count. So "category" is
        # the only allowed value and any other `x` falls back to it.
        "allowed_x": ("category",),
        "default_chart_type": "pie",
        "allowed_chart_types": ("pie", "bar"),
    },
    "station_freshness_trend": {
        "label": "站點新增與關閉",
        "unit": "站",
        "description": "每期新增與關閉的站點數；預設近 30 天",
        "allowed_x": ("date",),  # forced shape: always date-grouped
        "default_chart_type": "line",
        "allowed_chart_types": ("line", "bar"),
    },
    "operating_station_count": {
        "label": "營運中站點數",
        "unit": "站",
        "description": "目前營運中的站點，不受日期影響",
        "allowed_x": (None, "category"),
        "default_chart_type": "bar",
        "allowed_chart_types": ("bar", "pie"),
    },
}

CATALOG = {"tickets": _TICKET_CATALOG, "stations": _STATION_CATALOG}

# Axis-category display names, keyed by the raw values the data layer emits; unlisted values
# (free-text station `type`, age buckets) render as-is. Insertion order is the line-chart
# axis order, so 未分類 stays last.
_CATEGORY_LABEL = {
    "overall": "總計",
    "rescue": "搜救",
    "supply": "物資",
    "medical": "醫療",
    "hr": "人力",
    "active": "營運中",
    "temporarily_closed": "暫停營運",
    "permanently_closed": "永久關閉",
    "completed": "已完成",
    "remaining": "未完成",
    "shelter": "收容所",
    "water": "加水",
    "shower": "洗澡",
    "toilet": "廁所",
    "transport": "交通",
    "gas_station": "加油",
    "charge": "充電",
    "power": "發電",
    "cellular": "通訊",
    "pending": "待處理",
    "in_progress": "進行中",
    "cancelled": "已取消",
    "uncategorized": "未分類",
}
_CATEGORY_ORDER = {k: i for i, k in enumerate(_CATEGORY_LABEL)}


def display_name(value: str) -> str:
    """The zh-TW name for a raw category or option value, or the value itself when it has none."""
    return _CATEGORY_LABEL.get(value, value)


# Per-metric axis rules the style input must not be able to break.
_METRIC_LAYOUT = {
    "completion_rate": {"yaxis": {"tickformat": ".0%"}},
    "net_backlog_change": {"yaxis": {"rangemode": "normal"}},  # net change goes negative
}


def resolve(domain: str, y: str, x: str | None, chart_type: str | None) -> tuple[str | None, str]:
    """Resolve the effective (x, chart_type) for a (domain, y) request.

    Raises AnalyticsInputError for an unknown y or a chart_type outside that metric's
    allowed_chart_types; the endpoint layer turns that into HTTP 400. An `x` outside
    allowed_x is refused before this runs, so what is reconciled here is only an omitted `x`
    and the pie-with-date combination.
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
        # An omitted x falls back to aggregate (None) where that's allowed, or the metric's one
        # *forced* grouping otherwise (e.g. net_backlog_change/station_freshness_trend always
        # group by date — allowed_x={"date"} with no None — so no x still lands on "date").
        # allowed_x is an ordered tuple, so the forced-grouping fallback is deterministic
        # (a set would make [0] arbitrary the moment a metric had two forced values).
        resolved_x = None if None in spec["allowed_x"] else spec["allowed_x"][0]

    return resolved_x, resolved_chart_type


# --- Series builders: rows -> (x values, {series name: values}). Series names are the
# legend text, so they are zh-TW here rather than translated later. ---


def _count_series(
    data: list[dict], *, value_key: str = "count", series_label: str
) -> tuple[list, dict[str, list]]:
    """One series, from a single aggregate row or from rows of {"x": ..., value_key: ...}."""
    return _x_values(data), {series_label: [row[value_key] for row in data]}


def _x_values(data: list[dict]) -> list:
    """The rows' "x" keys, or the one "overall" point of an aggregate.

    An ungrouped query always returns exactly one row without "x", so no rows means a grouping
    that matched nothing, not a zero total.
    """
    return [row["x"] for row in data] if not data or "x" in data[0] else ["overall"]


def _time_to_completion_series(data):
    return _x_values(data), {
        "平均（天）": [(row["avg_seconds"] or 0) / 86400 for row in data],
        "中位數（天）": [(row["median_seconds"] or 0) / 86400 for row in data],
    }


def _net_backlog_change_series(data):
    # The two ways out of the backlog; both are already subtracted in "淨變化".
    return [row["x"] for row in data], {
        "新增": [row["new_count"] for row in data],
        "完成": [row["completed_count"] for row in data],
        "取消": [row["canceled_count"] for row in data],
        "淨變化": [row["net_change"] for row in data],
    }


def _station_freshness_trend_series(data):
    return [row["x"] for row in data], {
        "新增": [row["added_count"] for row in data],
        "關閉": [row["closed_count"] for row in data],
    }


_SERIES_BUILDERS = {
    "tickets": {
        "total_tickets": partial(_count_series, series_label="任務單"),
        "ongoing_tickets": partial(_count_series, series_label="進行中"),
        "unassigned_tickets": partial(_count_series, series_label="未指派"),
        "completed_tickets": partial(_count_series, series_label="已完成"),
        "canceled_tickets": partial(_count_series, series_label="已取消"),
        "completion_rate": partial(_count_series, value_key="rate", series_label="完成率"),
        "age_distribution": partial(_count_series, series_label="任務單"),
        "time_to_completion": _time_to_completion_series,
        "net_backlog_change": _net_backlog_change_series,
        "task_completion_distribution": partial(_count_series, series_label="子任務"),
        "duplicate_count": partial(_count_series, series_label="疑似重複的單"),
        "volunteers_needed": partial(_count_series, series_label="志工需求"),
        "volunteers_matched": partial(_count_series, series_label="已媒合志工"),
        "volunteer_gap": partial(_count_series, series_label="志工缺口"),
    },
    "stations": {
        "station_count": partial(_count_series, series_label="站點"),
        "station_status_count": partial(_count_series, series_label="站點"),
        "station_freshness_trend": _station_freshness_trend_series,
        "operating_station_count": partial(_count_series, series_label="營運中站點"),
    },
}


def chart_series(domain: str, y: str, data: list[dict]) -> tuple[list, dict[str, list]]:
    """The x values and {series name: values} that a chart of `y` plots, in display order.

    render_chart draws exactly this and the data endpoints return it, so the two cannot disagree.
    """
    x_values, series = _SERIES_BUILDERS[domain][y](data)
    # SQL GROUP BY promises no order, so known categories follow the glossary, dates run
    # chronologically and None sorts last. Other keys keep the service's order, which is what
    # holds age buckets in age order.
    unknown = len(_CATEGORY_ORDER)
    order = sorted(
        range(len(x_values)),
        key=lambda i: (
            x_values[i] is None,
            _CATEGORY_ORDER.get(x_values[i], unknown),
            "" if isinstance(x_values[i], str) else x_values[i],
        ),
    )
    x_values = [x_values[i] for i in order]
    x_values = [_CATEGORY_LABEL.get(v, v) if isinstance(v, str) else v for v in x_values]
    return x_values, {name: [values[i] for i in order] for name, values in series.items()}


def _render_pivoted(x_values: list, series: dict[str, list], chart_type: str, style: ChartStyle) -> go.Figure:
    """Build a bar, line, or pie figure from chart_series output.

    Series colours are not set per trace; they come from layout.colorway (see _layout_for).
    """
    if chart_type == "pie":
        values = next(iter(series.values())) if series else []
        return go.Figure(
            go.Pie(
                labels=x_values,
                values=values,
                hole=style.pie_hole,
                textinfo="percent",
                textposition="inside",
                marker={"line": {"color": "#FFFFFF", "width": 2}},
            )
        )
    fig = go.Figure()
    if chart_type == "line":
        # A single point has no segment to draw, so show the marker there or the chart is
        # blank (e.g. an ungrouped total or a one-day range).
        mode = "lines+markers" if len(x_values) == 1 else "lines"
        for name, values in series.items():
            fig.add_trace(
                go.Scatter(
                    x=x_values,
                    y=values,
                    mode=mode,
                    name=name,
                    line={"width": style.line_width, "shape": style.line_shape, "smoothing": 0.4},
                )
            )
        return fig
    for name, values in series.items():
        fig.add_trace(go.Bar(x=x_values, y=values, name=name))
    if len(series) > 1:
        fig.update_layout(barmode="group")
    return fig


def _layout_for(style: ChartStyle, chart_type: str) -> dict:
    layout = {
        "template": "plotly_white",
        "colorway": style.palette,
        "piecolorway": style.palette,
        "font": {"family": style.font_family, "size": style.font_size, "color": style.font_color},
        "margin": {
            "l": style.margin.left,
            "r": style.margin.right,
            "t": style.margin.top,
            "b": style.margin.bottom,
        },
        "paper_bgcolor": "rgba(0,0,0,0)",
        "plot_bgcolor": "rgba(0,0,0,0)",
        "hovermode": "closest" if chart_type == "pie" else "x unified",
        "xaxis": {"gridcolor": style.grid_color},
        "yaxis": {"gridcolor": style.grid_color, "rangemode": "tozero"},
    }
    if style.legend == "none":
        layout["showlegend"] = False
    elif style.legend == "bottom":
        layout["legend"] = {"orientation": "h", "x": 0, "y": -0.2}
    return layout


def render_chart(
    domain: str,
    y: str,
    data: list[dict],
    *,
    x: str | None,
    chart_type: str | None,
    style: ChartStyle | None = None,
    width: int | None = None,
    height: int | None = None,
    layout_overrides: dict | None = None,
) -> dict:
    """Build a styled Plotly figure for `y` and return it as `{"data", "layout", "config"}`.

    `style`, the metric's axis rules, `width`/`height` and `layout_overrides` apply in that order,
    each overriding the last; a bad `y`, `chart_type` or layout key raises AnalyticsInputError.
    """
    style = style or ChartStyle()
    resolved_x, resolved_chart_type = resolve(domain, y, x, chart_type)
    x_values, series = chart_series(domain, y, data)
    # Plotly.js renders a small HTML subset in labels, and categories include free-text station types.
    # Escaping only the figure keeps /data raw, and our own labels hold none of these characters.
    x_values = [html.escape(v, quote=False) if isinstance(v, str) else v for v in x_values]
    fig = _render_pivoted(x_values, series, resolved_chart_type, style)

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

    # Plotly's encoder turns the datetimes and Decimals in the rows into what Plotly.js reads,
    # which a plain model dump would not.
    figure = json.loads(fig.to_json())
    figure["config"] = {"displayModeBar": style.modebar, "responsive": True}
    return figure
