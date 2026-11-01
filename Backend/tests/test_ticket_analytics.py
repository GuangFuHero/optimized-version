"""Unit tests for ticket/task analytics aggregation and the chart_render x resolution.

Covers the trickiest pieces: the four-way bucket classification (exposed as
get_ticket_count(bucket=...)), date-grouping on top of a bucket filter, age-distribution
bucketing, the volunteer totals and trend, duplicate-ticket counting from the AI review's pairs,
and the "ignore x when it doesn't apply" behavior in app.services.chart_render.resolve().
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.core import search
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.schemas.analytics import ChartStyle, TicketTaskType
from app.services import ticket as ticket_service
from app.services import ticket_analytics
from app.services.analytics_common import MAX_TREND_DAYS, UNCATEGORIZED_LABEL, AnalyticsInputError
from app.services.chart_render import _render_pivoted, chart_series, render_chart, resolve

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
        title="t",
        contact_name="c",
        status="pending",
        priority="high",
        task_type=task_type,
    )


def _make_task(
    ticket_uuid: str, user_uuid: str, *, status: str = "pending", task_type: str = "rescue"
) -> TicketTask:
    return TicketTask(
        ticket_uuid=ticket_uuid,
        task_type=task_type,
        task_name="task",
        source="user",
        created_by=user_uuid,
        status=status,
        completed_at=datetime.now(UTC) if status == "fulfilled" else None,
        canceled_at=datetime.now(UTC) if status == "canceled" else None,
    )


async def _count(db, *, bucket, x=None, x_granularity="day") -> int:
    """Run get_ticket_count(bucket=...) ungrouped and return its single count."""
    rows = await ticket_analytics.get_ticket_count(
        db,
        bucket=bucket,
        x=x,
        x_granularity=x_granularity,
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
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

    db.add_all(
        [
            TaskAssignment(task_uuid=task_c.uuid, actor_uuid=user_uuid, status="accepted"),
            TaskAssignment(task_uuid=task_d.uuid, actor_uuid=user_uuid, status="completed"),
        ]
    )
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
        db,
        x=None,
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
    )
    assert rate[0]["total"] == 0
    assert rate[0]["completed"] == 0

    # Entered the backlog as new, left it as canceled, so the day nets out to zero.
    backlog = await ticket_analytics.get_net_backlog_change(
        db,
        x="date",
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
    )
    assert len(backlog) == 1
    assert backlog[0]["new_count"] == 1
    assert backlog[0]["completed_count"] == 0
    assert backlog[0]["canceled_count"] == 1
    assert backlog[0]["net_change"] == 0

    # No longer ageing — there is no outstanding work to be overdue.
    ages = await ticket_analytics.get_age_distribution(
        db,
        x=None,
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
    )
    assert sum(row["count"] for row in ages) == 0

    # And it appears on the day it was called off, matching the backlog drain series.
    by_day = await ticket_analytics.get_ticket_count(
        db,
        bucket="canceled",
        x="date",
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
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
        db,
        bucket="ongoing",
        x="date",
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
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
        db,
        bucket=None,
        x="category",
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
    )
    labels = {r["x"] for r in rows}
    assert None not in labels
    assert labels == {"rescue", UNCATEGORIZED_LABEL}

    # The whole point: this shape must now render as a line chart without raising.
    figure = render_chart("tickets", "total_tickets", rows, x="category", chart_type="line")
    assert figure["data"][0]["x"] == ["搜救", "未分類"]


@pytest.mark.asyncio
async def test_completion_rate_category_labels_null_task_type(db):
    """get_completion_rate shares the H1a grouping, so it gets the same label treatment."""
    user_uuid = await _make_user(db)
    db.add_all([_make_ticket(user_uuid, task_type=None)])
    await db.flush()

    rows = await ticket_analytics.get_completion_rate(
        db,
        x="category",
        x_granularity="day",
        start_date=None,
        end_date=None,
        tz=UTC_TZ,
    )
    assert [r["x"] for r in rows] == [UNCATEGORIZED_LABEL]
    assert render_chart("tickets", "completion_rate", rows, x="category", chart_type="line")


def _count_rows(*pairs) -> list[dict]:
    return [{"x": x, "count": count} for x, count in pairs]


def test_chart_series_tolerates_a_none_key():
    """Backstop at the shared series boundary: a None key sorts last instead of raising."""
    rows = _count_rows(("hr", 1), (None, 2), ("rescue", 3))
    x_values, series = chart_series("tickets", "total_tickets", rows)
    assert x_values == ["搜救", "人力", None]
    assert series == {"任務單": [3, 1, 2]}


def test_chart_series_orders_categories_by_glossary():
    """task_type keys sort in _CATEGORY_LABEL order, not alphabetically; 未分類 last."""
    rows = _count_rows(("uncategorized", 1), ("hr", 2), ("rescue", 3))
    x_values, series = chart_series("tickets", "total_tickets", rows)
    assert x_values == ["搜救", "人力", "未分類"]
    assert series == {"任務單": [3, 2, 1]}


def test_chart_series_orders_dates_but_keeps_other_keys_as_given():
    """Dates come back chronological whatever order SQL gave them; age buckets keep theirs."""
    later, earlier = datetime(2026, 8, 2), datetime(2026, 8, 1)
    x_values, series = chart_series("tickets", "total_tickets", _count_rows((later, 1), (earlier, 2)))
    assert (x_values, series) == ([earlier, later], {"任務單": [2, 1]})

    buckets = _count_rows(("<24h", 1), ("24-48h", 2), ("48-72h", 3), (">72h", 4))
    x_values, _ = chart_series("tickets", "age_distribution", buckets)
    assert x_values == ["<24h", "24-48h", "48-72h", ">72h"]


def test_chart_series_rate_stays_a_fraction_for_the_figure():
    """The figure's `.0%` tickformat needs the 0–1 fraction, so the series doesn't scale it."""
    rows = [{"total": 2, "completed": 1, "rate": 0.5}]
    assert chart_series("tickets", "completion_rate", rows) == (["總計"], {"完成率": [0.5]})


def test_render_pivoted_line_marks_a_single_point():
    """A one-point line has no segment to draw, so it falls back to a marker."""
    single = _render_pivoted(["overall"], {"v": [1]}, "line", ChartStyle())
    multi = _render_pivoted(["a", "b"], {"v": [1, 2]}, "line", ChartStyle())
    assert single.data[0].mode == "lines+markers"
    assert multi.data[0].mode == "lines"


def test_resolve_forced_x_fallback_is_deterministic():
    """allowed_x is an ordered tuple, so a forced-shape metric's fallback is stable."""
    for _ in range(5):
        assert resolve("tickets", "net_backlog_change", "category", None) == ("date", "line")
        assert resolve("stations", "station_freshness_trend", "category", None) == ("date", "line")


