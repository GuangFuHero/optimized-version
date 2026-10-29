"""Two-phase createTicket / createTicketTask / createStation over GraphQL, on the real engine.

End to end: resolver, union results, the backend's engine guard, the engine's own queries and
scoring, and the rows written. Service-level cases (atomicity, fail-open, acknowledgement
bookkeeping) are in tests/test_dedup_submission.py.
"""

import re
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from graphql import print_schema
from shapely.geometry import Point
from sqlalchemy import delete, func, select

from app.dedup_engine.registry import get_engine
from app.graphql.schema import schema
from app.models.dedup import DedupAuditEvent, DuplicatePair
from app.models.geo import BuildingMapTicketMap, Station
from app.models.photo import Photo
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.ticket_task import TaskAssignment, TaskProperty, TicketTask
from tests.test_graphql.conftest import auth_header, test_db

pytestmark = [pytest.mark.asyncio, pytest.mark.real_dedup]

FLOODED_STREET = (121.5601, 23.6701)
SUSPECTS = "... on DuplicatesSuspected { suspects { draftRef relatedKind relatedUuid relatedTicketUuid } }"
CREATE_TICKET = f"""
mutation($input: CreateTicketInput!) {{
    createTicket(input: $input) {{
        __typename
        ... on TicketCreated {{ ticket {{ uuid }} tasks {{ uuid taskName }} }}
        {SUSPECTS}
    }}
}}
"""
CREATE_TICKET_TASK = f"""
mutation($input: CreateTicketTaskInput!, $ack: String) {{
    createTicketTask(input: $input, acknowledgedDuplicateOf: $ack) {{
        __typename
        ... on TicketTaskCreated {{ task {{ uuid taskName }} }}
        {SUSPECTS}
    }}
}}
"""
CREATE_HELP_REQUEST = f"""
mutation($input: CreateHelpRequestInput!) {{
    createHelpRequest(input: $input) {{
        __typename
        ... on TicketCreated {{ ticket {{ uuid }} tasks {{ uuid taskName }} }}
        {SUSPECTS}
    }}
}}
"""
CREATE_STATION = f"""
mutation($input: CreateStationInput!, $ack: String) {{
    createStation(input: $input, acknowledgedDuplicateOf: $ack) {{
        __typename
        ... on StationCreated {{ station {{ uuid }} }}
        {SUSPECTS}
    }}
}}
"""
# The old standalone dedup query/mutation API and the old single-suspect result types.
REMOVED_FROM_SDL = (
    "ticketDedupCandidates",
    "stationDedupCandidates",
    "recordDedupHintOutcome",
    "TicketDedupHint",
    "StationDedupHint",
    "DedupScoreComponent",
    "DedupEntityKind",
    "DedupHintOutcome",
    "DuplicateSuspected",
    "DuplicateStationSuspected",
)
PUMP = {"taskType": "rescue", "taskName": "一樓淹水需要抽水機", "taskDescription": "水深及膝"}
WATER = {"taskType": "supply", "taskName": "需要飲用水", "taskDescription": "二十人份", "quantity": 20}


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """No leftovers from other tests become candidates.

    A need's assignments and properties go first: another file may leave some, and they hold the need.
    """
    async with test_db() as db:
        await db.execute(delete(BuildingMapTicketMap))
        await db.execute(
            delete(SecondaryLocation).where(
                SecondaryLocation.geometry_uuid.in_(select(Tickets.uuid).union(select(Station.uuid)))
            )
        )
        for model in (
            DedupAuditEvent,
            DuplicatePair,
            Photo,
            TaskAssignment,
            TaskProperty,
            TicketTask,
            Tickets,
            Station,
        ):
            for row in (await db.execute(select(model))).scalars().all():
                await db.delete(row)
    yield


async def _seed_ticket_with_task(owner: str, *, east_deg=0.0, task=PUMP) -> tuple[str, str]:
    """An open ticket near the flooded street with one open task; returns (ticket, task) uuids."""
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(FLOODED_STREET[0] + east_deg, FLOODED_STREET[1]), srid=4326),
            title="民生街淹水",
            status="pending",
            priority="high",
            contact_name="李",
            created_by=owner,
        )
        db.add(ticket)
        await db.flush()
        row = TicketTask(
            ticket_uuid=ticket.uuid,
            task_type=task["taskType"],
            task_name=task["taskName"],
            task_description=task.get("taskDescription"),
            created_by=owner,
            created_at=datetime.now(UTC) - timedelta(minutes=10),
        )
        db.add(row)
        await db.flush()
        return str(ticket.uuid), str(row.uuid)


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


def _ticket_input(tasks=(), **overrides) -> dict:
    fields = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "title": "民生街淹水",
        "contactName": "王小明",
        "priority": "high",
        "tasks": list(tasks),
    }
    return fields | overrides


