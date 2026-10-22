"""normalizeAddress / reverseGeocode, and a looked-up address saved through createTicket."""

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.secondary_location import SecondaryLocation
from tests.test_address_service import DOOR, TWO_KM_AWAY, _tgos_replies
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as open_db

pytestmark = pytest.mark.asyncio

AT_THE_DOOR = {"type": "Point", "coordinates": [121.4206, 23.6587]}
FAR_FROM_THE_DOOR = {"type": "Point", "coordinates": [TWO_KM_AWAY[1], TWO_KM_AWAY[0]]}
LOOKUP_FIELDS = (
    "status fullAddress county town village neighborhood road no floor distanceM pinMismatch addressToken"
)
NORMALIZE = f"""
query ($address: String!, $lat: Float, $lng: Float) {{
  normalizeAddress(address: $address, lat: $lat, lng: $lng) {{ {LOOKUP_FIELDS} }}
}}
"""
REVERSE = (
    f"query ($lat: Float!, $lng: Float!) {{ reverseGeocode(lat: $lat, lng: $lng) {{ {LOOKUP_FIELDS} }} }}"
)
CREATE_TICKET = """
mutation ($input: CreateTicketInput!) {
  createTicket(input: $input) { ... on TicketCreated { ticket {
    secondaryLocation { fullAddress county town village neighborhood road no floor normalizationStatus }
  } } }
}
"""

# A station or building, each created and moved with its own mutations.
PLACES = {
    "station": (
        "mutation ($input: CreateStationInput!) {"
        " createStation(input: $input) { ... on StationCreated { station { uuid } } } }",
        "mutation ($uuid: UUID!, $input: UpdateStationInput!) {"
        " updateStation(uuid: $uuid, input: $input) { uuid } }",
        {"level": 3},
        lambda data: data["createStation"]["station"]["uuid"],
    ),
    "building": (
        "mutation ($input: CreateBuildingMapInput!) { createBuildingMap(input: $input) { uuid } }",
        "mutation ($uuid: UUID!, $input: UpdateBuildingMapInput!) {"
        " updateBuildingMap(uuid: $uuid, input: $input) { uuid } }",
        {"name": "糖廠宿舍", "floorsAboveGround": 2},
        lambda data: data["createBuildingMap"]["uuid"],
    ),
}


@pytest.fixture(autouse=True)
def tgos(monkeypatch):
    """TGOS answers every request with the one door; the keys are dummies."""
    for name in ("TGOS_ADDR_APP_ID", "TGOS_ADDR_API_KEY", "TGOS_GEO_APP_ID", "TGOS_GEO_API_KEY"):
        monkeypatch.setattr(settings, name, "test-key")
    return _tgos_replies(monkeypatch, {"AddressList": [DOOR]})


async def _gql(client, query, variables, token=None) -> dict:
    resp = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=auth_header(token) if token else {}
    )
    return resp.json()


async def _normalize(client, token, **variables) -> dict:
    body = await _gql(client, NORMALIZE, {"address": "花蓮縣光復鄉糖廠街19號3樓", **variables}, token)
    assert body.get("errors") is None, body
    return body["data"]["normalizeAddress"]


async def _file_ticket(client, token, location, geometry=AT_THE_DOOR) -> dict:
    body = await _gql(
        client,
        CREATE_TICKET,
        {
            "input": {
                "title": "糖廠街淹水",
                "geometry": geometry,
                "contactName": "王",
                "priority": "high",
                "taskType": "rescue",
                "secondaryLocation": location,
            }
        },
        token,
    )
    assert body.get("errors") is None, body
    return body["data"]["createTicket"]["ticket"]["secondaryLocation"]


@pytest.mark.parametrize(
    ("query", "variables"),
    [
        (NORMALIZE, {"address": "花蓮縣光復鄉糖廠街19號"}),
        (REVERSE, {"lat": 23.6587, "lng": 121.4206}),
    ],
)
async def test_lookups_need_a_signed_in_caller(client, tgos, query, variables):
    """Guests cannot spend the lookup quota, and nothing reaches TGOS."""
    body = await _gql(client, query, variables)

    assert "401" in body["errors"][0]["message"]
    assert tgos == []


async def test_normalizing_returns_the_official_address_split(client, login_user_auth):
    """A typed address comes back official and split, with the typed floor and a token."""
    _, token = login_user_auth

    found = await _normalize(client, token, lat=23.6587, lng=121.4206)

    assert found["status"] == "found"
    assert (found["fullAddress"], found["village"], found["neighborhood"], found["no"], found["floor"]) == (
        "花蓮縣光復鄉大進村3鄰糖廠街19號",
        "大進村",
        "3鄰",
        "19號",
        "3樓",
    )
    assert found["pinMismatch"] is False and found["addressToken"]


