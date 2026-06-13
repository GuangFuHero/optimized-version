"""GraphQL integration tests for the station-update suggestion workflow."""

import pytest

from tests.test_graphql.conftest import auth_header

# ---------------------------------------------------------------------------
# GraphQL query strings
# ---------------------------------------------------------------------------

SUGGESTABLE_FIELDS = """
query($t: String!) {
    suggestableFields(targetType: $t) { fieldName dataType enumOptions }
}
"""

CREATE_SUGGESTION = """
mutation($input: CreateStationSuggestionInput!) {
    createStationSuggestion(input: $input) {
        uuid status fieldName newValue targetType comment createdBy
    }
}
"""

REVIEW_SUGGESTION = """
mutation($uuid: UUID!, $approve: Boolean!, $note: String) {
    reviewStationSuggestion(uuid: $uuid, approve: $approve, reviewNote: $note) {
        uuid status reviewNote reviewedBy
    }
}
"""

LIST_SUGGESTIONS = """
query($status: String) {
    stationSuggestions(status: $status) { uuid status fieldName }
}
"""

STATION_DETAIL = """
query($uuid: UUID!) {
    station(uuid: $uuid) {
        uuid opHour level visibility name
        properties { uuid quantity propertyName }
    }
}
"""


async def _create(client, token, target_type, target_uuid, field_name, new_value, comment=None):
    """Helper: POST a createStationSuggestion mutation, return the JSON body."""
    resp = await client.post("/graphql", json={
        "query": CREATE_SUGGESTION,
        "variables": {"input": {
            "targetType": target_type, "targetUuid": target_uuid,
            "fieldName": field_name, "newValue": new_value, "comment": comment,
        }},
    }, headers=auth_header(token))
    return resp.json()


# ---------------------------------------------------------------------------
# suggestableFields query
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_suggestable_fields_exposes_enum_options(client):
    """The schema query returns data types and enum options for station fields."""
    resp = await client.post("/graphql", json={
        "query": SUGGESTABLE_FIELDS, "variables": {"t": "station"},
    })
    fields = {f["fieldName"]: f for f in resp.json()["data"]["suggestableFields"]}
    assert fields["type"]["dataType"] == "string"
    assert fields["type"]["enumOptions"] is None
    assert fields["visibility"]["enumOptions"] == ["public", "restricted", "internal"]
    assert fields["op_hour"]["dataType"] == "string"
    assert fields["level"]["dataType"] == "integer"
    assert fields["level"]["enumOptions"] is None


@pytest.mark.asyncio
async def test_suggestable_fields_rejects_unknown_target(client):
    """An unknown target type surfaces an error."""
    resp = await client.post("/graphql", json={
        "query": SUGGESTABLE_FIELDS, "variables": {"t": "nonsense"},
    })
    assert any("Unknown target_type" in e["message"] for e in resp.json()["errors"])


# ---------------------------------------------------------------------------
# createStationSuggestion
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_login_user_can_suggest_station_field(client, login_user_auth, sample_station):
    """A regular logged-in user (map:edit=none) can still create a suggestion."""
    _, token = login_user_auth
    body = await _create(client, token, "station", sample_station, "op_hour", "24h", "always open")
    data = body["data"]["createStationSuggestion"]
    assert data["status"] == "pending"
    assert data["fieldName"] == "op_hour"
    assert data["newValue"] == "24h"
    assert data["comment"] == "always open"


@pytest.mark.asyncio
async def test_login_user_can_suggest_property_field(
    client, login_user_auth, sample_station_property
):
    """A suggestion can target a station_property row."""
    _, token = login_user_auth
    body = await _create(client, token, "station_property", sample_station_property, "quantity", "10")
    data = body["data"]["createStationSuggestion"]
    assert data["targetType"] == "station_property"
    assert data["newValue"] == "10"


@pytest.mark.asyncio
async def test_create_rejects_unknown_field(client, login_user_auth, sample_station):
    """Suggesting a non-suggestable field errors."""
    _, token = login_user_auth
    body = await _create(client, token, "station", sample_station, "credibility_score", "99")
    assert any("not suggestable" in e["message"] for e in body["errors"])


@pytest.mark.asyncio
async def test_create_rejects_bad_enum_value(client, login_user_auth, sample_station):
    """An enum field rejects a value outside its allowed set."""
    _, token = login_user_auth
    body = await _create(client, token, "station", sample_station, "visibility", "secret")
    assert any("not a valid value" in e["message"] for e in body["errors"])


@pytest.mark.asyncio
async def test_create_rejects_non_integer(client, login_user_auth, sample_station):
    """An integer field rejects a non-numeric value."""
    _, token = login_user_auth
    body = await _create(client, token, "station", sample_station, "level", "high")
    assert any("expects an integer" in e["message"] for e in body["errors"])


@pytest.mark.asyncio
async def test_create_rejects_missing_target(client, login_user_auth):
    """Suggesting against a non-existent station errors."""
    _, token = login_user_auth
    body = await _create(
        client, token, "station", "00000000-0000-0000-0000-000000000000", "name", "X"
    )
    assert any("not found" in e["message"].lower() for e in body["errors"])


@pytest.mark.asyncio
async def test_create_requires_auth(client, sample_station):
    """An unauthenticated request cannot create a suggestion."""
    body = await _create(client, "", "station", sample_station, "name", "X")
    assert "errors" in body


