"""Analytics chart REST API — returns Plotly-generated HTML for the ops dashboard.

See https://plotly.com/python/ for the underlying charting library. Each endpoint
picks one metric from a fixed catalog (app.services.chart_render.CHART_DEFAULTS),
runs its aggregation query (app.services.ticket_analytics / station_analytics), and
renders it to a partial HTML `<div>` (no embedded plotly.js — the frontend loads the
library once and injects the div; see https://plotly.com/python/interactive-html-export/).

`layout_overrides` lets the frontend adjust chart styling beyond `theme`/`width`/
`height` — any key from the Plotly Layout reference
(https://plotly.com/python/reference/layout/), passed through to `Figure.update_layout`.
"""

import json
from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.permissions import Perm
from app.schemas.analytics import (
    ChartGroupBy,
    ChartResponse,
    ChartTheme,
    ChartType,
    StationMetric,
    TicketMetric,
)
from app.services import station_analytics, ticket_analytics
from app.services.chart_render import render_chart

router = APIRouter()

TICKET_METRIC_FNS = {
    TicketMetric.status_breakdown: ticket_analytics.get_status_breakdown,
    TicketMetric.completion_rate: ticket_analytics.get_completion_rate,
    TicketMetric.age_distribution: ticket_analytics.get_age_distribution,
    TicketMetric.time_to_completion: ticket_analytics.get_time_to_completion,
    TicketMetric.backlog_trend: ticket_analytics.get_backlog_trend,
    TicketMetric.task_completion_distribution: ticket_analytics.get_task_completion_distribution,
    TicketMetric.duplicate_count: ticket_analytics.get_duplicate_count,
}

STATION_METRIC_FNS = {
    StationMetric.count_by_type: station_analytics.get_count_by_type,
    StationMetric.status_breakdown: station_analytics.get_status_breakdown,
    StationMetric.freshness_trend: station_analytics.get_freshness_trend,
}


def _parse_tz(tz: str) -> ZoneInfo:
    """Validate an IANA timezone name (see Spec/Docs/er-diagram.md's 2026-08-07 note)."""
    try:
        return ZoneInfo(tz)
    except ZoneInfoNotFoundError as err:
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


@router.get(
    "/tickets/chart",
    response_model=ChartResponse,
    dependencies=[security.has_permission(Perm.TICKET_VIEW)],
)
async def get_ticket_chart(
    metric: TicketMetric,
    group_by: ChartGroupBy | None = None,
    chart_type: ChartType | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tz: str = "UTC",
    theme: ChartTheme = ChartTheme.light,
    width: int | None = None,
    height: int | None = None,
    layout_overrides: str | None = None,
    db: AsyncSession = Depends(security.get_db),
):
    """Render one ticket/task metric as a Plotly chart.

    See app.services.ticket_analytics for the metric catalog and
    app.services.chart_render for valid group_by/chart_type combinations per metric.
    """
    tzinfo = _parse_tz(tz)
    overrides = _parse_layout_overrides(layout_overrides)
    group_by_value = group_by.value if group_by is not None else None
    chart_type_value = chart_type.value if chart_type is not None else None

    try:
        data = await TICKET_METRIC_FNS[metric](
            db, start_date=start_date, end_date=end_date, group_by=group_by_value, tz=tzinfo,
        )
        html = render_chart(
            "tickets", metric.value, data,
            group_by=group_by_value, chart_type=chart_type_value,
            theme=theme.value, width=width, height=height, layout_overrides=overrides,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err
    return ChartResponse(html=html)


@router.get(
    "/stations/chart",
    response_model=ChartResponse,
    dependencies=[security.has_permission(Perm.STATION_VIEW)],
)
async def get_station_chart(
    metric: StationMetric,
    group_by: ChartGroupBy | None = None,
    chart_type: ChartType | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    tz: str = "UTC",
    theme: ChartTheme = ChartTheme.light,
    width: int | None = None,
    height: int | None = None,
    layout_overrides: str | None = None,
    db: AsyncSession = Depends(security.get_db),
):
    """Render one station metric as a Plotly chart.

    See app.services.station_analytics for the metric catalog and
    app.services.chart_render for valid group_by/chart_type combinations per metric.
    """
    tzinfo = _parse_tz(tz)
    overrides = _parse_layout_overrides(layout_overrides)
    group_by_value = group_by.value if group_by is not None else None
    chart_type_value = chart_type.value if chart_type is not None else None

    try:
        data = await STATION_METRIC_FNS[metric](
            db, start_date=start_date, end_date=end_date, group_by=group_by_value, tz=tzinfo,
        )
        html = render_chart(
            "stations", metric.value, data,
            group_by=group_by_value, chart_type=chart_type_value,
            theme=theme.value, width=width, height=height, layout_overrides=overrides,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err
    return ChartResponse(html=html)
