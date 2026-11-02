"""A team's member list, and the user directory it shares a base with (Spec/026).

`GET /admin/teams/{uuid}/members` is `TeamMemberDirectory`; `GET /admin/users` is
`PlatformUserDirectory`. Each has its own capability, so either can be granted alone.
"""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from app.services.user_directory import PlatformUserDirectory, TeamMemberDirectory, UserDirectory
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import auth_headers_for


def _url(team_uuid) -> str:
    """The member list's path."""
    return f"/api/v1/admin/teams/{team_uuid}/members"


def _seeded(role_name: str, *perms: Perm) -> tuple[tuple[Perm, str], ...]:
    """The scopes the seed gives `role_name` for `perms`, so the tests follow the seed."""
    granted = next(spec["permissions"] for spec in ROLES_DATA if spec["name"] == role_name)
    if isinstance(granted, list):  # super_admin's list means `all` for each
        granted = dict.fromkeys(granted, "all")
    return tuple((perm, granted[perm]) for perm in perms if perm in granted)


async def _role(db, name: str, kind: str, grants) -> Role:
    """The role called `name`, created with `grants`."""
    role = Role(name=name, kind=kind)
    db.add(role)
    await db.flush()
    for perm, scope in grants:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    await db.flush()
    return role


TEAM_PERMS = (Perm.TEAM_MEMBER_VIEW, Perm.TEAM_MEMBER_MANAGE)


class World:
    """Teams A and B. A: an admin and two members (one in B too). B: its own admin."""

    async def build(self, db, redis, *, member_grants=None) -> "World":
        """Arrange the world with the seed's team grants unless told otherwise."""
        a, b = Team(name="A 隊", type="ngo", status="active"), Team(name="B 隊", type="ngo", status="active")
        db.add_all([a, b])
        await db.flush()
        admin = await _role(db, "admin", "team", _seeded("admin", *TEAM_PERMS))
        grants = _seeded("member", *TEAM_PERMS) if member_grants is None else member_grants
        member = await _role(db, "member", "team", grants)
        boss = await _role(
            db, "super_admin", "platform", _seeded("super_admin", *TEAM_PERMS, Perm.ROLE_REQUEST_REVIEW)
        )
        plain = (
            await db.execute(select(Role).where(Role.name == "user"))
        ).scalar_one()  # db_session seeds it
        people = {}
        for name, real in (
            ("A admin", "陳隊長"),
            ("A1", "王小明"),
            ("A2", "林小華"),
            ("B admin", "李科長"),
            ("super", None),
            ("nobody", None),
        ):
            user = User(name=name, real_name=real)
            db.add(user)
            await db.flush()
            people[name] = user
        db.add_all(
            [
                UserRoleAssign(user_uuid=people["A admin"].uuid, role_uuid=admin.uuid, team_uuid=a.uuid),
                UserRoleAssign(user_uuid=people["A1"].uuid, role_uuid=member.uuid, team_uuid=a.uuid),
                UserRoleAssign(user_uuid=people["A2"].uuid, role_uuid=member.uuid, team_uuid=a.uuid),
                UserRoleAssign(user_uuid=people["A2"].uuid, role_uuid=member.uuid, team_uuid=b.uuid),
                UserRoleAssign(user_uuid=people["B admin"].uuid, role_uuid=admin.uuid, team_uuid=b.uuid),
                UserRoleAssign(user_uuid=people["super"].uuid, role_uuid=boss.uuid),
                UserRoleAssign(user_uuid=people["nobody"].uuid, role_uuid=plain.uuid),
            ]
        )
        await db.flush()
        self.a, self.b = str(a.uuid), str(b.uuid)
        ids = {
            "A admin": (people["A admin"].uuid, admin.uuid, a.uuid),
            "A1": (people["A1"].uuid, member.uuid, a.uuid),
            "B admin": (people["B admin"].uuid, admin.uuid, b.uuid),
            "super": (people["super"].uuid, boss.uuid, None),
            "nobody": (people["nobody"].uuid, plain.uuid, None),
        }
        await db.commit()
        self.headers = {who: await auth_headers_for(redis, *v) for who, v in ids.items()}
        return self


