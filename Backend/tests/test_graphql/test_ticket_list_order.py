"""The `tickets` list's NEEDS_FIRST order (ADR-419).

Tickets still short of people come first, one with an open rescue need ahead of the rest, finished
ones last. The GraphQL suite's database outlives a session, so other tests' tickets, and this file's from
earlier runs, are in it too. Each test files its tickets at a random spot of its own and lists them
with `bounds` a few kilometres around it.
"""

import random
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as graphql_db  # a bare `test_db` would be collected

LIST = """
query($bounds: BoundsInput, $order: TicketListOrder, $q: String, $skip: Int, $limit: Int) {
  tickets(bounds: $bounds, order: $order, q: $q, skip: $skip, limit: $limit) {
    items { title }
    pageInfo { totalCount }
  }
}
"""

NOW = datetime(2026, 10, 29, 9, 0, tzinfo=UTC)


def _spot() -> tuple[float, float]:
    """A random point, far enough from any other run's that their boxes do not meet."""
    return random.uniform(-170, 170), random.uniform(-60, 60)


def _bounds(lng: float, lat: float) -> dict:
    return {"minLng": lng - 0.05, "minLat": lat - 0.05, "maxLng": lng + 0.05, "maxLat": lat + 0.05}


async def _file(lng: float, lat: float, author_uuid: str, tickets: list[dict]) -> dict[str, dict]:
    """File each ticket — title, status, minutes ago, needs as (type, status) — around (lng, lat).

    Returns each ticket's needs by title, as {(type, status): need uuid}, for claims.
    """
    needs_by_title: dict[str, dict] = {}
    async with graphql_db() as db:
        for spec in tickets:
            ticket = Tickets(
                geometry=from_shape(Point(lng, lat), srid=4326),
                created_by=author_uuid,
                title=spec["title"],
                contact_name="測試",
                status=spec["status"],
                priority="medium",
                created_at=NOW - timedelta(minutes=spec["ago"]),
            )
            db.add(ticket)
            await db.flush()
            needs_by_title[spec["title"]] = {}
            for task_type, status in spec["needs"]:
                need = TicketTask(
                    ticket_uuid=str(ticket.uuid),
                    task_type=task_type,
                    task_name=f"{spec['title']} {task_type}",
                    quantity=2,
                    status=status,
                    created_by=author_uuid,
                )
                db.add(need)
                await db.flush()
                needs_by_title[spec["title"]][(task_type, status)] = str(need.uuid)
    return needs_by_title


async def _claim(actor_uuid: str, need_uuid: str) -> None:
    async with graphql_db() as db:
        db.add(TaskAssignment(task_uuid=need_uuid, actor_uuid=actor_uuid))


async def _titles(client, *, headers=None, **variables) -> list[str]:
    variables.setdefault("limit", 50)
    res = await client.post("/graphql", json={"query": LIST, "variables": variables}, headers=headers or {})
    body = res.json()
    assert "errors" not in body, body
    return [item["title"] for item in body["data"]["tickets"]["items"]]


# Newest first: 已完成 (0 min), 一般缺人 (10), 搜救已滿 (20), 舊的取消 (30), 搜救缺人 (40).
FIVE = [
    {"title": "已完成", "status": "completed", "ago": 0, "needs": [("rescue", "fulfilled")]},
    {"title": "一般缺人", "status": "pending", "ago": 10, "needs": [("supply", "pending")]},
    {
        "title": "搜救已滿",
        "status": "in_progress",
        "ago": 20,
        "needs": [("rescue", "fulfilled"), ("hr", "pending")],
    },
    # Cancelled by hand before statuses were derived: its need still reads pending, but it takes nobody.
    {"title": "舊的取消", "status": "cancelled", "ago": 30, "needs": [("rescue", "pending")]},
    {"title": "搜救缺人", "status": "pending", "ago": 40, "needs": [("rescue", "pending")]},
]
# FIVE in NEEDS_FIRST order for a guest: the open rescue need, the other open needs, the rest.
NEEDS_FIRST_FOR_A_GUEST = ["搜救缺人", "一般缺人", "搜救已滿", "已完成", "舊的取消"]


