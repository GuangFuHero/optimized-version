"""A ticket's updatedAt (「最後更新」): any visible change to it moves it; sign-ups and verdicts don't."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import update

from app.models.geo import BaseGeometry
from app.services.ticket_audit import flag_need_audit
from tests.test_graphql.conftest import auth_header, test_db

# Every test first puts the ticket's updatedAt back to this, so "moved" and "unchanged" are exact.
EARLIER = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)

TICKET = "query($uuid: UUID!) { ticket(uuid: $uuid) { updatedAt status auditContentHash } }"

UPDATE_TICKET = """
mutation($uuid: UUID!, $input: UpdateTicketInput!) { updateTicket(uuid: $uuid, input: $input) { uuid } }
"""

SET_DETAILS = """
mutation($uuid: UUID!, $details: [TicketDisasterDetailInput!]!) {
    setTicketDisasterDetails(uuid: $uuid, details: $details) { propertyName }
}
"""

CREATE_NEED = """
mutation($input: CreateTicketTaskInput!) {
    createTicketTask(input: $input) { ... on TicketTaskCreated { task { uuid } } }
}
"""

UPDATE_NEED = """
mutation($uuid: UUID!, $input: UpdateTicketTaskInput!) {
    updateTicketTask(uuid: $uuid, input: $input) { uuid }
}
"""

DELETE_NEED = "mutation($uuid: UUID!) { deleteTicketTask(uuid: $uuid) }"

CREATE_ITEM = "mutation($input: CreateTaskPropertyInput!) { createTaskProperty(input: $input) { uuid } }"

UPDATE_ITEM = """
mutation($uuid: UUID!, $input: UpdateTaskPropertyInput!) {
    updateTaskProperty(uuid: $uuid, input: $input) { uuid }
}
"""

SIGN_UP = "mutation($task: UUID!) { assignTaskActor(taskUuid: $task) { uuid } }"

LEAVE = "mutation($uuid: UUID!) { unassignTaskActor(uuid: $uuid) }"

STOP_RECRUITING = "mutation($task: UUID!) { stopRecruiting(taskUuid: $task) { uuid } }"

AUDIT = """
mutation($uuid: UUID!, $hash: String!) {
    auditTicket(uuid: $uuid, status: audited, contentHash: $hash) { uuid }
}
"""


async def _gql(client, token, query, variables):
    """POST one GraphQL request and return its data, failing on any error."""
    resp = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=auth_header(token)
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]


async def _set_earlier(ticket: str) -> None:
    """Put the ticket's updatedAt back to EARLIER."""
    async with test_db() as db:
        await db.execute(update(BaseGeometry).where(BaseGeometry.uuid == ticket).values(updated_at=EARLIER))


async def _ticket(client, token, ticket: str) -> dict:
    """The ticket's updatedAt (as a datetime), status and audit hash, as the API returns them."""
    data = (await _gql(client, token, TICKET, {"uuid": ticket}))["ticket"]
    return {**data, "updatedAt": datetime.fromisoformat(data["updatedAt"])}


async def _updated_at(client, token, ticket: str) -> datetime:
    """The ticket's updatedAt as the API returns it."""
    return (await _ticket(client, token, ticket))["updatedAt"]


@pytest.mark.asyncio
async def test_a_field_edit_moves_it_and_a_save_without_changes_does_not(
    client, coordinator_auth, sample_ticket
):
    """The title lives on `tickets` alone; saving the title it already has is not a change."""
    _, admin = coordinator_auth
    await _set_earlier(sample_ticket)
    await _gql(client, admin, UPDATE_TICKET, {"uuid": sample_ticket, "input": {"title": "Need volunteers"}})
    assert await _updated_at(client, admin, sample_ticket) == EARLIER

    await _gql(client, admin, UPDATE_TICKET, {"uuid": sample_ticket, "input": {"title": "Need 5 volunteers"}})

    assert await _updated_at(client, admin, sample_ticket) > EARLIER


