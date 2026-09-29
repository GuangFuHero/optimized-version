"""GraphQL surface of 刪除這筆需求 (team decision 2026-09-28).

The rules — what a deleted need becomes, who hears, who may — are pinned at the service layer in
tests/test_delete_ticket_task.py; these only prove the mutation is wired to them.
"""

import uuid

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as graphql_db  # a bare `test_db` would be collected

DELETE = """
mutation($uuid: UUID!) {
  deleteTicketTask(uuid: $uuid)
}
"""


async def _need(requester_uuid: str) -> str:
    """One of two needs on a fresh ticket of the requester's."""
    async with graphql_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=requester_uuid,
            title="需要清淤人力", contact_name="王小姐", status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        tasks = [
            TicketTask(
                ticket_uuid=str(ticket.uuid), task_type="hr", task_name=name, quantity=3,
                source="user", visibility="public", created_by=requester_uuid,
            )
            for name in ("清淤", "搬家具")
        ]
        db.add_all(tasks)
        await db.flush()
        return str(tasks[0].uuid)


@pytest.mark.asyncio
async def test_the_requester_deletes_a_need_through_graphql(client, redis):
    """The mutation answers true, and the need is canceled and gone."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    task_uuid = await _need(requester_uuid)

    res = await client.post(
        "/graphql", json={"query": DELETE, "variables": {"uuid": task_uuid}},
        headers=auth_header(requester_token),
    )

    assert res.json() == {"data": {"deleteTicketTask": True}}
    async with graphql_db() as db:
        deleted = await db.get(TicketTask, uuid.UUID(task_uuid))
        assert (deleted.status, deleted.delete_at is not None) == ("canceled", True)


@pytest.mark.asyncio
async def test_a_guest_cannot_delete_a_need(client, redis):
    """Sign-in first, like every write."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    task_uuid = await _need(requester_uuid)

    res = await client.post("/graphql", json={"query": DELETE, "variables": {"uuid": task_uuid}})

    assert [e["message"] for e in res.json()["errors"]] == ["401: Could not validate credentials"]
