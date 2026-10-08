"""Who sees a need's moderation status.

The back office's verdict on a need (`pending_review`, `approved`, `rejected`) is
the requester's and the coordinators' to see, like the list of who claimed it (ADR-286): it
follows the parent ticket's `ticket.view_history`. Every need a citizen files starts as
`pending_review`, so shown to the public it would read as "not to be trusted yet" on all of
them, and a rejection would tell everyone what staff decided.
"""

import pytest

from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as db_ctx  # renamed so pytest does not collect it
from tests.test_graphql.test_task_assignment_visibility import _need_filed_by

MODERATION = """
query($ticketUuid: String!) {
    ticketTasks(ticketUuid: $ticketUuid) { taskName moderationStatus }
}
"""


async def _moderation_seen(client, ticket_uuid: str, token: str | None):
    headers = auth_header(token) if token else {}
    res = await client.post(
        "/graphql", json={"query": MODERATION, "variables": {"ticketUuid": ticket_uuid}}, headers=headers
    )
    assert "errors" not in res.json(), res.json()
    [task] = res.json()["data"]["ticketTasks"]
    assert task["taskName"] == "清淤", "the need itself stays public"
    return task["moderationStatus"]


async def _filed_need(redis) -> tuple[str, str, str]:
    """A need a signed-in citizen filed; returns (ticket_uuid, task_uuid, requester_token)."""
    requester_uuid, requester_token = await _create_user_with_role(redis, "Login User")
    ticket_uuid, task_uuid = await _need_filed_by(requester_uuid)
    return ticket_uuid, task_uuid, requester_token


@pytest.mark.asyncio
async def test_a_guest_does_not_see_the_moderation_status(client, redis):
    """`ticket.view_history` is not public, so the guest gets null."""
    ticket_uuid, *_ = await _filed_need(redis)

    assert await _moderation_seen(client, ticket_uuid, None) is None


@pytest.mark.asyncio
async def test_another_signed_in_citizen_does_not_see_it(client, redis):
    """Signing in unlocks the exact place (ADR-281), not the back office's verdict."""
    ticket_uuid, *_ = await _filed_need(redis)
    _, bystander_token = await _create_user_with_role(redis, "Login User")

    assert await _moderation_seen(client, ticket_uuid, bystander_token) is None


@pytest.mark.asyncio
async def test_the_requester_sees_where_their_own_need_stands(client, redis):
    """ticket.view_history `own`."""
    ticket_uuid, _, requester_token = await _filed_need(redis)

    assert await _moderation_seen(client, ticket_uuid, requester_token) == "pending_review"


@pytest.mark.asyncio
async def test_a_coordinator_reads_back_the_verdict(client, redis, coordinator_auth):
    """ticket.view_history `all`: whoever reviews a need can read the status they set."""
    ticket_uuid, task_uuid, _ = await _filed_need(redis)
    async with db_ctx() as db:
        (await db.get(TicketTask, task_uuid)).moderation_status = "rejected"
    _, coordinator_token = coordinator_auth

    assert await _moderation_seen(client, ticket_uuid, coordinator_token) == "rejected"