@pytest.mark.asyncio
async def test_a_new_address_moves_it_and_sending_the_same_one_again_does_not(
    client, coordinator_auth, sample_ticket
):
    """The address is its own row, so the ticket's own columns never see it change."""
    _, admin = coordinator_auth
    address = {"secondaryLocation": {"fullAddress": "花蓮縣光復鄉中正路一段1號"}}
    await _set_earlier(sample_ticket)
    await _gql(client, admin, UPDATE_TICKET, {"uuid": sample_ticket, "input": address})
    assert await _updated_at(client, admin, sample_ticket) > EARLIER

    await _set_earlier(sample_ticket)
    await _gql(client, admin, UPDATE_TICKET, {"uuid": sample_ticket, "input": address})

    assert await _updated_at(client, admin, sample_ticket) == EARLIER


@pytest.mark.asyncio
async def test_new_disaster_answers_move_it_and_the_same_answers_again_do_not(
    client, coordinator_auth, sample_ticket
):
    """The answers are replaced whole on every save, so only a different set counts."""
    _, admin = coordinator_auth
    details = [{"propertyName": "water_depth", "values": ["50cm"]}]
    await _set_earlier(sample_ticket)
    await _gql(client, admin, SET_DETAILS, {"uuid": sample_ticket, "details": details})
    assert await _updated_at(client, admin, sample_ticket) > EARLIER

    await _set_earlier(sample_ticket)
    await _gql(client, admin, SET_DETAILS, {"uuid": sample_ticket, "details": details})

    assert await _updated_at(client, admin, sample_ticket) == EARLIER


@pytest.mark.asyncio
async def test_adding_editing_and_deleting_a_need_each_move_it(client, coordinator_auth, sample_ticket):
    """A need is part of the ticket, so each change to one is a change to the ticket."""
    _, admin = coordinator_auth
    await _set_earlier(sample_ticket)
    created = await _gql(
        client,
        admin,
        CREATE_NEED,
        {
            "input": {
                "ticketUuid": sample_ticket,
                "taskType": "hr",
                "taskName": "搬沙包",
                "quantity": 2,
            }
        },
    )
    need = created["createTicketTask"]["task"]["uuid"]
    assert await _updated_at(client, admin, sample_ticket) > EARLIER

    await _set_earlier(sample_ticket)
    await _gql(client, admin, UPDATE_NEED, {"uuid": need, "input": {"progressNote": "已出發"}})
    assert await _updated_at(client, admin, sample_ticket) > EARLIER

    await _set_earlier(sample_ticket)
    await _gql(client, admin, UPDATE_NEED, {"uuid": need, "input": {"progressNote": "已出發"}})
    assert await _updated_at(client, admin, sample_ticket) == EARLIER

    await _gql(client, admin, DELETE_NEED, {"uuid": need})

    assert await _updated_at(client, admin, sample_ticket) > EARLIER


@pytest.mark.asyncio
async def test_adding_and_editing_a_need_item_each_move_it(
    client, coordinator_auth, sample_ticket, sample_ticket_task
):
    """An item on a need is part of the ticket too; saving the value it already has is not a change."""
    _, admin = coordinator_auth
    await _set_earlier(sample_ticket)
    created = await _gql(
        client,
        admin,
        CREATE_ITEM,
        {
            "input": {
                "taskUuid": sample_ticket_task,
                "propertyName": "tool",
                "propertyValue": "鏟子",
            }
        },
    )
    item = created["createTaskProperty"]["uuid"]
    assert await _updated_at(client, admin, sample_ticket) > EARLIER

    await _set_earlier(sample_ticket)
    await _gql(client, admin, UPDATE_ITEM, {"uuid": item, "input": {"propertyValue": "鏟子"}})
    assert await _updated_at(client, admin, sample_ticket) == EARLIER

    await _gql(client, admin, UPDATE_ITEM, {"uuid": item, "input": {"propertyValue": "水桶"}})

    assert await _updated_at(client, admin, sample_ticket) > EARLIER


