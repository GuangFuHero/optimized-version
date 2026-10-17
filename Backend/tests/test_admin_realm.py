"""The back office acts as a back-office identity, marked by X-WG-Realm: admin (ADR-329).

A login lands on `user` (ADR-290), which is the site's identity. The back office marks its requests so the
same session acts there as something more: the identity the caller switched to, or else the first
back-office identity they hold. As with the site's marker (ADR-289), that lasts one request, picks only a
grant the caller holds, and changes nothing stored. An account holding nothing besides `user` is refused.
"""

import uuid

import pytest
from sqlalchemy import delete, select, text

from app.core import auth_cookies
from app.core.permissions import Perm
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, get_audit_trigger_sql
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from tests.conftest import auth_headers_for, token_for
from tests.cookies import cookie_header, cookies_set_by

pytestmark = pytest.mark.asyncio

BACK_OFFICE = {"X-WG-Realm": "admin"}
SITE = {"X-WG-Realm": "site"}

NO_BACK_OFFICE_IDENTITY = {
    "detail": "This account has no back-office identity",
    "code": "back_office_identity_required",
}


async def _role(db, name: str, kind: str = "platform") -> uuid.UUID:
    """The uuid of the named role, created if the fixture seed did not."""
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is None:
        role = Role(name=name, kind=kind)
        db.add(role)
        await db.flush()
    return role.uuid


async def _team(db, name: str, team_uuid: uuid.UUID | None = None) -> uuid.UUID:
    """The uuid of a new team with this name, and with `team_uuid` when given."""
    team = Team(name=name, type="ngo")
    if team_uuid is not None:
        team.uuid = team_uuid
    db.add(team)
    await db.flush()
    return team.uuid


async def _account(db, *grants: tuple[uuid.UUID, uuid.UUID | None]) -> str:
    """A committed account holding `user` and every (role, team) in `grants`; returns its uuid."""
    account = User(name="後台的人")
    db.add(account)
    await db.flush()
    for role_uuid, team_uuid in [(await _role(db, "user"), None), *grants]:
        db.add(UserRoleAssign(user_uuid=account.uuid, role_uuid=role_uuid, team_uuid=team_uuid))
    account_uuid = str(account.uuid)
    await db.commit()
    return account_uuid


async def _signed_in_as_user(db, redis, account_uuid: str) -> dict:
    """Bearer headers for a session on `user`, where every login lands (ADR-290)."""
    return await auth_headers_for(redis, account_uuid, await _role(db, "user"))


async def _acting_as(client, headers: dict) -> tuple[str, str | None]:
    """The (role, team) that `/users/me` says the request acted as."""
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 200, response.text
    identity = response.json()["active_identity"]
    return identity["role"], identity["team"]


async def test_a_session_on_user_acts_as_its_back_office_identity(client, db_session, redis):
    """A data auditor lands on `user` at login; in the back office they are a data auditor."""
    account = await _account(db_session, (await _role(db_session, "data_auditor"), None))
    headers = await _signed_in_as_user(db_session, redis, account)

    assert await _acting_as(client, {**headers, **BACK_OFFICE}) == ("data_auditor", None)


async def test_the_back_office_identity_brings_its_capabilities(client, db_session, redis):
    """Not just a label: the request is authorised as the back-office identity."""
    auditor = await _role(db_session, "data_auditor")
    permission = Permission(key=Perm.USER_VIEW.value)
    db_session.add(permission)
    await db_session.flush()
    db_session.add(RolePermissionAssign(role_uuid=auditor, permission_uuid=permission.uuid, scope="all"))
    account = await _account(db_session, (auditor, None))
    headers = await _signed_in_as_user(db_session, redis, account)

    assert (await client.get("/api/v1/admin/users", headers=headers)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers={**headers, **BACK_OFFICE})).status_code == 200


@pytest.mark.parametrize("entrypoint", ["rest", "graphql"])
async def test_an_account_holding_only_user_is_refused(
    client, db_session, redis, fresh_app_engine, entrypoint
):
    """No back-office identity: 403 with a code the back office can show, on REST and GraphQL alike.

    A 403 rather than a back office that lets them in and shows them nothing. It is not a 401 either: the
    session is fine and the site still works, so nobody is signed out.
    """
    account = await _account(db_session)
    headers = {**await _signed_in_as_user(db_session, redis, account), **BACK_OFFICE}

    if entrypoint == "rest":
        response = await client.get("/api/v1/users/me", headers=headers)
    else:
        response = await client.post("/graphql", json={"query": "{ __typename }"}, headers=headers)

    assert response.status_code == 403, response.text
    assert response.json() == NO_BACK_OFFICE_IDENTITY


