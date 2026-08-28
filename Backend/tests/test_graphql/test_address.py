"""GraphQL surface for address normalization (app/graphql/address/).

Two things are pinned here that the service tests cannot cover:

- **the auth shapes**, which differ in a way that is easy to get backwards — a bad token is a
  real HTTP 401 raised by `get_context` before execution, while "Permission Denied." is an
  HTTPException raised *inside* a resolver and therefore arrives as HTTP 200 + `errors[]`.
- **un-normalizable input is not an error**: `normalizable: false` with a populated `issues`
  and no `errors[]` entry at all, so a client renders "we could not resolve this" rather than
  handling a failed request.
"""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, Point, Polygon
from sqlalchemy import text

from app.models.reference import OsmAddressPoint, ReferenceDataset, RefRoad, RefVillage
from tests.test_graphql.conftest import auth_header, test_db

NORMALIZE = """
query($input: NormalizeAddressInput!) {
    normalizeAddress(input: $input) {
        normalizable status formatted county town village road no
        distanceM issues
        suggestions { formatted distanceM }
    }
}
"""

REFERENCE_DATA = """
query { referenceData { name status rowCount sourceVersion error } }
"""

_DAQUAN = Polygon([(121.40, 23.64), (121.45, 23.64), (121.45, 23.68), (121.40, 23.68)])
_XINYI = Polygon([(121.55, 25.02), (121.58, 25.02), (121.58, 25.05), (121.55, 25.05)])
IN_DAQUAN = {"lat": 23.66, "lng": 121.42}
IN_TAIPEI = {"lat": 25.033, "lng": 121.565}


async def _post(client, query, variables=None, token=None):
    resp = await client.post(
        "/graphql",
        json={"query": query, "variables": variables or {}},
        headers=auth_header(token) if token else {},
    )
    return resp


@pytest_asyncio.fixture(autouse=True)
async def wipe_refdata():
    """Empty the reference tables before every test in this module.

    Unlike the `db` fixture, this package's conftest builds the schema once for the whole run
    and leaves rows in place between tests. Without this, `refdata` collides on its second use
    AND the degraded-mode test below silently inherits another test's loaded data.
    """
    async with test_db() as db:
        for table in ("osm_address_points", "ref_roads", "ref_villages", "reference_datasets"):
            await db.execute(text(f"DELETE FROM {table}"))


@pytest_asyncio.fixture
async def refdata(wipe_refdata):
    """Seed the same minimal 光復鄉 slice the service tests use, plus a 信義區 polygon.

    The second polygon exists so a pin/text disagreement is reachable: without somewhere else
    for the pin to legitimately land, a Taipei coordinate is merely "outside the loaded
    boundaries", which is a different status.
    """
    async with test_db() as db:
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
                RefVillage(
                    villcode="63000020001",
                    county="台北市",
                    town="信義區",
                    village="西村里",
                    geom=from_shape(MultiPolygon([_XINYI]), srid=4326),
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
            db.add(ReferenceDataset(name=name, status="ready", row_count=1, source_version="test"))


# --------------------------------------------------------------------------- auth shapes


@pytest.mark.asyncio
async def test_anonymous_is_denied(client, refdata):
    """map.view is public, but this surface is not: require_authenticated runs first.

    It raises 401 rather than 403, and because the exception is raised INSIDE a resolver the
    transport status stays 200 — the 401 only shows up in the message. MaskErrors allow-lists
    HTTPException, which is why the message survives instead of becoming "Unexpected error.".
    """
    resp = await _post(client, NORMALIZE, {"input": {"raw": "花蓮縣光復鄉中興路10號"}})
    assert resp.status_code == 200
    assert "401" in resp.json()["errors"][0]["message"]


@pytest.mark.asyncio
async def test_invalid_token_is_a_real_401(client, refdata):
    """get_context is a FastAPI dependency, so it fails BEFORE GraphQL execution starts."""
    resp = await _post(
        client, NORMALIZE, {"input": {"raw": "花蓮縣光復鄉中興路10號"}}, token="not-a-real-token"
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reference_data_needs_authentication_too(client, refdata):
    """Same gate on both fields; a guest cannot enumerate our import state either."""
    assert "401" in (await _post(client, REFERENCE_DATA)).json()["errors"][0]["message"]


@pytest.mark.asyncio
async def test_reference_data_lists_every_dataset(client, coordinator_auth, refdata):
    """The frontend reads this to decide whether to offer address suggestions at all."""
    _, token = coordinator_auth
    body = (await _post(client, REFERENCE_DATA, token=token)).json()
    assert "errors" not in body, body
    rows = {r["name"]: r for r in body["data"]["referenceData"]}
    assert set(rows) == {"ref_roads", "ref_villages", "osm_address_points"}
    assert all(r["status"] == "ready" for r in rows.values())


# --------------------------------------------------------------------------- the three modes


@pytest.mark.asyncio
async def test_text_mode(client, coordinator_auth, refdata):
    """Text alone grades against the published road list."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": {"raw": "花蓮縣光復鄉中興路10號"}}, token)).json()
    assert "errors" not in body, body
    result = body["data"]["normalizeAddress"]
    assert result["normalizable"] is True
    assert result["status"] == "verified"
    assert result["formatted"] == "花蓮縣光復鄉中興路10號"


@pytest.mark.asyncio
async def test_coordinate_mode_returns_ranked_suggestions(client, coordinator_auth, refdata):
    """A pin answers with the nearest address and the alternatives behind it."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": IN_DAQUAN}, token)).json()
    result = body["data"]["normalizeAddress"]
    assert result["formatted"] == "花蓮縣光復鄉大全村中興路10號"
    assert result["suggestions"][0]["formatted"] == "花蓮縣光復鄉大全村中興路10號"
    assert result["suggestions"][0]["distanceM"] == pytest.approx(0, abs=1)


