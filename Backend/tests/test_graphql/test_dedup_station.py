"""GraphQL integration tests for the dedup fast layer's station path (登記據點前查重複).

Mirrors tests/test_graphql/test_dedup.py's structure and fixtures, but exercises
`stationDedupCandidates` / `recordDedupHintOutcome(entityKind: station)` instead. The scoring
formula itself (including the station parameter group) is unit-tested in
tests/test_dedup_scoring.py; here we only care that the pieces are wired together correctly
for stations — the open-station filter, the missing time signal, and `entity_kind='station'`
landing in the shared tables.
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


def _check_input(**overrides) -> dict:
    """Build a StationDedupCheckInput for a station about to be registered at the same spot."""
    payload = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "type": "shelter",
        "name": "民生街避難所",
        "description": "可收容約 50 人，提供毛毯與熱食",
    }
    payload.update(overrides)
    return payload


async def _seed_station(user_uuid: str, *, offset_deg=0.0, age_min=10.0, **overrides) -> str:
    """Seed one station near the flooded street and return its uuid."""
    fields = {
        "type": "shelter",
        "name": "民生街避難所",
        "description": "可收容約 50 人，提供毛毯與熱食",
        "source": "user",
        "visibility": "public",
        "operational_status": "active",
    }
    fields.update(overrides)
    async with test_db() as db:
        station = Station(
            geometry=from_shape(
                Point(FLOODED_STREET[0] + offset_deg, FLOODED_STREET[1]), srid=4326
            ),
            created_by=user_uuid,
            created_at=datetime.now(UTC) - timedelta(minutes=age_min),
            **fields,
        )
        db.add(station)
        await db.flush()
        return str(station.uuid)


@pytest_asyncio.fixture(autouse=True)
async def _clean_stations():
    """Start each test with no stations, so one test's fixture is not another's candidate."""
    async with test_db() as db:
        for model in (DedupAuditEvent, DuplicatePair):
            for row in (await db.execute(select(model))).scalars().all():
                await db.delete(row)
        for row in (await db.execute(select(Station))).scalars().all():
            await db.delete(row)
    yield


@pytest.mark.asyncio
async def test_hint_returned_for_a_near_identical_open_station(client, coordinator_auth):
    """Same spot, same type, same wording — the registrant gets one hint, no time signal."""
    user_uuid, token = coordinator_auth
    existing = await _seed_station(user_uuid)

    res = await client.post(
        "/graphql",
        json={"query": STATION_DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    hints = res.json()["data"]["stationDedupCandidates"]
    assert len(hints) == 1
    assert hints[0]["relatedStationUuid"] == existing
    assert hints[0]["similarity"] >= 0.8
    names = {c["name"] for c in hints[0]["scoreComponents"]}
    assert names == {"distance", "task_type", "text"}  # no "time" — stations don't compare it


@pytest.mark.asyncio
async def test_temporarily_closed_hints_but_permanently_closed_does_not(client, coordinator_auth):
    """`temporarily_closed` is still a live candidate; `permanently_closed` never is."""
    user_uuid, token = coordinator_auth
    closed = await _seed_station(user_uuid, operational_status="temporarily_closed")

    res = await client.post(
        "/graphql",
        json={"query": STATION_DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    hints = res.json()["data"]["stationDedupCandidates"]
    assert [h["relatedStationUuid"] for h in hints] == [closed]

    async with test_db() as db:
        row = await db.get(Station, uuid_mod.UUID(closed))
        row.operational_status = "permanently_closed"

    res2 = await client.post(
        "/graphql",
        json={"query": STATION_DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    assert res2.json()["data"]["stationDedupCandidates"] == []


@pytest.mark.asyncio
async def test_an_expired_temporary_station_is_not_a_candidate(client, coordinator_auth):
    """A temporary station past its own `expiresAt` is skipped even while still `active`."""
    user_uuid, token = coordinator_auth
    await _seed_station(
        user_uuid,
        is_temporary=True,
        expires_at=datetime.now(UTC) - timedelta(days=1),
    )

    res = await client.post(
        "/graphql",
        json={"query": STATION_DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    assert res.json()["data"]["stationDedupCandidates"] == []


@pytest.mark.asyncio
async def test_time_weight_zero_means_a_month_old_station_still_hints(client, coordinator_auth):
    """A station registered a month ago is not pushed below the threshold for its age."""
    user_uuid, token = coordinator_auth
    old = await _seed_station(user_uuid, age_min=60 * 24 * 30)  # ~1 month old

    res = await client.post(
        "/graphql",
        json={"query": STATION_DEDUP_CANDIDATES, "variables": {"input": _check_input()}},
        headers=auth_header(token),
    )
    hints = res.json()["data"]["stationDedupCandidates"]
    assert len(hints) == 1
    assert hints[0]["relatedStationUuid"] == old
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
    assert result["pairUuid"]

    async with test_db() as db:
        pair = await db.get(DuplicatePair, uuid_mod.UUID(result["pairUuid"]))
        assert pair.entity_kind == "station"
        assert (pair.status, pair.source_layer, pair.method) == ("dup_ignored", "fast", "fast_rule")
        assert {c["name"] for c in pair.score_components} == {"distance", "task_type", "text"}

        event = await db.get(DedupAuditEvent, uuid_mod.UUID(result["auditEventUuid"]))
        assert event.entity_kind == "station"
        assert event.event_type == "ignored_by_submitter"


@pytest.mark.asyncio
async def test_ticket_dedup_candidates_is_unaffected_by_the_station_path(client, login_user_auth):
    """`ticketDedupCandidates` still needs no `entityKind` and still means "ticket"."""
    from app.models.request import Tickets

    _user_uuid, token = login_user_auth
    async with test_db() as db:
        for row in (await db.execute(select(Tickets))).scalars().all():
            await db.delete(row)

    query = """
    query($input: TicketDedupCheckInput!) {
        ticketDedupCandidates(input: $input) { relatedTicketUuid }
    }
    """
    res = await client.post(
        "/graphql",
        json={
            "query": query,
            "variables": {"input": {
                "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
                "title": "測試單",
            }},
        },
        headers=auth_header(token),
    )
    assert "errors" not in res.json()
