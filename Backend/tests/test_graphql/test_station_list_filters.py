"""ADR-394: `stations` filters by area, official source, creation and update time, and sorts open first.

The back office's station page used to read every station in scope and filter and sort in the browser
(#97). These arguments let it page instead. Every test works inside a small box nobody else puts a
station in, since the GraphQL test database is shared across modules.
"""

import random
from datetime import UTC, datetime, timedelta

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.geo import Station
from app.models.secondary_location import SecondaryLocation
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as db_ctx

T0 = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)
_TYPES = {
    "bounds": "BoundsInput",
    "county": "String",
    "town": "String",
    "official": "Boolean",
    "createdAfter": "DateTime",
    "createdBefore": "DateTime",
    "updatedAfter": "DateTime",
    "updatedBefore": "DateTime",
    "orderBy": "StationOrder!",
    "skip": "Int!",
    "limit": "Int!",
}


def _box() -> tuple[float, float, dict]:
    """A 0.01° square far from Taiwan, with its south-west corner."""
    lng = 140 + random.random() * 20
    lat = -40 + random.random() * 20
    return lng, lat, {"minLng": lng, "minLat": lat, "maxLng": lng + 0.01, "maxLat": lat + 0.01}


async def _station(corner, *, county=None, town=None, **fields) -> str:
    lng, lat = corner
    values = {"type": "shelter", "source": "user", "visibility": "public", "operational_status": "active"}
    async with db_ctx() as db:
        station = Station(
            geometry=from_shape(Point(lng + 0.005, lat + 0.005), srid=4326), **(values | fields)
        )
        db.add(station)
        await db.flush()
        if county or town:
            db.add(
                SecondaryLocation(
                    geometry_uuid=station.uuid, location_type="address", county=county, town=town
                )
            )
        return str(station.uuid)


async def _stations(client, token=None, **variables) -> dict:
    """POST `stations` with exactly `variables`, returning the whole response body."""
    declared = ", ".join(f"${name}: {_TYPES[name]}" for name in variables)
    passed = ", ".join(f"{name}: ${name}" for name in variables)
    selection = "{ items { uuid } pageInfo { totalCount hasNextPage } }"
    query = f"query({declared}) {{ stations({passed}) {selection} }}"
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return resp.json()


async def _uuids(client, token=None, **variables) -> list[str]:
    body = await _stations(client, token, **variables)
    assert "errors" not in body, body
    page = body["data"]["stations"]
    assert page["pageInfo"]["totalCount"] == len(page["items"]), "totalCount must agree with the rows"
    return [item["uuid"] for item in page["items"]]


@pytest.mark.asyncio
async def test_a_page_holds_at_most_1000_stations(client):
    """Above every limit a caller sends today (500 in these tests, 200 from the site)."""
    *_, bounds = _box()

    refused = await _stations(client, bounds=bounds, limit=1001)
    allowed = await _stations(client, bounds=bounds, limit=1000)

    assert [error["message"] for error in refused["errors"]] == ["limit must be at most 1000"]
    assert "errors" not in allowed, allowed


@pytest.mark.asyncio
@pytest.mark.parametrize("page", [{"limit": -1}, {"skip": -1}], ids=["limit", "skip"])
async def test_a_negative_page_is_refused_by_name(client, page):
    """As the ticket list refuses one, rather than a masked database error."""
    *_, bounds = _box()

    body = await _stations(client, bounds=bounds, **{"limit": 50, "skip": 0, **page})

    assert [error["message"] for error in body["errors"]] == ["limit and skip must not be negative"]


@pytest.mark.asyncio
async def test_official_keeps_the_stations_the_back_office_made(client):
    """`source = 'official'` is what the back office writes, and what defines official (ADR-394)."""
    lng, lat, bounds = _box()
    official = await _station((lng, lat), source="official")
    user = await _station((lng, lat), source="user")
    unknown = await _station((lng, lat), source=None)

    assert await _uuids(client, bounds=bounds, official=True) == [official]
    assert sorted(await _uuids(client, bounds=bounds, official=False)) == sorted([user, unknown])


@pytest.mark.asyncio
async def test_the_official_badge_follows_source_and_keeps_the_old_flag(client):
    """The site's 官方 badge reads `isOfficial`: official by `source`, or marked so before (ADR-394)."""
    lng, lat, bounds = _box()
    made = await _station((lng, lat), source="official", is_official=False)
    marked = await _station((lng, lat), source="gov", is_official=True)
    user = await _station((lng, lat), source="user", is_official=False)
    query = "query($bounds: BoundsInput) { stations(bounds: $bounds) { items { uuid isOfficial } } }"

    resp = await client.post("/graphql", json={"query": query, "variables": {"bounds": bounds}})

    badges = {item["uuid"]: item["isOfficial"] for item in resp.json()["data"]["stations"]["items"]}
    assert badges == {made: True, marked: True, user: False}


@pytest.mark.asyncio
async def test_county_and_town_keep_the_stations_at_that_address(client):
    """A station with no address is in no area, so either filter leaves it out."""
    lng, lat, bounds = _box()
    guangfu = await _station((lng, lat), county="花蓮縣", town="光復鄉")
    fenglin = await _station((lng, lat), county="花蓮縣", town="鳳林鎮")
    await _station((lng, lat))

    assert sorted(await _uuids(client, bounds=bounds, county="花蓮縣")) == sorted([guangfu, fenglin])
    assert await _uuids(client, bounds=bounds, county="花蓮縣", town="光復鄉") == [guangfu]


@pytest.mark.asyncio
async def test_a_town_needs_its_county(client):
    """鄉鎮 names repeat across counties (中正區, 東區), so a town alone names no one place."""
    *_, bounds = _box()

    body = await _stations(client, bounds=bounds, town="東區")

    assert [error["message"] for error in body["errors"]] == ["town needs county"]


@pytest.mark.asyncio
async def test_creation_and_update_ranges_include_the_start_and_exclude_the_end(client):
    """Half-open, so two adjacent ranges never count a station twice."""
    lng, lat, bounds = _box()
    early, middle, late = [
        await _station((lng, lat), created_at=T0 + timedelta(days=d), updated_at=T0 + timedelta(days=d))
        for d in (0, 1, 2)
    ]
    boundary = (T0 + timedelta(days=1)).isoformat()

    assert sorted(await _uuids(client, bounds=bounds, createdAfter=boundary)) == sorted([middle, late])
    assert await _uuids(client, bounds=bounds, createdBefore=boundary) == [early]
    assert sorted(await _uuids(client, bounds=bounds, updatedAfter=boundary)) == sorted([middle, late])
    assert await _uuids(client, bounds=bounds, updatedBefore=boundary) == [early]


@pytest.mark.asyncio
async def test_open_first_then_most_recently_updated(client):
    """The back office's list order: open stations first, then whatever changed last; paging keeps it."""
    lng, lat, bounds = _box()
    old_open = await _station((lng, lat), updated_at=T0)
    new_open = await _station((lng, lat), updated_at=T0 + timedelta(days=2))
    closed = await _station(
        (lng, lat), operational_status="temporarily_closed", updated_at=T0 + timedelta(days=3)
    )

    ordered = await _uuids(client, bounds=bounds, orderBy="OPEN_FIRST_RECENTLY_UPDATED")
    paged = [
        (await _stations(client, bounds=bounds, orderBy="OPEN_FIRST_RECENTLY_UPDATED", skip=skip, limit=1))[
            "data"
        ]["stations"]["items"][0]["uuid"]
        for skip in range(3)
    ]

    assert ordered == [new_open, old_open, closed]
    assert paged == ordered
