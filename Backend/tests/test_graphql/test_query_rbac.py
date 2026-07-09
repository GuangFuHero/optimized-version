"""Coverage for the GraphQL query read-checks (RBAC_V1_DECISIONS.md ADR-027/028/049).

Covers PII masking on Ticket contact fields (out-of-scope → masked value, not null —
ADR-049), list-level scope filtering, and default-deny for non-public capabilities.
`test_ticket_detail` (test_queries.py) requests contact fields but never asserted their
value, so it wouldn't have caught a masking regression either way — these assert values.
"""

import pytest

from tests.test_graphql.conftest import auth_header

CREATE_TICKET = """
mutation($input: CreateTicketInput!) {
    createTicket(input: $input) { uuid title status priority }
}
"""

TICKET_DETAIL_WITH_PII = """
query($uuid: UUID!) {
    ticket(uuid: $uuid) { uuid contactName contactEmail contactPhone }
}
"""

TICKETS_LIST = """
query { tickets { items { uuid } pageInfo { totalCount } } }
"""

STATION_PROPERTY_CONFIGS = """
query($stationType: String!) { stationPropertyConfigs(stationType: $stationType) { propertyName } }
"""


async def _create_ticket(client, token: str, title: str) -> str:
    resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_TICKET,
            "variables": {
                "input": {
                    "title": title,
                    "geometry": {"type": "Point", "coordinates": [121.5, 25.0]},
                    "contactName": "Contact Person",
                    "contactEmail": "contact@example.com",
                    "contactPhone": "0912345678",
                }
            },
        },
        headers=auth_header(token),
    )
    return resp.json()["data"]["createTicket"]["uuid"]


@pytest.mark.asyncio
async def test_anonymous_ticket_query_hides_pii(client, coordinator_auth):
    """An anonymous caller can see a ticket (ticket.view is public) but not its PII."""
    _, coord_token = coordinator_auth
    ticket_uuid = await _create_ticket(client, coord_token, "Anon PII test")

    resp = await client.post(
        "/graphql", json={"query": TICKET_DETAIL_WITH_PII, "variables": {"uuid": ticket_uuid}}
    )
    body = resp.json()
    assert "errors" not in body, body
    ticket = body["data"]["ticket"]
    assert ticket is not None
    # ADR-049: out-of-scope PII is masked (not null). Anonymous → no view_pii → masked.
    assert ticket["contactName"] == "Contact P."
    assert ticket["contactEmail"] == "c***@***.com"
    assert ticket["contactPhone"] == "09*****678"


@pytest.mark.asyncio
async def test_owner_sees_own_ticket_pii(client, login_user_auth):
    """The ticket's own creator sees their own contact fields (ticket.view_pii=own)."""
    _, login_token = login_user_auth
    ticket_uuid = await _create_ticket(client, login_token, "Owner PII test")

    resp = await client.post(
        "/graphql",
        json={"query": TICKET_DETAIL_WITH_PII, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(login_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    ticket = body["data"]["ticket"]
    assert ticket["contactName"] == "Contact Person"
    assert ticket["contactEmail"] == "contact@example.com"


@pytest.mark.asyncio
async def test_non_owner_login_user_cannot_see_others_pii(client, login_user_auth, coordinator_auth):
    """A different logged-in `own`-scope user cannot see someone else's ticket PII."""
    _, coord_token = coordinator_auth
    _, other_login_token = login_user_auth
    ticket_uuid = await _create_ticket(client, coord_token, "Someone else's ticket")

    resp = await client.post(
        "/graphql",
        json={"query": TICKET_DETAIL_WITH_PII, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(other_login_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    ticket = body["data"]["ticket"]
    # A different own-scope user sees the masked value, not the raw one (ADR-049).
    assert ticket["contactName"] == "Contact P."
    assert ticket["contactName"] != "Contact Person"


@pytest.mark.asyncio
async def test_coordinator_sees_any_ticket_pii(client, login_user_auth, coordinator_auth):
    """A coordinator (ticket.view_pii=all) sees PII on a ticket they didn't create."""
    _, login_token = login_user_auth
    _, coord_token = coordinator_auth
    ticket_uuid = await _create_ticket(client, login_token, "Staff visibility test")

    resp = await client.post(
        "/graphql",
        json={"query": TICKET_DETAIL_WITH_PII, "variables": {"uuid": ticket_uuid}},
        headers=auth_header(coord_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    ticket = body["data"]["ticket"]
    assert ticket["contactName"] == "Contact Person"


@pytest.mark.asyncio
async def test_login_user_ticket_list_includes_others_tickets(client, login_user_auth, coordinator_auth):
    """A logged-in ordinary user sees the same full ticket list an anonymous visitor would.

    ticket.view=all for the default role (ADR-030) — viewing is public, not just own.
    Only ticket.view_pii / edit / delete stay own-scoped.
    """
    _, login_token = login_user_auth
    _, coord_token = coordinator_auth
    own_ticket_uuid = await _create_ticket(client, login_token, "My own ticket")
    others_ticket_uuid = await _create_ticket(client, coord_token, "Someone else's ticket")

    resp = await client.post("/graphql", json={"query": TICKETS_LIST}, headers=auth_header(login_token))
    body = resp.json()
    assert "errors" not in body, body
    uuids = [item["uuid"] for item in body["data"]["tickets"]["items"]]
    assert own_ticket_uuid in uuids
    assert others_ticket_uuid in uuids


@pytest.mark.asyncio
async def test_anonymous_config_query_requires_login(client):
    """dynamic_field.view is not public (ADR-027) — an anonymous config query is denied."""
    resp = await client.post(
        "/graphql",
        json={"query": STATION_PROPERTY_CONFIGS, "variables": {"stationType": "shelter"}},
    )
    body = resp.json()
    assert any("Permission Denied." in e["message"] for e in body.get("errors", [])), body