# --- volunteers ---


def _utc(month: int, day: int, hour: int = 0) -> datetime:
    return datetime(2026, month, day, hour, tzinfo=UTC)


def _json(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value if value is None or isinstance(value, int) else str(value)


def _record(db, row, *steps: tuple[datetime, dict | None]) -> None:
    """Audit entries for a flushed `row`, one per (when, changes), as the trigger would write them.

    The first step inserts the row on top of its own columns, later ones update, `changes` accumulate,
    and None deletes it.
    """
    state: dict = {}
    for n, (when, changes) in enumerate(steps):
        before = dict(state) if n else None
        action = "INSERT" if n == 0 else "UPDATE" if changes is not None else "DELETE"
        if n == 0:
            state = {
                c.name: _json(getattr(row, c.name)) for c in row.__table__.columns if c.name != "search_text"
            }
        state = {**state, **{k: _json(v) for k, v in (changes or {}).items()}}
        db.add(
            AuditLog(
                table_name=row.__tablename__,
                action=action,
                row_id=row.uuid,
                old_values=before,
                new_values=None if changes is None else dict(state),
                created_at=when,
            )
        )


def _need(ticket_uuid: str, user_uuid: str, *, quantity: int | None, **columns) -> TicketTask:
    """A need created in the past; `columns` overrides any TicketTask column."""
    task = _make_task(ticket_uuid, user_uuid, status=columns.pop("status", "pending"))
    task.quantity = quantity
    task.created_at = columns.pop("created_at", datetime.now(UTC) - timedelta(days=10))
    for name, value in columns.items():
        setattr(task, name, value)
    return task


def _taken(
    task: TicketTask, actors: list[str], *, at: datetime | None = None, status: str = "accepted"
) -> list:
    """One assignment per actor on `task`, made in the past unless `at` says when."""
    return [
        TaskAssignment(
            task_uuid=task.uuid,
            actor_uuid=actor,
            status=status,
            assigned_at=at or datetime.now(UTC) - timedelta(days=1),
        )
        for actor in actors
    ]


async def _volunteers(db, metric, *, x=None, start_date=None, end_date=None, tz=UTC_TZ, extra_filters=None):
    return await ticket_analytics.get_volunteer_metric(
        db,
        metric=metric,
        x=x,
        x_granularity="day",
        start_date=start_date,
        end_date=end_date,
        tz=tz,
        extra_filters=extra_filters,
    )


@pytest.mark.asyncio
async def test_volunteer_totals_count_standing_needs_that_give_a_quantity(db):
    """Needed sums quantity, matched counts every claim, gap is what the open needs still lack.

    A full need and a stopped one are matched but have no gap; a need with no quantity, a
    canceled one, one merged into another and one canceled with its deleted ticket count in none of the three.
    """
    owner = await _make_user(db)
    people = [await _make_user(db) for _ in range(5)]
    ticket, deleted = _make_ticket(owner, task_type="hr"), _make_ticket(owner, task_type="hr")
    deleted.delete_at = datetime.now(UTC)
    db.add_all([ticket, deleted])
    await db.flush()
    t = str(ticket.uuid)
    gone = dict(status="canceled", canceled_at=datetime.now(UTC), delete_at=datetime.now(UTC))
    open_need = _need(t, owner, quantity=5)
    full = _need(t, owner, quantity=4, status="fulfilled", completed_at=datetime.now(UTC))
    stopped = _need(
        t,
        owner,
        quantity=3,
        status="fulfilled",
        completed_at=datetime.now(UTC),
        recruiting_stopped_at=datetime.now(UTC),
    )
    no_quantity = _need(t, owner, quantity=None)
    canceled = _need(t, owner, quantity=7, **gone)
    db.add_all(
        [open_need, full, stopped, no_quantity, canceled, _need(str(deleted.uuid), owner, quantity=9, **gone)]
    )
    await db.flush()
    db.add(_need(t, owner, quantity=2, merged_into_uuid=open_need.uuid, **gone))
    db.add_all(
        [
            *_taken(open_need, people[:2]),
            *_taken(open_need, people[2:3], status="completed"),  # still a place taken
            *_taken(full, people[:4]),
            *_taken(stopped, people[:3]),
            *_taken(no_quantity, people[:2]),
        ]
    )
    await db.flush()

    assert await _volunteers(db, "needed") == [{"count": 12}]
    assert await _volunteers(db, "matched") == [{"count": 10}]
    assert await _volunteers(db, "gap") == [{"count": 2}]
    # Running totals: a created-in-range start_date does not narrow them.
    assert await _volunteers(db, "needed", start_date=date.today() + timedelta(days=1)) == [{"count": 12}]


@pytest.mark.asyncio
async def test_volunteer_totals_are_zero_with_no_needs(db):
    """With nothing to count a total is 0, and a grouping has no rows."""
    for metric in ("needed", "matched", "gap"):
        assert await _volunteers(db, metric) == [{"count": 0}]
        assert await _volunteers(db, metric, x="category") == []


@pytest.mark.asyncio
async def test_volunteer_totals_by_category_follow_the_needs_task_type(db):
    """x=category groups by the need's own task_type, and a task_type filter reads it too."""
    owner = await _make_user(db)
    people = [await _make_user(db) for _ in range(2)]
    tickets = [_make_ticket(owner, task_type="supply") for _ in range(4)]
    db.add_all(tickets)
    await db.flush()
    needs = [
        _need(str(ticket.uuid), owner, quantity=quantity, task_type=kind)
        for ticket, quantity, kind in zip(
            tickets, (3, 4, 5, 6), ("supply", "supply", "medical", "hr"), strict=True
        )
    ]
    db.add_all(needs)
    await db.flush()
    db.add_all(_taken(needs[0], people) + _taken(needs[2], people[:1]))
    await db.flush()

    rows = await _volunteers(db, "gap", x="category")
    assert {r["x"]: r["count"] for r in rows} == {"supply": 5, "medical": 4, "hr": 6}
    rows = await _volunteers(db, "matched", x="category")
    assert {r["x"]: r["count"] for r in rows} == {"supply": 2, "medical": 1, "hr": 0}
    # The ticket says supply for all four; the filter still sees the medical need's own type.
    assert await _volunteers(db, "needed", extra_filters=[Tickets.task_type == "medical"]) == [{"count": 5}]


@pytest.mark.asyncio
async def test_volunteer_totals_stay_inside_the_callers_filters(db):
    """The caller's row filters narrow the totals, as they do every other metric."""
    mine, theirs, nobody = await _make_user(db), await _make_user(db), await _make_user(db)
    own, other = _make_ticket(mine), _make_ticket(theirs)
    db.add_all([own, other])
    await db.flush()
    db.add_all([_need(str(own.uuid), mine, quantity=2), _need(str(other.uuid), theirs, quantity=8)])
    await db.flush()

    assert await _volunteers(db, "needed", extra_filters=[Tickets.created_by == mine]) == [{"count": 2}]
    assert await _volunteers(db, "needed", extra_filters=[Tickets.created_by == nobody]) == [{"count": 0}]


async def _seed_trend(db) -> None:
    """Four needs whose audit history tells a September story, read back day by day below.

    A stays open; B is created on the 2nd and filled on the 4th; C is canceled on the 3rd;
    D is stopped by hand on the 3rd, at the two people it had.
    """
    owner = await _make_user(db)
    people = [await _make_user(db) for _ in range(5)]
    ticket = _make_ticket(owner, task_type="hr")
    db.add(ticket)
    await db.flush()
    t = str(ticket.uuid)
    a = _need(t, owner, quantity=10, created_at=_utc(9, 1, 9))
    b = _need(t, owner, quantity=5, status="fulfilled", created_at=_utc(9, 2, 9), completed_at=_utc(9, 4, 8))
    c = _need(
        t,
        owner,
        quantity=4,
        status="canceled",
        created_at=_utc(9, 1, 9),
        canceled_at=_utc(9, 3, 8),
        delete_at=_utc(9, 3, 8),
    )
    d = _need(
        t,
        owner,
        quantity=2,
        status="fulfilled",
        created_at=_utc(9, 1, 9),
        completed_at=_utc(9, 3, 12),
        recruiting_stopped_at=_utc(9, 3, 12),
    )
    db.add_all([a, b, c, d])
    await db.flush()
    _record(db, a, (_utc(9, 1, 9), {}))
    _record(
        db,
        b,
        (_utc(9, 2, 9), {"status": "pending", "completed_at": None}),
        (_utc(9, 4, 8), {"status": "fulfilled", "completed_at": _utc(9, 4, 8)}),
    )
    _record(
        db,
        c,
        (_utc(9, 1, 9), {"status": "pending", "canceled_at": None, "delete_at": None}),
        (_utc(9, 3, 8), {"status": "canceled", "canceled_at": _utc(9, 3, 8), "delete_at": _utc(9, 3, 8)}),
    )
    _record(
        db,
        d,
        (_utc(9, 1, 9), {"status": "pending", "completed_at": None, "recruiting_stopped_at": None}),
        (
            _utc(9, 3, 12),
            {"status": "fulfilled", "completed_at": _utc(9, 3, 12), "recruiting_stopped_at": _utc(9, 3, 12)},
        ),
    )
    claims = [
        *_taken(a, people[:1], at=_utc(9, 2, 10)),
        *_taken(a, people[1:3], at=_utc(9, 3, 10)),
        *_taken(b, people, at=_utc(9, 3, 12)),
        *_taken(d, people[:2], at=_utc(9, 2, 9)),
    ]
    db.add_all(claims)
    await db.flush()
    for claim in claims:
        _record(db, claim, (claim.assigned_at, {}))
    await db.flush()


@pytest.mark.asyncio
async def test_volunteer_gap_trend_is_the_gap_at_the_end_of_each_day(db):
    """Each day's gap is read as of that day's end from the need and claim audit history."""
    await _seed_trend(db)

    rows = await _volunteers(db, "gap", x="date", start_date=date(2026, 9, 1), end_date=date(2026, 9, 5))
    assert [(r["x"], r["count"]) for r in rows] == [
        (datetime(2026, 9, 1), 16),  # A 10, C 4, D 2; B not yet created
        (datetime(2026, 9, 2), 18),  # A 9 (one taken), C 4, D 0 (both taken), B 5
        (datetime(2026, 9, 3), 7),  # A 7; C canceled, D stopped, B has its five
        (datetime(2026, 9, 4), 7),  # B filled that morning
        (datetime(2026, 9, 5), 7),
    ]
    # The last day agrees with the running total as of that day, and with today's.
    assert await _volunteers(db, "gap", end_date=date(2026, 9, 5)) == [{"count": 7}]
    assert await _volunteers(db, "gap") == [{"count": 7}]


@pytest.mark.asyncio
async def test_volunteer_totals_can_be_read_as_of_an_earlier_day(db):
    """end_date reads a total as of the end of that day instead of now."""
    await _seed_trend(db)

    assert await _volunteers(db, "needed", end_date=date(2026, 9, 1)) == [{"count": 16}]
    assert await _volunteers(db, "needed", end_date=date(2026, 9, 2)) == [{"count": 21}]
    assert await _volunteers(db, "matched", end_date=date(2026, 9, 2)) == [{"count": 3}]
    assert await _volunteers(db, "matched", end_date=date(2026, 9, 3)) == [{"count": 10}]
    # Today: C was canceled, so A, B and D remain.
    assert await _volunteers(db, "needed") == [{"count": 17}]


@pytest.mark.asyncio
async def test_volunteer_trend_keeps_a_released_place_and_a_stopped_quantity_in_the_past(db):
    """A place given back, and a need cut to its headcount, change only the days after them."""
    owner = await _make_user(db)
    people = [await _make_user(db) for _ in range(3)]
    ticket = _make_ticket(owner, task_type="hr")
    db.add(ticket)
    await db.flush()
    t = str(ticket.uuid)
    stopped = _need(
        t,
        owner,
        quantity=2,
        status="fulfilled",
        created_at=_utc(9, 1, 9),
        recruiting_stopped_at=_utc(9, 3, 12),
    )
    open_need = _need(t, owner, quantity=4, created_at=_utc(9, 1, 9))
    db.add_all([stopped, open_need])
    await db.flush()
    # The stopped need asked for 6 and had 2 people when it was stopped; the other had one person
    # who gave the place back on the 4th.
    _record(
        db,
        stopped,
        (_utc(9, 1, 9), {"quantity": 6, "status": "pending", "recruiting_stopped_at": None}),
        (_utc(9, 3, 12), {"quantity": 2, "status": "fulfilled", "recruiting_stopped_at": _utc(9, 3, 12)}),
    )
    _record(db, open_need, (_utc(9, 1, 9), {}))
    claims = [
        *_taken(stopped, people[:2], at=_utc(9, 2, 9)),
        *_taken(open_need, people[2:], at=_utc(9, 2, 9)),
    ]
    db.add_all(claims)
    await db.flush()
    for claim in claims[:2]:
        _record(db, claim, (_utc(9, 2, 9), {}))
    _record(db, claims[2], (_utc(9, 2, 9), {}), (_utc(9, 4, 10), None))
    await db.delete(claims[2])
    await db.flush()

    rows = await _volunteers(db, "gap", x="date", start_date=date(2026, 9, 1), end_date=date(2026, 9, 5))
    assert [r["count"] for r in rows] == [
        10,
        7,
        3,
        4,
        4,
    ]  # 6+4, then 4+3; stopped on the 3rd; place back on the 4th
    assert [
        r["count"]
        for r in await _volunteers(
            db, "matched", x="date", start_date=date(2026, 9, 1), end_date=date(2026, 9, 5)
        )
    ] == [0, 3, 3, 2, 2]


@pytest.mark.asyncio
async def test_volunteer_trend_follows_claims_a_merge_moved_and_rows_older_than_auditing(db):
    """A moved claim counts on the need it stood on each day; a need first logged by an update starts old."""
    owner = await _make_user(db)
    person = await _make_user(db)
    ticket = _make_ticket(owner, task_type="hr")
    db.add(ticket)
    await db.flush()
    t = str(ticket.uuid)
    absorbed = _need(
        t, owner, quantity=3, status="canceled", created_at=_utc(8, 1), canceled_at=_utc(9, 3, 8)
    )
    kept = _need(t, owner, quantity=2, created_at=_utc(8, 1))
    db.add_all([absorbed, kept])
    await db.flush()
    _record(
        db,
        absorbed,
        (_utc(8, 1), {"status": "pending", "canceled_at": None}),
        (_utc(9, 3, 8), {"status": "canceled", "canceled_at": _utc(9, 3, 8)}),
    )
    # First entry is an update: the need predates auditing, and before it held `old` values.
    db.add(
        AuditLog(
            table_name="ticket_tasks",
            action="UPDATE",
            row_id=kept.uuid,
            old_values={
                **{
                    c.name: _json(getattr(kept, c.name))
                    for c in kept.__table__.columns
                    if c.name != "search_text"
                },
                "quantity": 5,
            },
            new_values={
                **{
                    c.name: _json(getattr(kept, c.name))
                    for c in kept.__table__.columns
                    if c.name != "search_text"
                }
            },
            created_at=_utc(9, 3, 8),
        )
    )
    claim = TaskAssignment(
        task_uuid=absorbed.uuid, actor_uuid=person, status="accepted", assigned_at=_utc(9, 1, 9)
    )
    db.add(claim)
    await db.flush()
    _record(db, claim, (_utc(9, 1, 9), {}), (_utc(9, 3, 8), {"task_uuid": kept.uuid}))
    claim.task_uuid = kept.uuid
    await db.flush()

    span = dict(x="date", start_date=date(2026, 9, 1), end_date=date(2026, 9, 4))
    # 1st-2nd: absorbed 3-1 and kept 5; 3rd on: kept 2 with the moved person.
    assert [r["count"] for r in await _volunteers(db, "gap", **span)] == [7, 7, 1, 1]
    assert [r["count"] for r in await _volunteers(db, "matched", **span)] == [1, 1, 1, 1]


@pytest.mark.asyncio
async def test_volunteer_totals_read_the_latest_audit_entry_when_entries_share_a_time(db):
    """Entries written in one transaction share a timestamp; the one written last is the state."""
    owner = await _make_user(db)
    ticket = _make_ticket(owner)
    db.add(ticket)
    await db.flush()
    need = _need(str(ticket.uuid), owner, quantity=9, created_at=_utc(9, 1, 9))
    db.add(need)
    await db.flush()
    _record(db, need, (_utc(9, 1, 9), {"quantity": 4}), (_utc(9, 1, 9), {"quantity": 9}))
    await db.flush()

    assert await _volunteers(db, "needed", end_date=date(2026, 9, 2)) == [{"count": 9}]


@pytest.mark.asyncio
async def test_a_trend_over_the_statement_ceiling_is_refused_as_a_bad_request(db, monkeypatch):
    """A trend too costly for the ceiling is cancelled and surfaces as the 400-type input error."""
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 1)
    await _seed_trend(db)

    with pytest.raises(AnalyticsInputError, match="逾時.*趨勢請縮短日期範圍"):
        await _volunteers(
            db, "gap", x="date", start_date=date(2026, 1, 1), end_date=date(2026, 1, 1) + timedelta(days=365)
        )