HELP_ADDRESS = "花蓮縣光復鄉民生街"


def _help_input(tasks) -> dict:
    """請求協助 from the flooded street, with an address and a photo link a hold must not keep."""
    return {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "title": "民生街淹水",
        "contactName": "王小明",
        "secondaryLocation": {"landmarkNote": HELP_ADDRESS},
        "photoUrls": ["https://duk.tw/flood.jpg"],
        "tasks": list(tasks),
    }


async def _post(client, token, query, variables) -> dict:
    res = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=auth_header(token)
    )
    return res.json()


async def _count(model) -> int:
    async with test_db() as db:
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()


async def _help_addresses() -> int:
    """Addresses carrying `_help_input`'s line; other tests leave addresses of their own behind."""
    async with test_db() as db:
        query = select(func.count()).where(SecondaryLocation.landmark_note == HELP_ADDRESS)
        return (await db.execute(query)).scalar_one()


async def _events() -> list[str]:
    async with test_db() as db:
        return sorted((await db.execute(select(DedupAuditEvent.event_type))).scalars())


# --- new ticket ----------------------------------------------------------------------------


async def test_a_task_like_an_open_one_holds_the_whole_ticket(client, login_user_auth):
    """Two tasks, one matching an open task nearby: DuplicatesSuspected naming it; nothing created."""
    user_uuid, token = login_user_auth
    ticket_uuid, task_uuid = await _seed_ticket_with_task(user_uuid)

    body = await _post(client, token, CREATE_TICKET, {"input": _ticket_input([WATER, PUMP])})

    assert body.get("errors") is None, body
    assert body["data"]["createTicket"] == {
        "__typename": "DuplicatesSuspected",
        "suspects": [
            {
                "draftRef": "task:1",
                "relatedKind": "ticket_task",
                "relatedUuid": task_uuid,
                "relatedTicketUuid": ticket_uuid,
            }
        ],
    }
    assert (await _count(Tickets), await _count(TicketTask)) == (1, 1)
    assert await _events() == ["hint_shown"]


async def test_filing_anyway_creates_the_ticket_its_tasks_and_the_pair(client, login_user_auth):
    """The acknowledgement travels on its task draft: TicketCreated with both tasks, one pair card."""
    user_uuid, token = login_user_auth
    _, task_uuid = await _seed_ticket_with_task(user_uuid)
    acked = PUMP | {"acknowledgedDuplicateOf": task_uuid}

    body = await _post(client, token, CREATE_TICKET, {"input": _ticket_input([acked, WATER])})

    created = body["data"]["createTicket"]
    assert created["__typename"] == "TicketCreated", body
    assert [t["taskName"] for t in created["tasks"]] == ["一樓淹水需要抽水機", "需要飲用水"]
    async with test_db() as db:
        pair = (await db.execute(select(DuplicatePair))).scalar_one()
        facts = (
            pair.entity_kind,
            pair.status,
            pair.engine_version,
            {str(pair.low_uuid), str(pair.high_uuid)},
        )
    expected_uuids = {task_uuid, created["tasks"][0]["uuid"]}
    assert facts == ("ticket_task", "dup_ignored", get_engine().version, expected_uuids)


async def test_a_ticket_without_tasks_is_created_directly(client, login_user_auth):
    """Nothing to compare: created, even next to an identical ticket."""
    user_uuid, token = login_user_auth
    await _seed_ticket_with_task(user_uuid)
    body = await _post(client, token, CREATE_TICKET, {"input": _ticket_input()})
    assert body["data"]["createTicket"]["__typename"] == "TicketCreated"
    assert body["data"]["createTicket"]["tasks"] == []


async def test_an_unrelated_task_elsewhere_is_created_directly(client, login_user_auth):
    """A different need a few hundred metres away: created, no dedup rows."""
    user_uuid, token = login_user_auth
    await _seed_ticket_with_task(user_uuid, east_deg=0.004)
    body = await _post(client, token, CREATE_TICKET, {"input": _ticket_input([WATER])})
    assert body["data"]["createTicket"]["__typename"] == "TicketCreated"
    assert await _events() == []


async def test_without_ticket_add_nothing_is_revealed(client, content_admin_auth):
    """A caller who could not create learns nothing about what is nearby."""
    user_uuid, token = content_admin_auth
    await _seed_ticket_with_task(user_uuid)
    body = await _post(client, token, CREATE_TICKET, {"input": _ticket_input([PUMP])})
    assert body["data"] is None
    assert "Permission Denied" in body["errors"][0]["message"]
    assert "Suspected" not in str(body)
    assert await _events() == []