async def test_half_a_pin_is_refused(client, login_user_auth):
    """A latitude without a longitude is a caller bug, refused with a readable message."""
    _, token = login_user_auth

    body = await _gql(client, NORMALIZE, {"address": "花蓮縣光復鄉糖廠街19號", "lat": 23.6}, token)

    assert body["errors"][0]["message"] == "lat and lng must be provided together"


async def test_reverse_geocoding_returns_the_nearest_door(client, login_user_auth):
    """A pin comes back as the nearest door's line."""
    _, token = login_user_auth

    body = await _gql(client, REVERSE, {"lat": 23.6587, "lng": 121.4206}, token)

    assert body["data"]["reverseGeocode"]["fullAddress"] == "花蓮縣光復鄉大進村3鄰糖廠街19號"


async def test_a_looked_up_address_saves_as_verified(client, login_user_auth):
    """Saving the line and token from a lookup stores the address verified and split."""
    _, token = login_user_auth
    found = await _normalize(client, token)

    stored = await _file_ticket(
        client,
        token,
        {
            "fullAddress": found["fullAddress"],
            "addressToken": found["addressToken"],
            "floor": found["floor"],
        },
    )

    assert stored == {
        "fullAddress": "花蓮縣光復鄉大進村3鄰糖廠街19號",
        "county": "花蓮縣",
        "town": "光復鄉",
        "village": "大進村",
        "neighborhood": "3鄰",
        "road": "糖廠街",
        "no": "19號",
        "floor": "3樓",
        "normalizationStatus": "verified",
    }


async def test_a_pin_far_from_the_looked_up_address_saves_as_a_mismatch(client, login_user_auth):
    """The same token on a ticket pinned 2 km away stores a pin mismatch."""
    _, token = login_user_auth
    found = await _normalize(client, token)

    stored = await _file_ticket(
        client,
        token,
        {"fullAddress": found["fullAddress"], "addressToken": found["addressToken"]},
        FAR_FROM_THE_DOOR,
    )

    assert stored["normalizationStatus"] == "pin_mismatch"


async def test_a_typed_address_saves_as_unverified_and_still_split(client, login_user_auth):
    """A typed address with no lookup is still split, and stored unverified."""
    _, token = login_user_auth

    stored = await _file_ticket(client, token, {"fullAddress": "台北市松江路469巷4號"})

    assert (stored["fullAddress"], stored["county"], stored["road"], stored["normalizationStatus"]) == (
        "臺北市松江路469巷4號",
        "臺北市",
        "松江路",
        "unverified",
    )


async def test_lookups_are_rate_limited_per_caller(client, login_user_auth):
    """The 31st lookup in a minute is refused."""
    _, token = login_user_auth
    for _ in range(30):
        await _normalize(client, token)

    body = await _gql(client, NORMALIZE, {"address": "花蓮縣光復鄉糖廠街19號"}, token)

    assert body["errors"][0]["message"] == "Too many address lookups; try again in a minute"


async def _stored_status(geometry_uuid: str) -> str | None:
    async with open_db() as db:
        return await db.scalar(
            select(SecondaryLocation.normalization_status).where(
                SecondaryLocation.geometry_uuid == geometry_uuid
            )
        )


@pytest.mark.parametrize("place", PLACES)
async def test_moving_a_confirmed_place_leaves_its_address_unverified(client, coordinator_auth, place):
    """A station or building keeps `verified` when saved in place, and drops to unverified once moved."""
    _, token = coordinator_auth
    create, update, fields, uuid_of = PLACES[place]
    found = await _normalize(client, token)
    location = {"fullAddress": found["fullAddress"], "addressToken": found["addressToken"]}
    body = await _gql(
        client, create, {"input": {**fields, "geometry": AT_THE_DOOR, "secondaryLocation": location}}, token
    )
    assert body.get("errors") is None, body
    uuid = uuid_of(body["data"])
    assert await _stored_status(uuid) == "verified"

    for geometry, status in ((AT_THE_DOOR, "verified"), (FAR_FROM_THE_DOOR, "unverified")):
        body = await _gql(client, update, {"uuid": uuid, "input": {"geometry": geometry}}, token)
        assert body.get("errors") is None, body
        assert await _stored_status(uuid) == status