async def test_refusing_the_back_office_leaves_the_cookies(client, db_session, redis):
    """A browser turned away from the back office stays signed in for the site.

    Only the answers that mean "signed out" clear the cookies (ADR-328); this 403 is not one of them.
    """
    account = await _account(db_session)
    token = await token_for(redis, account, await _role(db_session, "user"))
    headers = {**cookie_header(**{auth_cookies.access_cookie_name(): token}), **BACK_OFFICE}

    response = await client.get("/api/v1/users/me", headers=headers)

    assert response.status_code == 403, response.text
    assert cookies_set_by(response) == {}


async def test_a_platform_identity_comes_before_a_team_one(client, db_session, redis):
    """`admin` sorts before `data_auditor` by name, but platform identities come first."""
    team = await _team(db_session, "慈濟")
    account = await _account(
        db_session,
        (await _role(db_session, "admin", "team"), team),
        (await _role(db_session, "data_auditor"), None),
    )
    headers = await _signed_in_as_user(db_session, redis, account)

    assert await _acting_as(client, {**headers, **BACK_OFFICE}) == ("data_auditor", None)


async def test_the_same_role_in_two_teams_resolves_by_team_name(client, db_session, redis):
    """`admin` of two teams: the one whose team name sorts first, on every request.

    The uuids sort the other way from the names, and the later name is granted first, so neither the uuid
    nor the order the rows were written in can pass for the name.
    """
    admin = await _role(db_session, "admin", "team")
    team_b = await _team(db_session, "B 隊", uuid.UUID(int=1))
    team_a = await _team(db_session, "A 隊", uuid.UUID(int=2**128 - 1))
    account = await _account(db_session, (admin, team_b), (admin, team_a))
    headers = await _signed_in_as_user(db_session, redis, account)

    assert await _acting_as(client, {**headers, **BACK_OFFICE}) == ("admin", "A 隊")


async def test_the_back_office_acts_as_the_identity_switched_to(client, db_session, redis):
    """After a switch, the back office acts as it, the site as `user`, and an unmarked request as the token.

    The account also holds `data_auditor`, which the back office would pick by default, so acting as the
    team identity shows the switch is what decided.
    """
    member = await _role(db_session, "member", "team")
    team = await _team(db_session, "慈濟")
    account = await _account(db_session, (await _role(db_session, "data_auditor"), None), (member, team))
    switched = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(member), "team_uuid": str(team)},
        headers=await _signed_in_as_user(db_session, redis, account),
    )
    assert switched.status_code == 200, switched.text
    headers = {"Authorization": f"Bearer {switched.json()['access_token']}"}

    assert await _acting_as(client, {**headers, **BACK_OFFICE}) == ("member", "慈濟")
    assert await _acting_as(client, {**headers, **SITE}) == ("user", None)
    assert await _acting_as(client, headers) == ("member", "慈濟")


@pytest.mark.parametrize("revoked", ["data_auditor", "user"])
async def test_the_marker_does_not_stand_in_for_a_revoked_identity(client, db_session, redis, revoked):
    """The token is checked first, so a revoked identity 401s whatever is left (ADR-096).

    Revoking `data_auditor` leaves only `user`, which the marker would refuse with a 403. Revoking `user`
    leaves `data_auditor`, which the marker would act as. Neither answer is right: the session is over.
    """
    roles = {"user": await _role(db_session, "user"), "data_auditor": await _role(db_session, "data_auditor")}
    account = await _account(db_session, (roles["data_auditor"], None))
    headers = {**await auth_headers_for(redis, account, roles[revoked]), **BACK_OFFICE}
    await db_session.execute(
        delete(UserRoleAssign).where(
            UserRoleAssign.user_uuid == account, UserRoleAssign.role_uuid == roles[revoked]
        )
    )
    await db_session.commit()

    response = await client.get("/api/v1/users/me", headers=headers)

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "credentials_invalid"


async def test_what_the_back_office_changes_is_recorded_under_its_identity(client, db_session, redis):
    """The audit trail names the identity the change was actually made under (ADR-076)."""
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("users")))
    await db_session.commit()
    account = await _account(db_session, (await _role(db_session, "data_auditor"), None))
    headers = {**await _signed_in_as_user(db_session, redis, account), **BACK_OFFICE}

    response = await client.patch("/api/v1/users/me", json={"name": "改名"}, headers=headers)

    assert response.status_code == 200, response.text
    logs = await db_session.execute(
        select(AuditLog).where(
            AuditLog.table_name == "users",
            AuditLog.row_id == account,
            AuditLog.action == "UPDATE",
        )
    )
    [log] = logs.scalars().all()
    assert log.context["identity"]["role"] == "data_auditor"


@pytest.mark.parametrize("realm", [None, "Admin", "back-office"])
async def test_any_other_realm_leaves_the_token_identity(client, db_session, redis, realm):
    """Only the exact value the back office sends means anything: without it, `user` is not refused."""
    account = await _account(db_session)
    headers = await _signed_in_as_user(db_session, redis, account)
    if realm is not None:
        headers["X-WG-Realm"] = realm

    assert await _acting_as(client, headers) == ("user", None)