# --- help request (請求協助) ---------------------------------------------------------------


async def test_a_help_request_need_like_an_open_one_holds_the_whole_request(client, login_user_auth):
    """The site's new ticket is checked like createTicket's: one need suspected, nothing is filed."""
    user_uuid, token = login_user_auth
    ticket_uuid, task_uuid = await _seed_ticket_with_task(user_uuid)

    body = await _post(client, token, CREATE_HELP_REQUEST, {"input": _help_input([WATER, PUMP])})

    assert body.get("errors") is None, body
    assert body["data"]["createHelpRequest"] == {
        "__typename": "DuplicatesSuspected",
        "suspects": [
            {
                "draftRef": "task:1",
                "relatedKind": "ticket_task",
                "relatedUuid": task_uuid,
                "relatedTicketUuid": ticket_uuid,
            }
        ],
    }
    assert (await _count(Tickets), await _count(TicketTask), await _count(Photo)) == (1, 1, 0)
    assert await _help_addresses() == 0
    assert await _events() == ["hint_shown"]


async def test_filing_a_help_request_anyway_files_every_need_and_the_pair(client, login_user_auth):
    """The acknowledgement travels on its need: TicketCreated with both needs, one pair card."""
    user_uuid, token = login_user_auth
    _, task_uuid = await _seed_ticket_with_task(user_uuid)
    acked = PUMP | {"acknowledgedDuplicateOf": task_uuid}

    body = await _post(client, token, CREATE_HELP_REQUEST, {"input": _help_input([WATER, acked])})

    created = body["data"]["createHelpRequest"]
    assert created["__typename"] == "TicketCreated", body
    assert [t["taskName"] for t in created["tasks"]] == ["需要飲用水", "一樓淹水需要抽水機"]
    async with test_db() as db:
        pair = (await db.execute(select(DuplicatePair))).scalar_one()
        facts = (pair.entity_kind, pair.status, {str(pair.low_uuid), str(pair.high_uuid)})
    assert facts == ("ticket_task", "dup_ignored", {task_uuid, created["tasks"][1]["uuid"]})
    assert await _events() == ["ignored_by_submitter"]
    assert (await _count(Photo), await _help_addresses()) == (1, 1)


# --- task on an existing ticket ------------------------------------------------------------


async def test_adding_a_task_like_another_tickets_open_task_is_held(client, login_user_auth):
    """Another ticket's matching task holds it; the ticket's own tasks do not."""
    user_uuid, token = login_user_auth
    mine, _ = await _seed_ticket_with_task(user_uuid)
    other_ticket, other_task = await _seed_ticket_with_task(user_uuid, east_deg=0.0002)
    task_input = PUMP | {"ticketUuid": mine}

    body = await _post(client, token, CREATE_TICKET_TASK, {"input": task_input, "ack": None})
    assert body["data"]["createTicketTask"]["suspects"] == [
        {
            "draftRef": "task:0",
            "relatedKind": "ticket_task",
            "relatedUuid": other_task,
            "relatedTicketUuid": other_ticket,
        }
    ]

    body = await _post(client, token, CREATE_TICKET_TASK, {"input": task_input, "ack": other_task})
    assert body["data"]["createTicketTask"]["__typename"] == "TicketTaskCreated"
    assert body["data"]["createTicketTask"]["task"]["taskName"] == "一樓淹水需要抽水機"


# --- station -------------------------------------------------------------------------------


async def test_a_station_like_a_serving_one_is_held_then_registered(client, coordinator_auth):
    """DuplicatesSuspected with draftRef "station"; acknowledged, it is registered and carded."""
    user_uuid, token = coordinator_auth
    existing = await _seed_station(user_uuid)
    station_input = {
        "geometry": {"type": "Point", "coordinates": list(FLOODED_STREET)},
        "name": "光復國小臨時收容所",
        "description": "可收容 200 人",
        "type": "shelter",
    }

    body = await _post(client, token, CREATE_STATION, {"input": station_input, "ack": None})
    assert body["data"]["createStation"]["suspects"] == [
        {"draftRef": "station", "relatedKind": "station", "relatedUuid": existing, "relatedTicketUuid": None}
    ]
    body = await _post(client, token, CREATE_STATION, {"input": station_input, "ack": existing})
    assert body["data"]["createStation"]["__typename"] == "StationCreated"
    assert await _count(DuplicatePair) == 1


# --- the old API is gone -----------------------------------------------------------------


def test_the_standalone_and_phase_1_dedup_types_are_gone():
    """No dedup query or mutation, and no single-suspect result types, in the SDL."""
    sdl = print_schema(schema._schema)
    assert [name for name in REMOVED_FROM_SDL if re.search(rf"\b{name}\b", sdl)] == []
