"""Unit tests for ticket/task analytics aggregation and the chart_render x resolution.

Covers the trickiest pieces: the four-way bucket classification (exposed as
get_ticket_count(bucket=...)), date-grouping on top of a bucket filter, age-distribution
bucketing, duplicate-ticket detection, and the "ignore x when it doesn't apply" behavior
in app.services.chart_render.resolve().
"""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import ticket_analytics
from app.services.analytics_common import UNCATEGORIZED_LABEL
from app.services.chart_render import _render_pivoted, render_chart, resolve

UTC_TZ = ZoneInfo("UTC")


async def _make_user(db) -> str:
    user = User(name="tester")
    db.add(user)
    await db.flush()
    return str(user.uuid)


def _make_ticket(
    user_uuid: str, *, task_type: str = "rescue", lon: float = 121.5, lat: float = 25.0
) -> Tickets:
    return Tickets(
        geometry=from_shape(Point(lon, lat), srid=4326),
        created_by=user_uuid,
        title="t", contact_name="c", status="pending", priority="high",
        task_type=task_type, visibility="public",
    )


def _make_task(
    ticket_uuid: str, user_uuid: str, *, status: str = "pending", task_type: str = "rescue"
) -> TicketTask:
    return TicketTask(
        ticket_uuid=ticket_uuid, task_type=task_type, task_name="task",
        source="user", visibility="public", created_by=user_uuid, status=status,
    )


async def _count(db, *, bucket, x=None, x_granularity="day") -> int:
    """Run get_ticket_count(bucket=...) ungrouped and return its single count."""
    rows = await ticket_analytics.get_ticket_count(
        db, bucket=bucket, x=x, x_granularity=x_granularity,
        start_date=None, end_date=None, tz=UTC_TZ,
    )
    return rows[0]["count"] if rows else 0


@pytest.mark.asyncio
async def test_ticket_count_buckets(db):
    """Classify tickets into the four buckets based on their tasks.

    unassigned (no tasks or no assignments), ongoing (assigned, not all fulfilled), and
    completed (all un-canceled tasks fulfilled). bucket=None counts every ticket. The
    canceled bucket has its own test below.
    """
    user_uuid = await _make_user(db)

    # A: no tasks at all -> unassigned
    ticket_a = _make_ticket(user_uuid)
    # B: one task, no assignment -> unassigned
    ticket_b = _make_ticket(user_uuid)
    # C: one task, one assignment, still in_progress -> ongoing
    ticket_c = _make_ticket(user_uuid)
    # D: one task, one assignment, fulfilled -> completed
    ticket_d = _make_ticket(user_uuid)
    db.add_all([ticket_a, ticket_b, ticket_c, ticket_d])
    await db.flush()

    task_b = _make_task(str(ticket_b.uuid), user_uuid, status="pending")
    task_c = _make_task(str(ticket_c.uuid), user_uuid, status="in_progress")
    task_d = _make_task(str(ticket_d.uuid), user_uuid, status="fulfilled")
    db.add_all([task_b, task_c, task_d])
    await db.flush()

    db.add_all([
        TaskAssignment(task_uuid=task_c.uuid, actor_uuid=user_uuid, status="accepted"),
        TaskAssignment(task_uuid=task_d.uuid, actor_uuid=user_uuid, status="completed"),
    ])
    await db.commit()

    assert await _count(db, bucket=None) == 4  # total_tickets
    assert await _count(db, bucket="unassigned") == 2  # A, B
    assert await _count(db, bucket="ongoing") == 1  # C
    assert await _count(db, bucket="completed") == 1  # D
    assert await _count(db, bucket="canceled") == 0  # nothing was called off here