@pytest.mark.asyncio
async def test_a_total_over_the_statement_ceiling_is_not_told_to_shorten_the_range(db, monkeypatch):
    """A total or a by-category view has no range to shorten, so the refusal must not suggest one."""
    monkeypatch.setattr(search, "SEARCH_STATEMENT_TIMEOUT_MS", 1)
    await _seed_trend(db)

    for x in (None, "category"):
        with pytest.raises(AnalyticsInputError, match="逾時") as refused:
            await _volunteers(db, "gap", x=x)
        assert "日期範圍" not in str(refused.value)


@pytest.mark.asyncio
async def test_audit_entries_of_rows_no_longer_in_ticket_tasks_are_not_read(db):
    """The need history is read for the rows still in ticket_tasks only; a stray entry changes nothing."""
    owner = await _make_user(db)
    ticket = _make_ticket(owner)
    db.add(ticket)
    await db.flush()
    need = _need(str(ticket.uuid), owner, quantity=3, created_at=_utc(9, 1))
    db.add(need)
    await db.flush()
    _record(db, need, (_utc(9, 1), {"quantity": 3}))
    db.add(
        AuditLog(
            table_name="ticket_tasks",
            action="INSERT",
            row_id=uuid.uuid4(),
            new_values={
                "ticket_uuid": str(ticket.uuid),
                "quantity": 50,
                "status": "pending",
                "task_type": "rescue",
                "created_at": _utc(9, 1).isoformat(),
            },
            created_at=_utc(9, 1),
        )
    )
    await db.flush()

    assert await _volunteers(db, "needed", end_date=date(2026, 9, 2)) == [{"count": 3}]