@pytest.mark.asyncio
async def test_both_modes_detect_a_pin_mismatch(client, coordinator_auth, refdata):
    """Only supplying both can produce this status — it needs two statements of location."""
    _, token = coordinator_auth
    body = (
        await _post(client, NORMALIZE, {"input": {"raw": "花蓮縣光復鄉中興路10號", **IN_TAIPEI}}, token)
    ).json()
    assert body["data"]["normalizeAddress"]["status"] == "pin_mismatch"


# --------------------------------------------------------------------------- results, not errors


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", ["asdfgh", "", "   ", "%_%"])
async def test_unnormalizable_text_is_a_result_not_an_error(client, coordinator_auth, refdata, raw):
    """Goal 1's explicit requirement: say so, do not raise."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": {"raw": raw}}, token)).json()
    assert "errors" not in body, body
    result = body["data"]["normalizeAddress"]
    assert result["normalizable"] is False
    assert result["issues"]


@pytest.mark.asyncio
async def test_coordinate_outside_taiwan_is_a_result_not_an_error(client, coordinator_auth, refdata):
    """Null island: no crash, no 500, just normalizable=false."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": {"lat": 0, "lng": 0}}, token)).json()
    assert "errors" not in body, body
    assert body["data"]["normalizeAddress"]["normalizable"] is False


@pytest.mark.asyncio
async def test_missing_reference_data_degrades(client, coordinator_auth):
    """No `refdata` fixture: the state during the minutes after a deploy, before the import ends."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": {"raw": "花蓮縣光復鄉中興路10號"}}, token)).json()
    assert "errors" not in body, body
    result = body["data"]["normalizeAddress"]
    assert result["normalizable"] is True
    assert any("still loading" in issue for issue in result["issues"])


# --------------------------------------------------------------------------- request errors


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "variables,fragment",
    [
        ({}, "provide an address"),
        ({"lat": 23.66}, "together"),
        ({"lng": 121.42}, "together"),
        ({"lat": 91, "lng": 121}, "Invalid coordinates"),
        ({"lat": 23, "lng": 181}, "Invalid coordinates"),
    ],
)
async def test_malformed_requests_error_with_a_real_message(
    client, coordinator_auth, refdata, variables, fragment
):
    """A caller bug DOES error — and the message survives MaskErrors because it is a ValueError."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": variables}, token)).json()
    assert fragment in body["errors"][0]["message"]
    assert body["errors"][0]["message"] != "Unexpected error."


@pytest.mark.asyncio
@pytest.mark.parametrize("limit,expected", [(0, 1), (-1, 1), (10000, 1)])
async def test_limit_is_clamped(client, coordinator_auth, refdata, limit, expected):
    """A hostile limit never reaches the query."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": {**IN_DAQUAN, "limit": limit}}, token)).json()
    assert "errors" not in body, body
    assert len(body["data"]["normalizeAddress"]["suggestions"]) == expected


@pytest.mark.asyncio
async def test_over_long_input_does_not_leak_the_statement(client, coordinator_auth, refdata):
    """The varchar-leak class: a real length message, nothing about the query."""
    _, token = coordinator_auth
    body = (await _post(client, NORMALIZE, {"input": {"raw": "花" * 5000}}, token)).json()
    result = body["data"]["normalizeAddress"]
    assert result["normalizable"] is False
    assert any("at most" in issue for issue in result["issues"])
