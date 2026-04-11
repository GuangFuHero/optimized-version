import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from tests.test_graphql.conftest import test_db, auth_header


# ──────────────────────────────────────────────
# GraphQL query strings
# ──────────────────────────────────────────────

STATION_PROPERTY_CONFIGS = """
query($stationType: String!) {
    stationPropertyConfigs(stationType: $stationType) { propertyName dataType enumOptions }
}
"""

TASK_PROPERTY_CONFIGS = """
query($taskType: String!) {
    taskPropertyConfigs(taskType: $taskType) { propertyName dataType enumOptions }
}
"""

TICKET_TASKS_QUERY = """
query($ticketUuid: String!) {
    ticketTasks(ticketUuid: $ticketUuid) {
        uuid taskType status
        properties { propertyName propertyValue }
    }
}
"""


# ──────────────────────────────────────────────
# Station queries
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stations_returns_data(client, sample_station):
    response = await client.post("/graphql", json={
        "query": """
            query { stations { items { uuid propertyName } pageInfo { totalCount } } }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["stations"]["items"]
    assert isinstance(items, list)
    assert len(items) >= 1
    assert data["data"]["stations"]["pageInfo"]["totalCount"] >= 1


@pytest.mark.asyncio
async def test_stations_with_bounds(client, sample_station):
    response = await client.post("/graphql", json={
        "query": """
            query {
                stations(bounds: {minLat: 24.9, maxLat: 25.1, minLng: 121.4, maxLng: 121.6}) {
                    items { uuid propertyName }
                    pageInfo { totalCount }
                }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["stations"]["items"]
    assert len(items) >= 1
    uuids = [item["uuid"] for item in items]
    assert sample_station in uuids


@pytest.mark.asyncio
async def test_stations_outside_bounds_excluded(client, sample_station):
    response = await client.post("/graphql", json={
        "query": """
            query {
                stations(bounds: {minLat: 0, maxLat: 1, minLng: 0, maxLng: 1}) {
                    items { uuid }
                    pageInfo { totalCount }
                }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    assert data["data"]["stations"]["items"] == []
    assert data["data"]["stations"]["pageInfo"]["totalCount"] == 0


@pytest.mark.asyncio
async def test_stations_filter_by_station_type(client, sample_station):
    """
    Hypothesis: stations(stationType=...) filters by Station.type field.
    Test case: stationType=shelter returns sample_station; stationType=water returns empty list.
    """
    response = await client.post("/graphql", json={
        "query": """
            query { stations(stationType: "shelter") { items { uuid } } }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    uuids = [item["uuid"] for item in data["data"]["stations"]["items"]]
    assert sample_station in uuids

    response = await client.post("/graphql", json={
        "query": """
            query { stations(stationType: "water") { items { uuid } } }
        """
    })
    data = response.json()
    assert "errors" not in data
    uuids = [item["uuid"] for item in data["data"]["stations"]["items"]]
    assert sample_station not in uuids


@pytest.mark.asyncio
async def test_stations_pagination(client, sample_station):
    response = await client.post("/graphql", json={
        "query": """
            query {
                stations(skip: 0, limit: 1) {
                    items { uuid }
                    pageInfo { totalCount hasNextPage hasPreviousPage }
                }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    page_info = data["data"]["stations"]["pageInfo"]
    assert page_info["totalCount"] >= 1
    assert page_info["hasPreviousPage"] is False
    assert len(data["data"]["stations"]["items"]) <= 1


@pytest.mark.asyncio
async def test_stations_excludes_soft_deleted(client, coordinator_auth):
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point
    from app.models.geo import Station

    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
        )
        db.add(station)
        await db.flush()
        deleted_uuid = str(station.uuid)

        station.delete_at = datetime.now(timezone.utc)

    response = await client.post("/graphql", json={
        "query": """
            query { stations { items { uuid } } }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    uuids = [item["uuid"] for item in data["data"]["stations"]["items"]]
    assert deleted_uuid not in uuids


@pytest.mark.asyncio
async def test_station_detail(client, sample_station):
    response = await client.post("/graphql", json={
        "query": f"""
            query {{
                station(uuid: "{sample_station}") {{
                    uuid propertyName opHour level comment
                    createdBy createdAt updatedAt geometry
                }}
            }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    station = data["data"]["station"]
    assert station is not None
    assert station["uuid"] == sample_station
    assert station["propertyName"] == "station"
    assert station["level"] == 3


@pytest.mark.asyncio
async def test_station_not_found(client):
    random_uuid = str(uuid.uuid4())
    response = await client.post("/graphql", json={
        "query": f"""
            query {{ station(uuid: "{random_uuid}") {{ uuid }} }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    assert data["data"]["station"] is None


# ──────────────────────────────────────────────
# Closure area queries
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_closure_areas_returns_data(client, sample_closure_area):
    response = await client.post("/graphql", json={
        "query": """
            query { closureAreas { items { uuid propertyName } pageInfo { totalCount } } }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["closureAreas"]["items"]
    assert isinstance(items, list)
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_closure_areas_with_bounds(client, sample_closure_area):
    response = await client.post("/graphql", json={
        "query": """
            query {
                closureAreas(bounds: {minLat: 24.9, maxLat: 25.1, minLng: 121.4, maxLng: 121.6}) {
                    items { uuid }
                    pageInfo { totalCount }
                }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["closureAreas"]["items"]
    assert len(items) >= 1
    uuids = [item["uuid"] for item in items]
    assert sample_closure_area in uuids


@pytest.mark.asyncio
async def test_closure_area_detail(client, sample_closure_area):
    response = await client.post("/graphql", json={
        "query": f"""
            query {{
                closureArea(uuid: "{sample_closure_area}") {{
                    uuid propertyName status
                    informationSource comment createdAt updatedAt geometry
                }}
            }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    area = data["data"]["closureArea"]
    assert area is not None
    assert area["uuid"] == sample_closure_area
    assert area["status"] == "blocked"


@pytest.mark.asyncio
async def test_closure_area_not_found(client):
    random_uuid = str(uuid.uuid4())
    response = await client.post("/graphql", json={
        "query": f"""
            query {{ closureArea(uuid: "{random_uuid}") {{ uuid }} }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    assert data["data"]["closureArea"] is None


# ──────────────────────────────────────────────
# Ticket queries
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tickets_returns_data(client, sample_ticket):
    response = await client.post("/graphql", json={
        "query": """
            query { tickets { items { uuid title status } pageInfo { totalCount } } }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["tickets"]["items"]
    assert isinstance(items, list)
    assert len(items) >= 1


@pytest.mark.asyncio
async def test_tickets_with_bounds(client, sample_ticket):
    response = await client.post("/graphql", json={
        "query": """
            query {
                tickets(bounds: {minLat: 24.9, maxLat: 25.1, minLng: 121.4, maxLng: 121.6}) {
                    items { uuid }
                    pageInfo { totalCount }
                }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["tickets"]["items"]
    assert len(items) >= 1
    uuids = [item["uuid"] for item in items]
    assert sample_ticket in uuids


@pytest.mark.asyncio
async def test_tickets_filter_by_status(client, sample_ticket):
    # Match "pending"
    response = await client.post("/graphql", json={
        "query": """
            query {
                tickets(status: "pending") { items { uuid status } }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["tickets"]["items"]
    assert len(items) >= 1
    assert all(item["status"] == "pending" for item in items)

    # The sample_ticket is "pending", so it should NOT appear in "completed"
    response = await client.post("/graphql", json={
        "query": """
            query {
                tickets(status: "completed") { items { uuid status } }
            }
        """
    })
    data = response.json()
    assert "errors" not in data
    completed_items = data["data"]["tickets"]["items"]
    assert all(item["status"] == "completed" for item in completed_items)
    completed_uuids = [item["uuid"] for item in completed_items]
    assert sample_ticket not in completed_uuids


@pytest.mark.asyncio
async def test_ticket_detail(client, sample_ticket):
    response = await client.post("/graphql", json={
        "query": f"""
            query {{
                ticket(uuid: "{sample_ticket}") {{
                    uuid title status priority description
                    contactName contactEmail createdAt updatedAt geometry
                }}
            }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    ticket = data["data"]["ticket"]
    assert ticket is not None
    assert ticket["uuid"] == sample_ticket
    assert ticket["title"] == "Need volunteers"
    assert ticket["status"] == "pending"
    assert ticket["priority"] == "high"


# ──────────────────────────────────────────────
# Property config queries (4 tests)
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_station_property_configs_returns_list(client, coordinator_auth):
    """
    Hypothesis: stationPropertyConfigs query returns a list of property configs.
    Test case: query with any stationType returns a list (may be empty if not seeded).
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": STATION_PROPERTY_CONFIGS,
        "variables": {"stationType": "shelter"},
    }, headers=auth_header(token))
    data = resp.json()["data"]["stationPropertyConfigs"]
    assert isinstance(data, list)
    # Each config should have propertyName and dataType
    for cfg in data:
        assert "propertyName" in cfg
        assert "dataType" in cfg


@pytest.mark.asyncio
async def test_task_property_configs_returns_list(client, coordinator_auth):
    """
    Hypothesis: taskPropertyConfigs query returns a list of property configs.
    Test case: query with any taskType returns a list (may be empty if not seeded).
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": TASK_PROPERTY_CONFIGS,
        "variables": {"taskType": "rescue"},
    }, headers=auth_header(token))
    data = resp.json()["data"]["taskPropertyConfigs"]
    assert isinstance(data, list)
    # Each config should have propertyName and dataType
    for cfg in data:
        assert "propertyName" in cfg
        assert "dataType" in cfg


@pytest.mark.asyncio
async def test_ticket_tasks_query(client, coordinator_auth, sample_ticket, sample_ticket_task):
    """
    Hypothesis: ticketTasks returns all tasks for a ticket, with an empty properties list initially.
    Test case: sample_ticket has 1 task (sample_ticket_task), taskType=hr, no properties yet.
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": TICKET_TASKS_QUERY,
        "variables": {"ticketUuid": sample_ticket},
    }, headers=auth_header(token))
    tasks = resp.json()["data"]["ticketTasks"]
    assert len(tasks) >= 1
    assert tasks[0]["taskType"] == "hr"
    assert tasks[0]["properties"] == []