@pytest.mark.asyncio
async def test_a_sign_up_counts_only_when_it_changes_the_status(
    client, coordinator_auth, login_user_auth, sample_ticket, sample_ticket_task
):
    """The first person on a need moves the ticket to in_progress; the next one changes nothing visible."""
    _, admin = coordinator_auth
    _, volunteer = login_user_auth
    await _set_earlier(sample_ticket)
    await _gql(client, admin, SIGN_UP, {"task": sample_ticket_task})
    first = await _ticket(client, admin, sample_ticket)
    assert (first["status"], first["updatedAt"] > EARLIER) == ("in_progress", True)

    await _set_earlier(sample_ticket)
    await _gql(client, volunteer, SIGN_UP, {"task": sample_ticket_task})

    assert await _updated_at(client, admin, sample_ticket) == EARLIER


@pytest.mark.asyncio
async def test_stopping_recruitment_moves_it(client, coordinator_auth, sample_ticket, sample_ticket_task):
    """停止招募 closes the need, which the requester and everyone else can see."""
    _, admin = coordinator_auth
    await _gql(client, admin, SIGN_UP, {"task": sample_ticket_task})
    await _set_earlier(sample_ticket)

    await _gql(client, admin, STOP_RECRUITING, {"task": sample_ticket_task})

    assert await _updated_at(client, admin, sample_ticket) > EARLIER


@pytest.mark.asyncio
async def test_a_review_verdict_does_not_move_it(client, coordinator_auth, sample_ticket):
    """A verdict says the ticket was checked, not that it changed."""
    _, admin = coordinator_auth
    await _set_earlier(sample_ticket)
    seen = (await _ticket(client, admin, sample_ticket))["auditContentHash"]

    await _gql(client, admin, AUDIT, {"uuid": sample_ticket, "hash": seen})

    assert await _updated_at(client, admin, sample_ticket) == EARLIER


@pytest.mark.asyncio
async def test_leaving_a_need_that_keeps_the_status_does_not_move_it(
    client, coordinator_auth, login_user_auth, sample_ticket, sample_ticket_task
):
    """With someone still on the need the ticket stays in_progress, so a leave changes nothing visible."""
    _, admin = coordinator_auth
    _, volunteer = login_user_auth
    await _gql(client, admin, SIGN_UP, {"task": sample_ticket_task})
    place = (await _gql(client, volunteer, SIGN_UP, {"task": sample_ticket_task}))["assignTaskActor"]["uuid"]
    await _set_earlier(sample_ticket)

    await _gql(client, volunteer, LEAVE, {"uuid": place})

    after = await _ticket(client, admin, sample_ticket)
    assert (after["status"], after["updatedAt"]) == ("in_progress", EARLIER)


@pytest.mark.asyncio
async def test_a_refused_edit_leaves_it_alone(client, coordinator_auth, login_user_auth, sample_ticket):
    """Someone who may edit only their own tickets cannot edit this one, and it does not move."""
    _, admin = coordinator_auth
    _, stranger = login_user_auth
    await _set_earlier(sample_ticket)

    resp = await client.post(
        "/graphql",
        json={"query": UPDATE_TICKET, "variables": {"uuid": sample_ticket, "input": {"title": "改掉"}}},
        headers=auth_header(stranger),
    )

    assert "errors" in resp.json(), resp.json()
    assert await _updated_at(client, admin, sample_ticket) == EARLIER


@pytest.mark.asyncio
async def test_the_audit_scan_flag_does_not_move_it(client, coordinator_auth, sample_ticket):
    """Flagging a ticket for audit is part of a verdict's life, not a change to the ticket."""
    _, admin = coordinator_auth
    await _set_earlier(sample_ticket)

    async with test_db() as db:
        assert await flag_need_audit(db, [sample_ticket]) == 1

    assert await _updated_at(client, admin, sample_ticket) == EARLIER
