"""End-to-end tests for building maps and the tickets filed inside them."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select

from app.core.permissions import Perm
from app.models.geo import BuildingMapTicketMap
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TaskAssignment, TicketTask
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as open_db
from tests.test_graphql.test_area import _make_team_user
from tests.test_graphql.test_loaders import _SelectCounter
from tests.test_graphql.test_ticket_detail_boundary import _actor

pytestmark = pytest.mark.asyncio

POINT = {"type": "Point", "coordinates": [121.4219, 23.6696]}
ADDRESS = {"fullAddress": "花蓮縣光復鄉中正路10號"}
LAYOUT = {
    "floorsAboveGround": 3,
    "floorsBelowGround": 1,
    "floorAreas": [
        {"floor": "1F", "areas": ["閱覽室", "健身房"]},
        {"floor": "2F", "areas": ["閱覽室", "咖啡廳", "其他"]},
    ],
}

BUILDING_FIELDS = "uuid name geometry floors { label areas } secondaryLocation { county road no }"

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
  createTicket(input: $input) {
    ... on TicketCreated { ticket {
      uuid geometry secondaryLocation { county town road no floor room normalizationStatus }
    } }
  }
}
"""
BUILDING_TICKETS = "query ($uuid: UUID!) { buildingMapTickets(buildingMapUuid: $uuid) { uuid } }"
BUILDING_TICKETS_PAGE = """
query ($uuid: UUID!, $limit: Int!) { buildingMapTickets(buildingMapUuid: $uuid, limit: $limit) { uuid } }
"""
BUILDING_TICKETS_WINDOW = """
query ($uuid: UUID!, $skip: Int! = 0, $limit: Int! = 100) {
  buildingMapTickets(buildingMapUuid: $uuid, skip: $skip, limit: $limit) { uuid }
}
"""
TICKET_BUILDING = "query ($uuid: UUID!) { ticket(uuid: $uuid) { buildingMapUuid } }"
TICKETS_BUILDING = "query { tickets(limit: 200) { items { uuid buildingMapUuid } } }"
CREATE_TICKET_BUILDING = """
mutation ($input: CreateTicketInput!) {
  createTicket(input: $input) { ... on TicketCreated { ticket { buildingMapUuid } } }
}
"""


async def _gql(client, query, variables, token=None):
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return resp.json()


async def _create_building(client, token, **overrides):
    body = await _gql(
        client,
        CREATE_BUILDING,
        {
            "input": {
                "name": "光復國小圖書館",
                "geometry": POINT,
                "secondaryLocation": ADDRESS,
                **LAYOUT,
                **overrides,
            }
        },
        token,
    )
    assert "errors" not in body, body
    return body["data"]["createBuildingMap"]


def _ticket_input(building_uuid, **location):
    return {
        "title": "咖啡廳天花板漏水",
        "contactName": "王小明",
        "buildingMapUuid": building_uuid,
        "secondaryLocation": location,
    }


async def _file_in_building(client, token, building_uuid, **location) -> str:
    body = await _gql(client, CREATE_TICKET, {"input": _ticket_input(building_uuid, **location)}, token)
    assert "errors" not in body, body
    return body["data"]["createTicket"]["ticket"]["uuid"]


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
    assert building["secondaryLocation"] == {"county": "花蓮縣", "road": "中正路", "no": "10號"}
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


async def test_create_building_map_requires_work_zone_add(client, login_user_auth):
    """A plain signed-in user cannot pin a building."""
    _, token = login_user_auth
    body = await _gql(
        client,
        CREATE_BUILDING,
        {
            "input": {
                "name": "x",
                "geometry": POINT,
                "secondaryLocation": ADDRESS,
                **LAYOUT,
            }
        },
        token,
    )
    assert body["data"] is None and body["errors"]


