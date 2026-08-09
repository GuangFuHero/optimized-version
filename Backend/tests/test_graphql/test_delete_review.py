"""Coverage for the parity-gap mutations added in the ADR-049 catalog audit.

- delete_ticket / delete_closure_area: SOFT delete (sets delete_at; row hidden from active
  queries afterwards, not physically removed).
- review_ticket: verification_status is gated by ticket.review, separate from ticket.edit.
"""

import pytest

from tests.test_graphql.conftest import auth_header

CREATE_TICKET = """
mutation($input: CreateTicketInput!) { createTicket(input: $input) { uuid } }
"""
DELETE_TICKET = "mutation($uuid: UUID!) { deleteTicket(uuid: $uuid) }"
GET_TICKET = "query($uuid: UUID!) { ticket(uuid: $uuid) { uuid status } }"
REVIEW_TICKET = """
mutation($uuid: UUID!, $vs: String!) {
    reviewTicket(uuid: $uuid, verificationStatus: $vs) { uuid verificationStatus }
}
"""
CREATE_CLOSURE = """
mutation($input: CreateClosureAreaInput!) { createClosureArea(input: $input) { uuid } }
"""
DELETE_CLOSURE = "mutation($uuid: UUID!) { deleteClosureArea(uuid: $uuid) }"
GET_CLOSURE = "query($uuid: UUID!) { closureArea(uuid: $uuid) { uuid } }"

_POINT = {"type": "Point", "coordinates": [121.5, 25.0]}
_POLY = {
    "type": "Polygon",
    "coordinates": [[[121.0, 24.0], [121.0, 25.0], [122.0, 25.0], [122.0, 24.0], [121.0, 24.0]]],
}


async def _create_ticket(client, token: str) -> str:
    resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_TICKET,
            "variables": {"input": {"title": "T", "geometry": _POINT, "contactName": "C"}},
        },
        headers=auth_header(token),
    )
    return resp.json()["data"]["createTicket"]["uuid"]


@pytest.mark.asyncio
async def test_delete_ticket_is_soft(client, coordinator_auth):
    """A deleted ticket soft-deletes: it no longer resolves from ticket() afterwards."""
    _, token = coordinator_auth
    ticket_uuid = await _create_ticket(client, token)

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_TICKET, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["deleteTicket"] is True

    # get_by_uuid_active filters delete_at → the soft-deleted ticket is now invisible.
    resp = await client.post(
        "/graphql",
        json={"query": GET_TICKET, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(token),
    )
    assert resp.json()["data"]["ticket"] is None


@pytest.mark.asyncio
async def test_login_user_cannot_delete_others_ticket(client, coordinator_auth, login_user_auth):
    """With ticket.delete=own a login user can't delete a ticket someone else created."""
    _, coord_token = coordinator_auth
    _, login_token = login_user_auth
    ticket_uuid = await _create_ticket(client, coord_token)

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_TICKET, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(login_token),
    )
    body = resp.json()
    assert any("Permission Denied." in e["message"] for e in body.get("errors", [])), body


@pytest.mark.asyncio
async def test_review_ticket_requires_ticket_review(client, coordinator_auth, login_user_auth):
    """A ticket review needs ticket.review — coordinator succeeds, plain login user is denied."""
    _, coord_token = coordinator_auth
    _, login_token = login_user_auth
    ticket_uuid = await _create_ticket(client, login_token)

    ok = await client.post(
        "/graphql",
        json={"query": REVIEW_TICKET, "variables": {"uuid": ticket_uuid, "vs": "human_verified"}},
        headers=auth_header(coord_token),
    )
    body = ok.json()
    assert "errors" not in body, body
    assert body["data"]["reviewTicket"]["verificationStatus"] == "human_verified"

    denied = await client.post(
        "/graphql",
        json={"query": REVIEW_TICKET, "variables": {"uuid": ticket_uuid, "vs": "human_verified"}},
        headers=auth_header(login_token),
    )
    denied_errors = denied.json().get("errors", [])
    assert any("Permission Denied." in e["message"] for e in denied_errors), denied.json()


@pytest.mark.asyncio
async def test_delete_closure_area_is_soft(client, coordinator_auth):
    """A deleted closure area soft-deletes: it no longer resolves afterwards."""
    _, token = coordinator_auth
    resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_CLOSURE,
            "variables": {"input": {"geometry": _POLY, "status": "dangerous"}},
        },
        headers=auth_header(token),
    )
    closure_uuid = resp.json()["data"]["createClosureArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_CLOSURE, "variables": {"uuid": closure_uuid}},
        headers=auth_header(token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["deleteClosureArea"] is True

    resp = await client.post(
        "/graphql",
        json={"query": GET_CLOSURE, "variables": {"uuid": closure_uuid}},
        headers=auth_header(token),
    )
    assert resp.json()["data"]["closureArea"] is None
