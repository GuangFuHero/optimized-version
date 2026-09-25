"""GraphQL integration tests for the dedup fast layer's station path (登記據點前查重複).

Covers what differs from tickets: the open-station filter, the missing time signal, and
`entity_kind='station'` in the shared tables. The ticket path is in test_dedup.py.
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from tests.test_graphql.conftest import auth_header, test_db

STATION_DEDUP_CANDIDATES = """
query($input: StationDedupCheckInput!) {
    stationDedupCandidates(input: $input) {
        relatedStationUuid
        similarity
        scoreComponents { name score weight passed }
    }
}
"""

RECORD_OUTCOME = """
mutation($input: RecordDedupHintOutcomeInput!, $entityKind: DedupEntityKind!) {
    recordDedupHintOutcome(input: $input, entityKind: $entityKind) {
        auditEventUuid hintOutcome pairUuid
    }
}
"""

# The location every fixture station in this file sits at.
FLOODED_STREET = (121.5601, 23.6701)
STATION_SIGNALS = {"distance", "task_type", "text"}  # no "time": stations do not compare it


async def _seed_station(user_uuid: str, *, age_min=10.0, **overrides) -> str:
    """Seed one active station at the flooded street and return its uuid."""
    fields = {
        "type": "shelter",
        "name": "民生街避難所",
        "description": "可收容約 50 人，提供毛毯與熱食",
        "source": "user",
        "visibility": "public",
        "operational_status": "active",
    }
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(*FLOODED_STREET), srid=4326),
            created_by=user_uuid,
            created_at=datetime.now(UTC) - timedelta(minutes=age_min),
            **(fields | overrides),
        )
        db.add(station)
        await db.flush()
        return str(station.uuid)


async def _hints(client, token) -> list[dict]:
    """Run stationDedupCandidates for a shelter registered at the flooded street."""
    payload = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "type": "shelter",
        "name": "民生街避難所",
        "description": "可收容約 50 人，提供毛毯與熱食",
    }
    res = await client.post(
        "/graphql",
        json={"query": STATION_DEDUP_CANDIDATES, "variables": {"input": payload}},
        headers=auth_header(token),
    )
    return res.json()["data"]["stationDedupCandidates"]


@pytest_asyncio.fixture(autouse=True)
async def _clean_dedup_tables():
    """Start each test with no stations, so one test's fixture is not another's candidate."""
    async with test_db() as db:
        for model in (DedupAuditEvent, DuplicatePair, Station):
            for row in (await db.execute(select(model))).scalars().all():
                await db.delete(row)
    yield


@pytest.mark.asyncio
async def test_hint_returned_for_a_near_identical_open_station(client, coordinator_auth):
    """Same spot, same type, same wording — the registrant gets one hint, no time signal."""
    user_uuid, token = coordinator_auth
    existing = await _seed_station(user_uuid)

    hints = await _hints(client, token)
    assert [h["relatedStationUuid"] for h in hints] == [existing]
    assert hints[0]["similarity"] >= 0.8
    assert {c["name"] for c in hints[0]["scoreComponents"]} == STATION_SIGNALS


@pytest.mark.asyncio
async def test_temporarily_closed_hints_but_permanently_closed_does_not(client, coordinator_auth):
    """`temporarily_closed` is still a live candidate; `permanently_closed` never is."""
    user_uuid, token = coordinator_auth
    closed = await _seed_station(user_uuid, operational_status="temporarily_closed")
    assert [h["relatedStationUuid"] for h in await _hints(client, token)] == [closed]

    async with test_db() as db:
        (await db.get(Station, uuid_mod.UUID(closed))).operational_status = "permanently_closed"
    assert await _hints(client, token) == []


@pytest.mark.asyncio
async def test_an_expired_temporary_station_is_not_a_candidate(client, coordinator_auth):
    """A temporary station past its own `expiresAt` is skipped even while still `active`."""
    user_uuid, token = coordinator_auth
    await _seed_station(user_uuid, is_temporary=True, expires_at=datetime.now(UTC) - timedelta(days=1))
    assert await _hints(client, token) == []


@pytest.mark.asyncio
async def test_a_month_old_station_still_hints(client, coordinator_auth):
    """With no time signal, a station is not pushed below the threshold for its age."""
    user_uuid, token = coordinator_auth
    old = await _seed_station(user_uuid, age_min=60 * 24 * 30)

    hints = await _hints(client, token)
    assert [h["relatedStationUuid"] for h in hints] == [old]
    assert hints[0]["similarity"] >= 0.8


@pytest.mark.asyncio
async def test_recording_a_station_outcome_writes_entity_kind_station(client, coordinator_auth):
    """`recordDedupHintOutcome(entityKind: station)` writes `entity_kind='station'` throughout."""
    user_uuid, token = coordinator_auth
    original = await _seed_station(user_uuid)
    submitted = await _seed_station(user_uuid, age_min=0.0)

    res = await client.post(
        "/graphql",
        json={
            "query": RECORD_OUTCOME,
            "variables": {
                "input": {
                    "candidateTicketUuid": original,
                    "submittedTicketUuid": submitted,
                    "outcome": "ignored_hint",
                },
                "entityKind": "station",
            },
        },
        headers=auth_header(token),
    )
    body = res.json()
    assert "errors" not in body, body
    result = body["data"]["recordDedupHintOutcome"]
    assert result["hintOutcome"] == "ignored_hint"

    async with test_db() as db:
        pair = await db.get(DuplicatePair, uuid_mod.UUID(result["pairUuid"]))
        assert (pair.entity_kind, pair.status, pair.source_layer, pair.method) == (
            "station",
            "dup_ignored",
            "fast",
            "fast_rule",
        )
        assert {c["name"] for c in pair.score_components} == STATION_SIGNALS

        event = await db.get(DedupAuditEvent, uuid_mod.UUID(result["auditEventUuid"]))
        assert (event.entity_kind, event.event_type) == ("station", "ignored_by_submitter")
