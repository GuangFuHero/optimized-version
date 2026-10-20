"""`/users/me` lists what the active identity passes checkpoint 1 for (PR #79).

Roles come straight from `scripts/seed_rbac.py`, so the expectations are the grants production
holds rather than a hand-written restatement of them.
"""

from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from sqlalchemy import event, select

from app.core.permissions import GOV_TEAM_ONLY_PERMS, PUBLIC_PERMS, Perm
from app.models.auth import User
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.team import Team
from app.services import authz
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import acting_as, auth_headers_for

pytestmark = pytest.mark.asyncio

SITE = {"X-WG-Realm": "site"}
GRANTS = {spec["name"]: spec["permissions"] for spec in ROLES_DATA}


async def _permission(db, perm: Perm) -> Permission:
    """Fetch or create the permission row for a seeded grant."""
    found = (await db.execute(select(Permission).where(Permission.key == perm.value))).scalar_one_or_none()
    if found is None:
        found = Permission(key=perm.value)
        db.add(found)
        await db.flush()
    return found


async def _seed_role(db, name: str) -> Role:
    """`name` with exactly the grants seed_rbac.py gives it; reused when it already exists."""
    spec = next(spec for spec in ROLES_DATA if spec["name"] == name)
    grants = spec["permissions"]
    assert isinstance(grants, dict)
    role = (await db.execute(select(Role).where(Role.name == name))).scalars().first()
    if role is None:
        role = Role(name=name, kind=spec["kind"])
        db.add(role)
        await db.flush()
    for perm, scope in grants.items():
        permission = await _permission(db, perm)
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    await db.flush()
    return role


async def _acting(db, role: Role, team: Team | None = None) -> User:
    """Assign and activate one identity on a new account."""
    user = User(name=f"{role.name} 帳號")
    db.add(user)
    await db.flush()
    db.add(
        UserRoleAssign(
            user_uuid=user.uuid,
            role_uuid=role.uuid,
            team_uuid=team.uuid if team is not None else None,
            role_kind=role.kind,
        )
    )
    await db.flush()
    return acting_as(user, role, team)


async def test_super_admin_lists_everything_the_seed_grants_it(db):
    """Not every Perm: ai_duplicate.* has no feature yet and role_request.add is the citizen's alone."""
    actor = await _acting(db, await _seed_role(db, "super_admin"))

    capabilities = await authz.capabilities(actor, db)

    assert [perm for perm in Perm if perm not in capabilities] == [
        Perm.AI_DUP_VIEW,
        Perm.AI_DUP_REVIEW,
        Perm.ROLE_REQUEST_ADD,
    ]
    # A platform identity is never fenced by the gov-team rule.
    assert set(capabilities) >= GOV_TEAM_ONLY_PERMS


@pytest.mark.parametrize("role_name", ["admin", "member"])
@pytest.mark.parametrize(
    ("team_type", "team_status", "fenced"),
    [("gov", "active", False), ("ngo", "active", True), ("gov", "inactive", True)],
    ids=["active-gov", "ngo", "inactive-gov"],
)
async def test_gov_only_capabilities_answer_as_require_gov_team_does(
    db, role_name, team_type, team_status, fenced
):
    """The seed gives every team admin (and member) the gov-only capabilities; the fence decides."""
    team = Team(name="隊", type=team_type, status=team_status)
    db.add(team)
    await db.flush()
    actor = await _acting(db, await _seed_role(db, role_name), team)
    held = GOV_TEAM_ONLY_PERMS & set(GRANTS[role_name])
    assert held, "the seed no longer grants this role any gov-only capability"

    capabilities = set(await authz.capabilities(actor, db))

    assert capabilities & GOV_TEAM_ONLY_PERMS == (set() if fenced else held)
    assert {Perm.STATION_ADD, Perm.TICKET_ADD} <= capabilities  # nothing else is fenced
    if fenced:
        with pytest.raises(HTTPException):
            await authz.require_gov_team(db, actor, detail="fenced")
    else:
        await authz.require_gov_team(db, actor, detail="fenced")