async def test_ngo_team_admin_cannot_pin_a_building(client, redis):
    """work_zone.add is not enough on an ngo team, as with zones."""
    token = await _make_team_user(redis, "ngo")
    body = await _gql(
        client,
        CREATE_BUILDING,
        {
            "input": {
                "name": "x",
                "geometry": POINT,
                "secondaryLocation": ADDRESS,
                **LAYOUT,
            }
        },
        token,
    )
    assert "Only gov teams" in body["errors"][0]["message"]


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"floorAreas": [{"floor": "9F", "areas": ["頂樓"]}]}, "Floor '9F' is not in this building"),
        ({"secondaryLocation": {**ADDRESS, "floor": "2F"}}, "no building section, floor or room"),
        (
            {"secondaryLocation": {"fullAddress": "花蓮縣光復鄉中正路10號A棟"}},
            "no building section, floor or room",
        ),
        ({"floorsAboveGround": 0}, "floorsAboveGround must be"),
        ({"floorAreas": [{"floor": "1F", "areas": ["   "]}]}, "Area names must be"),
        (
            {"secondaryLocation": {"fullAddress": f"花蓮縣光復鄉中正路{'1' * 21}號"}},
            "no must be at most 20 characters",
        ),
    ],
)
async def test_create_building_map_rejects_bad_layout(client, coordinator_auth, overrides, message):
    """A bad floor layout, a floor in the address, or an address part too long for its column is refused."""
    _, token = coordinator_auth
    body = await _gql(
        client,
        CREATE_BUILDING,
        {
            "input": {
                "name": "x",
                "geometry": POINT,
                "secondaryLocation": ADDRESS,
                **LAYOUT,
                **overrides,
            }
        },
        token,
    )
    assert any(message in e["message"] for e in body["errors"]), body


async def test_update_building_map_replaces_areas_and_rechecks_floor_range(client, coordinator_auth):
    """New areas replace the old set, and shrinking floors under an area list is refused."""
    _, token = coordinator_auth
    building = await _create_building(client, token)

    body = await _gql(
        client,
        UPDATE_BUILDING,
        {
            "uuid": building["uuid"],
            "input": {
                "floorAreas": [{"floor": "3F", "areas": ["機房"]}],
            },
        },
        token,
    )
    floors = {f["label"]: f["areas"] for f in body["data"]["updateBuildingMap"]["floors"]}
    assert floors["3F"] == ["機房", "其他"] and floors["1F"] == []

    body = await _gql(
        client,
        UPDATE_BUILDING,
        {
            "uuid": building["uuid"],
            "input": {
                "floorsAboveGround": 2,
            },
        },
        token,
    )
    assert any("Floor '3F' is not in this building" in e["message"] for e in body["errors"])


async def test_ticket_in_building_copies_its_point_and_address(client, coordinator_auth, login_user_auth):
    """The ticket gets the building's point and address, the reporter's floor and room, and a link."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(
        client,
        CREATE_TICKET,
        {
            "input": _ticket_input(
                building["uuid"],
                floor="2F",
                room="咖啡廳",
                fullAddress="臺北市假路1號",
            )
        },
        token,
    )
    assert "errors" not in body, body
    ticket = body["data"]["createTicket"]["ticket"]
    assert ticket["geometry"]["coordinates"] == POINT["coordinates"]
    assert ticket["secondaryLocation"] == {
        "county": "花蓮縣",
        "town": "光復鄉",
        "road": "中正路",
        "no": "10號",
        "floor": "2F",
        "room": "咖啡廳",
        "normalizationStatus": "unverified",
    }
    async with open_db() as db:
        linked_to = await db.scalar(
            select(BuildingMapTicketMap.building_map_uuid).where(
                BuildingMapTicketMap.ticket_uuid == ticket["uuid"]
            )
        )
    assert str(linked_to) == building["uuid"]


async def test_a_building_without_an_address_never_takes_the_reporters_text(
    client, coordinator_auth, login_user_auth
):
    """A building with no address row leaves the ticket's address empty rather than storing raw text."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    async with open_db() as db:
        await db.execute(delete(SecondaryLocation).where(SecondaryLocation.geometry_uuid == building["uuid"]))

    body = await _gql(
        client,
        CREATE_TICKET,
        {"input": _ticket_input(building["uuid"], floor="2F", room="咖啡廳", fullAddress="臺北市假路1號")},
        token,
    )

    assert "errors" not in body, body
    stored = body["data"]["createTicket"]["ticket"]["secondaryLocation"]
    assert (stored["county"], stored["road"], stored["no"], stored["normalizationStatus"]) == (None,) * 4
    assert (stored["floor"], stored["room"]) == ("2F", "咖啡廳")


