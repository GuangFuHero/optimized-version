"""GraphQL surface of 「我的任務 › 我建立的」 (spec Q16/Q17).

The rules — whose tickets, in what order, which ones — are pinned at the service layer in
tests/test_my_tickets.py; these only prove the query is wired to them and carries what the list
counts its progress from: each need's quantity, status and headcount.
"""

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TaskAssignment, TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as graphql_db  # a bare `test_db` would be collected

MY_TICKETS = """
query {
  myTickets { title status tasks { taskName quantity status assignedCount } }
}
"""


async def _filed(requester_uuid: str, volunteer_uuid: str) -> None:
    """A ticket of the requester's: 清淤 for three with one volunteer on it, 搬家具 filled."""
    async with graphql_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=requester_uuid,
            title="一樓客廳積泥需要幫忙清", contact_name="王阿嬤", status="in_progress",
            priority="medium", task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        for name, quantity, status in (("清淤", 3, "pending"), ("搬家具", 1, "fulfilled")):
            task = TicketTask(
                ticket_uuid=str(ticket.uuid), task_type="hr", task_name=name, quantity=quantity,
                status=status, source="user", visibility="public", created_by=requester_uuid,
            )
            db.add(task)
            await db.flush()
            db.add(TaskAssignment(task_uuid=str(task.uuid), actor_uuid=volunteer_uuid, status="accepted"))
        await db.flush()


@pytest.mark.asyncio
async def test_the_requester_lists_their_tickets_through_graphql(client, redis):
    """Each ticket comes with its needs, enough to say 「2 件事：1 件已滿、1 件還缺人」."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    volunteer_uuid, _ = await _create_user_with_role(redis, "Login User")
    await _filed(requester_uuid, volunteer_uuid)

    res = await client.post("/graphql", json={"query": MY_TICKETS}, headers=auth_header(requester_token))

    assert "errors" not in res.json(), res.json()
    [ticket] = res.json()["data"]["myTickets"]
    assert (ticket["title"], ticket["status"]) == ("一樓客廳積泥需要幫忙清", "in_progress")
    assert sorted(ticket["tasks"], key=lambda task: task["taskName"]) == [
        {"taskName": "搬家具", "quantity": 1, "status": "fulfilled", "assignedCount": 1},
        {"taskName": "清淤", "quantity": 3, "status": "pending", "assignedCount": 1},
    ]


@pytest.mark.asyncio
async def test_a_guest_has_no_tickets_to_list(client):
    """Sign-in first: a guest filed nothing that could be theirs."""
    res = await client.post("/graphql", json={"query": MY_TICKETS})

    assert [e["message"] for e in res.json()["errors"]] == ["401: Could not validate credentials"]
