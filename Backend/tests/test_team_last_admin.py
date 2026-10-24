"""A team keeps at least one admin (Spec/026 Task 7, ADR-356; ADMIN-027 Story 4 step 3)."""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.services import admin as admin_service
from app.services.admin import AdminConflictError
from app.services.authz import refresh_actor
from tests.conftest import TEST_DB_URL, acting_as
from tests.test_role_request import _role


async def _world(db, admins: int = 1, members: int = 1):
    """A team with `admins` admins (each managing members) and `members` plain members."""
    team = Team(name="光復隊", type="ngo", status="active")
    db.add(team)
    await db.flush()
    admin = await _role(db, "admin", {Perm.TEAM_MEMBER_MANAGE: "team"}, kind="team")
    member = await _role(db, "member", {}, kind="team")
    people = {}
    for name, role, count in (("admin", admin, admins), ("member", member, members)):
        for i in range(count):
            user = User(name=f"{name}{i}")
            db.add(user)
            await db.flush()
            db.add(
                UserRoleAssign(
                    user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid, role_kind="team"
                )
            )
            people[f"{name}{i}"] = acting_as(user, role, team)
    await db.flush()
    return team, people


async def _admins(db, team_uuid) -> int:
    rows = await db.execute(
        select(UserRoleAssign.uuid)
        .join(Role, Role.uuid == UserRoleAssign.role_uuid)
        .where(UserRoleAssign.team_uuid == team_uuid, Role.name == "admin")
    )
    return len(rows.all())


@pytest.mark.asyncio
async def test_the_only_admin_cannot_leave(db):
    """Removing themselves would leave the team with nobody to manage it."""
    team, people = await _world(db)
    me = people["admin0"]

    with pytest.raises(AdminConflictError, match="^Cannot remove the team's only admin$"):
        await admin_service.remove_team_member(db, actor=me, team_uuid=str(team.uuid), user_uuid=str(me.uuid))


@pytest.mark.asyncio
async def test_the_only_admin_cannot_be_made_a_member(db):
    """Changing their own role to member is the same loss."""
    team, people = await _world(db)
    me = people["admin0"]

    with pytest.raises(AdminConflictError, match="^Cannot remove the team's only admin$"):
        await admin_service.add_team_member(
            db, actor=me, team_uuid=str(team.uuid), user_uuid=str(me.uuid), team_role_name="member"
        )


@pytest.mark.asyncio
async def test_with_two_admins_one_may_step_down(db):
    """Another admin remains, so it goes through."""
    team, people = await _world(db, admins=2)
    team_uuid = team.uuid

    await admin_service.add_team_member(
        db,
        actor=people["admin0"],
        team_uuid=str(team_uuid),
        user_uuid=str(people["admin1"].uuid),
        team_role_name="member",
    )

    assert await _admins(db, team_uuid) == 1


@pytest.mark.asyncio
async def test_the_only_admin_may_remove_every_other_member(db):
    """Story 4 step 4: the admin can empty the team down to themselves."""
    team, people = await _world(db, members=2)
    team_uuid, me = team.uuid, people["admin0"]
    others = [str(people[f"member{i}"].uuid) for i in range(2)]

    for other in others:
        await refresh_actor(db, me)
        await admin_service.remove_team_member(db, actor=me, team_uuid=str(team_uuid), user_uuid=other)

    remaining = await db.execute(select(UserRoleAssign.uuid).where(UserRoleAssign.team_uuid == team_uuid))
    assert len(remaining.all()) == 1


@pytest.mark.asyncio
async def test_promoting_a_member_is_never_refused(db):
    """Making someone an admin takes no admin away."""
    team, people = await _world(db)
    team_uuid = team.uuid

    await admin_service.add_team_member(
        db,
        actor=people["admin0"],
        team_uuid=str(team_uuid),
        user_uuid=str(people["member0"].uuid),
        team_role_name="admin",
    )

    assert await _admins(db, team_uuid) == 2


@pytest.mark.asyncio
async def test_two_admins_demoting_each_other_at_once_leave_one(db):
    """The admin rows are locked first, so the second demotion sees only one admin left."""
    team, people = await _world(db, admins=2)
    team_uuid = str(team.uuid)
    pairs = [
        (str(people["admin0"].uuid), people["admin0"].active_identity, str(people["admin1"].uuid)),
        (str(people["admin1"].uuid), people["admin1"].active_identity, str(people["admin0"].uuid)),
    ]
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def demote(session, actor_uuid, identity, target_uuid):
            actor = await session.get(User, actor_uuid)
            actor.active_identity = identity
            await admin_service.add_team_member(
                session, actor=actor, team_uuid=team_uuid, user_uuid=target_uuid, team_role_name="member"
            )

        outcomes = await asyncio.gather(
            *(demote(session, *pair) for session, pair in zip(sessions, pairs, strict=True)),
            return_exceptions=True,
        )
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, Exception)]
    assert len(refused) == 1, outcomes
    db.expire_all()
    assert await _admins(db, team_uuid) == 1