@pytest.mark.parametrize(
    ("extra", "location", "message"),
    [
        ({"geometry": POINT}, {"floor": "1F", "room": "閱覽室"}, "Omit geometry"),
        ({}, {"floor": "9F"}, "Floor '9F' is not in this building"),
        ({}, {"floor": "1F", "room": "咖啡廳"}, "must be one of"),
        ({}, {"floor": "1F"}, "must be one of"),
    ],
)
async def test_ticket_in_building_rejects_a_place_outside_the_layout(
    client, coordinator_auth, login_user_auth, extra, location, message
):
    """Geometry beside a building, an unknown floor label, or an unlisted area is refused."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(
        client,
        CREATE_TICKET,
        {
            "input": {**_ticket_input(building["uuid"], **location), **extra},
        },
        token,
    )
    assert any(message in e["message"] for e in body["errors"]), body


@pytest.mark.parametrize(
    "location",
    [
        {"floor": "1F", "room": "其他", "victimSpace": "走廊盡頭"},
        {"floor": "3F", "room": "302"},
        {"floor": "B1"},
        {"floor": "RF"},
        {},
        {"floor": "", "room": "大廳"},
    ],
)
async def test_ticket_in_building_accepts_other_and_free_text_rooms(
    client, coordinator_auth, login_user_auth, location
):
    """其他 is offered where areas exist, other floors take any room, and RF or an unknown floor is fine."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, CREATE_TICKET, {"input": _ticket_input(building["uuid"], **location)}, token)
    assert "errors" not in body, body


async def test_ticket_cannot_be_filed_under_a_deleted_building(client, coordinator_auth, login_user_auth):
    """A soft-deleted building takes no new tickets."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    await _gql(client, DELETE_BUILDING, {"uuid": building["uuid"]}, admin_token)

    body = await _gql(
        client,
        CREATE_TICKET,
        {
            "input": _ticket_input(building["uuid"], floor="3F"),
        },
        token,
    )
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
    ticket_uuid = body["data"]["createTicket"]["ticket"]["uuid"]

    body = await _gql(client, BUILDING_TICKETS, {"uuid": building["uuid"]}, token)
    assert body["data"]["buildingMapTickets"] == [{"uuid": ticket_uuid}]
    body = await _gql(client, BUILDING_TICKETS, {"uuid": building["uuid"]})
    assert body["data"]["buildingMapTickets"] == []


async def test_a_ticket_names_the_building_it_was_filed_under(client, coordinator_auth, login_user_auth):
    """Signed in, `ticket` and every row of `tickets` carry the building, which the map groups by."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    ticket_uuid = await _file_in_building(client, token, building["uuid"], floor="3F")

    body = await _gql(client, TICKET_BUILDING, {"uuid": ticket_uuid}, token)
    assert body["data"]["ticket"]["buildingMapUuid"] == building["uuid"]
    body = await _gql(client, TICKETS_BUILDING, {}, token)
    assert {"uuid": ticket_uuid, "buildingMapUuid": building["uuid"]} in body["data"]["tickets"]["items"]


