"""A malformed UUID in a create input is refused as bad input, not reported as a server fault.

Typed as `str`, these fields passed any text through to asyncpg, whose error was masked to
"Unexpected error.". Typed as `UUID`, graphql-core rejects the value before any resolver runs.
"""

import pytest

from tests.test_graphql.conftest import auth_header

pytestmark = pytest.mark.asyncio

CASES = {
    "station property": (
        "createStationProperty(input: $input) { uuid }",
        "CreateStationPropertyInput",
        {"stationUuid": "ZAP", "propertyType": "supply", "propertyName": "water"},
    ),
    "crowd-sourcing station": (
        "createCrowdSourcing(input: $input) { uuid }",
        "CreateCrowdSourcingInput",
        {"stationUuid": "ZAP", "rating": "up"},
    ),
    "crowd-sourcing item": (
        "createCrowdSourcing(input: $input) { uuid }",
        "CreateCrowdSourcingInput",
        {"stationUuid": "STATION", "itemUuid": "ZAP", "rating": "up"},
    ),
    "ticket task": (
        "createTicketTask(input: $input) { __typename }",
        "CreateTicketTaskInput",
        {"ticketUuid": "ZAP", "taskType": "hr", "taskName": "Need medics"},
    ),
    "ticket task route": (
        "createTicketTask(input: $input) { __typename }",
        "CreateTicketTaskInput",
        {"ticketUuid": "TICKET", "taskType": "hr", "taskName": "Need medics", "routeUuid": "ZAP"},
    ),
    "new ticket's task route": (
        "createTicket(input: $input) { __typename }",
        "CreateTicketInput",
        {
            "title": "Flooded",
            "geometry": {"type": "Point", "coordinates": [121.42, 23.67]},
            "contactName": "Lee",
            "tasks": [{"taskType": "hr", "taskName": "Need medics", "routeUuid": "ZAP"}],
        },
    ),
    "task property": (
        "createTaskProperty(input: $input) { uuid }",
        "CreateTaskPropertyInput",
        {"taskUuid": "ZAP", "propertyName": "skill", "propertyValue": "medical"},
    ),
}


@pytest.mark.parametrize("case", CASES)
async def test_malformed_uuid_is_a_coercion_error(
    client, coordinator_auth, sample_station, sample_ticket, case
):
    """The error names the UUID type, and no part of the mutation runs."""
    _, token = coordinator_auth
    field, input_type, values = CASES[case]
    real = {"STATION": sample_station, "TICKET": sample_ticket}
    values = {
        key: real.get(value, value) if isinstance(value, str) else value for key, value in values.items()
    }

    resp = await client.post(
        "/graphql",
        json={"query": f"mutation($input: {input_type}!) {{ {field} }}", "variables": {"input": values}},
        headers=auth_header(token),
    )

    body = resp.json()
    assert body.get("data") is None, body
    message = body["errors"][0]["message"]
    assert "UUID" in message, message
    assert message != "Unexpected error."
