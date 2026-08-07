"""Unit tests for the ticket/task analytics aggregation queries.

Covers the three trickiest pieces flagged in the analytics plan's verification
section: the unassigned/ongoing/completed bucket CTE, age-distribution bucketing,
and duplicate-ticket detection.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from app.services import ticket_analytics

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


@pytest.mark.asyncio
async def test_status_breakdown_buckets(db):
    """Classify tickets as unassigned/ongoing/completed based on their tasks.

    unassigned (no tasks / no assignments), ongoing (assigned, not all fulfilled),
    and completed (all non-canceled tasks fulfilled).
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

    rows = await ticket_analytics.get_status_breakdown(
        db, start_date=None, end_date=None, group_by=None, tz=UTC_TZ
    )
    counts = {row["bucket"]: row["count"] for row in rows}
    assert counts.get("unassigned") == 2  # A, B
    assert counts.get("ongoing") == 1  # C
    assert counts.get("completed") == 1  # D


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
        db, start_date=None, end_date=None, group_by=None, tz=UTC_TZ
    )
    counts = {row["age_bucket"]: row["count"] for row in rows}
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

    rows = await ticket_analytics.get_duplicate_count(
        db, start_date=None, end_date=None, group_by=None, tz=UTC_TZ
    )
    assert rows == [{"count": 2}]