async def test_a_guest_is_not_told_the_building(client, coordinator_auth, login_user_auth):
    """Naming the building names the place, so it follows the exact point: null to a guest (ADR-281)."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    ticket_uuid = await _file_in_building(client, token, building["uuid"], floor="3F")

    body = await _gql(client, TICKET_BUILDING, {"uuid": ticket_uuid})
    assert body["data"]["ticket"]["buildingMapUuid"] is None
    body = await _gql(client, TICKETS_BUILDING, {})
    assert {"uuid": ticket_uuid, "buildingMapUuid": None} in body["data"]["tickets"]["items"]


async def test_a_deleted_building_is_no_longer_named(client, coordinator_auth, login_user_auth):
    """Deleting a building leaves its tickets standing on their own, so none points at a missing one."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    ticket_uuid = await _file_in_building(client, token, building["uuid"], floor="3F")
    await _gql(client, DELETE_BUILDING, {"uuid": building["uuid"]}, admin_token)

    body = await _gql(client, TICKET_BUILDING, {"uuid": ticket_uuid}, token)
    assert body["data"]["ticket"]["buildingMapUuid"] is None


async def test_narrowing_view_detail_to_own_names_only_the_callers_own_buildings(
    client, redis, coordinator_auth, login_user_auth
):
    """Decided per ticket like the exact point: `own` names the building of the caller's tickets only."""
    _, admin_token = coordinator_auth
    _, their_token = login_user_auth
    _, token = await _actor(
        redis,
        [
            (Perm.TICKET_VIEW, "all"),
            (Perm.TICKET_VIEW_DETAIL, "own"),
            (Perm.TICKET_VIEW_PII, "own"),
            (Perm.TICKET_ADD, "all"),
        ],
    )
    building = await _create_building(client, admin_token)
    mine = await _file_in_building(client, token, building["uuid"], floor="3F")
    theirs = await _file_in_building(client, their_token, building["uuid"], floor="2F", room="咖啡廳")

    items = (await _gql(client, TICKETS_BUILDING, {}, token))["data"]["tickets"]["items"]
    assert {"uuid": mine, "buildingMapUuid": building["uuid"]} in items
    assert {"uuid": theirs, "buildingMapUuid": None} in items


async def test_a_page_of_tickets_looks_their_buildings_up_once(client, coordinator_auth, login_user_auth):
    """One batched lookup for the whole page, and none at all for a guest, who is told no building."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    for floor in ("1F", "2F", "3F"):
        await _file_in_building(client, token, building["uuid"], floor=floor, room="其他")

    with _SelectCounter("building_map_ticket_map") as signed_in:
        body = await _gql(client, TICKETS_BUILDING, {}, token)
    with _SelectCounter("building_map_ticket_map") as guest:
        await _gql(client, TICKETS_BUILDING, {})

    named = [item for item in body["data"]["tickets"]["items"] if item["buildingMapUuid"] == building["uuid"]]
    assert len(named) == 3
    assert (signed_in.count, guest.count) == (1, 0)


async def test_filing_under_a_building_answers_with_it(client, coordinator_auth, login_user_auth):
    """The createTicket reply names the building, as a read does, so the site can open it straight away."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(
        client, CREATE_TICKET_BUILDING, {"input": _ticket_input(building["uuid"], floor="3F")}, token
    )
    assert body["data"]["createTicket"]["ticket"]["buildingMapUuid"] == building["uuid"]


async def test_building_map_tickets_take_at_most_a_tickets_page(client, coordinator_auth, login_user_auth):
    """The same ceiling as `tickets`, so one request cannot read a whole tower at once."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, BUILDING_TICKETS_PAGE, {"uuid": building["uuid"], "limit": 201}, token)
    assert any("limit must be at most 200" in e["message"] for e in body["errors"]), body
    body = await _gql(client, BUILDING_TICKETS_PAGE, {"uuid": building["uuid"], "limit": 200}, token)
    assert body["data"]["buildingMapTickets"] == []


@pytest.mark.parametrize("page", [{"limit": -1}, {"skip": -1}])
async def test_a_negative_page_is_refused_by_name(client, coordinator_auth, login_user_auth, page):
    """A negative `limit` or `skip` is named as such, not left to Postgres as "Unexpected error."."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, BUILDING_TICKETS_WINDOW, {"uuid": building["uuid"], **page}, token)
    assert [e["message"] for e in body["errors"]] == ["limit and skip must not be negative"]