@pytest.mark.asyncio
async def test_needs_first_puts_an_open_rescue_need_first_and_finished_tickets_last(client, redis):
    """Three tiers, newest first within each: an open rescue need, another open need, nothing open."""
    author_uuid, _ = await _create_user_with_role(redis, "Login User")
    lng, lat = _spot()
    await _file(lng, lat, author_uuid, FIVE)

    titles = await _titles(client, bounds=_bounds(lng, lat), order="NEEDS_FIRST")

    assert titles == NEEDS_FIRST_FOR_A_GUEST


@pytest.mark.asyncio
async def test_without_an_order_the_list_stays_newest_first(client, redis):
    """NEWEST is the default: the back office and every other caller see no change."""
    author_uuid, _ = await _create_user_with_role(redis, "Login User")
    lng, lat = _spot()
    await _file(lng, lat, author_uuid, FIVE)

    titles = await _titles(client, bounds=_bounds(lng, lat))

    assert titles == ["已完成", "一般缺人", "搜救已滿", "舊的取消", "搜救缺人"]


@pytest.mark.asyncio
async def test_a_need_the_viewer_claimed_counts_as_open_for_them(client, redis):
    """Taking the last place does not send the ticket to the end of the claimer's own list.

    The viewer is on the filled rescue needs of 搜救已滿 and 已完成, so for them both have a live
    rescue need and join 搜救缺人 in the first tier. A guest sees the plain order.
    """
    author_uuid, _ = await _create_user_with_role(redis, "Login User")
    viewer_uuid, viewer_token = await _create_user_with_role(redis, "Login User")
    lng, lat = _spot()
    needs = await _file(lng, lat, author_uuid, FIVE)
    await _claim(viewer_uuid, needs["搜救已滿"][("rescue", "fulfilled")])
    await _claim(viewer_uuid, needs["已完成"][("rescue", "fulfilled")])

    mine = await _titles(
        client, headers=auth_header(viewer_token), bounds=_bounds(lng, lat), order="NEEDS_FIRST"
    )
    guest = await _titles(client, bounds=_bounds(lng, lat), order="NEEDS_FIRST")

    assert mine == ["已完成", "搜救已滿", "搜救缺人", "一般缺人", "舊的取消"]
    assert guest == NEEDS_FIRST_FOR_A_GUEST


@pytest.mark.asyncio
async def test_when_searching_the_tiers_come_before_relevance(client, redis):
    """A finished ticket that matches better still comes after one still short of people."""
    author_uuid, _ = await _create_user_with_role(redis, "Login User")
    lng, lat = _spot()
    await _file(
        lng,
        lat,
        author_uuid,
        [
            {"title": "清淤", "status": "completed", "ago": 0, "needs": [("hr", "fulfilled")]},
            {"title": "巷口民宅需要清淤人力", "status": "pending", "ago": 10, "needs": [("hr", "pending")]},
        ],
    )

    titles = await _titles(client, bounds=_bounds(lng, lat), q="清淤", order="NEEDS_FIRST")

    assert titles == ["巷口民宅需要清淤人力", "清淤"]


@pytest.mark.asyncio
async def test_pages_follow_the_order_without_repeating_or_skipping(client, redis):
    """Two at a time, the pages put together are the whole list, in order; totalCount is unchanged."""
    author_uuid, _ = await _create_user_with_role(redis, "Login User")
    lng, lat = _spot()
    await _file(lng, lat, author_uuid, FIVE)
    bounds = _bounds(lng, lat)

    pages = [
        await _titles(client, bounds=bounds, order="NEEDS_FIRST", skip=skip, limit=2) for skip in (0, 2, 4)
    ]
    res = await client.post(
        "/graphql", json={"query": LIST, "variables": {"bounds": bounds, "order": "NEEDS_FIRST", "limit": 2}}
    )

    assert [title for page in pages for title in page] == NEEDS_FIRST_FOR_A_GUEST
    assert res.json()["data"]["tickets"]["pageInfo"]["totalCount"] == 5
