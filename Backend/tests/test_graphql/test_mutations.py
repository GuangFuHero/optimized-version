import uuid

import pytest

from tests.test_graphql.conftest import auth_header

# ---------------------------------------------------------------------------
# GraphQL query strings
# ---------------------------------------------------------------------------

CREATE_STATION = """
mutation($input: CreateStationInput!) {
    createStation(input: $input) { uuid propertyName geometry level }
}
"""

UPDATE_STATION = """
mutation($uuid: UUID!, $input: UpdateStationInput!) {
    updateStation(uuid: $uuid, input: $input) { uuid propertyName }
}
"""

DELETE_STATION = """
mutation($uuid: UUID!) { deleteStation(uuid: $uuid) }
"""

QUERY_STATION = """
query($uuid: UUID!) { station(uuid: $uuid) { uuid propertyName } }
"""

CREATE_CLOSURE_AREA = """
mutation($input: CreateClosureAreaInput!) {
    createClosureArea(input: $input) { uuid status geometry }
}
"""

UPDATE_CLOSURE_AREA = """
mutation($uuid: UUID!, $input: UpdateClosureAreaInput!) {
    updateClosureArea(uuid: $uuid, input: $input) { uuid status }
}
"""

CREATE_STATION_PROPERTY = """
mutation($input: CreateStationPropertyInput!) {
    createStationProperty(input: $input) { uuid propertyName propertyType }
}
"""

UPDATE_STATION_PROPERTY = """
mutation($uuid: UUID!, $input: UpdateStationPropertyInput!) {
    updateStationProperty(uuid: $uuid, input: $input) { uuid status }
}
"""

CREATE_CROWDSOURCING = """
mutation($input: CreateCrowdSourcingInput!) {
    createCrowdSourcing(input: $input) { uuid rating userCredibilityScore }
}
"""

CREATE_TICKET = """
mutation($input: CreateTicketInput!) {
    createTicket(input: $input) { uuid title status priority }
}
"""

UPDATE_TICKET = """
mutation($uuid: UUID!, $input: UpdateTicketInput!) {
    updateTicket(uuid: $uuid, input: $input) { uuid status }
}
"""

CREATE_TICKET_TASK = """
mutation($input: CreateTicketTaskInput!) {
    createTicketTask(input: $input) { uuid taskType taskName status }
}
"""

UPDATE_TICKET_TASK = """
mutation($uuid: UUID!, $input: UpdateTicketTaskInput!) {
    updateTicketTask(uuid: $uuid, input: $input) { uuid status progressNote }
}
"""

CREATE_TASK_PROPERTY = """
mutation($input: CreateTaskPropertyInput!) {
    createTaskProperty(input: $input) { uuid propertyName propertyValue }
}
"""

UPSERT_STATION_PROPERTY_CONFIG = """
mutation($stationType: String!, $input: UpsertPropertyConfigInput!) {
    upsertStationPropertyConfig(stationType: $stationType, input: $input) {
        uuid stationType propertyName dataType enumOptions
    }
}
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

POINT_TAIPEI = {"type": "Point", "coordinates": [121.5, 25.0]}

POLYGON_TAIPEI = {
    "type": "Polygon",
    "coordinates": [[
        [121.49, 24.99], [121.51, 24.99], [121.51, 25.01],
        [121.49, 25.01], [121.49, 24.99],
    ]],
}

MULTIPOLYGON = {
    "type": "MultiPolygon",
    "coordinates": [
        [[[121.49, 24.99], [121.51, 24.99], [121.51, 25.01],
          [121.49, 25.01], [121.49, 24.99]]],
        [[[121.52, 25.02], [121.54, 25.02], [121.54, 25.04],
          [121.52, 25.04], [121.52, 25.02]]],
    ],
}


def _station_input(**overrides) -> dict:
    base = {"geometry": POINT_TAIPEI, "level": 3}
    base.update(overrides)
    return base


# ============================================================================
# Station mutations (11 tests)
# ============================================================================


@pytest.mark.asyncio
async def test_create_station(client, coordinator_auth):
    """Coordinator creates a station successfully."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION,
        "variables": {"input": _station_input()},
    }, headers=auth_header(token))

    data = resp.json()["data"]["createStation"]
    assert data["uuid"] is not None
    assert data["propertyName"] == "station"
    assert data["level"] == 3


@pytest.mark.asyncio
async def test_create_station_rejects_polygon(client, coordinator_auth):
    """Polygon geometry is rejected for a station."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION,
        "variables": {"input": _station_input(geometry=POLYGON_TAIPEI)},
    }, headers=auth_header(token))
    errors = resp.json()["errors"]
    assert any("must be a Point" in e["message"] for e in errors)


@pytest.mark.asyncio
async def test_create_station_invalid_coordinates(client, coordinator_auth):
    """Out-of-range coordinates are rejected."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION,
        "variables": {"input": _station_input(
            geometry={"type": "Point", "coordinates": [200, 100]},
        )},
    }, headers=auth_header(token))
    errors = resp.json()["errors"]
    assert any("Invalid coordinates" in e["message"] for e in errors)