async def test_a_deleted_building_lists_no_tickets(client, coordinator_auth, login_user_auth):
    """Its tickets are untied from it, as `buildingMapUuid` says, so the building lists none of them."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    await _file_in_building(client, token, building["uuid"], floor="3F")
    await _gql(client, DELETE_BUILDING, {"uuid": building["uuid"]}, admin_token)

    body = await _gql(client, BUILDING_TICKETS, {"uuid": building["uuid"]}, token)
    assert body["data"]["buildingMapTickets"] == []


# --- the site's help request (請求協助) filed inside a building ---

CREATE_HELP_REQUEST = """
mutation ($input: CreateHelpRequestInput!) {
  createHelpRequest(input: $input) {
    ... on TicketCreated { ticket {
      uuid buildingMapUuid geometry secondaryLocation { county town road no floor room normalizationStatus }
    } }
  }
}
"""


def _help_request_input(building_uuid, **location):
    return {
        "title": "咖啡廳天花板漏水",
        "contactName": "王小明",
        "buildingMapUuid": building_uuid,
        "secondaryLocation": location,
        "tasks": [{"taskType": "hr", "taskName": "清理積水", "quantity": 2}],
    }


async def test_a_help_request_in_a_building_takes_its_point_and_address(
    client, coordinator_auth, login_user_auth
):
    """As createTicket does: the building's point and address, the reporter's floor and room, and a link."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    request = _help_request_input(building["uuid"], floor="2F", room="咖啡廳", fullAddress="臺北市假路1號")

    body = await _gql(client, CREATE_HELP_REQUEST, {"input": request}, token)

    assert "errors" not in body, body
    ticket = body["data"]["createHelpRequest"]["ticket"]
    assert (ticket["buildingMapUuid"], ticket["geometry"]["coordinates"]) == (
        building["uuid"],
        POINT["coordinates"],
    )
    assert ticket["secondaryLocation"] == {
        "county": "花蓮縣",
        "town": "光復鄉",
        "road": "中正路",
        "no": "10號",
        "floor": "2F",
        "room": "咖啡廳",
        "normalizationStatus": "unverified",
    }


@pytest.mark.parametrize(
    ("extra", "location", "message"),
    [
        ({"geometry": POINT}, {"floor": "1F", "room": "閱覽室"}, "Omit geometry"),
        ({}, {"floor": "9F"}, "Floor '9F' is not in this building"),
        ({}, {"floor": "1F", "room": "咖啡廳"}, "must be one of"),
        ({}, {"floor": "1F"}, "must be one of"),
    ],
)
async def test_a_help_request_in_a_building_keeps_to_its_layout(
    client, coordinator_auth, login_user_auth, extra, location, message
):
    """Geometry beside a building, an unknown floor label, or an unlisted area is refused, as for a ticket."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    request = {**_help_request_input(building["uuid"], **location), **extra}

    body = await _gql(client, CREATE_HELP_REQUEST, {"input": request}, token)

    assert any(message in e["message"] for e in body["errors"]), body
    async with open_db() as db:
        linked = BuildingMapTicketMap.building_map_uuid == building["uuid"]
        assert await db.scalar(select(BuildingMapTicketMap).where(linked)) is None


async def test_a_help_request_cannot_be_filed_under_a_deleted_building(
    client, coordinator_auth, login_user_auth
):
    """A soft-deleted building takes no new requests."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    await _gql(client, DELETE_BUILDING, {"uuid": building["uuid"]}, admin_token)

    request = _help_request_input(building["uuid"], floor="3F")
    body = await _gql(client, CREATE_HELP_REQUEST, {"input": request}, token)

    assert any("Building map not found" in e["message"] for e in body["errors"]), body


async def test_a_help_request_needs_geometry_or_building(client, login_user_auth):
    """Without a building, a request still needs its own point."""
    _, token = login_user_auth
    request = {k: v for k, v in _help_request_input(None).items() if k != "buildingMapUuid"}

    body = await _gql(client, CREATE_HELP_REQUEST, {"input": request}, token)

    assert any("geometry or buildingMapUuid is required" in e["message"] for e in body["errors"]), body


