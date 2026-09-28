"""Two-phase createTicket / createStation over GraphQL, with the real engine (Spec 020 §5, ADR-296).

End to end: the resolver, the union result, PostGIS retrieval, fast-v1 scoring and the rows
written. The service-level cases (atomicity, fail-open) are in tests/test_dedup_submission.py.
"""

from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from graphql import print_schema
from shapely.geometry import Point
from sqlalchemy import func, select

from app.dedup_engine.registry import get_engine
from app.graphql.schema import schema
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import Station
from app.models.request import Tickets
from tests.test_graphql.conftest import auth_header, test_db

pytestmark = [pytest.mark.asyncio, pytest.mark.real_dedup]

FLOODED_STREET = (121.5601, 23.6701)
CREATE_TICKET = """
mutation($input: CreateTicketInput!, $ack: String) {
    createTicket(input: $input, acknowledgedDuplicateOf: $ack) {
        __typename
        ... on TicketCreated { ticket { uuid title } }
        ... on DuplicateSuspected { relatedTicketUuid }
    }
}
"""
CREATE_STATION = """
mutation($input: CreateStationInput!, $ack: String) {
    createStation(input: $input, acknowledgedDuplicateOf: $ack) {
        __typename
        ... on StationCreated { station { uuid name } }
        ... on DuplicateStationSuspected { relatedStationUuid }
    }
}
"""
# The Spec 019 standalone API this replaces (ADR-286).
REMOVED_FROM_SDL = (
    "ticketDedupCandidates",
    "stationDedupCandidates",
    "recordDedupHintOutcome",
    "TicketDedupHint",
    "StationDedupHint",
    "DedupScoreComponent",
    "DedupEntityKind",
    "DedupHintOutcome",
)


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Each test starts with no tickets, stations or dedup rows, so none is another's candidate."""
    async with test_db() as db:
        for model in (DedupAuditEvent, DuplicatePair, Tickets, Station):
            for row in (await db.execute(select(model))).scalars().all():
                await db.delete(row)
    yield


async def _seed_ticket(owner: str, *, east_deg=0.0, **overrides) -> str:
    fields = {
        "title": "民生街三段淹水需要抽水機",
        "description": "一樓積水到膝蓋，需要抽水機",
        "status": "pending",
        "priority": "high",
        "task_type": "rescue",
        "visibility": "public",
        "contact_name": "李",
        "created_by": owner,
        "created_at": datetime.now(UTC) - timedelta(minutes=10),
    }
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(FLOODED_STREET[0] + east_deg, FLOODED_STREET[1]), srid=4326),
            **(fields | overrides),
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _seed_station(owner: str) -> str:
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(*FLOODED_STREET), srid=4326),
            name="光復國小臨時收容所",
            description="可收容 200 人",
            type="shelter",
            level=0,
            visibility="public",
            operational_status="active",
            created_by=owner,
        )
        db.add(station)
        await db.flush()
        return str(station.uuid)


def _ticket_input(**overrides) -> dict:
    fields = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "title": "民生街三段淹水需要抽水機",
        "description": "一樓積水到膝蓋，需要抽水機",
        "contactName": "王小明",
        "priority": "high",
        "taskType": "rescue",
    }
    return fields | overrides


def _station_input(**overrides) -> dict:
    fields = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "name": "光復國小臨時收容所",
        "description": "可收容 200 人",
        "type": "shelter",
    }
    return fields | overrides


async def _post(client, token, query, input_, ack=None) -> dict:
    res = await client.post(
        "/graphql",
        json={"query": query, "variables": {"input": input_, "ack": ack}},
        headers=auth_header(token) if token else None,
    )
    return res.json()


async def _count(model) -> int:
    async with test_db() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _events() -> list[str]:
    async with test_db() as db:
        return list((await db.execute(select(DedupAuditEvent.event_type))).scalars())


# --- tickets -----------------------------------------------------------------------------


async def test_a_near_identical_ticket_is_suspected_and_not_created(client, login_user_auth):
    """Same street, same words, minutes apart: DuplicateSuspected, no new ticket, hint_shown."""
    user_uuid, token = login_user_auth
    existing = await _seed_ticket(user_uuid)

    body = await _post(client, token, CREATE_TICKET, _ticket_input())

    assert body.get("errors") is None, body
    assert body["data"]["createTicket"] == {"__typename": "DuplicateSuspected", "relatedTicketUuid": existing}
    assert await _count(Tickets) == 1
    assert await _events() == ["hint_shown"]


