"""Addresses on the write paths, and the PII gate on reading them back.

The masking tests here are the regression guard for a real hole this feature would otherwise
open: `ticket.view` is in PUBLIC_PERMS, so before `secondary_location` was gated an
unauthenticated Guest could have read a disaster victim's full 門牌 off the public request
board. `StationType.secondary_location` had no gate at all, which was harmless only because the
columns used to be county/city/lane/alley/no.
"""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Point, Polygon
from sqlalchemy import text

from app.models.reference import OsmAddressPoint, ReferenceDataset, RefRoad, RefVillage
from tests.test_graphql.conftest import auth_header, test_db

_DAQUAN = Polygon([(121.40, 23.64), (121.45, 23.64), (121.45, 23.68), (121.40, 23.68)])
POINT_IN_DAQUAN = {"type": "Point", "coordinates": [121.42, 23.66]}
ADDRESS = "花蓮縣光復鄉中興路10號"
FULL = "花蓮縣光復鄉大全村中興路10號"  # 村里 filled in from the pin
MASKED = "花蓮縣光復鄉大全村中興路◯◯◯"

CREATE_STATION = """
mutation($input: CreateStationInput!) { createStation(input: $input) { uuid } }
"""
UPDATE_STATION = """
mutation($uuid: UUID!, $input: UpdateStationInput!) { updateStation(uuid: $uuid, input: $input) { uuid } }
"""
CREATE_TICKET = """
mutation($input: CreateTicketInput!) { createTicket(input: $input) { uuid } }
"""
GET_STATION = """
query($uuid: UUID!) {
    station(uuid: $uuid) {
        secondaryLocation { formatted county town village road no floor normalizationStatus }
    }
}
"""
GET_TICKET = """
query($uuid: UUID!) {
    ticket(uuid: $uuid) {
        secondaryLocation { formatted county town village road no normalizationStatus }
    }
}
"""


async def _post(client, query, variables, token=None):
    resp = await client.post(
        "/graphql",
        json={"query": query, "variables": variables},
        headers=auth_header(token) if token else {},
    )
    return resp.json()


@pytest_asyncio.fixture(autouse=True)
async def refdata():
    """Reference slice, reset per test (this package's schema is built once, not per test)."""
    async with test_db() as db:
        for table in ("osm_address_points", "ref_roads", "ref_villages", "reference_datasets"):
            await db.execute(text(f"DELETE FROM {table}"))
        db.add_all(
            [
                RefRoad(county="花蓮縣", town="光復鄉", road="中興路"),
                RefVillage(
                    villcode="10015060005",
                    county="花蓮縣",
                    town="光復鄉",
                    village="大全村",
                    geom=from_shape(MultiPolygon([_DAQUAN]), srid=4326),
                ),
                OsmAddressPoint(
                    id=1,
                    geom=from_shape(Point(121.42, 23.66), srid=4326),
                    county="花蓮縣",
                    town="光復鄉",
                    village="大全村",
                    road="中興路",
                    no="10",
                ),
            ]
        )
        for name in ("ref_roads", "ref_villages", "osm_address_points"):
            db.add(ReferenceDataset(name=name, status="ready"))


async def _create_station(client, token, sl):
    body = await _post(
        client,
        CREATE_STATION,
        {"input": {"geometry": POINT_IN_DAQUAN, "name": "站", "secondaryLocation": sl}},
        token,
    )
    assert "errors" not in body, body
    return body["data"]["createStation"]["uuid"]


async def _create_ticket(client, token, sl):
    body = await _post(
        client,
        CREATE_TICKET,
        {
            "input": {
                "geometry": POINT_IN_DAQUAN,
                "title": "求救",
                "contactName": "王小明",
                "secondaryLocation": sl,
            }
        },
        token,
    )
    assert "errors" not in body, body
    return body["data"]["createTicket"]["uuid"]


# --------------------------------------------------------------------------- createStation


@pytest.mark.asyncio
async def test_create_station_normalizes_a_raw_address(client, coordinator_auth):
    """`raw` is parsed, graded, and stored as components — never as typed."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"raw": ADDRESS})
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["formatted"] == FULL
    assert (sl["county"], sl["town"], sl["village"], sl["road"], sl["no"]) == (
        "花蓮縣",
        "光復鄉",
        "大全村",
        "中興路",
        "10",
    )
    assert sl["normalizationStatus"] == "verified"


@pytest.mark.asyncio
async def test_create_station_folds_components(client, coordinator_auth):
    """臺 → 台 on the write path too, or stored values stop matching the reference tables."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"raw": "花蓮縣光復鄉中興路10號3樓"})
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["floor"] == "3"
    assert sl["formatted"] == "花蓮縣光復鄉大全村中興路10號3樓"