async def _members(client, world: World, who: str, team: str) -> list[dict]:
    """The list as `who` reads it."""
    response = await client.get(_url(team), headers=world.headers[who])
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_a_team_admin_lists_their_team_with_roles_and_real_names(client, db_session, redis):
    """The admin manages the members, so reads the name each one confirmed (ADR-355 point 5)."""
    world = await World().build(db_session, redis)

    rows = await _members(client, world, "A admin", world.a)

    assert {(r["name"], r["role"], r["real_name"]) for r in rows} == {
        ("A admin", "admin", "陳隊長"),
        ("A1", "member", "王小明"),
        ("A2", "member", "林小華"),
    }


@pytest.mark.asyncio
async def test_a_member_lists_their_team_without_real_names(client, db_session, redis):
    """team.member.view at `team` for members too (Popo, 2026-10-21); real names stay with admins."""
    world = await World().build(db_session, redis)

    rows = await _members(client, world, "A1", world.a)

    assert {r["name"] for r in rows} == {"A admin", "A1", "A2"}
    assert {r["real_name"] for r in rows} == {None}


@pytest.mark.asyncio
async def test_a_row_shows_only_the_role_in_this_team(client, db_session, redis):
    """A2 is in B as well; the list says nothing about it, nor about sessions or logins."""
    world = await World().build(db_session, redis)

    [a2] = [r for r in await _members(client, world, "A admin", world.a) if r["name"] == "A2"]

    assert set(a2) == {"uuid", "name", "real_name", "role_uuid", "role"}


@pytest.mark.asyncio
@pytest.mark.parametrize("who", ["A admin", "A1"])
async def test_another_team_is_not_found(client, db_session, redis, who):
    """Team scope: B's list answers 404, so B's existence is not given away (ADR-023)."""
    world = await World().build(db_session, redis)

    response = await client.get(_url(world.b), headers=world.headers[who])

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_super_admin_lists_any_team(client, db_session, redis):
    """team.member.view at `all`, and a reviewer, so with real names."""
    world = await World().build(db_session, redis)

    rows = await _members(client, world, "super", world.b)

    assert {(r["name"], r["real_name"]) for r in rows} == {("A2", "林小華"), ("B admin", "李科長")}


@pytest.mark.asyncio
async def test_someone_outside_every_team_is_refused(client, db_session, redis):
    """No team.member.view at all: 403."""
    world = await World().build(db_session, redis)

    response = await client.get(_url(world.a), headers=world.headers["nobody"])

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_the_capability_is_granted_on_its_own(client, db_session, redis):
    """Revoke team.member.view from members and they lose the list, nothing else."""
    world = await World().build(db_session, redis, member_grants=())

    response = await client.get(_url(world.a), headers=world.headers["A1"])

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_pages_are_stable(client, db_session, redis):
    """Oldest first, so skip and limit do not repeat or drop anyone."""
    world = await World().build(db_session, redis)

    first = (await client.get(_url(world.a), headers=world.headers["super"], params={"limit": 2})).json()
    rest = (await client.get(_url(world.a), headers=world.headers["super"], params={"skip": 2})).json()

    assert len(first) == 2 and len(rest) == 1
    assert {r["uuid"] for r in first}.isdisjoint({r["uuid"] for r in rest})


def test_both_lists_share_one_base():
    """The shape the user asked for: one base, one subclass per audience."""
    assert issubclass(PlatformUserDirectory, UserDirectory)
    assert issubclass(TeamMemberDirectory, UserDirectory)


def test_the_seed_grants_the_member_list_as_agreed():
    """Admin and member at `team`, super admin at `all` (Popo, 2026-10-21)."""
    assert _seeded("admin", Perm.TEAM_MEMBER_VIEW) == ((Perm.TEAM_MEMBER_VIEW, "team"),)
    assert _seeded("member", Perm.TEAM_MEMBER_VIEW) == ((Perm.TEAM_MEMBER_VIEW, "team"),)
    assert _seeded("super_admin", Perm.TEAM_MEMBER_VIEW) == ((Perm.TEAM_MEMBER_VIEW, "all"),)
