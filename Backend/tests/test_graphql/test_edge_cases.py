import pytest

from tests.test_graphql.conftest import auth_header


@pytest.mark.asyncio
async def test_geojson_point_roundtrip(client, coordinator_auth):
    """Create station with Point, query back, verify coordinates match."""
    _, token = coordinator_auth
    res = await client.post("/graphql", json={
        "query": """mutation($input: CreateStationInput!) {
            createStation(input: $input) { uuid geometry }
        }""",
        "variables": {"input": {
            "geometry": {"type": "Point", "coordinates": [121.5, 25.0]},
        }},
    }, headers=auth_header(token))
    data = res.json()["data"]["createStation"]
    created_uuid = data["uuid"]

    res = await client.post("/graphql", json={
        "query": f'{{ station(uuid: "{created_uuid}") {{ geometry }} }}',
    })
    geom = res.json()["data"]["station"]["geometry"]
    assert geom["type"] == "Point"
    assert abs(geom["coordinates"][0] - 121.5) < 0.0001
    assert abs(geom["coordinates"][1] - 25.0) < 0.0001


@pytest.mark.asyncio
async def test_geojson_polygon_roundtrip(client, coordinator_auth):
    """Create closure area with Polygon, query back, verify type."""
    _, token = coordinator_auth
    polygon = {
        "type": "Polygon",
        "coordinates": [[
            [121.49, 24.99], [121.51, 24.99], [121.51, 25.01],
            [121.49, 25.01], [121.49, 24.99],
        ]],
    }
    res = await client.post("/graphql", json={
        "query": """mutation($input: CreateClosureAreaInput!) {
            createClosureArea(input: $input) { uuid geometry }
        }""",
        "variables": {"input": {
            "geometry": polygon,
            "status": "blocked",
        }},
    }, headers=auth_header(token))
    data = res.json()["data"]["createClosureArea"]
    created_uuid = data["uuid"]

    res = await client.post("/graphql", json={
        "query": f'{{ closureArea(uuid: "{created_uuid}") {{ geometry }} }}',
    })
    geom = res.json()["data"]["closureArea"]["geometry"]
    assert geom["type"] == "Polygon"
    assert len(geom["coordinates"][0]) >= 4


@pytest.mark.asyncio
async def test_invalid_geojson(client, coordinator_auth):
    """Malformed geometry type should produce an error."""
    _, token = coordinator_auth
    res = await client.post("/graphql", json={
        "query": """mutation($input: CreateStationInput!) {
            createStation(input: $input) { uuid }
        }""",
        "variables": {"input": {
            "geometry": {"type": "Invalid", "coordinates": []},
        }},
    }, headers=auth_header(token))
    body = res.json()
    assert "errors" in body


@pytest.mark.asyncio
async def test_bounds_no_results(client):
    """Query with bounds in the Pacific Ocean returns empty list, no crash."""
    res = await client.post("/graphql", json={
        "query": """query {
            stations(bounds: {
                minLat: -10, maxLat: -5, minLng: -170, maxLng: -160
            }) { items { uuid } pageInfo { totalCount } }
        }""",
    })
    data = res.json()["data"]["stations"]
    assert data["items"] == []
    assert data["pageInfo"]["totalCount"] == 0


@pytest.mark.asyncio
async def test_unicode_in_fields(client, coordinator_auth):
    """Chinese characters in comment and county survive roundtrip."""
    _, token = coordinator_auth
    res = await client.post("/graphql", json={
        "query": """mutation($input: CreateStationInput!) {
            createStation(input: $input) { uuid comment county }
        }""",
        "variables": {"input": {
            "geometry": {"type": "Point", "coordinates": [121.5, 25.0]},
            "comment": "\u6e2c\u8a66\u7ad9\u9ede",
            "county": "\u53f0\u5317\u5e02",
        }},
    }, headers=auth_header(token))
    data = res.json()["data"]["createStation"]
    created_uuid = data["uuid"]
    assert data["comment"] == "\u6e2c\u8a66\u7ad9\u9ede"
    assert data["county"] == "\u53f0\u5317\u5e02"

    res = await client.post("/graphql", json={
        "query": f'{{ station(uuid: "{created_uuid}") {{ comment county }} }}',
    })
    station = res.json()["data"]["station"]
    assert station["comment"] == "\u6e2c\u8a66\u7ad9\u9ede"
    assert station["county"] == "\u53f0\u5317\u5e02"


@pytest.mark.asyncio
async def test_multiple_queries_one_request(client, sample_station, sample_closure_area):
    """Verify both stations and closureAreas queries work in the same session.

    NOTE: AsyncSession does not support concurrent operations, so we issue
    the two queries as separate requests rather than combining them in a single
    GraphQL document (which would cause Strawberry to resolve them in parallel).
    """
    res1 = await client.post("/graphql", json={
        "query": """{ stations { items { uuid } pageInfo { totalCount } } }""",
    })
    res2 = await client.post("/graphql", json={
        "query": """{ closureAreas { items { uuid } pageInfo { totalCount } } }""",
    })
    data1 = res1.json()["data"]
    data2 = res2.json()["data"]
    assert "stations" in data1
    assert "closureAreas" in data2
    assert data1["stations"]["pageInfo"]["totalCount"] >= 1
    assert data2["closureAreas"]["pageInfo"]["totalCount"] >= 1


@pytest.mark.asyncio
async def test_graphql_endpoint_accessible(client):
    """GET /graphql returns 200 (GraphiQL page)."""
    res = await client.get("/graphql")
    assert res.status_code == 200
