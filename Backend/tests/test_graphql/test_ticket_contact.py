"""Whom to call on a ticket (ADR-286 points 1 and 6).

A requester's name, phone and email read in full to the requester, the coordinators — whoever
holds ticket.view_history on the ticket — and anyone holding a claim on one of its live needs.
Everyone else signed in gets them masked, on the ticket they open as in the `tickets` list, so
neither one request with a page of aliases nor a request per uuid collects every requester's
phone. The two triage answers are not contact details: a volunteer decides on them, so the ticket
they open shows them to anyone signed in, and only the list asks for ticket.view_history too. A
page holds at most 200 rows, what the site's map asks for.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import _citizen_since_adr_286, _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as db_ctx  # renamed so pytest does not collect it

FIELDS = "uuid contactName contactPhone contactEmail personTrappedReported"
LIST = "query($limit: Int) { tickets(limit: $limit) { items { " + FIELDS + " } } }"
ONE = "query($uuid: UUID!) { ticket(uuid: $uuid) { " + FIELDS + " } }"
CLAIM = "mutation($taskUuid: UUID!) { assignTaskActor(taskUuid: $taskUuid) { uuid } }"
RELEASE = "mutation($uuid: UUID!) { unassignTaskActor(uuid: $uuid) }"

CONTACT = ("contactName", "contactPhone", "contactEmail")
IN_FULL = {"contactName": "王小明", "contactPhone": "0912345678", "contactEmail": "wang@example.com"}
MASKED = {"contactName": "王◯◯", "contactPhone": "09*****678", "contactEmail": "w***@***.com"}


async def _ticket(created_by: str | None = None) -> tuple[str, str]:
    """A ticket with a contact, a triage answer and one need; returns (ticket_uuid, task_uuid)."""
    async with db_ctx() as db:
        if created_by is None:
            someone = User(name=f"requester_{uuid_mod.uuid4().hex[:8]}")
            db.add(someone)
            await db.flush()
            created_by = str(someone.uuid)
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=created_by,
            title="一樓積泥",
            contact_name="王小明",
            contact_phone="0912345678",
            contact_email="wang@example.com",
            person_trapped_reported="yes",
            status="pending",
            priority="high",
        )
        db.add(ticket)
        await db.flush()
        task = TicketTask(
            ticket_uuid=str(ticket.uuid),
            task_type="hr",
            task_name="清淤",
            quantity=5,
            source="user",
            created_by=created_by,
        )
        db.add(task)
        await db.flush()
        return str(ticket.uuid), str(task.uuid)


async def _post(client, query: str, variables: dict, token: str | None) -> dict:
    headers = auth_header(token) if token else {}
    res = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    body = res.json()
    assert "errors" not in body, body
    return body["data"]


async def _in_list(client, ticket_uuid: str, token: str | None) -> dict:
    data = await _post(client, LIST, {"limit": 200}, token)
    [row] = [item for item in data["tickets"]["items"] if item["uuid"] == ticket_uuid]
    return row


async def _opened(client, ticket_uuid: str, token: str | None) -> dict:
    return (await _post(client, ONE, {"uuid": ticket_uuid}, token))["ticket"]


def _contact(row: dict) -> dict:
    return {key: row[key] for key in CONTACT}


async def _claim(client, token: str, task_uuid: str) -> str:
    return (await _post(client, CLAIM, {"taskUuid": task_uuid}, token))["assignTaskActor"]["uuid"]


@pytest.mark.asyncio
async def test_a_signed_in_citizen_without_a_claim_reads_the_contact_masked(client, redis):
    """ticket.view_pii `all` is not enough on its own: the requester's phone is not for everyone."""
    ticket_uuid, _ = await _ticket()
    citizen_token = await _citizen_since_adr_286(redis)

    opened = await _opened(client, ticket_uuid, citizen_token)
    listed = await _in_list(client, ticket_uuid, citizen_token)

    assert _contact(opened) == MASKED
    assert _contact(listed) == MASKED


@pytest.mark.asyncio
async def test_the_triage_answers_still_read_on_the_ticket_without_a_claim(client, redis):
    """A volunteer decides whether to go on them, so they are not held back until a claim."""
    ticket_uuid, _ = await _ticket()
    citizen_token = await _citizen_since_adr_286(redis)

    assert (await _opened(client, ticket_uuid, citizen_token))["personTrappedReported"] == "yes"
    assert (await _in_list(client, ticket_uuid, citizen_token))["personTrappedReported"] is None


