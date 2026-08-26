"""Analytics chart REST API — returns Plotly-generated HTML for the ops dashboard.

See https://plotly.com/python/ for the underlying charting library.

**X/Y model.** Pick `y` (what to measure — a metric from the catalog below) and `x`
(how to slice it — `date` or `category`, or omit `x` entirely for a single aggregate
value) independently. Not every combination is meaningful: an `x` that doesn't apply
to the chosen `y` (or to `chart_type` — e.g. a date trend can't be pie slices) is
**silently ignored**, not rejected — the response still renders, just without that
grouping. `chart_type` stays strictly validated (an unsupported one for the chosen `y`
is a 400). `GET /analytics/catalog` is the machine-readable source of truth for which
`x` values and chart types each `y` supports — build dropdowns from that response
instead of hardcoding the rules.

Example queries:
- `?y=total_tickets&x=date&x_granularity=week` — ticket volume trend, weekly buckets
- `?y=total_tickets&x=category` — ticket volume broken down by task_type
- `?y=task_completion_distribution` — no `x` needed, always a fixed 2-slice pie
- `?y=net_backlog_change` — no `x` needed either; this metric is always date-grouped

Each endpoint runs its aggregation query (app.services.ticket_analytics /
station_analytics) and renders it to a partial HTML `<div>` (no embedded plotly.js —
the frontend loads the library once and injects the div; see
https://plotly.com/python/interactive-html-export/).

`layout_overrides` lets the frontend adjust chart styling beyond `theme`/`width`/
`height` — any key from the Plotly Layout reference
(https://plotly.com/python/reference/layout/), passed through to `Figure.update_layout`.
"""

import json
from datetime import date
from functools import partial
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, scope_filter
from app.models.auth import User
from app.models.geo import Station
from app.models.request import Tickets
from app.schemas.analytics import (
    CatalogResponse,
    ChartResponse,
    ChartTheme,
    ChartType,
    ChartX,
    ChartXGranularity,
    StationYMetric,
    TicketYMetric,
    YMetricSpec,
)
from app.services import chart_render, station_analytics, ticket_analytics
from app.services.analytics_common import AnalyticsInputError

router = APIRouter()

TICKET_METRIC_FNS = {
    TicketYMetric.total_tickets: partial(ticket_analytics.get_ticket_count, bucket=None),
    TicketYMetric.ongoing_tickets: partial(ticket_analytics.get_ticket_count, bucket="ongoing"),
    TicketYMetric.unassigned_tickets: partial(ticket_analytics.get_ticket_count, bucket="unassigned"),
    TicketYMetric.completed_tickets: partial(ticket_analytics.get_ticket_count, bucket="completed"),
    TicketYMetric.canceled_tickets: partial(ticket_analytics.get_ticket_count, bucket="canceled"),
    TicketYMetric.completion_rate: ticket_analytics.get_completion_rate,
    TicketYMetric.age_distribution: ticket_analytics.get_age_distribution,
    TicketYMetric.time_to_completion: ticket_analytics.get_time_to_completion,
    TicketYMetric.net_backlog_change: ticket_analytics.get_net_backlog_change,
    TicketYMetric.task_completion_distribution: ticket_analytics.get_task_completion_distribution,
    TicketYMetric.duplicate_count: ticket_analytics.get_duplicate_count,
}

STATION_METRIC_FNS = {
    StationYMetric.station_count: station_analytics.get_station_count,
    StationYMetric.station_status_count: station_analytics.get_station_status_count,
    StationYMetric.station_freshness_trend: station_analytics.get_station_freshness_trend,
}

