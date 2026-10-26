"""A station's updatedAt (「最後更新」): any change to it moves it, a suggestion only once approved."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import update

from app.models.geo import BaseGeometry
from tests.test_graphql.conftest import auth_header, test_db
from tests.test_graphql.test_station_assignment_api import ASSIGN, _gov_assigner, _station_and_team

# Every test first puts the station's updatedAt back to this, so "moved" and "unchanged" are exact.
EARLIER = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)

UPDATED_AT = "query($uuid: UUID!) { station(uuid: $uuid) { updatedAt } }"

UPDATE_STATION = """
mutation($uuid: UUID!, $input: UpdateStationInput!) { updateStation(uuid: $uuid, input: $input) { uuid } }
"""

CREATE_SUGGESTION = """
mutation($input: CreateStationSuggestionInput!) { createStationSuggestion(input: $input) { uuid } }
"""

MERGE = """
mutation($station: UUID!, $decisions: [SuggestionDecisionInput!]!) {
    mergeStationSuggestions(stationUuid: $station, decisions: $decisions) { uuid createdAt }
}
"""

REVOKE = "mutation($uuid: UUID!) { revokeStationSuggestionMerge(uuid: $uuid) { revokedAt } }"

CREATE_PROPERTY = """
mutation($input: CreateStationPropertyInput!) { createStationProperty(input: $input) { uuid } }
"""

UPDATE_PROPERTY = """
mutation($uuid: UUID!, $input: UpdateStationPropertyInput!) {
    updateStationProperty(uuid: $uuid, input: $input) { uuid }
}
"""

ATTACH_PHOTO = (
    "mutation($s: UUID!, $url: String!) { attachStationPhoto(stationUuid: $s, url: $url) { uuid } }"
)

DETACH_PHOTO = "mutation($uuid: UUID!) { detachStationPhoto(uuid: $uuid) }"


async def _gql(client, token, query, variables):
    """POST one GraphQL request and return its data, failing on any error."""
    resp = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=auth_header(token)
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]


async def _set_earlier(station: str) -> None:
    """Put the station's updatedAt back to EARLIER."""
    async with test_db() as db:
        await db.execute(update(BaseGeometry).where(BaseGeometry.uuid == station).values(updated_at=EARLIER))


async def _updated_at(client, token, station: str) -> datetime:
    """The station's updatedAt as the API returns it."""
    data = await _gql(client, token, UPDATED_AT, {"uuid": station})
    return datetime.fromisoformat(data["station"]["updatedAt"])


async def _suggest(client, token, station: str, field: str, value: str) -> None:
    """Propose a value for one field of the station."""
    await _gql(
        client,
        token,
        CREATE_SUGGESTION,
        {
            "input": {
                "targetType": "station",
                "targetUuid": station,
                "fieldName": field,
                "newValue": value,
            }
        },
    )


async def _decide(client, token, station: str, field: str, value: str | None, approve: bool) -> dict:
    """Approve or reject the pending suggestions on one field and return the merge."""
    decision = {"targetUuid": station, "fieldName": field, "approve": approve, "value": value}
    data = await _gql(client, token, MERGE, {"station": station, "decisions": [decision]})
    return data["mergeStationSuggestions"]


@pytest.mark.asyncio
async def test_a_pending_suggestion_keeps_the_admin_edit_until_approval_moves_it(
    client, coordinator_auth, auditor_auth, login_user_auth, sample_station
):
    """An admin's contact edit moves it, a pending suggestion does not, and approving it does."""
    _, admin = coordinator_auth
    _, reviewer = auditor_auth
    _, public = login_user_auth
    await _set_earlier(sample_station)

    await _gql(client, admin, UPDATE_STATION, {"uuid": sample_station, "input": {"contactName": "王小明"}})
    edited = await _updated_at(client, admin, sample_station)
    assert edited > EARLIER

    await _suggest(client, public, sample_station, "operational_status", "temporarily_closed")
    assert await _updated_at(client, admin, sample_station) == edited

    merge = await _decide(client, reviewer, sample_station, "operational_status", "temporarily_closed", True)
    assert await _updated_at(client, admin, sample_station) == datetime.fromisoformat(merge["createdAt"])
    assert datetime.fromisoformat(merge["createdAt"]) > edited


