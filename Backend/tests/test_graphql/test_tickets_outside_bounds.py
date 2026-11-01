"""`tickets(outsideBounds:)`: the tickets a box leaves out, matched as `bounds` matches them (ADR-452)."""

import pytest

from app.models.request import Tickets
from tests.test_graphql.conftest import test_db
from tests.test_graphql.test_ticket_detail_boundary import (  # noqa: F401 — _only_this_tests_tickets is autouse
    INSIDE,
    OUTSIDE,
    TITLE,
    _box,
    _centre,
    _only_this_tests_tickets,
    _query,
    _signed_in,
    _ticket,
)

pytestmark = pytest.mark.asyncio

# `q` keeps every count to this module's tickets: a box leaves out every other ticket in the database.
TICKETS = f"""
query($bounds: BoundsInput, $outside: BoundsInput, $statuses: [TicketStatus!], $limit: Int = 50) {{
  tickets(bounds: $bounds, outsideBounds: $outside, statuses: $statuses, q: "{TITLE}", limit: $limit) {{
    items {{ uuid }}
    pageInfo {{ totalCount }}
  }}
}}
"""


async def _uuids(client, variables, token=None) -> tuple[list[str], int]:
    page = (await _query(client, TICKETS, variables, token))["tickets"]
    return sorted(i["uuid"] for i in page["items"]), page["pageInfo"]["totalCount"]


async def test_outside_bounds_lists_the_tickets_the_box_leaves_out(client, redis):
    """Signed in, by the exact point: the far ticket only, and totalCount says so."""
    _, token = await _signed_in(redis)
    near, far = await _ticket(INSIDE), await _ticket(OUTSIDE)
    box = _box([INSIDE.x, INSIDE.y], 0.01)

    assert await _uuids(client, {"outside": box}, token) == ([far], 1)
    assert await _uuids(client, {"bounds": box}, token) == ([near], 1)


async def test_the_two_boxes_split_every_ticket_once_with_the_edge_inside(client, redis):
    """`bounds` and `outsideBounds` over one box share no ticket and miss none; its edge is inside."""
    _, token = await _signed_in(redis)
    box = _box([INSIDE.x, INSIDE.y], 0.01)
    on_edge = await _ticket(type(INSIDE)(box["minLng"], INSIDE.y))
    near, far = await _ticket(INSIDE), await _ticket(OUTSIDE)
    finished = await _ticket(OUTSIDE)
    async with test_db() as db:
        (await db.get(Tickets, finished)).status = "completed"

    inside, inside_total = await _uuids(client, {"bounds": box}, token)
    outside, outside_total = await _uuids(client, {"outside": box}, token)
    every, total = await _uuids(client, {}, token)

    assert inside == sorted([on_edge, near])
    assert outside == sorted([far, finished])
    assert sorted(inside + outside) == every
    assert inside_total + outside_total == total
    # Other filters apply as before.
    assert await _uuids(client, {"outside": box, "statuses": ["pending"]}, token) == ([far], 1)


async def test_limit_zero_gives_the_count_alone(client, redis):
    """What the back office's 「有 N 張單在這個範圍外」 reads: no rows, just totalCount."""
    _, token = await _signed_in(redis)
    await _ticket(OUTSIDE)
    await _ticket(OUTSIDE)

    assert await _uuids(client, {"outside": _box([INSIDE.x, INSIDE.y], 0.01), "limit": 0}, token) == ([], 2)


async def test_an_anonymous_box_leaves_a_ticket_out_by_its_cell_centre_not_its_point(client):
    """Without view_detail a row is matched by the centre it is shown at, so the box learns no more."""
    uuid = await _ticket(INSIDE)
    centre = await _centre(INSIDE)
    gap = max(abs(centre[0] - INSIDE.x), abs(centre[1] - INSIDE.y))

    around_point = await _uuids(client, {"outside": _box([INSIDE.x, INSIDE.y], gap / 2)})
    around_centre = await _uuids(client, {"outside": _box(centre, gap / 2)})

    assert around_point == ([uuid], 1)
    assert around_centre == ([], 0)


async def test_each_row_is_left_out_by_the_point_its_caller_can_see(client, redis):
    """Own-scoped detail: the caller's ticket by its point, everyone else's by the centre."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    mine, theirs = await _ticket(INSIDE, created_by=user_uuid), await _ticket(INSIDE)
    centre = await _centre(INSIDE)
    gap = max(abs(centre[0] - INSIDE.x), abs(centre[1] - INSIDE.y))

    assert await _uuids(client, {"outside": _box([INSIDE.x, INSIDE.y], gap / 2)}, token) == ([theirs], 1)
    assert await _uuids(client, {"outside": _box(centre, gap / 2)}, token) == ([mine], 1)