# --- how many tickets a building holds, and how many people it is short (ADR-450) ---

BUILDING_COUNTS = "query ($uuid: UUID!) { buildingMap(uuid: $uuid) { ticketCount shortfall } }"
BUILDINGS_COUNTS = "query { buildingMaps { items { uuid ticketCount shortfall } } }"
NOW = datetime.now(UTC)


async def _need(ticket_uuid, owner, task_type, quantity, *, status="pending", claimed_by=()) -> None:
    """A need on the ticket, written directly: filing it would run the duplicate check on the building."""
    stamps = {"fulfilled": {"completed_at": NOW}, "canceled": {"canceled_at": NOW}}.get(status, {})
    async with open_db() as db:
        need = TicketTask(
            ticket_uuid=ticket_uuid,
            task_type=task_type,
            task_name=f"{task_type} {quantity}",
            quantity=quantity,
            status=status,
            created_by=owner,
            **stamps,
        )
        db.add(need)
        await db.flush()
        db.add_all(TaskAssignment(task_uuid=str(need.uuid), actor_uuid=actor) for actor in claimed_by)


async def _set_ticket(ticket_uuid, **values) -> None:
    async with open_db() as db:
        ticket = await db.get(Tickets, ticket_uuid)
        for name, value in values.items():
            setattr(ticket, name, value)


async def test_a_building_counts_its_tickets_and_the_people_its_open_needs_lack(
    client, coordinator_auth, login_user_auth
):
    """Every live ticket counts, closed ones too; only open people and supply needs on open tickets lack.

    A need adds its quantity less the people on it, never below 0. One with no quantity adds nothing,
    as the site's floor drawer counts it, and so does a rescue or medical need.
    """
    admin_uuid, admin_token = coordinator_auth
    user_uuid, token = login_user_auth
    building = await _create_building(client, admin_token)
    open_ticket = await _file_in_building(client, token, building["uuid"], floor="3F")
    await _need(open_ticket, user_uuid, "hr", 3, claimed_by=[user_uuid, admin_uuid])  # 1
    await _need(open_ticket, user_uuid, "supply", 2)  # 2
    await _need(open_ticket, user_uuid, "rescue", 5)
    await _need(open_ticket, user_uuid, "medical", 4)
    settled = await _file_in_building(client, token, building["uuid"], floor="2F", room="咖啡廳")
    await _need(settled, user_uuid, "hr", 4, status="fulfilled")
    await _need(settled, user_uuid, "supply", 3, status="canceled")
    await _need(settled, user_uuid, "hr", None)
    await _need(settled, user_uuid, "hr", 1, claimed_by=[user_uuid, admin_uuid])
    closed = await _file_in_building(client, token, building["uuid"], floor="1F", room="閱覽室")
    await _need(closed, user_uuid, "hr", 5)
    await _set_ticket(closed, status="completed")
    gone = await _file_in_building(client, token, building["uuid"], floor="RF")
    await _need(gone, user_uuid, "hr", 6)
    await _set_ticket(gone, delete_at=NOW)

    body = await _gql(client, BUILDING_COUNTS, {"uuid": building["uuid"]}, token)

    assert body["data"]["buildingMap"] == {"ticketCount": 3, "shortfall": 3}, body


async def test_an_empty_building_counts_nothing(client, coordinator_auth, login_user_auth):
    """Zero, not null, to a caller who may read the tickets: the building just holds none yet."""
    _, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)

    body = await _gql(client, BUILDING_COUNTS, {"uuid": building["uuid"]}, token)

    assert body["data"]["buildingMap"] == {"ticketCount": 0, "shortfall": 0}


