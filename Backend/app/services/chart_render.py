"""Turns pre-aggregated analytics rows into a Plotly figure, rendered as a partial HTML div.

Rows come from ticket_analytics.py / station_analytics.py. Official Plotly Python
docs: https://plotly.com/python/. This is the only module that
imports `plotly` — everything upstream deals in plain dicts/lists (ADR: keep the
charting library isolated to the render boundary).

Fixed metric catalog (per the analytics plan, Part 5): each metric has a small,
explicit figure-builder function rather than a generic x/y pivot engine, since not
every (metric, group_by, chart_type) combination is meaningful. CHART_DEFAULTS records
what *is* valid for each metric; validate_combo() is the single place that enforces it.
"""

import plotly.graph_objects as go

# --- Fixed metric catalog: (default_chart_type, allowed_chart_types, allowed_group_by) ---

_TICKET_METRIC_SPECS = {
    "status_breakdown": {
        "default_chart_type": "bar", "allowed_chart_types": {"bar", "pie"},
        "allowed_group_by": {None, "category"},
    },
    "completion_rate": {
        "default_chart_type": "bar", "allowed_chart_types": {"bar"},
        "allowed_group_by": {None, "category"},
    },
    "age_distribution": {
        "default_chart_type": "bar", "allowed_chart_types": {"bar"},
        "allowed_group_by": {None, "category"},
    },
    "time_to_completion": {
        "default_chart_type": "bar", "allowed_chart_types": {"bar"},
        "allowed_group_by": {None, "category"},
    },
    "backlog_trend": {
        "default_chart_type": "line", "allowed_chart_types": {"line", "bar"},
        "allowed_group_by": {None, "day", "week"},
    },
    "task_completion_distribution": {
        "default_chart_type": "pie", "allowed_chart_types": {"pie"},
        "allowed_group_by": {None},
    },
    "duplicate_count": {
        "default_chart_type": "bar", "allowed_chart_types": {"bar", "pie"},
        "allowed_group_by": {None, "category"},
    },
}

_STATION_METRIC_SPECS = {
    "count_by_type": {
        "default_chart_type": "bar", "allowed_chart_types": {"bar", "pie"},
        "allowed_group_by": {None},
    },
    "status_breakdown": {
        "default_chart_type": "pie", "allowed_chart_types": {"pie", "bar"},
        "allowed_group_by": {None},
    },
    "freshness_trend": {
        "default_chart_type": "line", "allowed_chart_types": {"line", "bar"},
        "allowed_group_by": {None, "day", "week"},
    },
}

CHART_DEFAULTS = {"tickets": _TICKET_METRIC_SPECS, "stations": _STATION_METRIC_SPECS}


def validate_combo(
    domain: str, metric: str, group_by: str | None, chart_type: str | None
) -> str:
    """Validate (metric, group_by, chart_type) against CHART_DEFAULTS.

    Returns the resolved chart_type (falls back to the metric's default when None).
    Raises ValueError on an unknown metric or an invalid combination — the endpoint
    layer turns that into HTTP 400.
    """
    specs = CHART_DEFAULTS.get(domain)
    if specs is None or metric not in specs:
        raise ValueError(f"Unknown metric {metric!r} for domain {domain!r}")
    spec = specs[metric]
    if group_by not in spec["allowed_group_by"]:
        raise ValueError(f"group_by={group_by!r} is not valid for metric {metric!r}")
    resolved_chart_type = chart_type or spec["default_chart_type"]
    if resolved_chart_type not in spec["allowed_chart_types"]:
        raise ValueError(f"chart_type={resolved_chart_type!r} is not valid for metric {metric!r}")
    return resolved_chart_type


# --- Small pivot/plot helpers shared by the per-metric figure builders below ---


def _pivot(
    data: list[dict], *, x_key: str, y_key: str, series_key: str | None
) -> tuple[list, dict[str, list]]:
    """Reshape rows into (x_values, {series_name: [y values aligned to x_values]})."""
    x_values = list(dict.fromkeys(row[x_key] for row in data))
    if series_key is None:
        lookup = {row[x_key]: row[y_key] for row in data}
        return x_values, {"value": [lookup.get(x, 0) for x in x_values]}
    series_names = list(dict.fromkeys(row[series_key] for row in data))
    lookup = {(row[x_key], row[series_key]): row[y_key] for row in data}
    series = {name: [lookup.get((x, name), 0) for x in x_values] for name in series_names}
    return x_values, series


def _render_pivoted(x_values: list, series: dict[str, list], chart_type: str) -> go.Figure:
    """Build a bar, line, or pie figure from pivoted (x_values, series) data.

    Chart type docs: https://plotly.com/python/bar-charts/,
    https://plotly.com/python/line-charts/, https://plotly.com/python/pie-charts/.
    """
    if chart_type == "pie":
        values = next(iter(series.values())) if series else []
        return go.Figure(go.Pie(labels=x_values, values=values))
    if chart_type == "line":
        fig = go.Figure()
        for name, values in series.items():
            fig.add_trace(go.Scatter(x=x_values, y=values, mode="lines+markers", name=name))
        return fig
    fig = go.Figure()
    for name, values in series.items():
        fig.add_trace(go.Bar(x=x_values, y=values, name=None if name == "value" else name))
    if len(series) > 1:
        fig.update_layout(barmode="group")
    return fig


# --- Ticket figure builders (one per metric id in _TICKET_METRIC_SPECS) ---