def test_task_type_filter_values_are_the_ticket_task_types():
    """A new task type must reach the filter and the catalog; this fails until it does."""
    assert {t.value for t in TicketTaskType} == ticket_service.TASK_TYPES


@pytest.mark.asyncio
async def test_volunteer_trend_days_follow_the_callers_timezone(db):
    """17:00 UTC on the 1st is already the 2nd in Taipei, so the need shows from the 2nd there."""
    owner = await _make_user(db)
    ticket = _make_ticket(owner)
    db.add(ticket)
    await db.flush()
    db.add(_need(str(ticket.uuid), owner, quantity=3, created_at=_utc(9, 1, 17)))
    await db.flush()
    span = dict(x="date", start_date=date(2026, 9, 1), end_date=date(2026, 9, 2))

    assert [r["count"] for r in await _volunteers(db, "gap", **span)] == [3, 3]
    assert [r["count"] for r in await _volunteers(db, "gap", tz=ZoneInfo("Asia/Taipei"), **span)] == [0, 3]


@pytest.mark.asyncio
async def test_volunteer_trend_defaults_to_thirty_days_and_is_capped(db):
    """Without start_date the trend covers 30 days; an inverted or over-wide range is refused."""
    days = await _volunteers(db, "gap", x="date", end_date=date(2026, 9, 30))
    assert [r["x"] for r in days] == [datetime(2026, 9, 1) + timedelta(days=i) for i in range(30)]
    assert [r["count"] for r in days] == [0] * 30

    with pytest.raises(ValueError, match="at most"):
        await _volunteers(
            db,
            "gap",
            x="date",
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 1) + timedelta(days=MAX_TREND_DAYS),
        )
    with pytest.raises(ValueError, match="on or after start_date"):
        await _volunteers(db, "gap", x="date", start_date=date(2026, 9, 2), end_date=date(2026, 9, 1))
    # The widest span allowed still runs.
    assert (
        len(
            await _volunteers(
                db,
                "gap",
                x="date",
                start_date=date(2026, 1, 1),
                end_date=date(2026, 1, 1) + timedelta(days=MAX_TREND_DAYS - 1),
            )
        )
        == MAX_TREND_DAYS
    )


