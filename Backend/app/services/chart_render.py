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

# --- Y-metric catalog: allowed_x is an ordered tuple that may contain None (aggregate/no
# grouping), "date", and/or "category" — ordered because resolve() falls back to its first
# entry for forced-shape metrics. `requires_date_range` (absent = False) marks a metric
# that refuses an unbounded query. See GET /api/v1/analytics/catalog for the JSON version. ---

_TICKET_CATALOG = {
    "total_tickets": {
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "ongoing_tickets": {
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "unassigned_tickets": {
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "completed_tickets": {
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line", "pie"),
    },
    "completion_rate": {
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "line"),
    },
    "age_distribution": {
        "allowed_x": (None,),  # forced shape: always grouped by age bucket internally
        "default_chart_type": "bar", "allowed_chart_types": ("bar",),
    },
    "time_to_completion": {
        "allowed_x": (None, "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar",),
    },
    "net_backlog_change": {
        "allowed_x": ("date",),  # forced shape: always date-grouped
        "default_chart_type": "line", "allowed_chart_types": ("line", "bar"),
    },
    "task_completion_distribution": {
        "allowed_x": (None,),  # forced shape: fixed completed/remaining pie
        "default_chart_type": "pie", "allowed_chart_types": ("pie",),
    },
    "duplicate_count": {
        "allowed_x": (None, "date", "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "pie"),
        # Self-join: unbounded it is O(n^2). ticket_analytics.get_duplicate_count rejects
        # a missing range outright; this flag lets the frontend require the dates up front.
        "requires_date_range": True,
    },
}

_STATION_CATALOG = {
    "station_count": {
        "allowed_x": (None, "category"),
        "default_chart_type": "bar", "allowed_chart_types": ("bar", "pie"),
    },
    "station_status_count": {
        "allowed_x": (None, "category"),
        "default_chart_type": "pie", "allowed_chart_types": ("pie", "bar"),
    },
    "station_freshness_trend": {
        "allowed_x": ("date",),  # forced shape: always date-grouped
        "default_chart_type": "line", "allowed_chart_types": ("line", "bar"),
    },
}

CATALOG = {"tickets": _TICKET_CATALOG, "stations": _STATION_CATALOG}


def resolve(domain: str, y: str, x: str | None, chart_type: str | None) -> tuple[str | None, str]:
    """Resolve the effective (x, chart_type) for a (domain, y) request.

    Raises ValueError for an unknown y or a chart_type outside that metric's
    allowed_chart_types (endpoint layer turns that into HTTP 400). Never raises over
    `x` — see module docstring's "ignore, don't reject" rule.
    """
    catalog = CATALOG.get(domain)
    if catalog is None or y not in catalog:
        raise ValueError(f"Unknown metric {y!r} for domain {domain!r}")
    spec = catalog[y]

    resolved_chart_type = chart_type or spec["default_chart_type"]
    if resolved_chart_type not in spec["allowed_chart_types"]:
        raise ValueError(f"chart_type={resolved_chart_type!r} is not valid for y={y!r}")

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


def _render_pivoted(x_values: list, series: dict[str, list], chart_type: str) -> go.Figure:
    """Build a bar, line, or pie figure from (x_values, {series_name: [y values]}) data.

    Chart type docs: https://plotly.com/python/bar-charts/,
    https://plotly.com/python/line-charts/, https://plotly.com/python/pie-charts/.
    """
    if chart_type == "pie":
        values = next(iter(series.values())) if series else []
        return go.Figure(go.Pie(labels=x_values, values=values))
    if chart_type == "line":
        # A line connects points in array order, not by re-sorting them — since a SQL
        # GROUP BY doesn't guarantee row order, an unsorted trace would zig-zag instead
        # of showing a clean trend. Sort here so every line chart is correct regardless
        # of which query produced its rows (some data-layer functions already return
        # date-sorted rows; this makes it true unconditionally, not by convention).
        # The `is None` half of the key is a backstop: the data layer labels NULL
        # categories and drops NULL dates, so None shouldn't reach here — but this is the
        # one function every metric's line chart flows through, and mixing None with str
        # or datetime raises TypeError, which would surface as a 500.
        order = sorted(range(len(x_values)), key=lambda i: (x_values[i] is None, x_values[i]))
        x_values = [x_values[i] for i in order]
        series = {name: [values[i] for i in order] for name, values in series.items()}
        fig = go.Figure()
        for name, values in series.items():
            fig.add_trace(go.Scatter(x=x_values, y=values, mode="lines+markers", name=name))
        return fig
    fig = go.Figure()
    for name, values in series.items():
        fig.add_trace(go.Bar(x=x_values, y=values, name=name))
    if len(series) > 1:
        fig.update_layout(barmode="group")
    return fig


def _fig_count_metric(
    data: list[dict], chart_type: str, *, value_key: str = "count", series_label: str = "value"
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
    return _render_pivoted(x_values, {series_label: y_values}, chart_type)


# --- Ticket figure builders (one per key in _TICKET_CATALOG) ---


def _fig_total_tickets(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="tickets")


def _fig_ongoing_tickets(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="ongoing tickets")


def _fig_unassigned_tickets(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="unassigned tickets")


def _fig_completed_tickets(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="completed tickets")


def _fig_completion_rate(data, chart_type):
    return _fig_count_metric(data, chart_type, value_key="rate", series_label="completion rate")


def _fig_age_distribution(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="tickets")


def _fig_time_to_completion(data, chart_type):
    x_values = [row["x"] for row in data] if data and "x" in data[0] else ["overall"]
    avg_days = [(row["avg_seconds"] or 0) / 86400 for row in data] if data else [0]
    median_days = [(row["median_seconds"] or 0) / 86400 for row in data] if data else [0]
    return _render_pivoted(x_values, {"avg (days)": avg_days, "median (days)": median_days}, chart_type)


def _fig_net_backlog_change(data, chart_type):
    x_values = [row["x"] for row in data]
    series = {
        "new": [row["new_count"] for row in data],
        "completed": [row["completed_count"] for row in data],
        "net change": [row["net_change"] for row in data],
    }
    return _render_pivoted(x_values, series, chart_type)


def _fig_task_completion_distribution(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="tasks")


def _fig_duplicate_count(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="duplicate tickets")


# --- Station figure builders (one per key in _STATION_CATALOG) ---


def _fig_station_count(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="stations")


def _fig_station_status_count(data, chart_type):
    return _fig_count_metric(data, chart_type, series_label="stations")


def _fig_station_freshness_trend(data, chart_type):
    x_values = [row["x"] for row in data]
    series = {
        "added": [row["added_count"] for row in data],
        "closed": [row["closed_count"] for row in data],
    }
    return _render_pivoted(x_values, series, chart_type)


_FIGURE_BUILDERS = {
    "tickets": {
        "total_tickets": _fig_total_tickets,
        "ongoing_tickets": _fig_ongoing_tickets,
        "unassigned_tickets": _fig_unassigned_tickets,
        "completed_tickets": _fig_completed_tickets,
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
    theme: str = "light", width: int | None = None, height: int | None = None,
    layout_overrides: dict | None = None,
) -> str:
    """Build a styled Plotly figure for `y` and return it as a partial HTML div.

    No embedded plotly.js — the frontend loads it once. Styling is layered so each
    stage can override the previous one: `theme` picks a
    base template (plotly_white/plotly_dark — https://plotly.com/python/templates/),
    then `width`/`height` (https://plotly.com/python/setting-graph-size/), then
    `layout_overrides` — arbitrary keys from the Layout reference
    (https://plotly.com/python/reference/layout/), applied via `update_layout(**...)`.
    A Plotly figure is pure JSON, not executable code, so this passthrough is safe;
    Plotly's own schema validation rejects unknown keys (raises ValueError, which the
    endpoint layer turns into HTTP 400).

    `data` is expected to already reflect the *resolved* `x` (the caller — the
    analytics endpoint — calls resolve() before querying, so the DB grouping and the
    chart grouping always agree). This function re-resolves `chart_type` internally
    anyway (idempotent, harmless) so it stays safe to call standalone.

    Raises ValueError on an unknown y or an unsupported chart_type for it.
    """
    _resolved_x, resolved_chart_type = resolve(domain, y, x, chart_type)
    fig = _FIGURE_BUILDERS[domain][y](data, resolved_chart_type)

    fig.update_layout(template="plotly_white" if theme == "light" else "plotly_dark")
    if width is not None or height is not None:
        fig.update_layout(width=width, height=height)
    if layout_overrides:
        fig.update_layout(**layout_overrides)

    # plotly.io.to_html reference: https://plotly.com/python-api-reference/generated/plotly.io.to_html.html
    return fig.to_html(full_html=False, include_plotlyjs=False)
