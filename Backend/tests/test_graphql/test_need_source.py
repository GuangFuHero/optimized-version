"""A need's `source` is the server's to set, from who files it: 'official' from the back office, else 'user'.

Neither createTicket's task drafts nor createTicketTask take a `source` any longer, so a citizen
cannot mark their own need official. The rule is `need_source` in app/services/ticket.py.
"""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import REALM_HEADER, SITE_REALM
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.ticket_task import TicketTask
from tests.test_graphql.conftest import (
    _create_user_with_grants,
    _create_user_with_role,
    auth_header,
    test_db,
)

CREATE_TICKET = """
mutation($input: CreateTicketInput!) {
    createTicket(input: $input) { ... on TicketCreated { ticket { uuid } tasks { uuid } } }
}
"""

CREATE_TICKET_TASK = """
mutation($input: CreateTicketTaskInput!) {
    createTicketTask(input: $input) { ... on TicketTaskCreated { task { uuid } } }
}
"""

_STAFF = [(Perm.TICKET_ADD, "all"), (Perm.TICKET_EDIT, "all"), (Perm.TICKET_VIEW, "all")]
# What production's `user` grants for filing (the site's identity); the GraphQL fixtures do not seed it.
_CITIZEN = [(Perm.TICKET_ADD, "all"), (Perm.TICKET_EDIT, "own"), (Perm.TICKET_VIEW, "all")]


async def _user_role() -> str:
    """The platform `user` role, made or topped up with the filing grants; returns its uuid."""
    async with test_db() as db:
        role = await db.scalar(select(Role).where(Role.name == "user"))
        if role is None:
            role = Role(name="user", kind="platform")
            db.add(role)
            await db.flush()
        for perm, scope in _CITIZEN:
            permission = await db.scalar(select(Permission).where(Permission.key == perm.value))
            if permission is None:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
            held = await db.scalar(
                select(RolePermissionAssign).where(
                    RolePermissionAssign.role_uuid == role.uuid,
                    RolePermissionAssign.permission_uuid == permission.uuid,
                )
            )
            if held is None:
                db.add(
                    RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope)
                )
        return str(role.uuid)


async def _post(client, token, query, variables, headers=None):
    resp = await client.post(
        "/graphql",
        json={"query": query, "variables": variables},
        headers={**auth_header(token), **(headers or {})},
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]


async def _file(client, token, headers=None) -> tuple[str, str]:
    """File a ticket with one need, then add a second; returns their uuids."""
    created = (
        await _post(
            client,
            token,
            CREATE_TICKET,
            {
                "input": {
                    "title": "need source",
                    "geometry": {"type": "Point", "coordinates": [121.43, 23.67]},
                    "contactName": "李",
                    "tasks": [{"taskType": "supply", "taskName": "飲用水", "quantity": 2}],
                }
            },
            headers,
        )
    )["createTicket"]
    added = (
        await _post(
            client,
            token,
            CREATE_TICKET_TASK,
            {
                "input": {
                    "ticketUuid": created["ticket"]["uuid"],
                    "taskType": "hr",
                    "taskName": "搬家具",
                    "quantity": 3,
                }
            },
            headers,
        )
    )["createTicketTask"]
    return created["tasks"][0]["uuid"], added["task"]["uuid"]


async def _sources(*task_uuids: str) -> list[str]:
    async with test_db() as db:
        rows = await db.execute(
            select(TicketTask.uuid, TicketTask.source).where(TicketTask.uuid.in_(task_uuids))
        )
        by_uuid = {str(uuid): source for uuid, source in rows}
    return [by_uuid[uuid] for uuid in task_uuids]


@pytest.mark.asyncio
async def test_a_citizens_needs_are_theirs(client, redis):
    """Acting as `user`, the site's identity, both the filed and the added need are 'user'."""
    await _user_role()
    _, token = await _create_user_with_role(redis, "user")
    assert await _sources(*await _file(client, token)) == ["user", "user"]


@pytest.mark.asyncio
async def test_a_back_office_identitys_needs_are_official(client, redis):
    """Acting as a back-office identity, both are 'official', with no `source` sent."""
    _, token = await _create_user_with_grants(redis, _STAFF)
    assert await _sources(*await _file(client, token)) == ["official", "official"]


@pytest.mark.asyncio
async def test_staff_on_the_site_file_as_user(client, redis):
    """The same staff account from the site acts as its `user` grant (ADR-289), so its needs are 'user'."""
    uid, token = await _create_user_with_grants(redis, _STAFF)
    role_uuid = await _user_role()
    async with test_db() as db:
        db.add(UserRoleAssign(user_uuid=uid, role_uuid=role_uuid))
    sources = await _sources(*await _file(client, token, {REALM_HEADER: SITE_REALM}))
    assert sources == ["user", "user"]


@pytest.mark.asyncio
async def test_a_sent_source_is_refused(client, redis):
    """The field is gone from the input: sending it is a validation error, not a silent override."""
    await _user_role()
    _, token = await _create_user_with_role(redis, "user")
    resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_TICKET_TASK,
            "variables": {
                "input": {
                    "ticketUuid": "00000000-0000-0000-0000-000000000000",
                    "taskType": "hr",
                    "taskName": "x",
                    "quantity": 1,
                    "source": "official",
                }
            },
        },
        headers=auth_header(token),
    )
    assert "errors" in resp.json()