def _fig_status_breakdown(data, group_by, chart_type):
    if group_by == "category":
        x, series = _pivot(data, x_key="category", series_key="bucket", y_key="count")
    else:
        x, series = _pivot(data, x_key="bucket", series_key=None, y_key="count")
    return _render_pivoted(x, series, chart_type)


def _fig_completion_rate(data, group_by, chart_type):
    if group_by == "category":
        x = [row["category"] for row in data]
        y = [row["rate"] for row in data]
    else:
        x = ["overall"]
        y = [data[0]["rate"]] if data else [0.0]
    return _render_pivoted(x, {"completion rate": y}, chart_type)


_AGE_BUCKET_ORDER = ["<24h", "24-48h", "48-72h", ">72h"]


def _fig_age_distribution(data, group_by, chart_type):
    series_key = "category" if group_by == "category" else None
    x, series = _pivot(data, x_key="age_bucket", series_key=series_key, y_key="count")
    ordered = [b for b in _AGE_BUCKET_ORDER if b in x]
    if ordered:
        idx = {b: i for i, b in enumerate(x)}
        series = {name: [values[idx[b]] for b in ordered] for name, values in series.items()}
        x = ordered
    return _render_pivoted(x, series, chart_type)


def _fig_time_to_completion(data, group_by, chart_type):
    x = [row["category"] for row in data] if group_by == "category" else ["overall"]
    avg_days = [(row["avg_seconds"] or 0) / 86400 for row in data] if data else [0]
    median_days = [(row["median_seconds"] or 0) / 86400 for row in data] if data else [0]
    return _render_pivoted(x, {"avg (days)": avg_days, "median (days)": median_days}, chart_type)


def _fig_backlog_trend(data, group_by, chart_type):
    x = [row["period"] for row in data]
    series = {
        "new": [row["new_count"] for row in data],
        "completed": [row["completed_count"] for row in data],
        "net change": [row["net_change"] for row in data],
    }
    return _render_pivoted(x, series, chart_type)


def _fig_task_completion_distribution(data, group_by, chart_type):
    x = [row["label"] for row in data]
    return _render_pivoted(x, {"value": [row["count"] for row in data]}, chart_type)


def _fig_duplicate_count(data, group_by, chart_type):
    if group_by == "category":
        x = [row["category"] for row in data]
        y = [row["count"] for row in data]
    else:
        x = ["overall"]
        y = [data[0]["count"]] if data else [0]
    return _render_pivoted(x, {"duplicate tickets": y}, chart_type)


# --- Station figure builders (one per metric id in _STATION_METRIC_SPECS) ---


def _fig_count_by_type(data, group_by, chart_type):
    x = [row["type"] for row in data]
    return _render_pivoted(x, {"stations": [row["count"] for row in data]}, chart_type)


def _fig_station_status_breakdown(data, group_by, chart_type):
    x = [row["operational_status"] for row in data]
    return _render_pivoted(x, {"stations": [row["count"] for row in data]}, chart_type)


def _fig_freshness_trend(data, group_by, chart_type):
    x = [row["period"] for row in data]
    series = {
        "added": [row["added_count"] for row in data],
        "closed": [row["closed_count"] for row in data],
    }
    return _render_pivoted(x, series, chart_type)


_FIGURE_BUILDERS = {
    "tickets": {
        "status_breakdown": _fig_status_breakdown,
        "completion_rate": _fig_completion_rate,
        "age_distribution": _fig_age_distribution,
        "time_to_completion": _fig_time_to_completion,
        "backlog_trend": _fig_backlog_trend,
        "task_completion_distribution": _fig_task_completion_distribution,
        "duplicate_count": _fig_duplicate_count,
    },
    "stations": {
        "count_by_type": _fig_count_by_type,
        "status_breakdown": _fig_station_status_breakdown,
        "freshness_trend": _fig_freshness_trend,
    },
}


def render_chart(
    domain: str, metric: str, data: list[dict], *,
    group_by: str | None, chart_type: str | None,
    theme: str = "light", width: int | None = None, height: int | None = None,
    layout_overrides: dict | None = None,
) -> str:
    """Build a styled Plotly figure for `metric` and return it as a partial HTML div.

    No embedded plotly.js — the frontend loads it once. Styling is layered so each
    stage can override the previous one: `theme` picks a
    base template (plotly_white/plotly_dark — https://plotly.com/python/templates/),
    then `width`/`height` (https://plotly.com/python/setting-graph-size/), then
    `layout_overrides` — arbitrary keys from the Layout reference
    (https://plotly.com/python/reference/layout/), applied via `update_layout(**...)`.
    A Plotly figure is pure JSON, not executable code, so this passthrough is safe;
    Plotly's own schema validation rejects unknown keys (raises ValueError, which the
    endpoint layer turns into HTTP 400).

    Raises ValueError on an invalid (metric, group_by, chart_type) combination.
    """
    resolved_chart_type = validate_combo(domain, metric, group_by, chart_type)
    fig = _FIGURE_BUILDERS[domain][metric](data, group_by, resolved_chart_type)

    fig.update_layout(template="plotly_white" if theme == "light" else "plotly_dark")
    if width is not None or height is not None:
        fig.update_layout(width=width, height=height)
    if layout_overrides:
        fig.update_layout(**layout_overrides)

    # plotly.io.to_html reference: https://plotly.com/python-api-reference/generated/plotly.io.to_html.html
    return fig.to_html(full_html=False, include_plotlyjs=False)
