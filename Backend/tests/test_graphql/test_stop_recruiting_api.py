"""GraphQL surface of 停止招募 (spec Q17/Q21).

The rules — what closes, who hears, who may — are pinned at the service layer in
tests/test_volunteer_claim.py; these only prove the mutation is wired to them.
"""

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header, test_db

STOP = """
mutation($ticketUuid: UUID!) { stopRecruiting(ticketUuid: $ticketUuid) { taskName status } }
"""


async def _ticket_filed_by(requester_uuid: str) -> str:
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=requester_uuid,
            title="需要清淤人力", contact_name="王小姐", status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        db.add(TicketTask(
            ticket_uuid=str(ticket.uuid), task_type="hr", task_name="清淤", quantity=3,
            source="user", visibility="public", created_by=requester_uuid,
        ))
        await db.flush()
        return str(ticket.uuid)


@pytest.mark.asyncio
async def test_the_requester_stops_recruiting_through_graphql(client, redis):
    """The mutation returns the needs it closed, now canceled."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    ticket_uuid = await _ticket_filed_by(requester_uuid)

    res = await client.post(
        "/graphql", json={"query": STOP, "variables": {"ticketUuid": ticket_uuid}},
        headers=auth_header(requester_token),
    )

    assert "errors" not in res.json(), res.json()
    assert res.json()["data"]["stopRecruiting"] == [{"taskName": "清淤", "status": "canceled"}]


@pytest.mark.asyncio
async def test_a_guest_cannot_stop_recruiting(client, redis):
    """Sign-in first, like every write."""
    requester_uuid, _ = await _create_user_with_role(redis, "Login User")
    ticket_uuid = await _ticket_filed_by(requester_uuid)

    res = await client.post("/graphql", json={"query": STOP, "variables": {"ticketUuid": ticket_uuid}})

    assert [e["message"] for e in res.json()["errors"]] == ["401: Could not validate credentials"]