@pytest.mark.asyncio
async def test_create_station_stores_an_unverified_address(client, coordinator_auth):
    """Accept-with-status: an unknown road is flagged, not refused."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"raw": "花蓮縣光復鄉沒有這條路5號"})
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["normalizationStatus"] == "unverified"


@pytest.mark.asyncio
async def test_create_station_rejects_an_unparseable_address(client, coordinator_auth):
    """The one hard failure: it must arrive as a real message, never the masked placeholder."""
    _, token = coordinator_auth
    body = await _post(
        client,
        CREATE_STATION,
        {"input": {"geometry": POINT_IN_DAQUAN, "secondaryLocation": {"raw": "asdfgh"}}},
        token,
    )
    message = body["errors"][0]["message"]
    assert message != "Unexpected error."
    assert "parse" in message


@pytest.mark.asyncio
async def test_over_long_address_does_not_leak_the_statement(client, coordinator_auth):
    """`road` is varchar(100) and `formatted` varchar(255) — the leak class test_error_masking.py covers.

    The length check must fire in the service, so the caller gets a domain message instead of
    asyncpg quoting the whole INSERT back at them.
    """
    _, token = coordinator_auth
    body = await _post(
        client,
        CREATE_STATION,
        {"input": {"geometry": POINT_IN_DAQUAN, "secondaryLocation": {"raw": "花" * 5000}}},
        token,
    )
    message = body["errors"][0]["message"]
    assert message != "Unexpected error."
    for leaked in ("SQL:", "INSERT", "secondary_locations", "varchar", "asyncpg"):
        assert leaked not in message, (leaked, message)


@pytest.mark.asyncio
async def test_pole_location_needs_no_address(client, coordinator_auth):
    """A utility pole has no 門牌; nothing is parsed and nothing is rejected."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"locationType": "pole", "poleId": "A123"})
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["formatted"] is None
    assert sl["normalizationStatus"] is None


# --------------------------------------------------------------------------- updateStation


@pytest.mark.asyncio
async def test_update_station_can_add_an_address(client, coordinator_auth):
    """Addresses used to be write-once at create, leaving no way to fix a wrong one."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, None)
    body = await _post(
        client, UPDATE_STATION, {"uuid": uuid, "input": {"secondaryLocation": {"raw": ADDRESS}}}, token
    )
    assert "errors" not in body, body
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["formatted"] == FULL


@pytest.mark.asyncio
async def test_update_station_can_replace_an_address(client, coordinator_auth):
    """A second update overwrites rather than inserting a duplicate row."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"raw": ADDRESS})
    await _post(
        client,
        UPDATE_STATION,
        {"uuid": uuid, "input": {"secondaryLocation": {"raw": "花蓮縣光復鄉中興路12號"}}},
        token,
    )
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["no"] == "12"


@pytest.mark.asyncio
async def test_update_station_without_an_address_leaves_it_alone(client, coordinator_auth):
    """UNSET means "unchanged" — omitting the field must not wipe the stored address."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"raw": ADDRESS})
    await _post(client, UPDATE_STATION, {"uuid": uuid, "input": {"name": "新名字"}}, token)
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["formatted"] == FULL


# --------------------------------------------------------------------------- createTicket


@pytest.mark.asyncio
async def test_create_ticket_stores_an_address(client, coordinator_auth):
    """No new table: secondary_locations keys on base_geometries.uuid and a ticket IS one."""
    _, token = coordinator_auth
    uuid = await _create_ticket(client, token, {"raw": ADDRESS})
    sl = (await _post(client, GET_TICKET, {"uuid": uuid}, token))["data"]["ticket"]["secondaryLocation"]
    assert sl["formatted"] == FULL
    assert sl["normalizationStatus"] == "verified"


# --------------------------------------------------------------------------- the PII gate


@pytest.mark.asyncio
async def test_guest_cannot_read_a_ticket_address(client, coordinator_auth):
    """THE regression guard: ticket.view is public, so this would expose a victim's 門牌."""
    _, token = coordinator_auth
    uuid = await _create_ticket(client, token, {"raw": ADDRESS})

    body = await _post(client, GET_TICKET, {"uuid": uuid})  # no Authorization header
    sl = body["data"]["ticket"]["secondaryLocation"]
    assert sl["formatted"] == MASKED
    assert sl["no"] is None  # blanked too, or the mask hands back what it hid
    assert sl["town"] == "光復鄉"  # coarse location is on the public map anyway


@pytest.mark.asyncio
async def test_non_owner_cannot_read_a_ticket_address(client, coordinator_auth, login_user_auth):
    """`ticket.view_pii: own` for the Login User role — someone else's request stays masked."""
    _, owner_token = coordinator_auth
    _, other_token = login_user_auth
    uuid = await _create_ticket(client, owner_token, {"raw": ADDRESS})

    sl = (await _post(client, GET_TICKET, {"uuid": uuid}, other_token))["data"]["ticket"]["secondaryLocation"]
    assert sl["formatted"] == MASKED
    assert sl["no"] is None


@pytest.mark.asyncio
async def test_owner_reads_their_own_ticket_address_in_full(client, login_user_auth):
    """`own` scope resolves to the creator, so the requester still sees their own address."""
    _, token = login_user_auth
    uuid = await _create_ticket(client, token, {"raw": ADDRESS})
    sl = (await _post(client, GET_TICKET, {"uuid": uuid}, token))["data"]["ticket"]["secondaryLocation"]
    assert sl["formatted"] == FULL
    assert sl["no"] == "10"


@pytest.mark.asyncio
async def test_non_owner_cannot_read_a_station_address(client, coordinator_auth, login_user_auth):
    """Stations are gated the same way, on station.view_pii (`own` for the Login User role)."""
    _, owner_token = coordinator_auth
    _, other_token = login_user_auth
    uuid = await _create_station(client, owner_token, {"raw": ADDRESS})

    body = await _post(client, GET_STATION, {"uuid": uuid}, other_token)
    sl = body["data"]["station"]["secondaryLocation"]
    assert sl["formatted"] == MASKED
    assert sl["no"] is None


@pytest.mark.asyncio
async def test_all_scope_reads_a_station_address_in_full(client, coordinator_auth):
    """`station.view_pii: all` for Field Coordinator — moderators need the real address."""
    _, token = coordinator_auth
    uuid = await _create_station(client, token, {"raw": ADDRESS})
    sl = (await _post(client, GET_STATION, {"uuid": uuid}, token))["data"]["station"]["secondaryLocation"]
    assert sl["formatted"] == FULL
    assert sl["no"] == "10"