_Y_DESCRIPTION = (
    "What to measure — see GET /analytics/catalog for the full list and which `x` "
    "values / chart types each one supports."
)
_X_DESCRIPTION = (
    "How to slice `y`: 'date' (day/week trend) or 'category' (breakdown by type). "
    "Omit for a single aggregate value. An `x` that doesn't apply to the chosen `y` "
    "or `chart_type` is silently ignored rather than rejected — see GET /analytics/catalog."
)
_X_GRANULARITY_DESCRIPTION = "Bucket size when x=date. Ignored for every other x."
_CHART_TYPE_DESCRIPTION = (
    "Overrides the y-metric's default chart shape. Unlike `x`, an unsupported "
    "chart_type for the chosen `y` is rejected with 400 — see GET /analytics/catalog."
)
_TZ_DESCRIPTION = (
    "IANA timezone name (e.g. 'Asia/Taipei', 'America/New_York'), default UTC. "
    "Controls day/week bucket boundaries when x=date and how start_date/end_date are "
    "interpreted (local midnight in this timezone, not UTC midnight) — duration-based "
    "metrics like age_distribution/time_to_completion ignore it."
)
_LAYOUT_OVERRIDES_DESCRIPTION = (
    "JSON-encoded object merged into the figure's layout — any key from "
    "https://plotly.com/python/reference/layout/, e.g. "
    '\'{"title": {"text": "Custom title"}}\'.'
)
# Plotly's own minimum for layout.width/height. Below it update_layout raises a ValueError
# that nothing catches — the try/except in chart_render covers layout_overrides only — so an
# unbounded param 500'd. Rejecting it here keeps it off plotly entirely and, unlike a guard in
# the service, publishes the minimum in the OpenAPI schema.
_MIN_FIGURE_PX = 10
_WIDTH_DESCRIPTION = (
    f"Figure width in px, at least {_MIN_FIGURE_PX}; omit for Plotly's default."
)
_HEIGHT_DESCRIPTION = (
    f"Figure height in px, at least {_MIN_FIGURE_PX}; omit for Plotly's default."
)


def _parse_tz(tz: str) -> ZoneInfo:
    """Validate an IANA timezone name (see Spec/Docs/er-diagram.md's 2026-08-07 note).

    ZoneInfo splits its rejections across two unrelated exception types: an unknown but
    well-formed key ('Nope/Nope') raises ZoneInfoNotFoundError, while a malformed one
    ('', '/etc/passwd', '..') raises ValueError. Both are client errors, so both are 400
    — catching only the first turned an empty `?tz=` into a 500.
    """
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError) as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown timezone: {tz!r}"
        ) from err


def _parse_layout_overrides(layout_overrides: str | None) -> dict | None:
    """Decode the JSON-encoded `layout_overrides` query param (GET params are always strings)."""
    if not layout_overrides:
        return None
    try:
        parsed = json.loads(layout_overrides)
    except json.JSONDecodeError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="layout_overrides is not valid JSON"
        ) from err
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="layout_overrides must be a JSON object"
        )
    return parsed


def _serialize_spec(spec: dict) -> YMetricSpec:
    """Convert one chart_render.CATALOG entry into a JSON-friendly YMetricSpec.

    'none' stands in for the Python None / aggregate-no-grouping value.
    """
    return YMetricSpec(
        allowed_x=sorted("none" if v is None else v for v in spec["allowed_x"]),
        default_chart_type=spec["default_chart_type"],
        allowed_chart_types=sorted(spec["allowed_chart_types"]),
        requires_date_range=spec.get("requires_date_range", False),
        max_range_days=spec.get("max_range_days"),
    )


async def _render_domain(
    domain: str, metric_fns: dict, db: AsyncSession, *,
    y, x, x_granularity, chart_type,
    start_date: date | None, end_date: date | None, tz: str,
    theme, width: int | None, height: int | None, layout_overrides: str | None,
    extra_filters: list,
) -> ChartResponse:
    """Shared body of both chart endpoints — resolve, query, render.

    The two handlers keep their own signatures so OpenAPI documents each domain's real
    `y` enum, but everything after parameter binding is identical, so it lives here.
    `extra_filters` is the caller's RBAC row filter; see the service module docstrings.

    Every 400 comes from `_parse_tz` / `_parse_layout_overrides`, which raise HTTPException
    themselves, or from an AnalyticsInputError below. Catching that narrow type rather than
    ValueError is deliberate: our own bugs raise plain ValueError, and 400-ing those would
    file a server fault as the caller's mistake and echo internal text back to them.
    """
    try:
        tzinfo = _parse_tz(tz)
        overrides = _parse_layout_overrides(layout_overrides)
        x_value = x.value if x is not None else None
        chart_type_value = chart_type.value if chart_type is not None else None

        resolved_x, resolved_chart_type = chart_render.resolve(
            domain, y.value, x_value, chart_type_value
        )
        data = await metric_fns[y](
            db, x=resolved_x, x_granularity=x_granularity.value,
            start_date=start_date, end_date=end_date, tz=tzinfo,
            extra_filters=extra_filters,
        )
        html = chart_render.render_chart(
            domain, y.value, data,
            x=resolved_x, chart_type=resolved_chart_type,
            theme=theme.value, width=width, height=height, layout_overrides=overrides,
        )
    except AnalyticsInputError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err
    return ChartResponse(html=html)


