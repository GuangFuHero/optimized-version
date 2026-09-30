"""The site acts as the caller's own `user` grant, marked by X-WG-Realm: site (Spec/019 Q15–Q17).

The team decided on 2026-09-28 that everyone signed in has the same permissions on the site —
those of `user` — and that which identity someone acts as is a back-office matter. A request
marked as coming from the site therefore acts as the `user` grant the caller holds, for that
request only: never an identity they do not hold, and nothing stored changes.
"""

import pytest
from sqlalchemy import delete, select, text

from app.core.permissions import Perm
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, get_audit_trigger_sql
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio

SITE = {"X-WG-Realm": "site"}

FILE = """
mutation($input: CreateHelpRequestInput!) { createHelpRequest(input: $input) { uuid } }
"""

HELP_REQUEST = {
    "title": "一樓客廳積泥需要幫忙清",
    "geometry": {"type": "Point", "coordinates": [121.4235, 23.6725]},
    "contactName": "王阿嬤",
    "contactPhone": "0912345678",
    "tasks": [{"taskType": "hr", "taskName": "清淤人力", "quantity": 3}],
}


async def _auditor(db, redis) -> tuple[str, str, dict]:
    """An approved data auditor acting as data_auditor, holding `user` beside it (Q3).

    `user` may file a help request and `data_auditor` may not, as in the seed. Returns
    (user uuid, data_auditor role uuid, headers acting as data_auditor).
    """
    user_role = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one()
    permission = Permission(key=Perm.TICKET_ADD.value)
    auditor_role = Role(name="data_auditor", kind="platform")
    account = User(name="資料檢核員")
    db.add_all([permission, auditor_role, account])
    await db.flush()
    db.add_all(
        [
            RolePermissionAssign(role_uuid=user_role.uuid, permission_uuid=permission.uuid, scope="all"),
            UserRoleAssign(user_uuid=account.uuid, role_uuid=user_role.uuid),
            UserRoleAssign(user_uuid=account.uuid, role_uuid=auditor_role.uuid),
        ]
    )
    account_uuid, auditor_uuid = str(account.uuid), str(auditor_role.uuid)
    await db.commit()
    return account_uuid, auditor_uuid, await auth_headers_for(redis, account_uuid, auditor_uuid)


async def _active_role(client, headers: dict) -> str:
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["active_identity"]["role"]


async def test_the_site_acts_as_user_whatever_the_back_office_switched_to(
    client, db_session, redis, fresh_app_engine
):
    """A data auditor cannot file a help request as one, but on the site they are `user` (GraphQL)."""
    _, _, headers = await _auditor(db_session, redis)
    body = {"query": FILE, "variables": {"input": HELP_REQUEST}}

    back_office = await client.post("/graphql", json=body, headers=headers)
    site = await client.post("/graphql", json=body, headers={**headers, **SITE})

    assert back_office.json()["errors"][0]["message"].startswith("403"), back_office.json()
    assert "errors" not in site.json(), site.json()


async def test_the_site_marker_lasts_one_request(client, db_session, redis):
    """REST reads the marker too, and it stores nothing: the next unmarked request is back.

    Had it rewritten the session's identity, the unmarked request would not merely act as
    `user` — it would 401, because a token that disagrees with its session is refused (ADR-195).
    """
    _, _, headers = await _auditor(db_session, redis)

    assert await _active_role(client, {**headers, **SITE}) == "user"
    assert await _active_role(client, headers) == "data_auditor"


async def test_what_the_site_changes_is_recorded_under_user(client, db_session, redis):
    """The audit trail names the identity the change was actually made under (ADR-076)."""
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("users")))
    await db_session.commit()
    account_uuid, _, headers = await _auditor(db_session, redis)

    response = await client.patch("/api/v1/users/me", json={"name": "改名"}, headers={**headers, **SITE})

    assert response.status_code == 200, response.text
    logs = await db_session.execute(
        select(AuditLog).where(
            AuditLog.table_name == "users",
            AuditLog.row_id == account_uuid,
            AuditLog.action == "UPDATE",
        )
    )
    [log] = logs.scalars().all()
    assert log.context["identity"]["role"] == "user"


async def test_an_account_without_user_keeps_its_identity(client, db_session, redis):
    """Q17: the marker only ever picks a grant the caller holds. It never hands one out."""
    super_admin = Role(name="super_admin", kind="platform")
    account = User(name="超級管理員")
    db_session.add_all([super_admin, account])
    await db_session.flush()
    db_session.add(UserRoleAssign(user_uuid=account.uuid, role_uuid=super_admin.uuid))
    account_uuid, super_admin_uuid = str(account.uuid), str(super_admin.uuid)
    await db_session.commit()
    headers = await auth_headers_for(redis, account_uuid, super_admin_uuid)

    assert await _active_role(client, {**headers, **SITE}) == "super_admin"


async def test_the_marker_does_not_revive_a_revoked_identity(client, db_session, redis):
    """The token is checked first: a revoked identity signs the session out, marked or not (ADR-096)."""
    _, auditor_uuid, headers = await _auditor(db_session, redis)
    await db_session.execute(delete(UserRoleAssign).where(UserRoleAssign.role_uuid == auditor_uuid))
    await db_session.commit()

    response = await client.get("/api/v1/users/me", headers={**headers, **SITE})

    assert response.status_code == 401


@pytest.mark.parametrize("realm", ["admin", "Site"])
async def test_any_other_realm_is_ignored(client, db_session, redis, realm):
    """Only the exact value the site sends means anything; the rest is as if it were absent."""
    _, _, headers = await _auditor(db_session, redis)

    assert await _active_role(client, {**headers, "X-WG-Realm": realm}) == "data_auditor"
