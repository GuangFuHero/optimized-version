"""Integration tests for the minimal admin REST API (T117, RBAC_V1_DECISIONS.md ADR-031/032).

Covers: role assignment (platform + team kind), the last-super_admin lockout guard, and
team membership add/remove including the checkpoint-2 cross-team 404 (ADR-023).

Every uuid used after a later `db_session.commit()` is captured into a plain `str` the
moment the row is created, never re-read off the ORM object afterward: `db_session` is
`expire_on_commit=True` (tests/conftest.py), so any *later* commit in the same session
expires every previously loaded attribute — re-reading `obj.uuid` at that point tries an
implicit lazy reload that isn't valid under AsyncSession outside a real await, and blows up
with `MissingGreenlet`.
"""

import pytest
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team


def _auth_header(user_uuid: str) -> dict:
    token = create_access_token(data={"sub": str(user_uuid)})
    return {"Authorization": f"Bearer {token}"}


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

    user = User(name="Super Admin")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid


async def _make_plain_user(db, *, name: str = "Plain User", team_uuid: str | None = None) -> str:
    """Create a plain user (no roles) and return their uuid as a plain str."""
    user = User(name=name, team_uuid=team_uuid)
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


async def _make_role(db, *, name: str, kind: str) -> str:
    """Create a bare role (no grants) and return its uuid as a plain str."""
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
async def test_list_users_requires_permission(client, db_session):
    """A caller without user.view is denied — checkpoint 1 only, but still enforced."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get("/api/v1/admin/users", headers=_auth_header(plain_uuid))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_users_returns_role_info(client, db_session):
    """super_admin sees every user with their current platform/team role names."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.get("/api/v1/admin/users", headers=_auth_header(admin_uuid))
    assert resp.status_code == 200
    rows = {row["uuid"]: row for row in resp.json()}
    assert admin_uuid in rows
    assert rows[admin_uuid]["platform_role"] == "super_admin"


@pytest.mark.asyncio
async def test_assign_role_replaces_existing_platform_role(client, db_session):
    """Assigning a new platform role removes the user's prior platform-kind assignment."""
    admin_uuid = await _make_super_admin(db_session)
    other_role_uuid = await _make_role(db_session, name="data_auditor", kind="platform")
    target_uuid = await _make_plain_user(db_session, name="Target")

    resp = await client.post(
        f"/api/v1/admin/users/{target_uuid}/role",
        json={"role_name": "data_auditor"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()

    rows = (
        await db_session.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == target_uuid))
    ).scalars().all()
    assert len(rows) == 1
    assert str(rows[0].role_uuid) == other_role_uuid


@pytest.mark.asyncio
async def test_assign_role_rejects_removing_the_last_super_admin(client, db_session):
    """Demoting the only super_admin to another role is refused (ADR-032)."""
    admin_uuid = await _make_super_admin(db_session)
    await _make_role(db_session, name="data_auditor", kind="platform")

    resp = await client.post(
        f"/api/v1/admin/users/{admin_uuid}/role",
        json={"role_name": "data_auditor"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_assign_role_allows_demotion_when_another_super_admin_exists(client, db_session):
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
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()


@pytest.mark.asyncio
async def test_assign_team_role_requires_existing_team_membership(client, db_session):
    """A team-kind role cannot be granted before the user belongs to a team."""
    admin_uuid = await _make_super_admin(db_session)
    await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="No Team Yet")

    resp = await client.post(
        f"/api/v1/admin/users/{target_uuid}/role",
        json={"role_name": "member"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_add_team_member_sets_team_and_role(client, db_session):
    """Adding a member sets users.team_uuid and grants the requested team-kind role."""
    admin_uuid = await _make_super_admin(db_session)
    team_uuid = await _make_team(db_session, name="Team A", type_="gov")
    await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="New Member")

    resp = await client.post(
        f"/api/v1/admin/teams/{team_uuid}/members",
        json={"user_uuid": target_uuid, "team_role_name": "member"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["team_uuid"] == team_uuid


@pytest.mark.asyncio
async def test_add_team_member_conflicts_if_already_on_a_different_team(client, db_session):
    """A user already on team B cannot be silently moved to team A via add-member."""
    admin_uuid = await _make_super_admin(db_session)
    team_a_uuid = await _make_team(db_session, name="A", type_="gov")
    team_b_uuid = await _make_team(db_session, name="B", type_="gov")
    target_uuid = await _make_plain_user(db_session, name="Already Elsewhere", team_uuid=team_b_uuid)

    resp = await client.post(
        f"/api/v1/admin/teams/{team_a_uuid}/members",
        json={"user_uuid": target_uuid},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_team_admin_cannot_manage_a_different_teams_members(client, db_session):
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

    team_admin_user = User(name="Team Admin", team_uuid=own_team_uuid)
    db_session.add(team_admin_user)
    await db_session.flush()
    team_admin_user_uuid = str(team_admin_user.uuid)
    db_session.add(UserRoleAssign(user_uuid=team_admin_user.uuid, role_uuid=team_admin_role_uuid))

    target = User(name="Outsider")
    db_session.add(target)
    await db_session.flush()
    target_uuid = str(target.uuid)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admin/teams/{other_team_uuid}/members",
        json={"user_uuid": target_uuid},
        headers=_auth_header(team_admin_user_uuid),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_remove_team_member_clears_team_uuid_and_role(client, db_session):
    """Removing a member clears users.team_uuid and any team-kind role they held."""
    admin_uuid = await _make_super_admin(db_session)
    team_uuid = await _make_team(db_session, name="Team A", type_="gov")
    team_role_uuid = await _make_role(db_session, name="member", kind="team")
    target_uuid = await _make_plain_user(db_session, name="Departing", team_uuid=team_uuid)
    db_session.add(UserRoleAssign(user_uuid=target_uuid, role_uuid=team_role_uuid))
    await db_session.commit()

    resp = await client.delete(
        f"/api/v1/admin/teams/{team_uuid}/members/{target_uuid}",
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["team_uuid"] is None

    remaining = (
        await db_session.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == target_uuid))
    ).scalars().all()
    assert remaining == []
