"""End-to-end tests for building maps and the tickets filed inside them."""

import pytest
from sqlalchemy import select

from app.models.geo import BuildingMapTicketMap
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as open_db

pytestmark = pytest.mark.asyncio

POINT = {"type": "Point", "coordinates": [121.4219, 23.6696]}
ADDRESS = {"county": "花蓮縣", "city": "光復鄉", "lane": "中正路", "no": "10號"}
LAYOUT = {
    "floorsAboveGround": 3,
    "floorsBelowGround": 1,
    "floorAreas": [
        {"floor": "1F", "areas": ["閱覽室", "健身房"]},
        {"floor": "2F", "areas": ["閱覽室", "咖啡廳", "其他"]},
    ],
}

BUILDING_FIELDS = "uuid name geometry floors { label areas } secondaryLocation { county lane no }"

CREATE_BUILDING = f"""
mutation ($input: CreateBuildingMapInput!) {{ createBuildingMap(input: $input) {{ {BUILDING_FIELDS} }} }}
"""
UPDATE_BUILDING = """
mutation ($uuid: UUID!, $input: UpdateBuildingMapInput!) {
  updateBuildingMap(uuid: $uuid, input: $input) { uuid floors { label areas } }
}
"""
DELETE_BUILDING = "mutation ($uuid: UUID!) { deleteBuildingMap(uuid: $uuid) }"
BUILDING = f"query ($uuid: UUID!) {{ buildingMap(uuid: $uuid) {{ {BUILDING_FIELDS} }} }}"
BUILDINGS = """
query ($bounds: BoundsInput) { buildingMaps(bounds: $bounds) { items { uuid } pageInfo { totalCount } } }
"""
CREATE_TICKET = """
mutation ($input: CreateTicketInput!) {
  createTicket(input: $input) { uuid geometry secondaryLocation { county city lane no floor room } }
}
"""
BUILDING_TICKETS = "query ($uuid: UUID!) { buildingMapTickets(buildingMapUuid: $uuid) { uuid } }"


async def _gql(client, query, variables, token=None):
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return resp.json()


async def _create_building(client, token, **overrides):
    body = await _gql(client, CREATE_BUILDING, {"input": {
        "name": "光復國小圖書館", "geometry": POINT, "secondaryLocation": ADDRESS, **LAYOUT, **overrides,
    }}, token)
    assert "errors" not in body, body
    return body["data"]["createBuildingMap"]


def _ticket_input(building_uuid, **location):
    return {"title": "咖啡廳天花板漏水", "contactName": "王小明",
            "buildingMapUuid": building_uuid, "secondaryLocation": location}


async def test_building_floors_are_listed_roof_first_with_other_on_floors_with_areas(
    client, coordinator_auth
):
    """Floors run from the roof down, and only floors with areas offer 其他, once."""
    _, token = coordinator_auth
    building = await _create_building(client, token)

    assert building["floors"] == [
        {"label": "RF", "areas": []},
        {"label": "3F", "areas": []},
        {"label": "2F", "areas": ["閱覽室", "咖啡廳", "其他"]},
        {"label": "1F", "areas": ["閱覽室", "健身房", "其他"]},
        {"label": "B1", "areas": []},
    ]
    assert building["secondaryLocation"] == {"county": "花蓮縣", "lane": "中正路", "no": "10號"}
    assert building["geometry"]["coordinates"] == POINT["coordinates"]


async def test_anonymous_caller_can_read_building_maps(client, coordinator_auth):
    """Building maps sit on the public map, so a guest can list and open them."""
    _, token = coordinator_auth
    building = await _create_building(client, token)

    body = await _gql(client, BUILDING, {"uuid": building["uuid"]})
    assert body["data"]["buildingMap"]["name"] == "光復國小圖書館"
    bounds = {"minLat": 23.6, "maxLat": 23.7, "minLng": 121.4, "maxLng": 121.5}
    body = await _gql(client, BUILDINGS, {"bounds": bounds})
    assert building["uuid"] in {item["uuid"] for item in body["data"]["buildingMaps"]["items"]}


async def test_create_building_map_requires_map_add(client, login_user_auth):
    """A plain signed-in user cannot pin a building."""
    _, token = login_user_auth
    body = await _gql(client, CREATE_BUILDING, {"input": {
        "name": "x", "geometry": POINT, "secondaryLocation": ADDRESS, **LAYOUT,
    }}, token)
    assert body["data"] is None and body["errors"]


@pytest.mark.parametrize(("overrides", "message"), [
    ({"floorAreas": [{"floor": "9F", "areas": ["頂樓"]}]}, "Floor '9F' is not in this building"),
    ({"secondaryLocation": {**ADDRESS, "floor": "2F"}}, "no building section, floor or room"),
    ({"floorsAboveGround": 0}, "floorsAboveGround must be"),
    ({"floorAreas": [{"floor": "1F", "areas": ["   "]}]}, "Area names must be"),
])
async def test_create_building_map_rejects_bad_layout(client, coordinator_auth, overrides, message):
    """An area outside the floor range, a floor in the address, or a zero-floor building is refused."""
    _, token = coordinator_auth
    body = await _gql(client, CREATE_BUILDING, {"input": {
        "name": "x", "geometry": POINT, "secondaryLocation": ADDRESS, **LAYOUT, **overrides,
    }}, token)
    assert any(message in e["message"] for e in body["errors"]), body


