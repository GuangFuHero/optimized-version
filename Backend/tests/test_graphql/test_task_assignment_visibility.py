"""Who sees who claimed a need (spec Q7/Q14, ADR-286).

`assignedCount` stays public — it is what a volunteer decides "is there room?" on. The list
of `assignments`, which names each volunteer's account, follows the parent ticket's
`ticket.view_history`: the requester and coordinators see who is coming, nobody else does —
not even the signed-in citizens who, since ADR-286, may read the requester's contact details.
Every signed-in caller gets `myAssignment`, their own claim, which is all the site needs to
show "已承接" and to release it.
"""

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import _citizen_since_adr_286, _create_user_with_role, auth_header, test_db

TASK_CLAIMS = """
query($ticketUuid: String!) {
    ticketTasks(ticketUuid: $ticketUuid) {
        assignedCount
        assignments { actorUuid }
        myAssignment { uuid actorUuid }
    }
}
"""

CLAIM = """
mutation($taskUuid: UUID!) { assignTaskActor(taskUuid: $taskUuid) { uuid } }
"""

CONTACT_AND_CLAIMS = """
query($uuid: UUID!) {
    ticket(uuid: $uuid) { contactName tasks { assignedCount assignments { actorUuid } } }
}
"""


async def _need_filed_by(requester_uuid: str) -> tuple[str, str]:
    """A ticket filed by a signed-in citizen, with one need; returns (ticket_uuid, task_uuid)."""
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
        return str(ticket.uuid), str(task.uuid)


async def _claimed_need(client, redis):
    """A need the requester filed and one volunteer claimed.

    Returns (ticket_uuid, volunteer_uuid, assignment_uuid, requester_token, volunteer_token).
    """
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    volunteer_uuid, volunteer_token = await _create_user_with_role(redis, "Login User")
    ticket_uuid, task_uuid = await _need_filed_by(requester_uuid)
    claimed = await client.post(
        "/graphql", json={"query": CLAIM, "variables": {"taskUuid": task_uuid}},
        headers=auth_header(volunteer_token),
    )
    assert "errors" not in claimed.json(), claimed.json()
    assignment_uuid = claimed.json()["data"]["assignTaskActor"]["uuid"]
    return ticket_uuid, volunteer_uuid, assignment_uuid, requester_token, volunteer_token


async def _claims_seen(client, ticket_uuid: str, token: str | None) -> dict:
    headers = auth_header(token) if token else {}
    res = await client.post(
        "/graphql", json={"query": TASK_CLAIMS, "variables": {"ticketUuid": ticket_uuid}},
        headers=headers,
    )
    assert "errors" not in res.json(), res.json()
    [task] = res.json()["data"]["ticketTasks"]
    return task


@pytest.mark.asyncio
async def test_a_guest_sees_how_many_but_not_who(client, redis):
    """The count is what decides "is there room?"; the accounts behind it are nobody's business."""
    ticket_uuid, *_ = await _claimed_need(client, redis)

    task = await _claims_seen(client, ticket_uuid, None)

    assert task["assignedCount"] == 1
    assert task["assignments"] == []
    assert task["myAssignment"] is None


@pytest.mark.asyncio
async def test_another_signed_in_citizen_sees_how_many_but_not_who(client, redis):
    """Signing in unlocks the exact place (ADR-281), not the other volunteers' accounts."""
    ticket_uuid, *_ = await _claimed_need(client, redis)
    _, bystander_token = await _create_user_with_role(redis, "Login User")

    task = await _claims_seen(client, ticket_uuid, bystander_token)

    assert task["assignedCount"] == 1
    assert task["assignments"] == []
    assert task["myAssignment"] is None


@pytest.mark.asyncio
async def test_a_volunteer_sees_their_own_claim(client, redis):
    """`myAssignment` is what the site shows as 已承接, and what 釋出名額 releases."""
    ticket_uuid, volunteer_uuid, assignment_uuid, _, volunteer_token = await _claimed_need(client, redis)

    task = await _claims_seen(client, ticket_uuid, volunteer_token)

    assert task["myAssignment"] == {"uuid": assignment_uuid, "actorUuid": volunteer_uuid}
    assert task["assignments"] == []


@pytest.mark.asyncio
async def test_a_citizen_who_may_call_the_requester_still_does_not_see_who_is_coming(client, redis):
    """ADR-286 split the two: contact details open to anyone signed in, the claimant list not.

    The requester's name in full, beside `createdBy`, ties an account to a person; an open list
    would let anyone signed in follow a volunteer from need to need.
    """
    ticket_uuid, *_ = await _claimed_need(client, redis)
    citizen_token = await _citizen_since_adr_286(redis)

    res = await client.post(
        "/graphql", json={"query": CONTACT_AND_CLAIMS, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(citizen_token),
    )

    assert "errors" not in res.json(), res.json()
    ticket = res.json()["data"]["ticket"]
    assert ticket["contactName"] == "王小姐"
    [task] = ticket["tasks"]
    assert task["assignedCount"] == 1
    assert task["assignments"] == []


@pytest.mark.asyncio
async def test_the_requester_sees_who_is_coming(client, redis):
    """ticket.view_history `own`: the requester sees the claims on their own ticket."""
    ticket_uuid, volunteer_uuid, _, requester_token, _ = await _claimed_need(client, redis)

    task = await _claims_seen(client, ticket_uuid, requester_token)

    assert task["assignments"] == [{"actorUuid": volunteer_uuid}]
    assert task["myAssignment"] is None


@pytest.mark.asyncio
async def test_a_coordinator_sees_who_is_coming(client, redis, coordinator_auth):
    """ticket.view_history `all`: a coordinator sees every claim."""
    ticket_uuid, volunteer_uuid, *_ = await _claimed_need(client, redis)
    _, coordinator_token = coordinator_auth

    task = await _claims_seen(client, ticket_uuid, coordinator_token)

    assert task["assignments"] == [{"actorUuid": volunteer_uuid}]
