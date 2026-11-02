"""Inside one building, requests on different floors are not duplicates (ADR-451), on the real engine."""

import random

import pytest

from tests.test_graphql.test_building_map import _create_building
from tests.test_graphql.test_create_dedup import CREATE_TICKET, CREATE_TICKET_TASK, PUMP, _post

pytestmark = [pytest.mark.asyncio, pytest.mark.real_dedup]

PUMP = PUMP | {"quantity": 1}


async def _building(client, token) -> dict:
    """A building of its own, far from every other test's tickets, so none of theirs is a candidate."""
    spot = {"type": "Point", "coordinates": [140 + random.random() * 20, -40 + random.random() * 20]}
    return await _create_building(client, token, geometry=spot)


def _ticket(building_uuid=None, floor=None, tasks=(PUMP,), **extra) -> dict:
    location = {} if floor is None else {"floor": floor}
    building = {} if building_uuid is None else {"buildingMapUuid": building_uuid}
    return {
        "title": "地下室淹水",
        "contactName": "王小明",
        "secondaryLocation": location,
        "tasks": list(tasks),
        **building,
        **extra,
    }


async def _file(client, token, building_uuid, floor=None, tasks=(PUMP,)) -> dict:
    body = await _post(client, token, CREATE_TICKET, {"input": _ticket(building_uuid, floor, tasks)})
    return body["data"]["createTicket"]


async def _filed_on(client, token, building_uuid, floor, tasks=(PUMP,)) -> str:
    """A ticket on that floor, which must go through; returns its uuid."""
    result = await _file(client, token, building_uuid, floor, tasks)
    assert result["__typename"] == "TicketCreated", result
    return result["ticket"]["uuid"]


async def test_the_same_need_on_another_floor_of_the_building_is_not_held(
    client, coordinator_auth, login_user_auth
):
    """Both inside one building, each with its floor, and the floors differ: no suspect."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _building(client, admin_token)
    await _filed_on(client, token, building["uuid"], "3F")

    result = await _file(client, token, building["uuid"], "RF")

    assert result["__typename"] == "TicketCreated", result


@pytest.mark.parametrize("floor", ["3F", None], ids=["same-floor", "floor-unknown"])
async def test_the_same_need_on_the_same_or_an_unknown_floor_is_held(
    client, coordinator_auth, login_user_auth, floor
):
    """The same floor, or a floor left out on the new side, is compared as before."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _building(client, admin_token)
    await _filed_on(client, token, building["uuid"], "3F")

    result = await _file(client, token, building["uuid"], floor)

    assert result["__typename"] == "DuplicatesSuspected", result


async def test_an_earlier_ticket_with_no_floor_still_holds_one_on_a_floor(
    client, coordinator_auth, login_user_auth
):
    """A floor left out on the earlier side counts the same as on the new one."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _building(client, admin_token)
    await _filed_on(client, token, building["uuid"], None)

    result = await _file(client, token, building["uuid"], "RF")

    assert result["__typename"] == "DuplicatesSuspected", result


async def test_floors_outside_a_building_are_not_compared(client, coordinator_auth, login_user_auth):
    """Filed outside the building at its point, another floor still holds: only building floors count."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _building(client, admin_token)
    await _filed_on(client, token, building["uuid"], "3F")
    outside = _ticket(floor="RF", geometry=building["geometry"])

    body = await _post(client, token, CREATE_TICKET, {"input": outside})

    assert body["data"]["createTicket"]["__typename"] == "DuplicatesSuspected", body


async def test_a_need_added_on_another_floor_is_not_held(client, coordinator_auth, login_user_auth):
    """Adding a need, its ticket's own building and floor count: a like need upstairs does not hold it."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _building(client, admin_token)
    await _filed_on(client, token, building["uuid"], "3F")
    water = {"taskType": "supply", "taskName": "需要飲用水", "quantity": 20}
    below = await _filed_on(client, token, building["uuid"], "B1", tasks=(water,))

    body = await _post(client, token, CREATE_TICKET_TASK, {"input": PUMP | {"ticketUuid": below}})

    assert body["data"]["createTicketTask"]["__typename"] == "TicketTaskCreated", body
