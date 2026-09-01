"""Integration tests for the minimal admin REST API (T117, ADR-031/032).

Covers: role assignment (platform + team kind), the last-super_admin lockout guard, and
team membership add/remove including the checkpoint-2 cross-team 404 (ADR-023). Those ADRs
live in `Spec/008-rbac-authorization/decisions.md`.

Every uuid used after a later `db_session.commit()` is captured into a plain `str` the
moment the row is created, never re-read off the ORM object afterward: `db_session` is
`expire_on_commit=True` (tests/conftest.py), so any *later* commit in the same session
expires every previously loaded attribute — re-reading `obj.uuid` at that point tries an
implicit lazy reload that isn't valid under AsyncSession outside a real await, and blows up
with `MissingGreenlet`.
"""

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.auth import User
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.team import Team
from tests.conftest import auth_headers_for


async def _auth_header(redis, user_uuid: str) -> dict:
    return await auth_headers_for(redis, user_uuid)


async def _grant(db, role: Role, perm_cache: dict, perm, scope: str) -> None:
    permission = perm_cache.get(perm.value)
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        perm_cache[perm.value] = permission
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))


async def _make_super_admin(db) -> str:
    """Create a super_admin user and return their uuid as a plain str."""
    from app.core.permissions import Perm

    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    perm_cache: dict = {}
    await _grant(db, role, perm_cache, Perm.RBAC_ASSIGN, "all")
    await _grant(db, role, perm_cache, Perm.USER_VIEW, "all")
    await _grant(db, role, perm_cache, Perm.TEAM_MEMBER_MANAGE, "all")
    await _grant(db, role, perm_cache, Perm.TEAM_EDIT, "all")
    await _grant(db, role, perm_cache, Perm.TEAM_VIEW, "all")

    user = User(name="Super Admin")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid


async def _make_plain_user(db, *, name: str = "Plain User") -> str:
    """Create a plain user (no roles) and return their uuid as a plain str.

    A user no longer carries a team of their own: which team someone belongs to is a
    property of the roles they hold (ADR-072/073), so joining a team means granting one.
    """
    user = User(name=name)
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


async def _make_team_admin(db, redis, team_uuid: str) -> tuple[str, dict]:
    """Create a user holding team.view=team IN team_uuid; return (uuid, auth headers).

    The headers matter: the grant only takes effect while the caller is acting as that
    identity (ADR-068), and a token with no `act` falls back to the platform identity, which
    holds nothing here.
    """
    from app.core.permissions import Perm

    role = Role(name=f"team-viewer-{uuid4().hex[:8]}", kind="team")
    db.add(role)
    await db.flush()
    perm_cache: dict = {}
    await _grant(db, role, perm_cache, Perm.TEAM_VIEW, "team")

    team = await db.get(Team, team_uuid)
    user = User(name="Team Admin")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_uuid))
    headers = await auth_headers_for(redis, user_uuid, role, team)
    await db.commit()
    return user_uuid, headers


async def _make_role(db, *, name: str, kind: str) -> str:
    """Create a bare role (no grants) and return its uuid as a plain str.

    Get-or-create: `roles.name` is unique and the suite shares one database, so well-known
    names like `user` or `member` may already have been created by another test.
    """
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is None:
        role = Role(name=name, kind=kind)
        db.add(role)
    await db.flush()
    role_uuid = str(role.uuid)
    await db.commit()
    return role_uuid


async def _make_team(db, *, name: str, type_: str) -> str:
    """Create a team and return its uuid as a plain str."""
    team = Team(name=name, type=type_)
    db.add(team)
    await db.flush()
    team_uuid = str(team.uuid)
    await db.commit()
    return team_uuid


@pytest.mark.asyncio
async def test_list_users_requires_permission(client, db_session, redis):
    """A caller without user.view is denied — checkpoint 1 only, but still enforced."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get("/api/v1/admin/users", headers=await _auth_header(redis, plain_uuid))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_returns_role_info(client, db_session, redis):
    """super_admin sees every user with their current platform/team role names."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.get("/api/v1/admin/users", headers=await _auth_header(redis, admin_uuid))
    assert resp.status_code == 200
    rows = {row["uuid"]: row for row in resp.json()}
    assert admin_uuid in rows
    assert rows[admin_uuid]["platform_role"] == "super_admin"


