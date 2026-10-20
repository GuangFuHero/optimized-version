"""A station's public supply status and when it last changed (Spec/024-station-supply-status ADR-333).

Merging and revoking a suggested supply status is covered beside the other suggestion tests, in
test_suggestions.py.
"""

from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.geo import Station
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as db_ctx

STATION = """
query($uuid: UUID!) { station(uuid: $uuid) { supplyStatus supplyStatusUpdatedAt } }
"""
CREATE_STATION = """
mutation($input: CreateStationInput!) {
    createStation(input: $input) {
        ... on StationCreated { station { uuid supplyStatus supplyStatusUpdatedAt } }
    }
}
"""
UPDATE_STATION = """
mutation($uuid: UUID!, $input: UpdateStationInput!) {
    updateStation(uuid: $uuid, input: $input) { supplyStatus supplyStatusUpdatedAt }
}
"""
SUGGESTABLE_FIELDS = """
query { suggestableFields(targetType: "station") { fieldName dataType } }
"""


async def _gql(client, query, variables=None, token=None) -> dict:
    resp = await client.post(
        "/graphql",
        json={"query": query, "variables": variables or {}},
        headers=auth_header(token) if token else None,
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]


async def _create(client, token, supply_status=None) -> dict:
    station_input = {"geometry": {"type": "Point", "coordinates": [121.5, 25.0]}}
    if supply_status is not None:
        station_input["supplyStatus"] = supply_status
    data = await _gql(client, CREATE_STATION, {"input": station_input}, token)
    return data["createStation"]["station"]


@pytest.mark.asyncio
async def test_anyone_reads_the_supply_status_and_its_stamp(client, coordinator_auth):
    """Public on purpose: the map tells passers-by what a station is short of."""
    coord_uuid, _ = coordinator_auth
    stamp = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
    async with db_ctx() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=coord_uuid,
            type="shelter", source="user", visibility="public",
            supply_status="飲用水見底、尿布尚有存量", supply_status_updated_at=stamp,
        )
        db.add(station)
        await db.flush()
        station_uuid = str(station.uuid)

    station = (await _gql(client, STATION, {"uuid": station_uuid}))["station"]
    assert station["supplyStatus"] == "飲用水見底、尿布尚有存量"
    assert datetime.fromisoformat(station["supplyStatusUpdatedAt"]) == stamp


@pytest.mark.asyncio
async def test_create_stamps_a_given_supply_status(client, coordinator_auth):
    """A station registered with a supply status is dated from that moment."""
    _, token = coordinator_auth
    station = await _create(client, token, "飲用水見底")

    assert station["supplyStatus"] == "飲用水見底"
    assert station["supplyStatusUpdatedAt"] is not None


@pytest.mark.asyncio
async def test_create_without_a_supply_status_leaves_both_null(client, coordinator_auth):
    """No line, nothing to date: unlike status_changed_at, the stamp is not set on create."""
    _, token = coordinator_auth
    station = await _create(client, token)

    assert station["supplyStatus"] is None
    assert station["supplyStatusUpdatedAt"] is None


@pytest.mark.asyncio
async def test_update_moves_the_stamp_only_on_a_real_change(client, coordinator_auth):
    """A form saved back whole must not make an old status look fresh."""
    _, token = coordinator_auth
    created = await _create(client, token, "飲用水見底")
    uuid = created["uuid"]

    same = await _gql(client, UPDATE_STATION, {"uuid": uuid, "input": {"supplyStatus": "飲用水見底"}}, token)
    assert same["updateStation"]["supplyStatusUpdatedAt"] == created["supplyStatusUpdatedAt"]
    other = await _gql(client, UPDATE_STATION, {"uuid": uuid, "input": {"name": "體育館"}}, token)
    assert other["updateStation"]["supplyStatusUpdatedAt"] == created["supplyStatusUpdatedAt"]

    changed = await _gql(client, UPDATE_STATION, {"uuid": uuid, "input": {"supplyStatus": "尿布不足"}}, token)
    assert changed["updateStation"]["supplyStatus"] == "尿布不足"
    assert changed["updateStation"]["supplyStatusUpdatedAt"] > created["supplyStatusUpdatedAt"]


@pytest.mark.asyncio
async def test_a_blank_supply_status_is_no_line_and_dates_nothing(client, coordinator_auth):
    """A form that sends "" for an empty field must not date a blank line."""
    _, token = coordinator_auth
    created = await _create(client, token, "  ")
    assert created["supplyStatus"] is None
    assert created["supplyStatusUpdatedAt"] is None

    blank = {"uuid": created["uuid"], "input": {"supplyStatus": ""}}
    saved = await _gql(client, UPDATE_STATION, blank, token)
    assert saved["updateStation"]["supplyStatus"] is None
    assert saved["updateStation"]["supplyStatusUpdatedAt"] is None


@pytest.mark.asyncio
async def test_a_blank_clears_a_supply_status_as_null_does(client, coordinator_auth):
    """Clearing is a change, so it is dated, and stored as the null an unset field holds."""
    _, token = coordinator_auth
    created = await _create(client, token, "飲用水見底")

    blank = {"uuid": created["uuid"], "input": {"supplyStatus": " "}}
    cleared = await _gql(client, UPDATE_STATION, blank, token)

    assert cleared["updateStation"]["supplyStatus"] is None
    assert cleared["updateStation"]["supplyStatusUpdatedAt"] > created["supplyStatusUpdatedAt"]


@pytest.mark.asyncio
async def test_supply_status_is_suggestable_as_free_text(client):
    """The site's suggest-an-edit form offers 物資狀況, so the field list carries it."""
    fields = {f["fieldName"]: f for f in (await _gql(client, SUGGESTABLE_FIELDS))["suggestableFields"]}
    assert fields["supply_status"]["dataType"] == "string"
