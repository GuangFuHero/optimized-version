"""GraphQL integration tests for the station-update suggestion workflow."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import update

from app.models.station_property import StationProperty
from tests.test_graphql.conftest import _create_user_with_role, auth_header, test_db

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

MERGE = """
mutation($station: UUID!, $decisions: [SuggestionDecisionInput!]!, $note: String) {
    mergeStationSuggestions(stationUuid: $station, decisions: $decisions, reviewNote: $note) {
        uuid status reviewNote changes { targetType fieldName before after }
    }
}
"""

REVOKE = """
mutation($uuid: UUID!) {
    revokeStationSuggestionMerge(uuid: $uuid) { uuid status revokedBy }
}
"""

REVIEW_VIEW = """
query($uuid: UUID!) {
    station(uuid: $uuid) {
        opHour name pendingSuggestedFields
        properties { uuid quantity pendingSuggestedFields }
        suggestedFields { targetUuid fieldName proposedValues suggestionCount comments }
        suggestionMerges { uuid status }
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
# mergeStationSuggestions / revokeStationSuggestionMerge
# ---------------------------------------------------------------------------

async def _gql(client, token, query, variables):
    """Helper: POST a GraphQL request, with a token when given, and return the JSON body."""
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return resp.json()


async def _merge(client, token, station, decisions, note=None):
    """Helper: merge the given decisions on one station."""
    return await _gql(client, token, MERGE, {"station": station, "decisions": decisions, "note": note})


def _decide(target, field, value=None, approve=True):
    return {"targetUuid": target, "fieldName": field, "approve": approve, "value": value}


@pytest.mark.asyncio
async def test_merge_applies_edited_values_across_station_and_property(
    client, auditor_auth, login_user_auth, sample_station, sample_station_property
):
    """One merge writes the reviewer's values to the station and its property in one go."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    await _create(client, user_token, "station", sample_station, "op_hour", "24h")
    await _create(client, user_token, "station_property", sample_station_property, "quantity", "42")

    body = await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "op_hour", "00:00-24:00"),  # edited by the reviewer
        _decide(sample_station_property, "quantity", "42"),
    ], note="checked by phone")
    merge = body["data"]["mergeStationSuggestions"]
    assert merge["status"] == "applied"
    assert {(c["fieldName"], c["before"], c["after"]) for c in merge["changes"]} == {
        ("op_hour", "08:00-18:00", "00:00-24:00"), ("quantity", "2", "42"),
    }

    view = (await _gql(client, auditor_token, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    assert view["opHour"] == "00:00-24:00"
    assert view["pendingSuggestedFields"] == []
    assert view["suggestedFields"] == []
    prop = next(p for p in view["properties"] if p["uuid"] == sample_station_property)
    assert prop["quantity"] == 42
    assert prop["pendingSuggestedFields"] == []


@pytest.mark.asyncio
async def test_merge_decides_every_suggestion_on_a_field_and_leaves_others_pending(
    client, redis, auditor_auth, login_user_auth, sample_station
):
    """Two people on the same field share one decision; an undecided field stays pending."""
    _, first = login_user_auth
    _, auditor_token = auditor_auth
    second_user = (await _create_user_with_role(redis, "Login User"))[1]
    await _create(client, first, "station", sample_station, "name", "A")
    await _create(client, second_user, "station", sample_station, "name", "B")
    await _create(client, first, "station", sample_station, "op_hour", "24h")

    await _merge(client, auditor_token, sample_station, [_decide(sample_station, "name", approve=False)])

    rows = (await _gql(client, auditor_token, LIST_SUGGESTIONS, {"status": "rejected"}))["data"]
    view = (await _gql(client, auditor_token, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    assert view["pendingSuggestedFields"] == ["op_hour"]
    assert sum(1 for r in rows["stationSuggestions"] if r["fieldName"] == "name") >= 2


@pytest.mark.asyncio
async def test_merge_refuses_unsuggested_field_and_duplicates(
    client, auditor_auth, login_user_auth, sample_station
):
    """A merge only writes fields someone suggested, each at most once."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    await _create(client, user_token, "station", sample_station, "name", "A")

    unsuggested = await _merge(
        client, auditor_token, sample_station, [_decide(sample_station, "op_hour", "24h")]
    )
    assert "No pending suggestion" in unsuggested["errors"][0]["message"]
    twice = await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "name", "A"), _decide(sample_station, "name", "B"),
    ])
    assert "only once" in twice["errors"][0]["message"]