@router.get(
    "/catalog",
    response_model=CatalogResponse,
    dependencies=[Depends(security.get_current_user)],
)
async def get_analytics_catalog():
    """Machine-readable y-metric catalog: valid `x` values and chart types per metric.

    The source of truth behind the "ignore x when it doesn't apply" behavior on both
    chart endpoints below — build x/y dropdowns from this response instead of
    hardcoding the rules client-side.

    Authentication only, no capability: the response is a static description of this
    API's own shape and contains no records. Gating it on ticket.view (as it originally
    was) locked a station-only role out of the station catalog it is allowed to chart.
    """
    return CatalogResponse(
        tickets={k: _serialize_spec(v) for k, v in chart_render.CATALOG["tickets"].items()},
        stations={k: _serialize_spec(v) for k, v in chart_render.CATALOG["stations"].items()},
    )


@router.get("/tickets/chart", response_model=ChartResponse)
async def get_ticket_chart(
    y: TicketYMetric = Query(..., description=_Y_DESCRIPTION),
    x: ChartX | None = Query(None, description=_X_DESCRIPTION),
    x_granularity: ChartXGranularity = Query(ChartXGranularity.day, description=_X_GRANULARITY_DESCRIPTION),
    chart_type: ChartType | None = Query(None, description=_CHART_TYPE_DESCRIPTION),
    start_date: date | None = Query(None, description="Inclusive range start, local to `tz`."),
    end_date: date | None = Query(None, description="Inclusive range end, local to `tz`."),
    tz: str = Query("UTC", description=_TZ_DESCRIPTION),
    theme: ChartTheme = Query(ChartTheme.light, description="Base Plotly template."),
    width: int | None = Query(None, ge=_MIN_FIGURE_PX, description=_WIDTH_DESCRIPTION),
    height: int | None = Query(None, ge=_MIN_FIGURE_PX, description=_HEIGHT_DESCRIPTION),
    layout_overrides: str | None = Query(None, description=_LAYOUT_OVERRIDES_DESCRIPTION),
    scope: Scope = security.has_permission(Perm.TICKET_VIEW),
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
):
    """Render one ticket/task metric as a Plotly chart.

    See the module docstring for the x/y model and example queries, and GET
    /analytics/catalog for the full per-metric rules.

    `scope` is a bound parameter, not a `dependencies=[]` entry, because FastAPI discards a
    dependency's return value there. The permission check is the same either way, but the
    resolved scope is needed to narrow the rows — otherwise a caller holding `ticket.view`
    at `own` gets totals for the whole table.
    """
    return await _render_domain(
        "tickets", TICKET_METRIC_FNS, db,
        y=y, x=x, x_granularity=x_granularity, chart_type=chart_type,
        start_date=start_date, end_date=end_date, tz=tz,
        theme=theme, width=width, height=height, layout_overrides=layout_overrides,
        extra_filters=scope_filter(scope, actor=current_user, model=Tickets),
    )


@router.get("/stations/chart", response_model=ChartResponse)
async def get_station_chart(
    y: StationYMetric = Query(..., description=_Y_DESCRIPTION),
    x: ChartX | None = Query(None, description=_X_DESCRIPTION),
    x_granularity: ChartXGranularity = Query(ChartXGranularity.day, description=_X_GRANULARITY_DESCRIPTION),
    chart_type: ChartType | None = Query(None, description=_CHART_TYPE_DESCRIPTION),
    start_date: date | None = Query(None, description="Inclusive range start, local to `tz`."),
    end_date: date | None = Query(None, description="Inclusive range end, local to `tz`."),
    tz: str = Query("UTC", description=_TZ_DESCRIPTION),
    theme: ChartTheme = Query(ChartTheme.light, description="Base Plotly template."),
    width: int | None = Query(None, ge=_MIN_FIGURE_PX, description=_WIDTH_DESCRIPTION),
    height: int | None = Query(None, ge=_MIN_FIGURE_PX, description=_HEIGHT_DESCRIPTION),
    layout_overrides: str | None = Query(None, description=_LAYOUT_OVERRIDES_DESCRIPTION),
    scope: Scope = security.has_permission(Perm.STATION_VIEW),
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
):
    """Render one station metric as a Plotly chart.

    See the module docstring for the x/y model and example queries, and GET
    /analytics/catalog for the full per-metric rules. `scope` is a bound parameter rather
    than a route dependency for the reason given on the ticket endpoint above.
    """
    return await _render_domain(
        "stations", STATION_METRIC_FNS, db,
        y=y, x=x, x_granularity=x_granularity, chart_type=chart_type,
        start_date=start_date, end_date=end_date, tz=tz,
        theme=theme, width=width, height=height, layout_overrides=layout_overrides,
        extra_filters=scope_filter(scope, actor=current_user, model=Station),
    )