@pytest.mark.asyncio
async def test_a_claim_on_one_of_its_needs_unlocks_the_contact(client, redis):
    """Whoever is going reads whom to call, on the ticket and in the list."""
    ticket_uuid, task_uuid = await _ticket()
    volunteer_token = await _citizen_since_adr_286(redis)
    await _claim(client, volunteer_token, task_uuid)

    assert _contact(await _opened(client, ticket_uuid, volunteer_token)) == IN_FULL
    assert _contact(await _in_list(client, ticket_uuid, volunteer_token)) == IN_FULL


@pytest.mark.asyncio
async def test_giving_the_place_back_masks_the_contact_again(client, redis):
    """Releasing deletes the claim, and with it the reason to call."""
    ticket_uuid, task_uuid = await _ticket()
    volunteer_token = await _citizen_since_adr_286(redis)
    assignment_uuid = await _claim(client, volunteer_token, task_uuid)
    await _post(client, RELEASE, {"uuid": assignment_uuid}, volunteer_token)

    assert _contact(await _opened(client, ticket_uuid, volunteer_token)) == MASKED


@pytest.mark.asyncio
async def test_a_claim_on_a_deleted_need_unlocks_nothing(client, redis):
    """The volunteer was told not to come (task_deleted); the claim row may outlive the need."""
    ticket_uuid, task_uuid = await _ticket()
    volunteer_token = await _citizen_since_adr_286(redis)
    await _claim(client, volunteer_token, task_uuid)
    async with db_ctx() as db:
        task = await db.get(TicketTask, task_uuid)
        task.delete_at = datetime.now(UTC)

    assert _contact(await _opened(client, ticket_uuid, volunteer_token)) == MASKED


@pytest.mark.asyncio
async def test_one_request_cannot_unmask_a_page_of_tickets(client, redis):
    """The #61 review's harvest: one `ticket` alias per uuid off the list, all in one request."""
    tickets = [await _ticket() for _ in range(3)]
    citizen_token = await _citizen_since_adr_286(redis)
    aliases = " ".join(
        f't{i}: ticket(uuid: "{ticket_uuid}") {{ contactName contactPhone contactEmail }}'
        for i, (ticket_uuid, _) in enumerate(tickets)
    )

    data = await _post(client, "query { " + aliases + " }", {}, citizen_token)

    assert [data[f"t{i}"] for i in range(len(tickets))] == [MASKED] * len(tickets)


@pytest.mark.asyncio
async def test_the_requester_reads_their_own_contact(client, redis):
    """ticket.view_history `own`."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    ticket_uuid, _ = await _ticket(created_by=requester_uuid)

    assert _contact(await _opened(client, ticket_uuid, requester_token)) == IN_FULL
    assert _contact(await _in_list(client, ticket_uuid, requester_token)) == IN_FULL


@pytest.mark.asyncio
async def test_a_coordinator_reads_every_contact(client, redis, coordinator_auth):
    """ticket.view_history `all`."""
    ticket_uuid, _ = await _ticket()
    _, coordinator_token = coordinator_auth

    assert _contact(await _opened(client, ticket_uuid, coordinator_token)) == IN_FULL
    assert _contact(await _in_list(client, ticket_uuid, coordinator_token)) == IN_FULL


@pytest.mark.asyncio
async def test_a_guest_reads_neither(client):
    """No ticket.view_pii at all, as before."""
    ticket_uuid, _ = await _ticket()

    assert _contact(await _opened(client, ticket_uuid, None)) == MASKED
    assert _contact(await _in_list(client, ticket_uuid, None)) == MASKED


@pytest.mark.asyncio
async def test_a_page_holds_at_most_200_rows(client):
    """The site's map asks for 200; one request cannot ask for every ticket at once."""
    res = await client.post("/graphql", json={"query": LIST, "variables": {"limit": 201}})

    assert [error["message"] for error in res.json()["errors"]] == ["limit must be at most 200"]


@pytest.mark.asyncio
@pytest.mark.parametrize("page", [{"limit": -1}, {"skip": -1}])
async def test_a_negative_page_is_refused_by_name(client, page):
    """A negative `limit` or `skip` is named as such, not left to Postgres as "Unexpected error."."""
    query = (
        "query($skip: Int! = 0, $limit: Int! = 50) { tickets(skip: $skip, limit: $limit) { items { uuid } } }"
    )
    res = await client.post("/graphql", json={"query": query, "variables": page})

    assert [error["message"] for error in res.json()["errors"]] == ["limit and skip must not be negative"]