async def test_update_building_map_replaces_areas_and_rechecks_floor_range(client, coordinator_auth):
    """New areas replace the old set, and shrinking floors under an area list is refused."""
    _, token = coordinator_auth
    building = await _create_building(client, token)

    body = await _gql(client, UPDATE_BUILDING, {"uuid": building["uuid"], "input": {
        "floorAreas": [{"floor": "3F", "areas": ["機房"]}],
    }}, token)
    floors = {f["label"]: f["areas"] for f in body["data"]["updateBuildingMap"]["floors"]}
    assert floors["3F"] == ["機房", "其他"] and floors["1F"] == []

    body = await _gql(client, UPDATE_BUILDING, {"uuid": building["uuid"], "input": {
        "floorsAboveGround": 2,
    }}, token)
    assert any("Floor '3F' is not in this building" in e["message"] for e in body["errors"])


async def test_ticket_in_building_copies_its_point_and_address(
    client, coordinator_auth, login_user_auth
):
    """The ticket gets the building's point and address, the reporter's floor and room, and a link."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, CREATE_TICKET, {"input": _ticket_input(
        building["uuid"], floor="2F", room="咖啡廳", county="台北市", lane="假路",
    )}, token)
    assert "errors" not in body, body
    ticket = body["data"]["createTicket"]
    assert ticket["geometry"]["coordinates"] == POINT["coordinates"]
    assert ticket["secondaryLocation"] == {
        "county": "花蓮縣", "city": "光復鄉", "lane": "中正路", "no": "10號",
        "floor": "2F", "room": "咖啡廳",
    }
    async with open_db() as db:
        linked_to = await db.scalar(
            select(BuildingMapTicketMap.building_map_uuid)
            .where(BuildingMapTicketMap.ticket_uuid == ticket["uuid"])
        )
    assert str(linked_to) == building["uuid"]


@pytest.mark.parametrize(("extra", "location", "message"), [
    ({"geometry": POINT}, {"floor": "1F", "room": "閱覽室"}, "Omit geometry"),
    ({}, {"floor": "9F"}, "Floor '9F' is not in this building"),
    ({}, {"floor": "1F", "room": "咖啡廳"}, "must be one of"),
    ({}, {"floor": "1F"}, "must be one of"),
])
async def test_ticket_in_building_rejects_a_place_outside_the_layout(
    client, coordinator_auth, login_user_auth, extra, location, message
):
    """Geometry beside a building, an unknown floor label, or an unlisted area is refused."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, CREATE_TICKET, {
        "input": {**_ticket_input(building["uuid"], **location), **extra},
    }, token)
    assert any(message in e["message"] for e in body["errors"]), body


@pytest.mark.parametrize("location", [
    {"floor": "1F", "room": "其他", "victimSpace": "走廊盡頭"},
    {"floor": "3F", "room": "302"},
    {"floor": "B1"},
    {"floor": "RF"},
    {},
])
async def test_ticket_in_building_accepts_other_and_free_text_rooms(
    client, coordinator_auth, login_user_auth, location
):
    """其他 is offered where areas exist, other floors take any room, and RF or no floor is fine."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, CREATE_TICKET, {"input": _ticket_input(building["uuid"], **location)}, token)
    assert "errors" not in body, body


async def test_ticket_cannot_be_filed_under_a_deleted_building(
    client, coordinator_auth, login_user_auth
):
    """A soft-deleted building takes no new tickets."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    await _gql(client, DELETE_BUILDING, {"uuid": building["uuid"]}, admin_token)

    body = await _gql(client, CREATE_TICKET, {
        "input": _ticket_input(building["uuid"], floor="3F"),
    }, token)
    assert any("Building map not found" in e["message"] for e in body["errors"]), body


async def test_ticket_needs_geometry_or_building(client, login_user_auth):
    """Without a building, a ticket still needs its own point."""
    _, token = login_user_auth
    body = await _gql(client, CREATE_TICKET, {"input": {"title": "t", "contactName": "c"}}, token)
    assert any("geometry or buildingMapUuid is required" in e["message"] for e in body["errors"])


async def test_building_map_tickets_are_hidden_from_anonymous_callers(
    client, coordinator_auth, login_user_auth
):
    """A signed-in caller sees the building's tickets; a guest gets none, since that names the place."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    body = await _gql(client, CREATE_TICKET, {"input": _ticket_input(building["uuid"], floor="3F")}, token)
    ticket_uuid = body["data"]["createTicket"]["uuid"]

    body = await _gql(client, BUILDING_TICKETS, {"uuid": building["uuid"]}, token)
    assert body["data"]["buildingMapTickets"] == [{"uuid": ticket_uuid}]
    body = await _gql(client, BUILDING_TICKETS, {"uuid": building["uuid"]})
    assert body["data"]["buildingMapTickets"] == []
