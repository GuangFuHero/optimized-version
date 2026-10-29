"""Where a station or a task came from is the backend's call, by the identity that made it (ADR-438).

Made in the back office, it is `official`; made on the site, `user`. What the form sends is not read:
the site and the back office share a form, and the identity is what the request actually acts as.
"""

import random

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.geo import Station
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import (
    _create_user_with_grants,
    _create_user_with_role,
    _ensure_platform_role,
    auth_header,
)
from tests.test_graphql.conftest import test_db as db_ctx

pytestmark = pytest.mark.asyncio

CREATE_STATION = """
mutation($input: CreateStationInput!) {
    createStation(input: $input) { __typename ... on StationCreated { station { uuid source } } }
}
"""


def _station(**fields) -> dict:
    """A station far from every other test's, so the stub engine's silence is not luck."""
    point = [140 + random.random() * 20, -40 + random.random() * 20]
    geometry = {"type": "Point", "coordinates": point}
    return {"geometry": geometry, "name": "來源測試站", "type": "shelter", **fields}


CITIZEN_GRANTS = [(Perm.STATION_ADD, "all"), (Perm.TICKET_ADD, "all"), (Perm.TICKET_EDIT, "own")]
CREATE_TICKET = """
mutation($input: CreateTicketInput!) {
    createTicket(input: $input) { __typename ... on TicketCreated { ticket { uuid } tasks { uuid source } } }
}
"""
CREATE_TICKET_TASK = """
mutation($input: CreateTicketTaskInput!) {
    createTicketTask(input: $input) { __typename ... on TicketTaskCreated { task { uuid source } } }
}
"""


async def _site_identity(redis) -> str:
    """A citizen's token: the platform `user` role, the site's identity (ADR-290)."""
    await _ensure_platform_role("user", CITIZEN_GRANTS)
    _, token = await _create_user_with_role(redis, "user")
    return token


async def _back_office_identity(redis) -> str:
    """A back-office token: any identity but `user` (ADR-329)."""
    grants = [(Perm.STATION_ADD, "all"), (Perm.TICKET_ADD, "all"), (Perm.TICKET_EDIT, "all")]
    _, token = await _create_user_with_grants(redis, grants)
    return token


async def _create(client, token, station: dict, headers=None) -> dict:
    resp = await client.post(
        "/graphql",
        json={"query": CREATE_STATION, "variables": {"input": station}},
        headers={**auth_header(token), **(headers or {})},
    )
    return resp


async def _stored_source(name: str) -> list[str | None]:
    async with db_ctx() as db:
        return list((await db.execute(select(Station.source).where(Station.name == name))).scalars())


async def test_a_station_made_on_the_site_is_the_users_whatever_it_sends(client, redis):
    """Asking for `official` from the site's identity does not make it so."""
    token = await _site_identity(redis)
    station = _station(name=f"民眾站-{random.random()}", source="official")

    body = (await _create(client, token, station)).json()

    assert body["data"]["createStation"]["station"]["source"] == "user", body
    assert await _stored_source(station["name"]) == ["user"]


@pytest.mark.parametrize("sent", [{"source": "user"}, {}], ids=["sends-user", "sends-nothing"])
async def test_a_station_made_in_the_back_office_is_official_whatever_it_sends(client, redis, sent):
    """Carol, 2026-10-28: everything made in the back office is official, a team member's too."""
    token = await _back_office_identity(redis)
    station = _station(name=f"後台站-{random.random()}", **sent)

    body = (await _create(client, token, station)).json()

    assert body["data"]["createStation"]["station"]["source"] == "official", body
    assert await _stored_source(station["name"]) == ["official"]


async def test_the_back_office_marker_does_not_make_a_citizen_official(client, redis):
    """A citizen sending the back office's realm is refused before anything is made (ADR-329)."""
    token = await _site_identity(redis)
    station = _station(name=f"冒充站-{random.random()}")

    resp = await _create(client, token, station, headers={"X-WG-Realm": "admin"})

    assert resp.status_code == 403, resp.text
    assert await _stored_source(station["name"]) == []


async def _post(client, token, query, variables) -> dict:
    body = {"query": query, "variables": variables}
    resp = await client.post("/graphql", json=body, headers=auth_header(token))
    return resp.json()


async def _task_sources(task_uuids) -> list[str | None]:
    async with db_ctx() as db:
        return list(
            (await db.execute(select(TicketTask.source).where(TicketTask.uuid.in_(task_uuids)))).scalars()
        )


async def _file_and_add(client, token, sent: str) -> list[str]:
    """A ticket with one task sending `source: sent`, then a second task added the same way."""
    point = [140 + random.random() * 20, -40 + random.random() * 20]
    ticket_input = {
        "geometry": {"type": "Point", "coordinates": point},
        "title": f"來源測試單-{random.random()}",
        "contactName": "王小明",
        "priority": "high",
        "tasks": [{"taskType": "rescue", "taskName": "抽水", "source": sent}],
    }
    created = (await _post(client, token, CREATE_TICKET, {"input": ticket_input}))["data"]["createTicket"]
    added = (
        await _post(
            client,
            token,
            CREATE_TICKET_TASK,
            {
                "input": {
                    "ticketUuid": created["ticket"]["uuid"],
                    "taskType": "rescue",
                    "taskName": "送水",
                    "source": sent,
                }
            },
        )
    )["data"]["createTicketTask"]
    return [created["tasks"][0]["uuid"], added["task"]["uuid"]]


async def test_tasks_made_on_the_site_are_the_users_whatever_they_send(client, redis):
    """Filed with a new ticket and added to it later, both from the site's identity."""
    tasks = await _file_and_add(client, await _site_identity(redis), sent="official")

    assert await _task_sources(tasks) == ["user", "user"]


async def test_tasks_made_in_the_back_office_are_official_whatever_they_send(client, redis):
    """The same two paths from a back-office identity (Dan, 2026-10-28: tasks follow stations)."""
    tasks = await _file_and_add(client, await _back_office_identity(redis), sent="user")

    assert await _task_sources(tasks) == ["official", "official"]
