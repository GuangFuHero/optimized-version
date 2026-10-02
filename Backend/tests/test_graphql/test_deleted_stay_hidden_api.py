"""A deleted ticket or need is gone from every query.

The site shows what the API returns: a deleted need that still came back would read as one to
claim. Deleting a ticket deletes its needs with it (services/ticket.py delete_ticket), but a ticket
deleted before that did not, so the ticket's own deletion has to hide its needs too — that is the
state the ticket cases below start from. `myTaskAssignments` is pinned the same way in
test_my_task_assignments.py (test_a_claim_on_a_deleted_need_or_ticket_drops_off).

Asked as a guest: ticket.view is public, so these are what anyone at all can reach.
"""

import uuid as uuidlib
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TaskProperty, TicketTask
from tests.test_graphql.conftest import test_db as graphql_db  # a bare `test_db` would be collected

TICKETS = """
query($q: String) {
  tickets(q: $q) { items { uuid } pageInfo { totalCount } }
}
"""
TICKET = "query($uuid: UUID!) { ticket(uuid: $uuid) { uuid tasks { uuid } } }"
TICKET_TASKS = "query($ticketUuid: String!) { ticketTasks(ticketUuid: $ticketUuid) { uuid } }"
TASK_PROPERTIES = "query($taskUuid: String!) { taskProperties(taskUuid: $taskUuid) { uuid } }"


async def _ticket(title: str, *, deleted: bool = False) -> tuple[str, dict[str, str]]:
    """A ticket with two needs, 清淤 and 搬家具, each with one property. Returns its uuid and theirs.

    `deleted` deletes the ticket alone and leaves its needs as they were.
    """
    async with graphql_db() as db:
        requester = User(name="求助者")
        db.add(requester)
        await db.flush()
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(requester.uuid),
            title=title, contact_name="王小姐", status="pending", priority="high",
            task_type="hr", visibility="public",
            delete_at=datetime.now(UTC) if deleted else None,
        )
        db.add(ticket)
        await db.flush()
        needs = {}
        for name in ("清淤", "搬家具"):
            task = TicketTask(
                ticket_uuid=str(ticket.uuid), task_type="hr", task_name=name, quantity=3,
                source="user", visibility="public", created_by=str(requester.uuid),
            )
            db.add(task)
            await db.flush()
            db.add(TaskProperty(task_uuid=str(task.uuid), property_name="人力", property_value="3"))
            needs[name] = str(task.uuid)
        await db.flush()
        return str(ticket.uuid), needs


async def _delete_need(task_uuid: str) -> None:
    async with graphql_db() as db:
        task = await db.get(TicketTask, uuidlib.UUID(task_uuid))
        task.status, task.delete_at = "canceled", datetime.now(UTC)


async def _ask(client, query: str, variables: dict) -> dict:
    body = (await client.post("/graphql", json={"query": query, "variables": variables})).json()
    assert "errors" not in body, body
    return body["data"]


def _title() -> str:
    """A title no other test's ticket has, so a search finds only this test's tickets."""
    return f"刪除測試 {uuidlib.uuid4().hex[:8]}"


# --- a deleted ticket ---


@pytest.mark.asyncio
async def test_a_deleted_ticket_is_not_listed_nor_counted(client):
    """The board and its count skip it; a live ticket found by the same search stays."""
    title = _title()
    live_uuid, _ = await _ticket(title)
    await _ticket(title, deleted=True)

    listed = (await _ask(client, TICKETS, {"q": title}))["tickets"]

    assert [item["uuid"] for item in listed["items"]] == [live_uuid]
    assert listed["pageInfo"]["totalCount"] == 1


@pytest.mark.asyncio
async def test_a_deleted_ticket_cannot_be_fetched(client):
    """Not even by its uuid, e.g. from a link or a notice."""
    ticket_uuid, _ = await _ticket(_title(), deleted=True)

    assert (await _ask(client, TICKET, {"uuid": ticket_uuid}))["ticket"] is None


@pytest.mark.asyncio
async def test_a_deleted_tickets_needs_are_not_listed(client):
    """Asked for by the ticket's uuid, which is all ticketTasks needs."""
    ticket_uuid, _ = await _ticket(_title(), deleted=True)

    assert (await _ask(client, TICKET_TASKS, {"ticketUuid": ticket_uuid}))["ticketTasks"] == []


@pytest.mark.asyncio
async def test_a_deleted_tickets_needs_show_no_properties(client):
    """Asked for by the need's uuid: the need is still live on its own row, its ticket is not."""
    _, needs = await _ticket(_title(), deleted=True)

    assert (await _ask(client, TASK_PROPERTIES, {"taskUuid": needs["清淤"]}))["taskProperties"] == []


# --- a deleted need on a ticket that is still there ---


@pytest.mark.asyncio
async def test_a_deleted_need_is_not_among_its_tickets_needs(client):
    """The ticket's `tasks` — what the site's detail drawer lists — keeps only the live one."""
    ticket_uuid, needs = await _ticket(_title())
    await _delete_need(needs["清淤"])

    tasks = (await _ask(client, TICKET, {"uuid": ticket_uuid}))["ticket"]["tasks"]

    assert [task["uuid"] for task in tasks] == [needs["搬家具"]]


@pytest.mark.asyncio
async def test_a_deleted_need_is_not_listed(client):
    """The `ticketTasks` list keeps only the live one too."""
    ticket_uuid, needs = await _ticket(_title())
    await _delete_need(needs["清淤"])

    listed = (await _ask(client, TICKET_TASKS, {"ticketUuid": ticket_uuid}))["ticketTasks"]

    assert [task["uuid"] for task in listed] == [needs["搬家具"]]


@pytest.mark.asyncio
async def test_a_deleted_need_shows_no_properties(client):
    """Its properties are live rows of their own; the need they belong to is gone."""
    _, needs = await _ticket(_title())
    await _delete_need(needs["清淤"])

    assert (await _ask(client, TASK_PROPERTIES, {"taskUuid": needs["清淤"]}))["taskProperties"] == []