@pytest.mark.asyncio
async def test_merge_denied_without_station_review(client, login_user_auth, sample_station):
    """A regular user cannot merge."""
    _, token = login_user_auth
    await _create(client, token, "station", sample_station, "op_hour", "24h")

    body = await _merge(client, token, sample_station, [_decide(sample_station, "op_hour", "24h")])
    assert any("Permission Denied." in e["message"] for e in body["errors"])


@pytest.mark.asyncio
async def test_revoke_restores_before_values(
    client, auditor_auth, login_user_auth, sample_station
):
    """Revoking a merge writes the old value back and marks the merge revoked."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    await _create(client, user_token, "station", sample_station, "op_hour", "24h")
    merge = (await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "op_hour", "24h"),
    ]))["data"]["mergeStationSuggestions"]

    revoked = (await _gql(client, auditor_token, REVOKE, {"uuid": merge["uuid"]}))["data"]
    assert revoked["revokeStationSuggestionMerge"]["status"] == "revoked"
    view = (await _gql(client, auditor_token, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    assert view["opHour"] == "08:00-18:00"
    assert view["suggestionMerges"][0]["status"] == "revoked"

    again = await _gql(client, auditor_token, REVOKE, {"uuid": merge["uuid"]})
    assert "already revoked" in again["errors"][0]["message"]


@pytest.mark.asyncio
async def test_revoke_refused_after_a_later_edit(
    client, auditor_auth, login_user_auth, sample_station
):
    """A revoke never overwrites a value changed after the merge."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    await _create(client, user_token, "station", sample_station, "op_hour", "24h")
    first = (await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "op_hour", "24h"),
    ]))["data"]["mergeStationSuggestions"]
    await _create(client, user_token, "station", sample_station, "op_hour", "10:00-12:00")
    await _merge(client, auditor_token, sample_station, [_decide(sample_station, "op_hour", "10:00-12:00")])

    body = await _gql(client, auditor_token, REVOKE, {"uuid": first["uuid"]})
    assert "op_hour" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_revoke_skips_a_property_deleted_since_the_merge(
    client, auditor_auth, login_user_auth, sample_station, sample_station_property
):
    """A deleted property has nothing to restore, so the rest of the merge still reverts."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    await _create(client, user_token, "station", sample_station, "op_hour", "24h")
    await _create(client, user_token, "station_property", sample_station_property, "quantity", "42")
    merge = (await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "op_hour", "24h"), _decide(sample_station_property, "quantity", "42"),
    ]))["data"]["mergeStationSuggestions"]
    async with test_db() as db:
        await db.execute(
            update(StationProperty)
            .where(StationProperty.uuid == sample_station_property)
            .values(delete_at=datetime.now(UTC))
        )

    body = await _gql(client, auditor_token, REVOKE, {"uuid": merge["uuid"]})
    assert body["data"]["revokeStationSuggestionMerge"]["status"] == "revoked", body
    view = (await _gql(client, auditor_token, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    assert view["opHour"] == "08:00-18:00"


@pytest.mark.asyncio
async def test_revoke_denied_for_reviewer_without_station_revoke(
    client, coordinator_auth, login_user_auth, sample_station
):
    """station.review alone can merge but not revoke."""
    _, user_token = login_user_auth
    _, coordinator_token = coordinator_auth
    await _create(client, user_token, "station", sample_station, "op_hour", "24h")
    merge = (await _merge(client, coordinator_token, sample_station, [
        _decide(sample_station, "op_hour", "24h"),
    ]))["data"]["mergeStationSuggestions"]

    body = await _gql(client, coordinator_token, REVOKE, {"uuid": merge["uuid"]})
    assert any("Permission Denied." in e["message"] for e in body["errors"])


# ---------------------------------------------------------------------------
# Reads: public pending names, pooled review view, review queue
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_guest_sees_pending_field_names_only(
    client, login_user_auth, sample_station, sample_station_property
):
    """A guest learns which fields are pending, and nothing about the suggestions themselves."""
    _, user_token = login_user_auth
    await _create(client, user_token, "station", sample_station, "name", "New name")
    await _create(client, user_token, "station_property", sample_station_property, "quantity", "7")

    view = (await _gql(client, None, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    assert view["pendingSuggestedFields"] == ["name"]
    prop = next(p for p in view["properties"] if p["uuid"] == sample_station_property)
    assert prop["pendingSuggestedFields"] == ["quantity"]
    assert view["suggestedFields"] == []
    assert view["suggestionMerges"] == []


@pytest.mark.asyncio
async def test_reviewer_sees_suggestions_pooled_per_field(
    client, redis, auditor_auth, login_user_auth, sample_station
):
    """Suggestions from different people on one field come back as one entry, without who."""
    _, first = login_user_auth
    _, auditor_token = auditor_auth
    second = (await _create_user_with_role(redis, "Login User"))[1]
    await _create(client, first, "station", sample_station, "name", "A", comment="sign says A")
    await _create(client, second, "station", sample_station, "name", "B")

    view = (await _gql(client, auditor_token, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    [field] = view["suggestedFields"]
    assert field["fieldName"] == "name"
    assert field["suggestionCount"] == 2
    assert field["proposedValues"] == ["B", "A"]
    assert field["comments"] == ["sign says A"]


@pytest.mark.asyncio
async def test_resubmitting_a_field_updates_your_own_suggestion(
    client, auditor_auth, login_user_auth, sample_station
):
    """The same person suggesting the same field again replaces their earlier value."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    first = (await _create(client, user_token, "station", sample_station, "name", "A"))["data"]
    second = (await _create(client, user_token, "station", sample_station, "name", "A2"))["data"]
    assert first["createStationSuggestion"]["uuid"] == second["createStationSuggestion"]["uuid"]

    view = (await _gql(client, auditor_token, REVIEW_VIEW, {"uuid": sample_station}))["data"]["station"]
    assert view["suggestedFields"][0]["proposedValues"] == ["A2"]