@pytest.mark.asyncio
async def test_a_fully_canceled_ticket_leaves_every_open_work_metric(db):
    """A ticket whose only task was canceled has no outstanding work, and must show that.

    Before the "canceled" bucket, such a ticket matched neither "unassigned" (it has an
    assignment) nor "completed" (no un-canceled task), so it fell through to "ongoing"
    permanently — inflating four metrics at once.
    """
    user_uuid = await _make_user(db)
    ticket = _make_ticket(user_uuid)
    db.add(ticket)
    await db.flush()

    task = _make_task(str(ticket.uuid), user_uuid, status="canceled")
    task.canceled_at = datetime.now(UTC)
    db.add(task)
    await db.flush()
    db.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=user_uuid, status="accepted"))
    await db.commit()

    assert await _count(db, bucket=None) == 1  # still a real ticket
    assert await _count(db, bucket="canceled") == 1
    assert await _count(db, bucket="ongoing") == 0
    assert await _count(db, bucket="completed") == 0
    assert await _count(db, bucket="unassigned") == 0

    # Excluded from the ratio entirely rather than counted as a delivery failure.
    rate = await ticket_analytics.get_completion_rate(
        db, x=None, x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert rate[0]["total"] == 0
    assert rate[0]["completed"] == 0

    # Entered the backlog as new, left it as canceled, so the day nets out to zero.
    backlog = await ticket_analytics.get_net_backlog_change(
        db, x="date", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert len(backlog) == 1
    assert backlog[0]["new_count"] == 1
    assert backlog[0]["completed_count"] == 0
    assert backlog[0]["canceled_count"] == 1
    assert backlog[0]["net_change"] == 0

    # No longer ageing — there is no outstanding work to be overdue.
    ages = await ticket_analytics.get_age_distribution(
        db, x=None, x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert sum(row["count"] for row in ages) == 0

    # And it appears on the day it was called off, matching the backlog drain series.
    by_day = await ticket_analytics.get_ticket_count(
        db, bucket="canceled", x="date", x_granularity="day",
        start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert [row["count"] for row in by_day] == [1]


@pytest.mark.asyncio
async def test_ticket_count_bucket_with_date_grouping(db):
    """get_ticket_count(bucket=..., x="date") groups the filtered bucket by creation day."""
    user_uuid = await _make_user(db)
    now = datetime.now(UTC)

    # Two "ongoing" tickets created on different days; one "unassigned" ticket that
    # must not be counted in the "ongoing" x=date breakdown.
    ongoing_day1 = _make_ticket(user_uuid)
    ongoing_day1.created_at = now - timedelta(days=3)
    ongoing_day2 = _make_ticket(user_uuid)
    ongoing_day2.created_at = now - timedelta(days=1)
    unassigned = _make_ticket(user_uuid)
    unassigned.created_at = now - timedelta(days=3)
    db.add_all([ongoing_day1, ongoing_day2, unassigned])
    await db.flush()

    for ticket in (ongoing_day1, ongoing_day2):
        task = _make_task(str(ticket.uuid), user_uuid, status="in_progress")
        task.created_at = ticket.created_at
        db.add(task)
        await db.flush()
        db.add(TaskAssignment(task_uuid=task.uuid, actor_uuid=user_uuid, status="accepted"))
    await db.commit()

    rows = await ticket_analytics.get_ticket_count(
        db, bucket="ongoing", x="date", x_granularity="day",
        start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert len(rows) == 2
    assert sum(row["count"] for row in rows) == 2


@pytest.mark.asyncio
async def test_age_distribution_buckets_and_excludes_completed(db):
    """Tickets are bucketed by (now - created_at) age; completed tickets are excluded."""
    user_uuid = await _make_user(db)
    now = datetime.now(UTC)

    ages = {
        "<24h": now - timedelta(hours=1),
        "24-48h": now - timedelta(hours=30),
        "48-72h": now - timedelta(hours=60),
        ">72h": now - timedelta(hours=100),
    }
    for created_at in ages.values():
        ticket = _make_ticket(user_uuid)
        ticket.created_at = created_at
        db.add(ticket)

    # A completed ticket, also >72h old, must NOT show up in any age bucket.
    completed_ticket = _make_ticket(user_uuid)
    completed_ticket.created_at = now - timedelta(hours=200)
    db.add(completed_ticket)
    await db.flush()
    completed_task = _make_task(str(completed_ticket.uuid), user_uuid, status="fulfilled")
    db.add(completed_task)
    await db.flush()
    db.add(TaskAssignment(task_uuid=completed_task.uuid, actor_uuid=user_uuid, status="completed"))
    await db.commit()

    rows = await ticket_analytics.get_age_distribution(
        db, x=None, x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ
    )
    counts = {row["x"]: row["count"] for row in rows}
    assert counts == {"<24h": 1, "24-48h": 1, "48-72h": 1, ">72h": 1}


@pytest.mark.asyncio
async def test_duplicate_count_flags_nearby_same_category_tickets(db):
    """Flag tickets that are close in space, time, and category.

    Two tickets sharing task_type, close in space and time, flag each other; an
    unrelated ticket (different category) does not.
    """
    user_uuid = await _make_user(db)
    now = datetime.now(UTC)

    # ~50m apart, same category, created minutes apart -> both should be flagged.
    near_a = _make_ticket(user_uuid, task_type="rescue", lon=121.50000, lat=25.00000)
    near_a.created_at = now
    near_b = _make_ticket(user_uuid, task_type="rescue", lon=121.50050, lat=25.00000)
    near_b.created_at = now + timedelta(minutes=10)

    # Far away (~1km+), same category -> not flagged.
    far = _make_ticket(user_uuid, task_type="rescue", lon=121.51000, lat=25.00000)
    far.created_at = now

    db.add_all([near_a, near_b, far])
    await db.commit()

    # A date range is mandatory for this metric (see
    # test_duplicate_count_requires_a_date_range) — window it around the fixtures.
    today = now.date()
    rows = await ticket_analytics.get_duplicate_count(
        db, x=None, x_granularity="day",
        start_date=today - timedelta(days=1), end_date=today + timedelta(days=1), tz=UTC_TZ,
    )
    assert rows == [{"count": 2}]


def test_resolve_ignores_inapplicable_x_instead_of_rejecting():
    """An x that doesn't apply to the chosen y/chart_type is silently dropped."""
    # task_completion_distribution has no x form at all -> x=date is ignored.
    assert resolve("tickets", "task_completion_distribution", "date", None) == (None, "pie")
    # A date trend can't be pie slices -> x collapses to None even though total_tickets
    # allows both x=date and chart_type=pie individually.
    assert resolve("tickets", "total_tickets", "date", "pie") == (None, "pie")
    # net_backlog_change is always date-grouped -> an inapplicable x still forces "date",
    # it doesn't fall back to ungrouped.
    assert resolve("tickets", "net_backlog_change", "category", None) == ("date", "line")


def test_resolve_still_rejects_invalid_chart_type():
    """Unlike x, chart_type stays strictly validated."""
    with pytest.raises(ValueError, match="chart_type"):
        resolve("tickets", "net_backlog_change", "date", "pie")


@pytest.mark.asyncio
async def test_ticket_count_category_labels_null_task_type(db):
    """A NULL task_type becomes a real label, so a line chart can sort the axis.

    Regression for the PR #32 review's H1a: task_type is nullable and was grouped raw, so
    `x=category&chart_type=line` mixed None with str in chart_render's sort and 500'd.
    """
    user_uuid = await _make_user(db)
    db.add_all([_make_ticket(user_uuid, task_type="rescue"), _make_ticket(user_uuid, task_type=None)])
    await db.flush()

    rows = await ticket_analytics.get_ticket_count(
        db, bucket=None, x="category", x_granularity="day",
        start_date=None, end_date=None, tz=UTC_TZ,
    )
    labels = {r["x"] for r in rows}
    assert None not in labels
    assert labels == {"rescue", UNCATEGORIZED_LABEL}

    # The whole point: this shape must now render as a line chart without raising.
    html = render_chart("tickets", "total_tickets", rows, x="category", chart_type="line")
    assert html.startswith("<div")


@pytest.mark.asyncio
async def test_completion_rate_category_labels_null_task_type(db):
    """get_completion_rate shares the H1a grouping, so it gets the same label treatment."""
    user_uuid = await _make_user(db)
    db.add_all([_make_ticket(user_uuid, task_type=None)])
    await db.flush()

    rows = await ticket_analytics.get_completion_rate(
        db, x="category", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert [r["x"] for r in rows] == [UNCATEGORIZED_LABEL]
    assert render_chart("tickets", "completion_rate", rows, x="category", chart_type="line")


@pytest.mark.asyncio
async def test_net_backlog_change_skips_tasks_without_completed_at(db):
    """An unstamped fulfilled task can't be placed on a day, so it stays out of the series.

    Regression for H1b: max(completed_at) returned NULL for tasks fulfilled before the
    column existed, date_trunc turned that into a NULL key, and the sort raised TypeError
    comparing None to datetime. Migration a1b2c3d4e5f6 backfills those rows; this asserts
    the query is safe even if one slips through.
    """
    user_uuid = await _make_user(db)
    stamped_ticket = _make_ticket(user_uuid)
    unstamped_ticket = _make_ticket(user_uuid)
    db.add_all([stamped_ticket, unstamped_ticket])
    await db.flush()

    completed_at = datetime(2026, 8, 10, 6, 0, tzinfo=UTC)
    for ticket, stamp in ((stamped_ticket, completed_at), (unstamped_ticket, None)):
        task = _make_task(str(ticket.uuid), user_uuid, status="fulfilled")
        task.completed_at = stamp
        db.add(task)
        await db.flush()
        db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=user_uuid, status="completed"))
    await db.flush()

    rows = await ticket_analytics.get_net_backlog_change(
        db, x="date", x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert all(r["x"] is not None for r in rows)
    # Exactly one ticket has a completion day; the unstamped one is absent from that series.
    assert sum(r["completed_count"] for r in rows) == 1
    assert render_chart("tickets", "net_backlog_change", rows, x="date", chart_type="line")


@pytest.mark.asyncio
async def test_ticket_count_completed_by_date_skips_unstamped(db):
    """The bucket="completed", x="date" path has the same NULL-date exposure as H1b."""
    user_uuid = await _make_user(db)
    ticket = _make_ticket(user_uuid)
    db.add(ticket)
    await db.flush()
    task = _make_task(str(ticket.uuid), user_uuid, status="fulfilled")
    task.completed_at = None
    db.add(task)
    await db.flush()
    db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=user_uuid, status="completed"))
    await db.flush()

    rows = await ticket_analytics.get_ticket_count(
        db, bucket="completed", x="date", x_granularity="day",
        start_date=None, end_date=None, tz=UTC_TZ,
    )
    assert all(r["x"] is not None for r in rows)


@pytest.mark.asyncio
async def test_duplicate_count_requires_a_date_range(db):
    """duplicate_count refuses an unbounded query — it's an O(n^2) self-join (H3)."""
    with pytest.raises(ValueError, match="requires both start_date and end_date"):
        await ticket_analytics.get_duplicate_count(
            db, x=None, x_granularity="day", start_date=None, end_date=None, tz=UTC_TZ,
        )
    with pytest.raises(ValueError, match="requires both start_date and end_date"):
        await ticket_analytics.get_duplicate_count(
            db, x=None, x_granularity="day",
            start_date=date(2026, 8, 1), end_date=None, tz=UTC_TZ,
        )
    # With both bounds it runs normally.
    rows = await ticket_analytics.get_duplicate_count(
        db, x=None, x_granularity="day",
        start_date=date(2026, 8, 1), end_date=date(2026, 8, 31), tz=UTC_TZ,
    )
    assert rows == [{"count": 0}]


def test_render_pivoted_line_tolerates_a_none_key():
    """Backstop at the shared render boundary: a None key sorts last instead of raising."""
    fig = _render_pivoted(["b", None, "a"], {"v": [1, 2, 3]}, "line")
    assert list(fig.data[0].x) == ["a", "b", None]


def test_resolve_forced_x_fallback_is_deterministic():
    """allowed_x is an ordered tuple, so a forced-shape metric's fallback is stable."""
    for _ in range(5):
        assert resolve("tickets", "net_backlog_change", "category", None) == ("date", "line")
        assert resolve("stations", "station_freshness_trend", "category", None) == ("date", "line")
