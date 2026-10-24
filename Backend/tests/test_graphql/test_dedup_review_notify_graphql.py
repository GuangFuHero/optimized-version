"""createTicket over GraphQL when the reviewer notice fails (Spec 025 §3, ADR-345).

A failing notice must not change what the submitter gets back. Its error path rolls the
session back, and a rollback expires every instance in it — the caller's User included — so
the fields resolved after the mutation (the contact masks check the caller's grants) must still
find a loaded actor. Found in the Task 7 review: they returned "Unexpected error.".
"""

import pytest

from app.services.notification_service import NotificationService
from tests.test_graphql.test_create_dedup import (  # noqa: F401 — _clean_tables is an autouse fixture
    PUMP,
    WATER,
    _clean_tables,
    _post,
    _seed_ticket_with_task,
    _ticket_input,
)

pytestmark = [pytest.mark.asyncio, pytest.mark.real_dedup]

CREATE = """mutation($input: CreateTicketInput!) { createTicket(input: $input) { __typename
  ... on TicketCreated { ticket { uuid title contactName contactPhone } tasks { uuid taskName } } } }"""


async def _create_anyway(client, user_uuid, token) -> dict:
    _, task_uuid = await _seed_ticket_with_task(user_uuid)
    acked = PUMP | {"acknowledgedDuplicateOf": task_uuid}
    return await _post(client, token, CREATE, {"input": _ticket_input([acked, WATER])})


@pytest.mark.parametrize("notice_fails", [False, True], ids=["notice-sent", "notice-fails"])
async def test_a_failing_notice_leaves_the_response_as_it_would_have_been(
    client, login_user_auth, monkeypatch, notice_fails
):
    """No errors either way, and the submitter's own contact name comes back unmasked both times."""
    user_uuid, token = login_user_auth
    real = NotificationService.dispatch

    async def fail_the_review_notice(db, **kwargs):
        if notice_fails and kwargs["event_type"] == "dedup_review_pending":
            raise RuntimeError("notification store is down")
        return await real(db, **kwargs)

    monkeypatch.setattr(NotificationService, "dispatch", fail_the_review_notice)
    body = await _create_anyway(client, user_uuid, token)

    assert "errors" not in body, body
    ticket = body["data"]["createTicket"]["ticket"]
    assert (ticket["title"], ticket["contactName"], ticket["contactPhone"]) == ("民生街淹水", "王小明", None)
