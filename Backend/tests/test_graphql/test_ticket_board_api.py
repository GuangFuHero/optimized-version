"""The ticket board's server side: per-ticket viewerCan* flags, the disaster filter, ticketStats."""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from tests.test_graphql import conftest as gql_conftest
from tests.test_graphql.conftest import _create_user_with_grants, auth_header

RIGHTS = """
query($q: String!) {
    tickets(q: $q) {
        items { title viewerCanEdit viewerCanDelete viewerCanAudit viewerCanViewHistory }
    }
}
"""

STATS = "query { ticketStats { total pending inProgress completed cancelled gapPeople gapNeeds } }"


async def _user(prefix: str = "u") -> str:
    """A fresh account; returns its uuid."""
    async with gql_conftest.test_db() as db:
        user = User(name=f"{prefix}_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        return str(user.uuid)


async def _ticket(created_by: str, title: str, status: str = "pending", disasters=()) -> str:
    """Insert one ticket."""
    async with gql_conftest.test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=created_by,
            title=title,
            description="d",
            contact_name="c",
            contact_email="c@test.com",
            status=status,
            priority="high",
            task_type="hr",
            disaster_types=sorted(disasters),
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _need(ticket: str, quantity: int | None, status: str = "pending", people: int = 0) -> str:
    """Insert one need on `ticket` with `people` linked."""
    async with gql_conftest.test_db() as db:
        task = TicketTask(
            ticket_uuid=ticket,
            task_type="hr",
            task_name="n",
            quantity=quantity,
            status=status,
            source="user",
            created_by=await db.scalar(select(Tickets.created_by).where(Tickets.uuid == ticket)),
        )
        db.add(task)
        await db.flush()
        for _ in range(people):
            actor = User(name=f"a_{uuid_mod.uuid4().hex[:8]}")
            db.add(actor)
            await db.flush()
            db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=str(actor.uuid)))
        await db.flush()
        return str(task.uuid)


async def _gql(client, token, query, variables=None):
    """POST one GraphQL request and return its data, failing on any error."""
    resp = await client.post(
        "/graphql", json={"query": query, "variables": variables or {}}, headers=auth_header(token)
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]


@pytest.mark.asyncio
async def test_viewer_can_flags_follow_each_tickets_scope(client, redis):
    """At `own`, only the caller's own ticket carries the flags; at `all`, every one does."""
    perms = [
        Perm.TICKET_VIEW,
        Perm.TICKET_EDIT,
        Perm.TICKET_DELETE,
        Perm.TICKET_AUDIT,
        Perm.TICKET_VIEW_HISTORY,
    ]
    own_uuid, own_token = await _create_user_with_grants(redis, [(p, "own") for p in perms])
    _, all_token = await _create_user_with_grants(redis, [(p, "all") for p in perms])
    tag = uuid_mod.uuid4().hex[:10]
    await _ticket(own_uuid, f"{tag} mine")
    await _ticket(await _user("other"), f"{tag} theirs")

    def flags(data):
        return {
            i["title"].removeprefix(f"{tag} "): [
                i[k] for k in ("viewerCanEdit", "viewerCanDelete", "viewerCanAudit", "viewerCanViewHistory")
            ]
            for i in data["tickets"]["items"]
        }

    mine, theirs = [True] * 4, [False] * 4
    assert flags(await _gql(client, own_token, RIGHTS, {"q": tag})) == {"mine": mine, "theirs": theirs}
    assert flags(await _gql(client, all_token, RIGHTS, {"q": tag})) == {"mine": mine, "theirs": mine}


@pytest.mark.asyncio
async def test_viewer_can_flags_are_false_without_the_perm(client, redis):
    """Viewing alone grants none of the flags; an anonymous caller gets false, not an error."""
    uid, token = await _create_user_with_grants(redis, [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_EDIT, "own")])
    tag = uuid_mod.uuid4().hex[:10]
    await _ticket(uid, f"{tag} mine")
    await _ticket(await _user("other"), f"{tag} theirs")

    items = (await _gql(client, token, RIGHTS, {"q": tag}))["tickets"]["items"]
    by_title = {i["title"].removeprefix(f"{tag} "): i for i in items}
    assert by_title["mine"]["viewerCanEdit"] is True
    assert by_title["theirs"]["viewerCanEdit"] is False
    assert not any(i[k] for i in items for k in ("viewerCanDelete", "viewerCanAudit", "viewerCanViewHistory"))

    resp = await client.post("/graphql", json={"query": RIGHTS, "variables": {"q": tag}})
    body = resp.json()
    assert "errors" not in body, body
    assert not any(v for i in body["data"]["tickets"]["items"] for k, v in i.items() if k != "title")


@pytest.mark.asyncio
async def test_disaster_type_keeps_only_tickets_filed_under_it(client, redis):
    """Both a single-disaster ticket and a two-disaster one match; the count agrees with the rows."""
    _, token = await _create_user_with_grants(redis, [(Perm.TICKET_VIEW, "all")])
    tag = uuid_mod.uuid4().hex[:10]
    author = await _user()
    await _ticket(author, f"{tag} flood", disasters=["flood"])
    await _ticket(author, f"{tag} both", disasters=["fire", "flood"])
    await _ticket(author, f"{tag} fire", disasters=["fire"])
    await _ticket(author, f"{tag} none")

    query = """
    query($q: String!, $d: String) {
        tickets(q: $q, disasterType: $d) { items { title } pageInfo { totalCount } }
    }
    """
    data = (await _gql(client, token, query, {"q": tag, "d": "flood"}))["tickets"]
    assert {i["title"].removeprefix(f"{tag} ") for i in data["items"]} == {"flood", "both"}
    assert data["pageInfo"]["totalCount"] == 2
    data = (await _gql(client, token, query, {"q": tag}))["tickets"]
    assert data["pageInfo"]["totalCount"] == 4


@pytest.mark.asyncio
async def test_ticket_stats_count_statuses_and_the_volunteer_gap(client, redis):
    """Compared with the board before the fixtures go in: the shared test DB holds other tickets."""
    uid, token = await _create_user_with_grants(redis, [(Perm.TICKET_VIEW, "all")])
    before = (await _gql(client, token, STATS))["ticketStats"]
    pending = await _ticket(uid, "p")
    working = await _ticket(uid, "w", status="in_progress")
    await _ticket(uid, "c1", status="completed")
    done = await _ticket(uid, "c2", status="completed")
    cancelled = await _ticket(uid, "x", status="cancelled")

    await _need(pending, 5, people=2)  # short 3
    await _need(pending, 2, status="in_progress")  # short 2 (legacy in_progress still open)
    await _need(working, 1, people=3)  # over-subscribed: no gap
    await _need(working, None)  # no quantity: no gap
    await _need(working, 4, status="completed")  # closed need: no gap
    await _need(done, 9)  # ticket completed: no gap
    await _need(cancelled, 9)  # ticket cancelled: no gap
    removed = await _need(pending, 7)  # taken off: no gap
    async with gql_conftest.test_db() as db:
        task = (await db.execute(select(TicketTask).where(TicketTask.uuid == removed))).scalar_one()
        task.delete_at = datetime.now(UTC)

    after = (await _gql(client, token, STATS))["ticketStats"]
    stats = {key: after[key] - before[key] for key in after}
    assert stats == {
        "total": 5,
        "pending": 1,
        "inProgress": 1,
        "completed": 2,
        "cancelled": 1,
        "gapPeople": 5,
        "gapNeeds": 2,
    }
