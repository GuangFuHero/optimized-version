"""Editing a team: its own admin or a super admin (Spec/026 Task 8, ADR-357 points 1, 2, 5)."""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import auth_headers_for

URL = "/api/v1/admin/teams"


async def _role(db, name: str, kind: str, grants: tuple[tuple[Perm, str], ...]) -> Role:
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


def _seeded(role_name: str) -> tuple[tuple[Perm, str], ...]:
    """The team capabilities the seed gives `role_name`, so the test follows the seed."""
    perms = next(spec["permissions"] for spec in ROLES_DATA if spec["name"] == role_name)
    return tuple((perm, scope) for perm, scope in perms.items() if perm.value.startswith("team."))


class World:
    """Teams A and B; A's admin, A's member, and a super admin, with the seed's team grants."""

    async def build(self, db, redis) -> "World":
        """Arrange the world and mint headers."""
        a = Team(name="A 隊", type="ngo", status="active", contact_name="王隊長", contact_phone="0912345678")
        b = Team(name="B 隊", type="gov", status="active")
        db.add_all([a, b])
        await db.flush()
        admin = await _role(db, "admin", "team", _seeded("admin"))
        member = await _role(db, "member", "team", _seeded("member"))
        super_admin = await _role(db, "super_admin", "platform", _seeded("super_admin"))
        identities = {}
        for who, role, team in (("A admin", admin, a), ("A member", member, a), ("super", super_admin, None)):
            user = User(name=who)
            db.add(user)
            await db.flush()
            db.add(
                UserRoleAssign(
                    user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid if team else None
                )
            )
            identities[who] = (user.uuid, role.uuid, team.uuid if team else None)
        self.a, self.b = str(a.uuid), str(b.uuid)
        await db.commit()
        self.headers = {who: await auth_headers_for(redis, *ids) for who, ids in identities.items()}
        return self


@pytest.mark.asyncio
async def test_a_team_admin_edits_their_own_team(client, db_session, redis):
    """Name, tax ID and contact; fields left out stay as they were."""
    world = await World().build(db_session, redis)

    response = await client.patch(
        f"{URL}/{world.a}",
        headers=world.headers["A admin"],
        json={"name": " A 隊（光復） ", "contact_phone": "0987654321"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["name"], body["contact_name"], body["contact_phone"]) == (
        "A 隊（光復）",
        "王隊長",
        "0987654321",
    )


@pytest.mark.asyncio
async def test_a_team_admin_cannot_edit_another_team(client, db_session, redis):
    """Not found, so its existence is not given away (ADR-023)."""
    world = await World().build(db_session, redis)

    response = await client.patch(f"{URL}/{world.b}", headers=world.headers["A admin"], json={"name": "改名"})

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_member_cannot_edit_the_team(client, db_session, redis):
    """Members hold no team.edit: 403."""
    world = await World().build(db_session, redis)

    response = await client.patch(
        f"{URL}/{world.a}", headers=world.headers["A member"], json={"name": "改名"}
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_team_admin_cannot_create_a_team(client, db_session, redis):
    """team.edit at `team` edits one's own; creating needs `all` (ADR-357 point 2)."""
    world = await World().build(db_session, redis)

    response = await client.post(URL, headers=world.headers["A admin"], json={"name": "新隊", "type": "ngo"})

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_super_admin_edits_any_team(client, db_session, redis):
    """team.edit at `all`."""
    world = await World().build(db_session, redis)

    response = await client.patch(
        f"{URL}/{world.b}", headers=world.headers["super"], json={"contact_name": "李科長"}
    )

    assert (response.status_code, response.json()["contact_name"]) == (200, "李科長")


@pytest.mark.asyncio
@pytest.mark.parametrize("taken", ["B 隊", " b 隊 "])
async def test_a_name_another_team_has_is_refused(client, db_session, redis, taken):
    """Trimmed, ignoring case (ADR-352 point 3)."""
    world = await World().build(db_session, redis)

    response = await client.patch(f"{URL}/{world.a}", headers=world.headers["super"], json={"name": taken})

    assert (response.status_code, response.json()["detail"]) == (409, "A team with this name already exists")


@pytest.mark.asyncio
async def test_keeping_the_same_name_is_not_a_conflict(client, db_session, redis):
    """The team's own name does not count as taken."""
    world = await World().build(db_session, redis)

    response = await client.patch(f"{URL}/{world.a}", headers=world.headers["A admin"], json={"name": "A 隊"})

    assert response.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("body", "status"), [({"type": "gov"}, 200), ({"tax_id": "123"}, 422), ({"name": "   "}, 422)]
)
async def test_the_type_is_not_editable_and_fields_are_checked(client, db_session, redis, body, status):
    """`type` is ignored; a bad tax ID or a blank name is a field to fix."""
    world = await World().build(db_session, redis)

    response = await client.patch(f"{URL}/{world.a}", headers=world.headers["super"], json=body)

    assert response.status_code == status, response.text
    if status == 200:
        assert response.json()["type"] == "ngo"


@pytest.mark.asyncio
async def test_a_member_sees_their_teams_contact_and_not_other_teams(client, db_session, redis):
    """Contact goes where the team already is; team.view is not widened (ADR-357 point 5)."""
    world = await World().build(db_session, redis)

    teams = (await client.get(URL, headers=world.headers["A member"])).json()

    assert [(t["name"], t["contact_name"]) for t in teams] == [("A 隊", "王隊長")]


def test_the_seed_lets_team_admins_edit_their_team_only():
    """The grant the PATCH relies on, at `team` so creating stays super admin only."""
    perms = next(spec["permissions"] for spec in ROLES_DATA if spec["name"] == "admin")
    assert perms[Perm.TEAM_EDIT] == "team"
