import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from tests.test_graphql.conftest import test_db


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
async def test_stations_with_property_filter(client, sample_station):
    # Match existing property_name (polymorphic identity)
    response = await client.post("/graphql", json={
        "query": """
            query {
                stations(propertyName: "station") {
                    items { uuid propertyName }
                }
            }
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    items = data["data"]["stations"]["items"]
    assert len(items) >= 1
    assert all(item["propertyName"] == "station" for item in items)

    # Non-existent property_name
    response = await client.post("/graphql", json={
        "query": """
            query {
                stations(propertyName: "nonexistent") {
                    items { uuid }
                }
            }
        """
    })
    data = response.json()
    assert "errors" not in data
    assert data["data"]["stations"]["items"] == []


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
                    uuid propertyName county city opHour level comment
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
    assert station["county"] == "台北市"
    assert station["city"] == "中正區"
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
                    uuid propertyName county city status
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
    assert area["county"] == "台北市"


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
    assert ticket["priority"] == "urgent"


@pytest.mark.asyncio
async def test_ticket_hr_nested_specialties(client, sample_ticket):
    response = await client.post("/graphql", json={
        "query": f"""
            query {{
                ticket(uuid: "{sample_ticket}") {{
                    uuid
                    taskSpecialties {{
                        uuid specialtyDescription quantity status
                    }}
                }}
            }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    ticket = data["data"]["ticket"]
    assert ticket is not None
    specialties = ticket["taskSpecialties"]
    assert len(specialties) >= 1
    assert specialties[0]["specialtyDescription"] == "Heavy lifting"
    assert specialties[0]["quantity"] == 5
    assert specialties[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_ticket_supply_nested_items(client, coordinator_auth):
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point
    from app.models.request import SupplyRequirement, SupplyTaskItem

    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        ticket = SupplyRequirement(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            title="Need supplies", description="Water needed",
            contact_name="Tester", contact_email="t@t.com",
            status="pending", priority="nominal",
        )
        db.add(ticket)
        await db.flush()
        db.add(SupplyTaskItem(
            req_uuid=ticket.uuid,
            item_name="Water bottle",
            item_description="500ml",
            quantity=100,
            status="pending",
        ))
        await db.flush()
        ticket_uuid = str(ticket.uuid)

    response = await client.post("/graphql", json={
        "query": f"""
            query {{
                ticket(uuid: "{ticket_uuid}") {{
                    uuid title
                    taskItems {{
                        uuid itemName itemDescription quantity status
                    }}
                }}
            }}
        """
    })
    assert response.status_code == 200
    data = response.json()
    assert "errors" not in data
    ticket = data["data"]["ticket"]
    assert ticket is not None
    assert ticket["uuid"] == ticket_uuid
    task_items = ticket["taskItems"]
    assert len(task_items) >= 1
    assert task_items[0]["itemName"] == "Water bottle"
    assert task_items[0]["quantity"] == 100
    assert task_items[0]["status"] == "pending"
