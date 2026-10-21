"""`grant_team_role`: the add-member write, shared with join request approval (Spec/026 Task 6a)."""

import pytest
from sqlalchemy import select

from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.services.admin import grant_team_role


async def _setup(db):
    a, b = Team(name="A", type="ngo", status="active"), Team(name="B", type="ngo", status="active")
    member, admin = Role(name="member", kind="team"), Role(name="admin", kind="team")
    user = User(name="x")
    db.add_all([a, b, member, admin, user])
    await db.flush()
    return a, b, member, admin, user


async def _held(db, user_uuid) -> set[tuple[str, str]]:
    rows = await db.execute(
        select(Team.name, Role.name)
        .join(UserRoleAssign, UserRoleAssign.team_uuid == Team.uuid)
        .join(Role, Role.uuid == UserRoleAssign.role_uuid)
        .where(UserRoleAssign.user_uuid == user_uuid)
    )
    return set(rows.all())


@pytest.mark.asyncio
async def test_it_replaces_the_role_in_that_team_only(db):
    """One role per team; roles in other teams are left alone (ADR-072)."""
    a, b, member, admin, user = await _setup(db)
    await grant_team_role(db, user_uuid=user.uuid, team_uuid=a.uuid, role=member)
    await grant_team_role(db, user_uuid=user.uuid, team_uuid=b.uuid, role=member)

    await grant_team_role(db, user_uuid=user.uuid, team_uuid=a.uuid, role=admin)

    assert await _held(db, user.uuid) == {("A", "admin"), ("B", "member")}


@pytest.mark.asyncio
async def test_it_does_not_commit(db):
    """The caller commits it with whatever else belongs to the same change."""
    a, _, member, _, user = await _setup(db)
    user_uuid, team_uuid, member_uuid = user.uuid, a.uuid, member.uuid  # read before the commit
    await db.commit()
    member = await db.get(Role, member_uuid)

    await grant_team_role(db, user_uuid=user_uuid, team_uuid=team_uuid, role=member)
    await db.rollback()

    assert await _held(db, user_uuid) == set()