async def test_filing_anyway_creates_and_cards_the_pair(client, login_user_auth):
    """Second call with acknowledgedDuplicateOf: TicketCreated and a dup_ignored card by fast-v1."""
    user_uuid, token = login_user_auth
    existing = await _seed_ticket(user_uuid)

    body = await _post(client, token, CREATE_TICKET, _ticket_input(), ack=existing)

    assert body.get("errors") is None, body
    created = body["data"]["createTicket"]
    assert created["__typename"] == "TicketCreated"
    assert created["ticket"]["title"] == "民生街三段淹水需要抽水機"
    async with test_db() as db:
        pair = (await db.execute(select(DuplicatePair))).scalar_one()
        status, version, similarity = pair.status, pair.engine_version, float(pair.similarity)
        uuids = {str(pair.low_uuid), str(pair.high_uuid)}
    assert (status, version) == ("dup_ignored", get_engine().version)
    assert uuids == {existing, created["ticket"]["uuid"]}
    assert similarity >= 0.8


async def test_an_unrelated_ticket_elsewhere_is_created_directly(client, login_user_auth):
    """A different request a few hundred metres away: TicketCreated, no dedup rows."""
    user_uuid, token = login_user_auth
    await _seed_ticket(
        user_uuid, east_deg=0.004, title="需要志工搬物資", description="倉庫缺人手", task_type="hr"
    )

    body = await _post(client, token, CREATE_TICKET, _ticket_input())

    assert body["data"]["createTicket"]["__typename"] == "TicketCreated"
    assert await _count(Tickets) == 2
    assert await _events() == []


async def test_without_ticket_add_the_duplicate_is_never_revealed(client, content_admin_auth):
    """A caller who could not create learns nothing about what is nearby."""
    user_uuid, token = content_admin_auth
    await _seed_ticket(user_uuid)

    body = await _post(client, token, CREATE_TICKET, _ticket_input())

    assert body["data"] is None
    assert "Permission Denied" in body["errors"][0]["message"]
    assert "DuplicateSuspected" not in str(body)
    assert await _events() == []


# --- stations ----------------------------------------------------------------------------


async def test_a_near_identical_station_is_suspected_and_not_created(client, coordinator_auth):
    """Same place, same name: DuplicateStationSuspected, nothing registered."""
    user_uuid, token = coordinator_auth
    existing = await _seed_station(user_uuid)

    body = await _post(client, token, CREATE_STATION, _station_input())

    assert body.get("errors") is None, body
    assert body["data"]["createStation"] == {
        "__typename": "DuplicateStationSuspected",
        "relatedStationUuid": existing,
    }
    assert await _count(Station) == 1


async def test_registering_a_station_anyway_creates_and_cards_it(client, coordinator_auth):
    """Registering a station with acknowledgedDuplicateOf: StationCreated and a station card."""
    user_uuid, token = coordinator_auth
    existing = await _seed_station(user_uuid)

    body = await _post(client, token, CREATE_STATION, _station_input(), ack=existing)

    assert body["data"]["createStation"]["__typename"] == "StationCreated"
    async with test_db() as db:
        pair = (await db.execute(select(DuplicatePair))).scalar_one()
        kind_and_status = (pair.entity_kind, pair.status)
    assert kind_and_status == ("station", "dup_ignored")


async def test_without_station_add_the_duplicate_is_never_revealed(client, login_user_auth):
    """Login User holds ticket.add but not station.add."""
    user_uuid, token = login_user_auth
    await _seed_station(user_uuid)

    body = await _post(client, token, CREATE_STATION, _station_input())

    assert body["data"] is None
    assert "DuplicateStationSuspected" not in str(body)


# --- the old API is gone -----------------------------------------------------------------


def test_the_standalone_dedup_api_is_gone():
    """No dedup query, mutation or score type is left in the SDL (ADR-286)."""
    sdl = print_schema(schema._schema)
    leftovers = [name for name in REMOVED_FROM_SDL if name in sdl]
    assert leftovers == []