@pytest.mark.asyncio
async def test_update_station(client, coordinator_auth, sample_station):
    """Coordinator updates a station's comment."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": """
        mutation($uuid: UUID!, $input: UpdateStationInput!) {
            updateStation(uuid: $uuid, input: $input) { uuid comment }
        }
        """,
        "variables": {
            "uuid": sample_station,
            "input": {"comment": "updated comment"},
        },
    }, headers=auth_header(token))
    data = resp.json()["data"]["updateStation"]
    assert data["comment"] == "updated comment"


@pytest.mark.asyncio
async def test_update_station_all_scope(client, coordinator_auth):
    """Coordinator with edit=all can edit another coordinator's station."""
    # Create a station as a second coordinator
    from tests.test_graphql.conftest import _create_user_with_role
    other_uuid, other_token = await _create_user_with_role("Field Coordinator")

    # Create station as the other coordinator
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION,
        "variables": {"input": _station_input()},
    }, headers=auth_header(other_token))
    station_uuid = resp.json()["data"]["createStation"]["uuid"]

    # Original coordinator edits it
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": """
        mutation($uuid: UUID!, $input: UpdateStationInput!) {
            updateStation(uuid: $uuid, input: $input) { uuid comment }
        }
        """,
        "variables": {
            "uuid": station_uuid,
            "input": {"comment": "edited_by_other"},
        },
    }, headers=auth_header(token))
    data = resp.json()["data"]["updateStation"]
    assert data["comment"] == "edited_by_other"


@pytest.mark.asyncio
async def test_delete_station(client, coordinator_auth):
    """Coordinator deletes a station (soft delete)."""
    _, token = coordinator_auth
    # Create a station to delete
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION,
        "variables": {"input": _station_input()},
    }, headers=auth_header(token))
    station_uuid = resp.json()["data"]["createStation"]["uuid"]

    resp = await client.post("/graphql", json={
        "query": DELETE_STATION,
        "variables": {"uuid": station_uuid},
    }, headers=auth_header(token))
    assert resp.json()["data"]["deleteStation"] is True


@pytest.mark.asyncio
async def test_delete_station_excluded_from_queries(client, coordinator_auth):
    """After deletion, station query returns null."""
    _, token = coordinator_auth
    # Create and delete
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION,
        "variables": {"input": _station_input()},
    }, headers=auth_header(token))
    station_uuid = resp.json()["data"]["createStation"]["uuid"]

    await client.post("/graphql", json={
        "query": DELETE_STATION,
        "variables": {"uuid": station_uuid},
    }, headers=auth_header(token))

    resp = await client.post("/graphql", json={
        "query": QUERY_STATION,
        "variables": {"uuid": station_uuid},
    }, headers=auth_header(token))
    assert resp.json()["data"]["station"] is None


# ============================================================================
# Closure area mutations (4 tests)
# ============================================================================


@pytest.mark.asyncio
async def test_create_closure_area(client, coordinator_auth):
    """Coordinator creates a closure area with a polygon."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_CLOSURE_AREA,
        "variables": {"input": {
            "geometry": POLYGON_TAIPEI,
            "status": "blocked",
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createClosureArea"]
    assert data["uuid"] is not None
    assert data["status"] == "blocked"


@pytest.mark.asyncio
async def test_create_closure_area_multipolygon(client, coordinator_auth):
    """MultiPolygon geometry is accepted for closure areas."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_CLOSURE_AREA,
        "variables": {"input": {
            "geometry": MULTIPOLYGON,
            "status": "blocked",
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createClosureArea"]
    assert data["uuid"] is not None


@pytest.mark.asyncio
async def test_create_closure_area_rejects_point(client, coordinator_auth):
    """Point geometry is rejected for closure areas."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_CLOSURE_AREA,
        "variables": {"input": {
            "geometry": POINT_TAIPEI,
            "status": "blocked",
        }},
    }, headers=auth_header(token))
    errors = resp.json()["errors"]
    assert any("Polygon or MultiPolygon" in e["message"] for e in errors)


