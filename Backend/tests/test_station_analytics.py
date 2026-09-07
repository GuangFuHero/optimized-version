"""Unit tests for app.services.station_analytics.

The module had no coverage at all before the PR #32 review; these pin the three
aggregation shapes plus the NULL-key handling that H1 was about (a nullable
`Station.type` category, and a closed station carrying no `status_changed_at`).
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.geo import Station
from app.services import station_analytics
from app.services.analytics_common import UNCATEGORIZED_LABEL
from app.services.chart_render import render_chart

UTC_TZ = ZoneInfo("UTC")


async def _make_user(db) -> str:
    user = User(name="tester")
    db.add(user)
    await db.flush()
    return str(user.uuid)


def _make_station(
    user_uuid: str, *, type: str | None = "shelter", operational_status: str = "active",
    lon: float = 121.5, lat: float = 25.0,
) -> Station:
    return Station(
        geometry=from_shape(Point(lon, lat), srid=4326),
        created_by=user_uuid, level=1, source="user", visibility="public",
        type=type, operational_status=operational_status,
    )


@pytest.mark.asyncio
async def test_station_count_aggregate_and_by_category(db):
    """Ungrouped returns one total; x="category" splits by type."""
    user_uuid = await _make_user(db)
    db.add_all([
        _make_station(user_uuid, type="shelter"),
        _make_station(user_uuid, type="shelter"),
        _make_station(user_uuid, type="medical"),
    ])
    await db.flush()

    aggregate = await station_analytics.get_station_count(
        db, x=None, x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert aggregate == [{"count": 3}]

    by_category = await station_analytics.get_station_count(
        db, x="category", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert {r["x"]: r["count"] for r in by_category} == {"shelter": 2, "medical": 1}


@pytest.mark.asyncio
async def test_station_count_labels_null_type(db):
    """Station.type is nullable, so its category grouping needs the same label as tickets'."""
    user_uuid = await _make_user(db)
    db.add_all([_make_station(user_uuid, type=None), _make_station(user_uuid, type="shelter")])
    await db.flush()

    rows = await station_analytics.get_station_count(
        db, x="category", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert {r["x"] for r in rows} == {"shelter", UNCATEGORIZED_LABEL}
    assert render_chart("stations", "station_count", rows, x="category", chart_type="bar")


@pytest.mark.asyncio
async def test_station_status_count_by_category(db):
    """x="category" groups by operational_status."""
    user_uuid = await _make_user(db)
    db.add_all([
        _make_station(user_uuid, operational_status="active"),
        _make_station(user_uuid, operational_status="temporarily_closed"),
        _make_station(user_uuid, operational_status="temporarily_closed"),
    ])
    await db.flush()

    rows = await station_analytics.get_station_status_count(
        db, x="category", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert {r["x"]: r["count"] for r in rows} == {"active": 1, "temporarily_closed": 2}


@pytest.mark.asyncio
async def test_station_freshness_trend_counts_added_and_closed(db):
    """Added is keyed on created_at, closed on status_changed_at — independent series."""
    user_uuid = await _make_user(db)
    day_one = datetime(2026, 8, 10, 6, 0, tzinfo=UTC)
    day_two = datetime(2026, 8, 11, 6, 0, tzinfo=UTC)

    added = _make_station(user_uuid)
    added.created_at = day_one
    closed = _make_station(user_uuid, operational_status="permanently_closed")
    closed.created_at = day_one
    closed.status_changed_at = day_two
    db.add_all([added, closed])
    await db.flush()

    rows = await station_analytics.get_station_freshness_trend(
        db, x="date", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    by_day = {r["x"].date(): r for r in rows}
    assert by_day[day_one.date()]["added_count"] == 2
    assert by_day[day_two.date()]["closed_count"] == 1
    assert render_chart("stations", "station_freshness_trend", rows, x="date", chart_type="line")


@pytest.mark.asyncio
async def test_station_freshness_trend_skips_closed_without_a_stamp(db):
    """A closed station with no status_changed_at has no day to plot, so it's excluded.

    Latent rather than reachable today (create/update_station always stamp), but it is the
    same NULL-date exposure as H1b and the sort would raise TypeError on it.
    """
    user_uuid = await _make_user(db)
    unstamped = _make_station(user_uuid, operational_status="temporarily_closed")
    unstamped.created_at = datetime(2026, 8, 10, 6, 0, tzinfo=UTC)
    unstamped.status_changed_at = None
    db.add(unstamped)
    await db.flush()

    rows = await station_analytics.get_station_freshness_trend(
        db, x="date", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert all(r["x"] is not None for r in rows)
    assert sum(r["closed_count"] for r in rows) == 0
    assert render_chart("stations", "station_freshness_trend", rows, x="date", chart_type="line")
