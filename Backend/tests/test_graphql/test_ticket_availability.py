"""ticketAvailability: a share link tells a deleted ticket from one that never was (ADR-444)."""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import event

from app.core.permissions import Perm
from app.db.session import engine as app_engine
from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql import conftest as gql_conftest
from tests.test_graphql.conftest import _create_user_with_grants, auth_header

# Both root fields in one request, as the share page asks them.
SHARE = """
query($uuid: UUID!) {
    ticket(uuid: $uuid) { uuid }
    ticketAvailability(uuid: $uuid)
}
"""


async def _ticket(created_by: str | None = None) -> str:
    """Insert one live ticket, filed by `created_by` or a new user; returns its uuid."""
    async with gql_conftest.test_db() as db:
        if created_by is None:
            author = User(name=f"u_{uuid_mod.uuid4().hex[:8]}")
            db.add(author)
            await db.flush()
            created_by = str(author.uuid)
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=created_by,
            title="t",
            description="d",
            contact_name="c",
            status="pending",
            priority="high",
            task_type="hr",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _share(client, uuid: str, token: str | None = None) -> tuple[dict | None, str]:
    """What the share page reads for `uuid`: the ticket, and its availability."""
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": SHARE, "variables": {"uuid": uuid}}, headers=headers)
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]["ticket"], body["data"]["ticketAvailability"]


@pytest.mark.asyncio
async def test_a_live_ticket_is_available_to_a_guest_and_a_signed_in_caller(client, redis):
    """A guest asking both root fields in one request gets the ticket too, as a signed-in caller does."""
    _, token = await _create_user_with_grants(redis, [])
    ticket = await _ticket()

    assert await _share(client, ticket) == ({"uuid": ticket}, "available")
    assert await _share(client, ticket, token) == ({"uuid": ticket}, "available")


@pytest.mark.asyncio
async def test_a_ticket_its_owner_deleted_reads_deleted(client, redis):
    """The owner deletes it the way the site does; the share link then has no ticket, only the state."""
    owner, token = await _create_user_with_grants(redis, [(Perm.TICKET_DELETE, "all")])
    ticket = await _ticket(created_by=owner)
    deleted = await client.post(
        "/graphql",
        json={"query": "mutation($uuid: UUID!) { deleteTicket(uuid: $uuid) }", "variables": {"uuid": ticket}},
        headers=auth_header(token),
    )
    assert deleted.json() == {"data": {"deleteTicket": True}}

    assert await _share(client, ticket) == (None, "deleted")


@pytest.mark.asyncio
async def test_a_ticket_a_merge_cancelled_reads_deleted(client):
    """重複審核 cancels the other ticket into the kept one; it is deleted all the same (ADR-372)."""
    kept, merged = await _ticket(), await _ticket()
    async with gql_conftest.test_db() as db:
        ticket = await db.get(Tickets, uuid_mod.UUID(merged))
        ticket.status = "cancelled"
        ticket.delete_at = datetime.now(UTC)
        ticket.replaced_by_uuid = kept

    assert await _share(client, merged) == (None, "deleted")


async def _need() -> str:
    """A need on a live ticket; returns the need's uuid."""
    ticket = await _ticket()
    async with gql_conftest.test_db() as db:
        author = await db.get(Tickets, uuid_mod.UUID(ticket))
        need = TicketTask(
            ticket_uuid=ticket,
            task_type="hr",
            task_name="n",
            status="pending",
            source="user",
            created_by=author.created_by,
        )
        db.add(need)
        await db.flush()
        return str(need.uuid)


@pytest.mark.asyncio
@pytest.mark.parametrize("what", ["never used", "a station", "a need"])
async def test_a_uuid_that_is_no_ticket_reads_not_found(client, sample_station, what):
    """Only tickets count: a station shares their geometry table, a need is on a ticket."""
    uuid = {"never used": str(uuid_mod.uuid4()), "a station": sample_station, "a need": None}[what]
    if what == "a need":
        uuid = await _need()

    assert await _share(client, uuid) == (None, "not_found")


@pytest.mark.asyncio
async def test_the_state_takes_one_statement(client):
    """One primary-key read of `delete_at`, whatever the answer."""
    gone = await _ticket()
    async with gql_conftest.test_db() as db:
        ticket = await db.get(Tickets, uuid_mod.UUID(gone))
        ticket.status = "cancelled"
        ticket.delete_at = datetime.now(UTC)
    counts = []
    for uuid in (await _ticket(), gone, str(uuid_mod.uuid4())):
        seen = []

        def on_execute(conn, cursor, statement, params, context, executemany, seen=seen):
            if "tickets" in statement:
                seen.append(statement)

        event.listen(app_engine.sync_engine, "before_cursor_execute", on_execute)
        try:
            resp = await client.post(
                "/graphql",
                json={"query": "query($u: UUID!) { ticketAvailability(uuid: $u) }", "variables": {"u": uuid}},
            )
        finally:
            event.remove(app_engine.sync_engine, "before_cursor_execute", on_execute)
        assert "errors" not in resp.json()
        counts.append(len(seen))
    assert counts == [1, 1, 1]