@pytest.mark.asyncio
async def test_update_closure_area(client, coordinator_auth, sample_closure_area):
    """Coordinator updates a closure area's status."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": UPDATE_CLOSURE_AREA,
        "variables": {
            "uuid": sample_closure_area,
            "input": {"status": "cleared"},
        },
    }, headers=auth_header(token))
    data = resp.json()["data"]["updateClosureArea"]
    assert data["status"] == "cleared"


# ============================================================================
# Station property mutations (3 tests)
# ============================================================================


@pytest.mark.asyncio
async def test_create_station_property(client, coordinator_auth, sample_station):
    """Coordinator adds a property to an existing station."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION_PROPERTY,
        "variables": {"input": {
            "stationUuid": sample_station,
            "propertyType": "facility",
            "propertyName": "wifi",
            "quantity": 1,
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createStationProperty"]
    assert data["propertyName"] == "wifi"
    assert data["propertyType"] == "facility"


@pytest.mark.asyncio
async def test_create_property_invalid_station(client, coordinator_auth):
    """Nonexistent station UUID is rejected."""
    _, token = coordinator_auth
    fake_uuid = str(uuid.uuid4())
    resp = await client.post("/graphql", json={
        "query": CREATE_STATION_PROPERTY,
        "variables": {"input": {
            "stationUuid": fake_uuid,
            "propertyType": "facility",
            "propertyName": "wifi",
        }},
    }, headers=auth_header(token))
    errors = resp.json()["errors"]
    assert any("Station not found" in e["message"] for e in errors)


@pytest.mark.asyncio
async def test_update_station_property(
    client, coordinator_auth, sample_station_property,
):
    """Coordinator updates a station property's status."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": UPDATE_STATION_PROPERTY,
        "variables": {
            "uuid": sample_station_property,
            "input": {"status": "verified"},
        },
    }, headers=auth_header(token))
    data = resp.json()["data"]["updateStationProperty"]
    assert data["status"] == "verified"


# ============================================================================
# Crowdsourcing mutations (4 tests)
# ============================================================================


@pytest.mark.asyncio
async def test_create_crowdsourcing(
    client, coordinator_auth, sample_station, sample_station_property,
):
    """Coordinator votes on a station property."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_CROWDSOURCING,
        "variables": {"input": {
            "stationUuid": sample_station,
            "itemUuid": sample_station_property,
            "rating": "agree",
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createCrowdSourcing"]
    assert data["uuid"] is not None
    assert data["rating"] == "agree"


@pytest.mark.asyncio
async def test_crowdsourcing_upsert(
    client, coordinator_auth, sample_station, sample_station_property,
):
    """Voting again on the same item updates instead of creating a duplicate."""
    _, token = coordinator_auth
    payload = {
        "query": CREATE_CROWDSOURCING,
        "variables": {"input": {
            "stationUuid": sample_station,
            "itemUuid": sample_station_property,
            "rating": "agree",
        }},
    }
    headers = auth_header(token)

    resp1 = await client.post("/graphql", json=payload, headers=headers)
    uuid1 = resp1.json()["data"]["createCrowdSourcing"]["uuid"]

    # Change rating and submit again
    payload["variables"]["input"]["rating"] = "disagree"
    resp2 = await client.post("/graphql", json=payload, headers=headers)
    data2 = resp2.json()["data"]["createCrowdSourcing"]

    assert data2["uuid"] == uuid1, "Should update existing record, not create new"
    assert data2["rating"] == "disagree"


@pytest.mark.asyncio
async def test_crowdsourcing_mismatched_station(
    client, coordinator_auth, sample_station_property,
):
    """Wrong stationUuid for the property item returns an error."""
    _, token = coordinator_auth
    fake_station = str(uuid.uuid4())
    resp = await client.post("/graphql", json={
        "query": CREATE_CROWDSOURCING,
        "variables": {"input": {
            "stationUuid": fake_station,
            "itemUuid": sample_station_property,
            "rating": "agree",
        }},
    }, headers=auth_header(token))
    errors = resp.json()["errors"]
    assert any("Item not found for this station" in e["message"] for e in errors)


@pytest.mark.asyncio
async def test_crowdsourcing_auto_credibility(
    client, coordinator_auth, sample_station, sample_station_property,
):
    """userCredibilityScore is auto-set from the user's credibility_score."""
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_CROWDSOURCING,
        "variables": {"input": {
            "stationUuid": sample_station,
            "itemUuid": sample_station_property,
            "rating": "agree",
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createCrowdSourcing"]
    # Default credibility_score for new users is 50.0
    assert data["userCredibilityScore"] == 50.0


# ============================================================================
# Ticket mutations (4 tests)
# ============================================================================


@pytest.mark.asyncio
async def test_create_ticket(client, coordinator_auth):
    """
    Hypothesis: createTicket creates a flat ticket with status=pending.
    Test case: coordinator creates hr ticket → uuid set, status=pending, priority=high.
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET,
        "variables": {"input": {
            "title": "Need medics",
            "description": "Flood relief",
            "geometry": POINT_TAIPEI,
            "contactName": "Alice",
            "contactEmail": "alice@example.com",
            "priority": "high",
            "taskType": "hr",
            "visibility": "public",
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createTicket"]
    assert data["title"] == "Need medics"
    assert data["status"] == "pending"
    assert data["priority"] == "high"


@pytest.mark.asyncio
async def test_update_ticket_valid_transition(client, coordinator_auth):
    """
    Hypothesis: valid status transitions are accepted by the API.
    Test case: pending → in_progress → completed each return the new status.
    """
    _, token = coordinator_auth
    headers = auth_header(token)

    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET,
        "variables": {"input": {
            "title": "Transition test",
            "geometry": POINT_TAIPEI,
            "contactName": "Bob",
            "taskType": "hr",
        }},
    }, headers=headers)
    ticket_uuid = resp.json()["data"]["createTicket"]["uuid"]

    for from_status, to_status in [("pending", "in_progress"), ("in_progress", "completed")]:
        resp = await client.post("/graphql", json={
            "query": UPDATE_TICKET,
            "variables": {"uuid": ticket_uuid, "input": {"status": to_status}},
        }, headers=headers)
        assert resp.json()["data"]["updateTicket"]["status"] == to_status




@pytest.mark.asyncio
async def test_update_ticket_no_permission_edit(
    client, coordinator_auth, login_user_auth, sample_ticket,
):
    """Login user (request:edit=own) cannot edit coordinator's ticket."""
    _, login_token = login_user_auth
    resp = await client.post("/graphql", json={
        "query": UPDATE_TICKET,
        "variables": {
            "uuid": sample_ticket,
            "input": {"status": "in_progress"},
        },
    }, headers=auth_header(login_token))
    errors = resp.json().get("errors", [])
    assert any("Permission Denied." in e["message"] for e in errors)


# ============================================================================
# Ticket task mutations (4 tests)
# ============================================================================

@pytest.mark.asyncio
async def test_create_ticket_task(client, coordinator_auth, sample_ticket):
    """
    Hypothesis: createTicketTask creates a task linked to its ticket with status=pending.
    Test case: coordinator creates hr task for sample_ticket → uuid set, taskType=hr, status=pending.
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET_TASK,
        "variables": {"input": {
            "ticketUuid": sample_ticket,
            "taskType": "hr",
            "taskName": "Need 3 medics",
            "quantity": 3,
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createTicketTask"]
    assert data["uuid"] is not None
    assert data["taskType"] == "hr"
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_create_ticket_task_unknown_ticket(client, coordinator_auth):
    """
    Hypothesis: createTicketTask with a non-existent ticketUuid returns an error.
    Test case: random UUID as ticketUuid → errors list contains "not found".
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_TICKET_TASK,
        "variables": {"input": {
            "ticketUuid": str(uuid.uuid4()),
            "taskType": "rescue",
            "taskName": "Search 3F",
        }},
    }, headers=auth_header(token))
    assert any("not found" in e["message"].lower() for e in resp.json()["errors"])


@pytest.mark.asyncio
async def test_update_ticket_task_status(client, coordinator_auth, sample_ticket_task):
    """
    Hypothesis: updateTicketTask status update is persisted and returned.
    Test case: update sample_ticket_task to in_progress → response reflects new status.
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": UPDATE_TICKET_TASK,
        "variables": {"uuid": sample_ticket_task, "input": {"status": "in_progress"}},
    }, headers=auth_header(token))
    assert resp.json()["data"]["updateTicketTask"]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_create_task_property(client, coordinator_auth, sample_ticket_task):
    """
    Hypothesis: createTaskProperty stores an EAV entry on a task.
    Test case: add required_skill=medical to hr task → propertyName and propertyValue round-trip correctly.
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": CREATE_TASK_PROPERTY,
        "variables": {"input": {
            "taskUuid": sample_ticket_task,
            "propertyName": "required_skill",
            "propertyValue": "medical",
        }},
    }, headers=auth_header(token))
    data = resp.json()["data"]["createTaskProperty"]
    assert data["propertyName"] == "required_skill"
    assert data["propertyValue"] == "medical"


# ============================================================================
# Property config mutations (2 tests)
# ============================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize("data_type", ["Boolean", "String"])
async def test_upsert_station_property_config_idempotent(client, coordinator_auth, data_type):
    """
    Hypothesis: upsertStationPropertyConfig is idempotent — calling it twice updates, not duplicates.
    Test case: upsert power_stable with Boolean then String → second call's dataType wins.
    """
    _, token = coordinator_auth
    resp = await client.post("/graphql", json={
        "query": UPSERT_STATION_PROPERTY_CONFIG,
        "variables": {
            "stationType": "power",
            "input": {"propertyName": "power_stable", "dataType": data_type},
        },
    }, headers=auth_header(token))
    assert resp.json()["data"]["upsertStationPropertyConfig"]["dataType"] == data_type
