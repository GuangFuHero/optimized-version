"""GraphQL surface of 停止招募, one need at a time (ADR-292).

The rules — what closes, who hears, who may — are pinned at the service layer in
tests/test_volunteer_claim.py; these only prove the mutation is wired to them.
"""

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header, test_db

STOP = """
mutation($taskUuid: UUID!) {
  stopRecruiting(taskUuid: $taskUuid) { taskName status quantity recruitingStoppedAt }
}
"""


async def _claimed_need(requester_uuid: str, volunteer_uuid: str) -> str:
    """A need for three on a fresh ticket of the requester's, with one volunteer on it."""
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=requester_uuid,
            title="需要清淤人力", contact_name="王小姐", status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        task = TicketTask(
            ticket_uuid=str(ticket.uuid), task_type="hr", task_name="清淤", quantity=3,
            source="user", visibility="public", created_by=requester_uuid,
        )
        db.add(task)
        await db.flush()
        db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=volunteer_uuid, status="accepted"))
        await db.flush()
        return str(task.uuid)


@pytest.mark.asyncio
async def test_the_requester_stops_recruiting_for_a_need_through_graphql(client, redis):
    """The mutation returns the need: fulfilled, cut to its headcount, stopped by hand."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    volunteer_uuid, _ = await _create_user_with_role(redis, "Login User")
    task_uuid = await _claimed_need(requester_uuid, volunteer_uuid)

    res = await client.post(
        "/graphql", json={"query": STOP, "variables": {"taskUuid": task_uuid}},
        headers=auth_header(requester_token),
    )

    assert "errors" not in res.json(), res.json()
    stopped = res.json()["data"]["stopRecruiting"]
    assert {key: stopped[key] for key in ("taskName", "status", "quantity")} == {
        "taskName": "清淤", "status": "fulfilled", "quantity": 1,
    }
    assert stopped["recruitingStoppedAt"] is not None


@pytest.mark.asyncio
async def test_a_guest_cannot_stop_recruiting(client, redis):
    """Sign-in first, like every write."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    volunteer_uuid, _ = await _create_user_with_role(redis, "Login User")
    task_uuid = await _claimed_need(requester_uuid, volunteer_uuid)

    res = await client.post("/graphql", json={"query": STOP, "variables": {"taskUuid": task_uuid}})

    assert [e["message"] for e in res.json()["errors"]] == ["401: Could not validate credentials"]