async def test_public_capabilities_are_listed_with_no_grant_and_with_a_none_grant(db):
    """As in require_scope: a public capability is Scope.ALL whatever the matrix says."""
    bare = Role(name="空角色", kind="platform")
    db.add(bare)
    await db.flush()
    ticket_view = await _permission(db, Perm.TICKET_VIEW)
    db.add(RolePermissionAssign(role_uuid=bare.uuid, permission_uuid=ticket_view.uuid, scope="none"))
    actor = await _acting(db, bare)

    assert await authz.capabilities(actor, db) == [perm for perm in Perm if perm in PUBLIC_PERMS]


async def test_the_seeded_user_lists_public_capabilities_it_holds_no_grant_for(db):
    """The seed gives `user` no announcement.view or pre_departure.view; both are public anyway."""
    actor = await _acting(db, await _seed_role(db, "user"))

    capabilities = await authz.capabilities(actor, db)

    assert Perm.ANN_VIEW not in GRANTS["user"] and Perm.ANN_VIEW in capabilities
    assert Perm.PREDEP_VIEW not in GRANTS["user"] and Perm.PREDEP_VIEW in capabilities
    assert Perm.ROLE_REQUEST_ADD in capabilities
    assert Perm.ANN_VIEW_ADMIN not in capabilities


async def test_a_direct_grant_on_the_active_identity_is_listed(db):
    """Include direct grants added at runtime to the active identity."""
    actor = await _acting(db, await _seed_role(db, "user"))
    team_view = await _permission(db, Perm.TEAM_VIEW)
    db.add(UserPermissionAssign(user_uuid=actor.uuid, permission_uuid=team_view.uuid, scope="all"))
    await db.flush()

    assert Perm.TEAM_VIEW in await authz.capabilities(actor, db)


@pytest.mark.parametrize("with_team", [False, True], ids=["platform", "team"])
async def test_listing_costs_a_fixed_number_of_queries(db, with_team):
    """Grants are read once and the gov-team answer once, however many capabilities there are."""
    team = None
    if with_team:
        team = Team(name="隊", type="gov")
        db.add(team)
        await db.flush()
    actor = await _acting(db, await _seed_role(db, "admin" if with_team else "super_admin"), team)
    count = Mock()

    engine = db.bind.sync_engine
    event.listen(engine, "before_cursor_execute", count)
    try:
        await authz.capabilities(actor, db)
    finally:
        event.remove(engine, "before_cursor_execute", count)

    assert count.call_count == (3 if with_team else 2)


async def test_users_me_lists_the_identity_the_request_acts_as(client, db_session, redis):
    """Back office: the token's identity. Site (X-WG-Realm: site): the caller's `user` grant (ADR-289)."""
    user_role = await _seed_role(db_session, "user")
    auditor_role = await _seed_role(db_session, "data_auditor")
    account = User(name="資料檢核員")
    db_session.add(account)
    await db_session.flush()
    db_session.add_all(
        [
            UserRoleAssign(user_uuid=account.uuid, role_uuid=user_role.uuid),
            UserRoleAssign(user_uuid=account.uuid, role_uuid=auditor_role.uuid),
        ]
    )
    account_uuid, auditor_uuid = str(account.uuid), str(auditor_role.uuid)
    await db_session.commit()
    headers = await auth_headers_for(redis, account_uuid, auditor_uuid)

    back_office = await client.get("/api/v1/users/me", headers=headers)
    site = await client.get("/api/v1/users/me", headers={**headers, **SITE})
    patched = await client.patch("/api/v1/users/me", json={"name": "改名"}, headers=headers)

    assert back_office.status_code == 200, back_office.text
    assert back_office.json()["active_identity"]["role"] == "data_auditor"
    assert "audit.view" in back_office.json()["capabilities"]
    assert "ticket.add" not in back_office.json()["capabilities"]
    assert site.status_code == 200, site.text
    assert site.json()["active_identity"]["role"] == "user"
    assert "ticket.add" in site.json()["capabilities"]
    assert "audit.view" not in site.json()["capabilities"]
    assert patched.status_code == 200, patched.text
    assert patched.json()["capabilities"] == back_office.json()["capabilities"]