@pytest.mark.asyncio
async def test_create_rejects_malformed_target_uuid(client, login_user_auth):
    """A non-UUID target is rejected at the GraphQL boundary, not as a leaky DB DataError."""
    _, token = login_user_auth
    body = await _create(client, token, "station", "abc", "name", "X")
    messages = " ".join(e["message"] for e in body["errors"])
    # The UUID scalar rejects "abc" before any query runs — no asyncpg DataError, no SQL leak.
    assert "DataError" not in messages
    assert "SQL" not in messages


# ---------------------------------------------------------------------------
# reviewStationSuggestion
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_approve_applies_to_station(
    client, coordinator_auth, login_user_auth, sample_station
):
    """Approving a station-field suggestion writes the value onto the station."""
    _, user_token = login_user_auth
    _, admin_token = coordinator_auth
    created = (await _create(
        client, user_token, "station", sample_station, "op_hour", "24h"
    ))["data"]["createStationSuggestion"]

    resp = await client.post("/graphql", json={
        "query": REVIEW_SUGGESTION,
        "variables": {"uuid": created["uuid"], "approve": True, "note": "looks right"},
    }, headers=auth_header(admin_token))
    reviewed = resp.json()["data"]["reviewStationSuggestion"]
    assert reviewed["status"] == "approved"
    assert reviewed["reviewNote"] == "looks right"

    detail = await client.post("/graphql", json={
        "query": STATION_DETAIL, "variables": {"uuid": sample_station},
    }, headers=auth_header(admin_token))
    assert detail.json()["data"]["station"]["opHour"] == "24h"


@pytest.mark.asyncio
async def test_approve_applies_to_property(
    client, coordinator_auth, login_user_auth, sample_station, sample_station_property
):
    """Approving a property-field suggestion writes the value onto the station_property."""
    _, user_token = login_user_auth
    _, admin_token = coordinator_auth
    created = (await _create(
        client, user_token, "station_property", sample_station_property, "quantity", "42"
    ))["data"]["createStationSuggestion"]

    resp = await client.post("/graphql", json={
        "query": REVIEW_SUGGESTION,
        "variables": {"uuid": created["uuid"], "approve": True, "note": None},
    }, headers=auth_header(admin_token))
    assert resp.json()["data"]["reviewStationSuggestion"]["status"] == "approved"

    detail = await client.post("/graphql", json={
        "query": STATION_DETAIL, "variables": {"uuid": sample_station},
    }, headers=auth_header(admin_token))
    props = detail.json()["data"]["station"]["properties"]
    assert any(p["uuid"] == sample_station_property and p["quantity"] == 42 for p in props)


@pytest.mark.asyncio
async def test_reject_leaves_target_unchanged(
    client, coordinator_auth, login_user_auth, sample_station
):
    """Rejecting a suggestion records the decision but does not touch the station."""
    _, user_token = login_user_auth
    _, admin_token = coordinator_auth
    created = (await _create(
        client, user_token, "station", sample_station, "op_hour", "24h"
    ))["data"]["createStationSuggestion"]

    resp = await client.post("/graphql", json={
        "query": REVIEW_SUGGESTION,
        "variables": {"uuid": created["uuid"], "approve": False, "note": "not verified"},
    }, headers=auth_header(admin_token))
    assert resp.json()["data"]["reviewStationSuggestion"]["status"] == "rejected"

    detail = await client.post("/graphql", json={
        "query": STATION_DETAIL, "variables": {"uuid": sample_station},
    }, headers=auth_header(admin_token))
    assert detail.json()["data"]["station"]["opHour"] == "08:00-18:00"


@pytest.mark.asyncio
async def test_review_denied_for_login_user(
    client, login_user_auth, sample_station
):
    """A regular user (map:edit=none) cannot review/approve suggestions."""
    _, token = login_user_auth
    created = (await _create(
        client, token, "station", sample_station, "op_hour", "24h"
    ))["data"]["createStationSuggestion"]

    resp = await client.post("/graphql", json={
        "query": REVIEW_SUGGESTION,
        "variables": {"uuid": created["uuid"], "approve": True, "note": None},
    }, headers=auth_header(token))
    assert any("Permission Denied." in e["message"] for e in resp.json()["errors"])


@pytest.mark.asyncio
async def test_review_already_decided_errors(
    client, coordinator_auth, login_user_auth, sample_station
):
    """A suggestion can only be reviewed once."""
    _, user_token = login_user_auth
    _, admin_token = coordinator_auth
    created = (await _create(
        client, user_token, "station", sample_station, "name", "New name"
    ))["data"]["createStationSuggestion"]

    for _ in range(2):
        resp = await client.post("/graphql", json={
            "query": REVIEW_SUGGESTION,
            "variables": {"uuid": created["uuid"], "approve": True, "note": None},
        }, headers=auth_header(admin_token))
        last = resp.json()
    assert any("already approved" in e["message"] for e in last["errors"])


@pytest.mark.asyncio
async def test_list_suggestions_filters_by_status(
    client, coordinator_auth, login_user_auth, sample_station
):
    """The review queue lists pending suggestions for an admin."""
    _, user_token = login_user_auth
    _, admin_token = coordinator_auth
    await _create(client, user_token, "station", sample_station, "name", "Queued name")

    resp = await client.post("/graphql", json={
        "query": LIST_SUGGESTIONS, "variables": {"status": "pending"},
    }, headers=auth_header(admin_token))
    items = resp.json()["data"]["stationSuggestions"]
    assert len(items) >= 1
    assert all(s["status"] == "pending" for s in items)