async def test_a_guest_is_told_no_counts(client, coordinator_auth, login_user_auth):
    """Null, not 0, as the site's guest view says nothing rather than "none" (ADR-281)."""
    user_uuid, admin_token = coordinator_auth
    _, token = login_user_auth
    building = await _create_building(client, admin_token)
    ticket_uuid = await _file_in_building(client, token, building["uuid"], floor="3F")
    await _need(ticket_uuid, user_uuid, "hr", 2)

    body = await _gql(client, BUILDING_COUNTS, {"uuid": building["uuid"]})

    assert body["data"]["buildingMap"] == {"ticketCount": None, "shortfall": None}


async def test_view_detail_narrowed_to_own_counts_only_the_callers_tickets(
    client, redis, coordinator_auth, login_user_auth
):
    """The count is of the tickets `buildingMapTickets` lists to this caller, so the drawer agrees."""
    _, admin_token = coordinator_auth
    their_uuid, their_token = login_user_auth
    my_uuid, token = await _actor(
        redis,
        [
            (Perm.TICKET_VIEW, "all"),
            (Perm.TICKET_VIEW_DETAIL, "own"),
            (Perm.TICKET_VIEW_PII, "own"),
            (Perm.TICKET_ADD, "all"),
        ],
    )
    building = await _create_building(client, admin_token)
    mine = await _file_in_building(client, token, building["uuid"], floor="3F")
    await _need(mine, my_uuid, "hr", 2)
    theirs = await _file_in_building(client, their_token, building["uuid"], floor="2F", room="咖啡廳")
    await _need(theirs, their_uuid, "hr", 5)

    body = await _gql(client, BUILDING_COUNTS, {"uuid": building["uuid"]}, token)
    listed = await _gql(client, BUILDING_TICKETS, {"uuid": building["uuid"]}, token)

    assert body["data"]["buildingMap"] == {"ticketCount": 1, "shortfall": 2}
    assert [t["uuid"] for t in listed["data"]["buildingMapTickets"]] == [mine]


async def test_a_page_of_buildings_is_counted_in_one_query(client, coordinator_auth, login_user_auth):
    """One batched statement for every building on the page, and none for a guest, who is told nothing."""
    user_uuid, admin_token = coordinator_auth
    _, token = login_user_auth
    buildings = [await _create_building(client, admin_token, name=f"光復國小 {n} 號館") for n in range(3)]
    for building in buildings:
        ticket_uuid = await _file_in_building(client, token, building["uuid"], floor="3F")
        await _need(ticket_uuid, user_uuid, "supply", 2)

    with _SelectCounter("building_map_ticket_map") as signed_in:
        body = await _gql(client, BUILDINGS_COUNTS, {}, token)
    with _SelectCounter("building_map_ticket_map") as guest:
        await _gql(client, BUILDINGS_COUNTS, {})

    counted = {
        item["uuid"]: (item["ticketCount"], item["shortfall"])
        for item in body["data"]["buildingMaps"]["items"]
    }
    assert [counted[b["uuid"]] for b in buildings] == [(1, 2)] * 3
    assert (signed_in.count, guest.count) == (1, 0)


# --- how many building maps one page may hold ---

BUILDINGS_PAGE = """
query ($skip: Int! = 0, $limit: Int! = 50) {
  buildingMaps(skip: $skip, limit: $limit) { items { uuid } pageInfo { totalCount } }
}
"""


async def test_building_maps_take_at_most_a_tickets_page(client):
    """The same ceiling as `tickets` and `buildingMapTickets`; the site's list asks for that many at once."""
    body = await _gql(client, BUILDINGS_PAGE, {"limit": 201})
    assert [e["message"] for e in body["errors"]] == ["limit must be at most 200"]

    body = await _gql(client, BUILDINGS_PAGE, {"limit": 200})
    assert "errors" not in body, body


@pytest.mark.parametrize("page", [{"limit": -1}, {"skip": -1}])
async def test_a_negative_page_of_building_maps_is_refused_by_name(client, page):
    """Named as such, as for `buildingMapTickets`, not left to Postgres as "Unexpected error."."""
    body = await _gql(client, BUILDINGS_PAGE, page)
    assert [e["message"] for e in body["errors"]] == ["limit and skip must not be negative"]