# --- duplicate_count, from the AI review's pairs ---


def _pair(kind: str, a, b, *, status: str = "dup_ignored", created_at: datetime | None = None, **columns):
    low, high = sorted((uuid.UUID(str(a)), uuid.UUID(str(b))), key=lambda u: u.int)
    pair = DuplicatePair(
        entity_kind=kind,
        low_uuid=low,
        high_uuid=high,
        method="fast_rule",
        engine_version="fast-v1",
        source_layer="fast",
        status=status,
        **columns,
    )
    if created_at is not None:
        pair.created_at = created_at
    return pair


async def _duplicates(db, *, x=None, start_date=None, end_date=None, extra_filters=None):
    return await ticket_analytics.get_duplicate_count(
        db,
        x=x,
        x_granularity="day",
        start_date=start_date,
        end_date=end_date,
        tz=UTC_TZ,
        extra_filters=extra_filters,
    )


async def _tickets_with_a_need(db, user_uuid: str, n: int, **ticket_columns) -> list[tuple[str, str]]:
    """`n` tickets, each with one need; the (ticket uuid, need uuid) of each."""
    tickets = [_make_ticket(user_uuid, **ticket_columns) for _ in range(n)]
    db.add_all(tickets)
    await db.flush()
    needs = [_make_task(str(ticket.uuid), user_uuid) for ticket in tickets]
    db.add_all(needs)
    await db.flush()
    return [(str(ticket.uuid), str(need.uuid)) for ticket, need in zip(tickets, needs, strict=True)]