@pytest.mark.asyncio
async def test_a_rejected_suggestion_keeps_the_admin_edit(
    client, coordinator_auth, auditor_auth, login_user_auth, sample_station
):
    """A review that only rejects leaves it at the last admin edit."""
    _, admin = coordinator_auth
    _, reviewer = auditor_auth
    _, public = login_user_auth
    await _gql(client, admin, UPDATE_STATION, {"uuid": sample_station, "input": {"contactName": "王小明"}})
    edited = await _updated_at(client, admin, sample_station)

    await _suggest(client, public, sample_station, "operational_status", "temporarily_closed")
    await _decide(client, reviewer, sample_station, "operational_status", None, False)

    assert await _updated_at(client, admin, sample_station) == edited


@pytest.mark.asyncio
async def test_revoking_an_approved_suggestion_moves_it_to_the_revoke_time(
    client, coordinator_auth, auditor_auth, login_user_auth, sample_station
):
    """A revoke changes the station back, so it counts as an update at the review's revokedAt."""
    _, admin = coordinator_auth
    _, reviewer = auditor_auth
    _, public = login_user_auth
    await _suggest(client, public, sample_station, "op_hour", "24h")
    merge = await _decide(client, reviewer, sample_station, "op_hour", "24h", True)
    await _set_earlier(sample_station)

    revoked = await _gql(client, reviewer, REVOKE, {"uuid": merge["uuid"]})

    revoked_at = datetime.fromisoformat(revoked["revokeStationSuggestionMerge"]["revokedAt"])
    assert await _updated_at(client, admin, sample_station) == revoked_at


@pytest.mark.asyncio
async def test_an_edit_to_only_a_stations_column_moves_it_and_a_save_without_changes_does_not(
    client, coordinator_auth, sample_station
):
    """op_hour lives on `stations` alone; saving the value it already has is not a change."""
    _, admin = coordinator_auth
    await _set_earlier(sample_station)
    await _gql(client, admin, UPDATE_STATION, {"uuid": sample_station, "input": {"opHour": "08:00-18:00"}})
    assert await _updated_at(client, admin, sample_station) == EARLIER

    await _gql(client, admin, UPDATE_STATION, {"uuid": sample_station, "input": {"opHour": "24h"}})

    assert await _updated_at(client, admin, sample_station) > EARLIER


@pytest.mark.asyncio
async def test_a_property_edit_moves_it_and_a_save_without_changes_does_not(
    client, coordinator_auth, sample_station, sample_station_property
):
    """A property is part of the station, so a change to one is a change to the station."""
    _, admin = coordinator_auth
    await _set_earlier(sample_station)
    await _gql(client, admin, UPDATE_PROPERTY, {"uuid": sample_station_property, "input": {"quantity": 2}})
    assert await _updated_at(client, admin, sample_station) == EARLIER

    await _gql(client, admin, UPDATE_PROPERTY, {"uuid": sample_station_property, "input": {"quantity": 5}})

    assert await _updated_at(client, admin, sample_station) > EARLIER


@pytest.mark.asyncio
async def test_adding_a_property_moves_it(client, coordinator_auth, sample_station):
    """A new property shows on the station at once, so it is a change to the station."""
    _, admin = coordinator_auth
    await _set_earlier(sample_station)

    await _gql(
        client,
        admin,
        CREATE_PROPERTY,
        {
            "input": {
                "stationUuid": sample_station,
                "propertyType": "facility",
                "propertyName": "generator",
            }
        },
    )

    assert await _updated_at(client, admin, sample_station) > EARLIER


@pytest.mark.asyncio
async def test_adding_and_deleting_a_photo_each_move_it(
    client, coordinator_auth, login_user_auth, sample_station
):
    """Photos are part of the station, so adding one and deleting one both count."""
    _, admin = coordinator_auth
    _, public = login_user_auth
    await _set_earlier(sample_station)
    photo = await _gql(client, public, ATTACH_PHOTO, {"s": sample_station, "url": "https://img.test/a.jpg"})
    assert await _updated_at(client, admin, sample_station) > EARLIER

    await _set_earlier(sample_station)
    await _gql(client, public, DETACH_PHOTO, {"uuid": photo["attachStationPhoto"]["uuid"]})

    assert await _updated_at(client, admin, sample_station) > EARLIER


@pytest.mark.asyncio
async def test_a_team_assignment_moves_it(client, redis, coordinator_auth):
    """Which team runs the station is part of the station."""
    _, admin = coordinator_auth
    station, team = await _station_and_team()
    await _set_earlier(station)

    await _gql(client, await _gov_assigner(redis), ASSIGN, {"stationUuid": station, "teamUuid": team})

    assert await _updated_at(client, admin, station) > EARLIER
