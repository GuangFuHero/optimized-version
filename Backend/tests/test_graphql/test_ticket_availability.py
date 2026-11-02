"""ticketAvailability: what a share link finds at a ticket's uuid when `ticket` has nothing (ADR-444)."""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import event

from app.core.permissions import PUBLIC_PERMS, Perm
from app.db.session import engine as app_engine
from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from app.services import authz
from tests.test_graphql import conftest as gql_conftest
from tests.test_graphql.conftest import _create_user_with_grants, auth_header

# Both root fields in one request, as the share page asks them.
SHARE = """
query($uuid: UUID!) {
    ticket(uuid: $uuid) { uuid }
    ticketAvailability(uuid: $uuid) { status replacedByUuid }
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


async def _gone(ticket: str, into: str | None = None) -> None:
    """Cancel and soft-delete `ticket`, as its owner deleting it does, or a merge into `into`."""
    async with gql_conftest.test_db() as db:
        row = await db.get(Tickets, uuid_mod.UUID(ticket))
        row.status = "cancelled"
        row.delete_at = datetime.now(UTC)
        row.replaced_by_uuid = into


async def _share(client, uuid: str, token: str | None = None) -> tuple[dict | None, dict]:
    """What the share page reads for `uuid`: the ticket, and its availability."""
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": SHARE, "variables": {"uuid": uuid}}, headers=headers)
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]["ticket"], body["data"]["ticketAvailability"]


def _state(status: str, replaced_by: str | None = None) -> dict:
    return {"status": status, "replacedByUuid": replaced_by}


@pytest.mark.asyncio
async def test_a_live_ticket_is_available_to_a_guest_and_a_signed_in_caller(client, redis):
    """A guest asking both root fields in one request gets the ticket too, as a signed-in caller does."""
    _, token = await _create_user_with_grants(redis, [])
    ticket = await _ticket()

    assert await _share(client, ticket) == ({"uuid": ticket}, _state("available"))
    assert await _share(client, ticket, token) == ({"uuid": ticket}, _state("available"))


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

    assert await _share(client, ticket) == (None, _state("deleted"))


@pytest.mark.asyncio
async def test_a_ticket_a_merge_cancelled_points_at_the_kept_one(client):
    """重複審核 cancels the other ticket into the kept one; its link is sent on to the kept ticket."""
    kept, merged = await _ticket(), await _ticket()
    await _gone(merged, into=kept)

    assert await _share(client, merged) == (None, _state("merged", kept))
    assert await _share(client, kept) == ({"uuid": kept}, _state("available"))


@pytest.mark.asyncio
async def test_a_ticket_merged_twice_over_points_at_where_its_request_is_now(client):
    """A merged into B, then B into C: both links go on to C."""
    a, b, c = await _ticket(), await _ticket(), await _ticket()
    await _gone(a, into=b)
    await _gone(b, into=c)

    assert await _share(client, a) == (None, _state("merged", c))
    assert await _share(client, b) == (None, _state("merged", c))


@pytest.mark.asyncio
async def test_a_ticket_merged_into_one_deleted_since_reads_deleted(client):
    """The kept ticket's owner deleted it afterwards, so the request is gone after all."""
    kept, merged = await _ticket(), await _ticket()
    await _gone(merged, into=kept)
    await _gone(kept)

    assert await _share(client, merged) == (None, _state("deleted"))


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

    assert await _share(client, uuid) == (None, _state("not_found"))


@pytest.mark.asyncio
async def test_out_of_a_narrower_scope_a_ticket_reads_not_found_deleted_or_not(client, redis, monkeypatch):
    """Were ticket.view not public, a ticket out of scope would read as `ticket` has it: not there.

    Whether it was deleted is not told, or a deleted one out of scope would read otherwise than a
    live one. A merge into a ticket out of scope reads deleted: this one the caller could see.
    """
    monkeypatch.setattr(authz, "PUBLIC_PERMS", PUBLIC_PERMS - {Perm.TICKET_VIEW})
    me, token = await _create_user_with_grants(redis, [(Perm.TICKET_VIEW, "own")])
    mine, mine_gone, mine_merged = await _ticket(me), await _ticket(me), await _ticket(me)
    theirs, theirs_gone = await _ticket(), await _ticket()
    await _gone(mine_gone)
    await _gone(theirs_gone)
    await _gone(mine_merged, into=theirs)

    assert await _share(client, mine, token) == ({"uuid": mine}, _state("available"))
    assert await _share(client, mine_gone, token) == (None, _state("deleted"))
    assert await _share(client, theirs, token) == (None, _state("not_found"))
    assert await _share(client, theirs_gone, token) == (None, _state("not_found"))
    assert await _share(client, mine_merged, token) == (None, _state("deleted"))


@pytest.mark.asyncio
async def test_each_ticket_it_looks_at_takes_one_statement(client):
    """One primary-key read per ticket: the one asked about, then each one a merge led on to."""
    kept, gone, merged = await _ticket(), await _ticket(), await _ticket()
    await _gone(gone)
    await _gone(merged, into=kept)
    counts = []
    for uuid in (kept, gone, str(uuid_mod.uuid4()), merged):
        seen = []

        def on_execute(conn, cursor, statement, params, context, executemany, seen=seen):
            if "tickets" in statement:
                seen.append(statement)

        event.listen(app_engine.sync_engine, "before_cursor_execute", on_execute)
        try:
            resp = await client.post(
                "/graphql",
                json={
                    "query": "query($u: UUID!) { ticketAvailability(uuid: $u) { status } }",
                    "variables": {"u": uuid},
                },
            )
        finally:
            event.remove(app_engine.sync_engine, "before_cursor_execute", on_execute)
        assert "errors" not in resp.json()
        counts.append(len(seen))
    assert counts == [1, 1, 1, 2]