@pytest.mark.asyncio
async def test_duplicate_count_counts_each_ticket_with_a_pending_card_once(db):
    """Need cards and ticket cards both count; a ticket named by two cards is still one."""
    user_uuid = await _make_user(db)
    a, b, c, d, e, f, g, h, i, j, k, m, n = await _tickets_with_a_need(db, user_uuid, 13)
    station = Station(
        geometry=from_shape(Point(121.5, 25.0), srid=4326),
        created_by=user_uuid,
        level=1,
        source="user",
        type="shelter",
        operational_status="active",
    )
    other_station = Station(
        geometry=from_shape(Point(121.5, 25.0), srid=4326),
        created_by=user_uuid,
        level=1,
        source="user",
        type="shelter",
        operational_status="active",
    )
    db.add_all([station, other_station])
    await db.flush()
    resolved = _pair("ticket_task", h[1], i[1])
    db.add_all(
        [
            _pair("ticket_task", a[1], b[1]),  # counts a and b
            _pair("ticket_task", a[1], c[1], status="suggested"),  # c too; a is not counted twice
            _pair("ticket", d[0], e[0]),  # a ticket card: the sides are the tickets
            _pair("ticket_task", f[1], g[1], status="confirmed_duplicate"),  # settled
            _pair("ticket_task", j[1], k[1], status="not_duplicate"),  # settled
            resolved,  # pending by status, but a merge already resolved it
            _pair("ticket_task", m[1], n[1], delete_at=datetime.now(UTC)),  # soft-deleted card
            _pair("station", station.uuid, other_station.uuid),  # not about tickets
        ]
    )
    await db.flush()
    db.add(
        DedupAuditEvent(
            entity_kind="ticket_task", event_type="merged", pair_uuid=resolved.uuid, source_layer="manual"
        )
    )
    await db.flush()

    assert await _duplicates(db) == [{"count": 5}]  # a, b, c, d, e