@pytest.mark.asyncio
async def test_guest_cannot_suggest(client, sample_station):
    """Submitting needs an account."""
    body = await _gql(client, None, CREATE_SUGGESTION, {"input": {
        "targetType": "station", "targetUuid": sample_station, "fieldName": "name", "newValue": "X",
    }})
    assert "errors" in body


@pytest.mark.asyncio
async def test_operational_status_merge_stamps_status_changed_at(
    client, auditor_auth, login_user_auth, sample_station
):
    """Closing a station through a merge moves status_changed_at, as a direct edit would."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    status_query = "query($uuid: UUID!) { station(uuid: $uuid) { operationalStatus statusChangedAt } }"
    before = (await _gql(client, auditor_token, status_query, {"uuid": sample_station}))["data"]["station"]
    await _create(client, user_token, "station", sample_station, "operational_status", "temporarily_closed")

    await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "operational_status", "temporarily_closed"),
    ])

    after = (await _gql(client, auditor_token, status_query, {"uuid": sample_station}))["data"]["station"]
    assert after["operationalStatus"] == "temporarily_closed"
    assert after["statusChangedAt"] != before["statusChangedAt"]


@pytest.mark.asyncio
async def test_revoke_restores_status_changed_at(
    client, auditor_auth, login_user_auth, sample_station
):
    """Undoing a wrong closure puts back when the old status began, not the time of the revoke."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    status_query = "query($uuid: UUID!) { station(uuid: $uuid) { operationalStatus statusChangedAt } }"
    before = (await _gql(client, auditor_token, status_query, {"uuid": sample_station}))["data"]["station"]
    await _create(client, user_token, "station", sample_station, "operational_status", "temporarily_closed")
    merge = (await _merge(client, auditor_token, sample_station, [
        _decide(sample_station, "operational_status", "temporarily_closed"),
    ]))["data"]["mergeStationSuggestions"]

    await _gql(client, auditor_token, REVOKE, {"uuid": merge["uuid"]})

    after = (await _gql(client, auditor_token, status_query, {"uuid": sample_station}))["data"]["station"]
    assert after == before


@pytest.mark.asyncio
async def test_free_text_over_the_limit_is_refused(
    client, auditor_auth, login_user_auth, sample_station
):
    """A comment or review note past 1000 characters is a clear error, not a stored blob."""
    _, user_token = login_user_auth
    _, auditor_token = auditor_auth
    body = await _create(client, user_token, "station", sample_station, "name", "A", comment="c" * 1001)
    assert "at most 1000" in body["errors"][0]["message"]

    await _create(client, user_token, "station", sample_station, "name", "A")
    body = await _merge(
        client, auditor_token, sample_station, [_decide(sample_station, "name", "A")], note="n" * 1001
    )
    assert "at most 1000" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_stations_filter_has_pending_suggestions(
    client, login_user_auth, sample_station, sample_station_property
):
    """The review queue lists a station whose only pending suggestion is on a property."""
    _, user_token = login_user_auth
    queue = "query { stations(hasPendingSuggestions: true, limit: 500) { items { uuid } } }"
    listed = (await _gql(client, None, queue, {}))["data"]["stations"]["items"]
    assert sample_station not in {s["uuid"] for s in listed}

    await _create(client, user_token, "station_property", sample_station_property, "quantity", "5")

    listed = (await _gql(client, None, queue, {}))["data"]["stations"]["items"]
    assert sample_station in {s["uuid"] for s in listed}


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