@pytest.mark.asyncio
async def test_assign_role_replaces_existing_platform_role(client, db_session, redis):
    """Assigning a new platform role removes the user's prior platform-kind assignment."""
    admin_uuid = await _make_super_admin(db_session)
    other_role_uuid = await _make_role(db_session, name="data_auditor", kind="platform")
    target_uuid = await _make_plain_user(db_session, name="Target")

    resp = await client.post(
        f"/api/v1/admin/users/{target_uuid}/role",
        json={"role_name": "data_auditor"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()

    rows = (
        await db_session.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == target_uuid))
    ).scalars().all()
    assert len(rows) == 1
    assert str(rows[0].role_uuid) == other_role_uuid


@pytest.mark.asyncio
async def test_assign_role_rejects_removing_the_last_super_admin(client, db_session, redis):
    """Demoting the only super_admin to another role is refused (ADR-032)."""
    admin_uuid = await _make_super_admin(db_session)
    await _make_role(db_session, name="data_auditor", kind="platform")

    resp = await client.post(
        f"/api/v1/admin/users/{admin_uuid}/role",
        json={"role_name": "data_auditor"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_assign_role_allows_demotion_when_another_super_admin_exists(client, db_session, redis):
    """Demoting one super_admin is fine as long as another still holds the role."""
    admin_uuid = await _make_super_admin(db_session)
    super_admin_role = (await db_session.execute(select(Role).where(Role.name == "super_admin"))).scalar_one()

    other_admin = User(name="Second Admin")
    db_session.add(other_admin)
    await db_session.flush()
    db_session.add(UserRoleAssign(user_uuid=other_admin.uuid, role_uuid=super_admin_role.uuid))
    await db_session.commit()
    await _make_role(db_session, name="data_auditor", kind="platform")

    resp = await client.post(
        f"/api/v1/admin/users/{admin_uuid}/role",
        json={"role_name": "data_auditor"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()


@pytest.mark.asyncio
async def test_assign_team_role_through_the_platform_endpoint_is_refused(client, db_session, redis):
    """A team role cannot be granted here — it has no team to belong to (ADR-072).

    Granting a team role IS joining that team, so the grant has to name one; this endpoint
    does not take a team, hence POST /teams/{uuid}/members instead.
    """
    admin_uuid = await _make_super_admin(db_session)
    await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="No Team Yet")

    resp = await client.post(
        f"/api/v1/admin/users/{target_uuid}/role",
        json={"role_name": "member"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_add_team_member_grants_the_requested_role_in_that_team(client, db_session, redis):
    """Adding a member grants the requested team-kind role, bound to that team."""
    admin_uuid = await _make_super_admin(db_session)
    team_uuid = await _make_team(db_session, name="Team A", type_="gov")
    await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="New Member")

    resp = await client.post(
        f"/api/v1/admin/teams/{team_uuid}/members",
        json={"user_uuid": target_uuid, "team_role_name": "member"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["team_uuid"] == team_uuid


@pytest.mark.asyncio
async def test_add_team_member_lets_a_user_belong_to_two_teams(client, db_session, redis):
    """Being on team B is no bar to joining team A — holding both is the point (ADR-068).

    This used to 409. The old model allowed one team per user, so the second add could only
    be read as a silent move; now the two grants are two identities the user switches between.
    """
    admin_uuid = await _make_super_admin(db_session)
    team_a_uuid = await _make_team(db_session, name="A", type_="gov")
    team_b_uuid = await _make_team(db_session, name="B", type_="gov")
    await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="Two Hats")

    for team_uuid in (team_b_uuid, team_a_uuid):
        resp = await client.post(
            f"/api/v1/admin/teams/{team_uuid}/members",
            json={"user_uuid": target_uuid},
            headers=await _auth_header(redis, admin_uuid),
        )
        assert resp.status_code == 200, resp.json()

    rows = (
        await db_session.execute(
            select(UserRoleAssign).where(UserRoleAssign.user_uuid == target_uuid)
        )
    ).scalars().all()
    assert {str(r.team_uuid) for r in rows} == {team_a_uuid, team_b_uuid}


@pytest.mark.asyncio
async def test_team_admin_cannot_manage_a_different_teams_members(client, db_session, redis):
    """A team-scoped team.member.manage grant 404s across a team boundary (ADR-023)."""
    from app.core.permissions import Perm

    team_admin_role = Role(name="admin", kind="team")
    db_session.add(team_admin_role)
    await db_session.flush()
    perm_cache: dict = {}
    await _grant(db_session, team_admin_role, perm_cache, Perm.TEAM_MEMBER_MANAGE, "team")
    team_admin_role_uuid = str(team_admin_role.uuid)

    own_team = Team(name="Own Team", type="ngo")
    other_team = Team(name="Other Team", type="ngo")
    db_session.add_all([own_team, other_team])
    await db_session.flush()
    own_team_uuid = str(own_team.uuid)
    other_team_uuid = str(other_team.uuid)

    team_admin_user = User(name="Team Admin")
    db_session.add(team_admin_user)
    await db_session.flush()
    team_admin_user_uuid = str(team_admin_user.uuid)
    db_session.add(
        UserRoleAssign(
            user_uuid=team_admin_user.uuid,
            role_uuid=team_admin_role_uuid,
            team_uuid=own_team_uuid,
        )
    )
    team_admin_headers = await auth_headers_for(redis, team_admin_user_uuid, team_admin_role, own_team)

    target = User(name="Outsider")
    db_session.add(target)
    await db_session.flush()
    target_uuid = str(target.uuid)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admin/teams/{other_team_uuid}/members",
        json={"user_uuid": target_uuid},
        headers=team_admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_team_member_revokes_every_grant_scoped_to_that_team(client, db_session, redis):
    """Removing a member revokes the roles they held in that team — that IS the membership."""
    admin_uuid = await _make_super_admin(db_session)
    team_uuid = await _make_team(db_session, name="Team A", type_="gov")
    team_role_uuid = await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="Departing")
    db_session.add(
        UserRoleAssign(user_uuid=target_uuid, role_uuid=team_role_uuid, team_uuid=team_uuid)
    )
    await db_session.commit()

    resp = await client.delete(
        f"/api/v1/admin/teams/{team_uuid}/members/{target_uuid}",
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["team_uuid"] is None

    remaining = (
        await db_session.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == target_uuid))
    ).scalars().all()
    assert remaining == []


@pytest.mark.asyncio
async def test_remove_team_member_also_revokes_direct_grants_bound_to_that_team(client, db_session, redis):
    """A direct grant naming the team is a permission in it, so leaving has to take it too.

    It used to survive, because the delete only touched `user_role_assign`. Re-adding the
    person then silently restored it: removed from a team, added back as a plain `member`,
    and they had their old `team.member.manage` again with no one re-granting anything
    (ADR-187).
    """
    from app.core.permissions import Perm

    admin_uuid = await _make_super_admin(db_session)
    team_uuid = await _make_team(db_session, name="Team B", type_="ngo")
    team_role_uuid = await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="Returning")
    # `_make_super_admin` already created this row and `permissions.key` is unique
    permission = (
        await db_session.execute(
            select(Permission).where(Permission.key == Perm.TEAM_MEMBER_MANAGE.value)
        )
    ).scalar_one()
    db_session.add_all([
        UserRoleAssign(user_uuid=target_uuid, role_uuid=team_role_uuid, team_uuid=team_uuid),
        UserPermissionAssign(
            user_uuid=target_uuid, permission_uuid=permission.uuid,
            scope="team", team_uuid=team_uuid,
        ),
    ])
    await db_session.commit()

    resp = await client.delete(
        f"/api/v1/admin/teams/{team_uuid}/members/{target_uuid}",
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()

    left = (
        await db_session.execute(
            select(UserPermissionAssign).where(
                UserPermissionAssign.user_uuid == target_uuid,
                UserPermissionAssign.team_uuid == team_uuid,
            )
        )
    ).scalars().all()
    assert left == []


@pytest.mark.asyncio
async def test_remove_team_member_leaves_other_teams_and_the_platform_grant_alone(
    client, db_session, redis
):
    """The delete keys on this team only — platform rows carry a NULL team and never match."""
    admin_uuid = await _make_super_admin(db_session)
    team_a = await _make_team(db_session, name="Team C", type_="ngo")
    team_b = await _make_team(db_session, name="Team D", type_="ngo")
    team_role_uuid = await _make_role(db_session, name="member", kind="team")
    platform_role_uuid = await _make_role(db_session, name="user", kind="platform")
    target_uuid = await _make_plain_user(db_session, name="Multi Hat")
    db_session.add_all([
        UserRoleAssign(user_uuid=target_uuid, role_uuid=platform_role_uuid),
        UserRoleAssign(user_uuid=target_uuid, role_uuid=team_role_uuid, team_uuid=team_a),
        UserRoleAssign(user_uuid=target_uuid, role_uuid=team_role_uuid, team_uuid=team_b),
    ])
    await db_session.commit()

    resp = await client.delete(
        f"/api/v1/admin/teams/{team_a}/members/{target_uuid}",
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()

    remaining = (
        await db_session.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == target_uuid))
    ).scalars().all()
    teams_left = {str(r.team_uuid) if r.team_uuid else None for r in remaining}
    assert teams_left == {None, str(team_b)}  # platform grant + the other team


@pytest.mark.asyncio
async def test_create_team_as_super_admin(client, db_session, redis):
    """super_admin creates a gov team (with a valid 統一編號) and gets 201 with the row."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "Taipei Gov", "type": "gov", "tax_id": "04595257"},  # Z=40, /5 ok
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body["name"] == "Taipei Gov"
    assert body["type"] == "gov"
    assert body["status"] == "active"
    assert body["tax_id"] == "04595257"
    assert body["uuid"]


@pytest.mark.asyncio
async def test_create_team_without_tax_id_is_null(client, db_session, redis):
    """tax_id is optional (可空): omitting it persists and returns null."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "No UBN Org", "type": "ngo"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["tax_id"] is None


@pytest.mark.asyncio
async def test_create_team_rejects_overlong_tax_id(client, db_session, redis):
    """tax_id that is not exactly 8 digits is rejected by the schema (422)."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "X", "type": "gov", "tax_id": "123456789"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_team_rejects_bad_ubn_checksum(client, db_session, redis):
    """8 digits but the /5 checksum fails → rejected (422). 12345678 gives Z=42."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "X", "type": "gov", "tax_id": "12345678"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_team_denied_without_team_edit(client, db_session, redis):
    """A caller without team.edit is denied (403)."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "Rogue", "type": "ngo"},
        headers=await _auth_header(redis, plain_uuid),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_team_rejects_bad_type(client, db_session, redis):
    """A type outside {gov, ngo} is rejected by the request schema (422)."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "X", "type": "military"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_list_teams_super_admin_sees_all(client, db_session, redis):
    """team.view=all returns every team."""
    admin_uuid = await _make_super_admin(db_session)
    await _make_team(db_session, name="Gov A", type_="gov")
    await _make_team(db_session, name="NGO B", type_="ngo")
    resp = await client.get("/api/v1/admin/teams", headers=await _auth_header(redis, admin_uuid))
    assert resp.status_code == 200, resp.json()
    names = {t["name"] for t in resp.json()}
    assert {"Gov A", "NGO B"} <= names


@pytest.mark.asyncio
async def test_list_teams_team_admin_sees_only_own(client, db_session, redis):
    """team.view=team returns only the caller's own team (ADR-053 boundary)."""
    my_team = await _make_team(db_session, name="My Team", type_="ngo")
    await _make_team(db_session, name="Other Team", type_="gov")
    _, viewer_headers = await _make_team_admin(db_session, redis, my_team)
    resp = await client.get("/api/v1/admin/teams", headers=viewer_headers)
    assert resp.status_code == 200, resp.json()
    names = {t["name"] for t in resp.json()}
    assert names == {"My Team"}


@pytest.mark.asyncio
async def test_list_teams_denied_without_team_view(client, db_session, redis):
    """A caller without team.view is denied (403)."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get("/api/v1/admin/teams", headers=await _auth_header(redis, plain_uuid))
    assert resp.status_code == 403
