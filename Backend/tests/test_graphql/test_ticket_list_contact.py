"""Contact details in the `tickets` list (ADR-286 point 6).

Anyone signed in may call a requester (ADR-286), so the ticket a volunteer opens shows the
contact in full. The list is a different matter: page after page of it would hand any new account
every requester's phone at once. So in the list the contact fields, and the two triage answers
that ride with them, also take ticket.view_history — the requester and the coordinators — and a
page holds at most 200 rows, what the site's map asks for.
"""

import uuid as uuid_mod

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.request import Tickets
from tests.test_graphql.conftest import _citizen_since_adr_286, _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as db_ctx  # renamed so pytest does not collect it

FIELDS = "uuid contactName contactPhone personTrappedReported"
LIST = "query($limit: Int) { tickets(limit: $limit) { items { " + FIELDS + " } } }"
ONE = "query($uuid: UUID!) { ticket(uuid: $uuid) { " + FIELDS + " } }"

IN_FULL = {"contactName": "王小明", "contactPhone": "0912345678", "personTrappedReported": "yes"}
MASKED = {"contactName": "王◯◯", "contactPhone": "09*****678", "personTrappedReported": None}


async def _ticket(created_by: str | None = None) -> str:
    """A ticket with a contact and a triage answer, filed by `created_by` (or someone else)."""
    async with db_ctx() as db:
        if created_by is None:
            someone = User(name=f"requester_{uuid_mod.uuid4().hex[:8]}")
            db.add(someone)
            await db.flush()
            created_by = str(someone.uuid)
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=created_by,
            title="一樓積泥", contact_name="王小明", contact_phone="0912345678",
            person_trapped_reported="yes", status="pending", priority="high", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _post(client, query: str, variables: dict, token: str | None) -> dict:
    headers = auth_header(token) if token else {}
    res = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return res.json()


async def _in_list(client, ticket_uuid: str, token: str | None) -> dict:
    body = await _post(client, LIST, {"limit": 200}, token)
    assert "errors" not in body, body
    [row] = [item for item in body["data"]["tickets"]["items"] if item["uuid"] == ticket_uuid]
    return {key: row[key] for key in IN_FULL}


async def _opened(client, ticket_uuid: str, token: str | None) -> dict:
    body = await _post(client, ONE, {"uuid": ticket_uuid}, token)
    assert "errors" not in body, body
    return {key: body["data"]["ticket"][key] for key in IN_FULL}


@pytest.mark.asyncio
async def test_a_signed_in_citizen_reads_the_contact_on_the_ticket_but_not_in_the_list(client, redis):
    """ticket.view_pii `all` still opens the ticket's contact; the list wants ticket.view_history."""
    ticket_uuid = await _ticket()
    citizen_token = await _citizen_since_adr_286(redis)

    assert await _opened(client, ticket_uuid, citizen_token) == IN_FULL
    assert await _in_list(client, ticket_uuid, citizen_token) == MASKED


@pytest.mark.asyncio
async def test_the_requester_reads_their_own_contact_in_the_list(client, redis):
    """ticket.view_history `own`."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    ticket_uuid = await _ticket(created_by=requester_uuid)

    assert await _in_list(client, ticket_uuid, requester_token) == IN_FULL


@pytest.mark.asyncio
async def test_a_coordinator_reads_every_contact_in_the_list(client, redis, coordinator_auth):
    """ticket.view_history `all`."""
    ticket_uuid = await _ticket()
    _, coordinator_token = coordinator_auth

    assert await _in_list(client, ticket_uuid, coordinator_token) == IN_FULL


@pytest.mark.asyncio
async def test_a_guest_reads_neither(client):
    """No ticket.view_pii at all, as before."""
    ticket_uuid = await _ticket()

    assert await _opened(client, ticket_uuid, None) == MASKED
    assert await _in_list(client, ticket_uuid, None) == MASKED


@pytest.mark.asyncio
async def test_a_page_holds_at_most_200_rows(client):
    """The site's map asks for 200; one request cannot ask for every ticket at once."""
    body = await _post(client, LIST, {"limit": 201}, None)

    assert [error["message"] for error in body["errors"]] == ["limit must be at most 200"]