@pytest.mark.asyncio
async def test_duplicate_count_leaves_out_tickets_that_are_gone(db):
    """A ticket cancelled by a merge is soft-deleted; a card still pending on it flags nothing."""
    user_uuid = await _make_user(db)
    (a, a_need), (b, b_need) = await _tickets_with_a_need(db, user_uuid, 2)
    ticket = await db.get(Tickets, b)
    ticket.delete_at = datetime.now(UTC)
    db.add(_pair("ticket_task", a_need, b_need))
    await db.flush()

    assert await _duplicates(db) == [{"count": 0}]


@pytest.mark.asyncio
async def test_duplicate_count_dates_a_ticket_by_its_cards(db):
    """The range filters on the card's created_at, and x=date puts a ticket on its earliest card."""
    user_uuid = await _make_user(db)
    a, b, c = await _tickets_with_a_need(db, user_uuid, 3)
    db.add_all(
        [
            _pair("ticket_task", a[1], b[1], created_at=_utc(9, 1, 10)),
            _pair("ticket_task", a[1], c[1], created_at=_utc(9, 3, 10)),
        ]
    )
    await db.flush()

    assert await _duplicates(db, start_date=date(2026, 9, 3), end_date=date(2026, 9, 3)) == [
        {"count": 2}
    ]  # a, c
    assert await _duplicates(db, start_date=date(2026, 9, 2), end_date=date(2026, 9, 2)) == [{"count": 0}]
    by_day = await _duplicates(db, x="date")
    assert sorted((r["x"], r["count"]) for r in by_day) == [
        (datetime(2026, 9, 1), 2),
        (datetime(2026, 9, 3), 1),
    ]


@pytest.mark.asyncio
async def test_duplicate_count_by_category_follows_the_tickets_task_type(db):
    """x=category groups a flagged ticket by its task_type."""
    user_uuid = await _make_user(db)
    a, b = await _tickets_with_a_need(db, user_uuid, 2, task_type="supply")
    c, d = await _tickets_with_a_need(db, user_uuid, 2, task_type="medical")
    db.add_all([_pair("ticket_task", a[1], b[1]), _pair("ticket_task", c[1], d[1])])
    await db.flush()

    rows = await _duplicates(db, x="category")
    assert {r["x"]: r["count"] for r in rows} == {"supply": 2, "medical": 2}


@pytest.mark.asyncio
async def test_duplicate_count_needs_both_tickets_of_a_card_inside_the_callers_filters(db):
    """Counting a ticket whose twin the caller cannot see would show that the twin exists."""
    mine, theirs = await _make_user(db), await _make_user(db)
    (own_a, own_a_need), (own_b, own_b_need) = await _tickets_with_a_need(db, mine, 2)
    ((_, other_need),) = await _tickets_with_a_need(db, theirs, 1)
    db.add_all([_pair("ticket_task", own_a_need, own_b_need), _pair("ticket_task", own_a_need, other_need)])
    await db.flush()

    assert await _duplicates(db) == [{"count": 3}]
    assert await _duplicates(db, extra_filters=[Tickets.created_by == mine]) == [{"count": 2}]
    assert await _duplicates(db, extra_filters=[Tickets.created_by == theirs]) == [{"count": 0}]
