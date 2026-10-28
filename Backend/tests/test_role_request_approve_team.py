"""Approving a member request or a new-team application (Spec/026 Task 6b, ADR-350 point 6).

Service-level, like tests/test_role_request.py; the concurrency case uses separate engines so
the two decisions really race on the row lock.
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.schemas.role_request import RoleRequestResponse
from app.services import role_request
from app.services.authz import refresh_actor
from tests.conftest import TEST_DB_URL, acting_as
from tests.test_role_request import REASON, _citizen, _reviewer, _role


async def _team(db, name: str = "光復在地互助協會", type_: str = "ngo") -> Team:
    team = Team(name=name, type=type_, status="active")
    db.add(team)
    await db.flush()
    return team


async def _team_admin(db, team: Team) -> User:
    """An account acting as the team's `admin`, which holds team.member.manage at `team`."""
    user = User(name="隊長")
    db.add(user)
    await db.flush()
    admin = await _role(db, "admin", {Perm.TEAM_MEMBER_MANAGE: "team"}, kind="team")
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=admin.uuid, team_uuid=team.uuid, role_kind="team"))
    await db.flush()
    return acting_as(user, admin, team)


async def _team_roles(db) -> None:
    await _role(db, "member", {}, kind="team")
    await _role(db, "admin", {Perm.TEAM_MEMBER_MANAGE: "team"}, kind="team")


async def _apply(db, actor: User, **application) -> role_request.RoleRequest:
    await refresh_actor(db, actor)
    return await role_request.submit(db, actor=actor, reason=REASON, name="王小明", **application)


async def _approve(db, reviewer: User, request_uuid, note=None):
    await refresh_actor(db, reviewer)
    return await role_request.approve(db, actor=reviewer, request_uuid=request_uuid, note=note)


async def _team_identities(db, user_uuid) -> set[tuple[str, str]]:
    rows = await db.execute(
        select(Team.name, Role.name)
        .join(UserRoleAssign, UserRoleAssign.team_uuid == Team.uuid)
        .join(Role, Role.uuid == UserRoleAssign.role_uuid)
        .where(UserRoleAssign.user_uuid == user_uuid)
    )
    return set(rows.all())


@pytest.mark.asyncio
async def test_a_team_admin_approves_a_member_into_their_team(db):
    """The applicant becomes a `member`, and the request records what was handed out."""
    await _team_roles(db)
    team = await _team(db)
    team_uuid = team.uuid
    admin = await _team_admin(db, team)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _apply(db, citizen, requested_role="ngo", team_uuid=team_uuid)

    approved = await _approve(db, admin, request.uuid)

    assert (approved.status, approved.granted_team_uuid) == ("approved", team_uuid)
    assert await _team_identities(db, citizen_uuid) == {("光復在地互助協會", "member")}


@pytest.mark.asyncio
async def test_a_super_admin_approves_a_new_team_and_the_applicant_admins_it(db):
    """The team is created with the identity's type; the applicant is its `admin`."""
    await _team_roles(db)
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _apply(db, citizen, requested_role="government", new_team_name="花蓮縣光復鄉公所")

    approved = await _approve(db, reviewer, request.uuid)

    team = (await db.execute(select(Team).where(Team.name == "花蓮縣光復鄉公所"))).scalar_one()
    assert (team.type, team.status, approved.granted_team_uuid) == ("gov", "active", team.uuid)
    assert await _team_identities(db, citizen_uuid) == {("花蓮縣光復鄉公所", "admin")}


@pytest.mark.asyncio
async def test_the_response_names_the_team_a_new_team_application_founded(db):
    """`granted_team_uuid` is the founded team; `team_uuid` stays what was applied for, None here."""
    await _team_roles(db)
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    request = await _apply(db, citizen, requested_role="ngo", new_team_name="光復青年志工隊")
    pending = RoleRequestResponse.from_request(request)

    approved = RoleRequestResponse.from_request(await _approve(db, reviewer, request.uuid))

    team = (await db.execute(select(Team).where(Team.name == "光復青年志工隊"))).scalar_one()
    assert pending.granted_team_uuid is None
    assert (approved.team_uuid, str(approved.granted_team_uuid)) == (None, str(team.uuid))


@pytest.mark.asyncio
async def test_the_response_names_the_team_a_member_request_joined(db):
    """A member request's granted team is the one it asked to join."""
    await _team_roles(db)
    team = await _team(db)
    team_uuid = team.uuid
    admin = await _team_admin(db, team)
    citizen = await _citizen(db)
    request = await _apply(db, citizen, requested_role="ngo", team_uuid=team_uuid)

    approved = RoleRequestResponse.from_request(await _approve(db, admin, request.uuid))

    assert str(approved.team_uuid) == str(approved.granted_team_uuid) == str(team_uuid)


@pytest.mark.asyncio
async def test_a_name_taken_since_sending_is_a_conflict_and_stays_pending(db):
    """Checked again on approval (ADR-352 point 3)."""
    await _team_roles(db)
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    request = await _apply(db, citizen, requested_role="ngo", new_team_name="新協會")
    request_uuid = request.uuid
    await _team(db, "新協會")
    await db.commit()

    with pytest.raises(role_request.RoleRequestConflictError, match="^A team with this name already exists$"):
        await _approve(db, reviewer, request_uuid)
    await db.rollback()
    status = (await db.execute(select(role_request.RoleRequest.status))).scalar_one()
    assert status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("since", ["suspended", "already a member"])
async def test_a_member_request_that_cannot_be_granted_any_more_is_a_conflict(db, since):
    """Checked again on approval: the team is still active and they are not in it yet."""
    await _team_roles(db)
    team = await _team(db)
    team_uuid = team.uuid
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _apply(db, citizen, requested_role="ngo", team_uuid=team_uuid)
    request_uuid = request.uuid
    if since == "suspended":
        (await db.get(Team, team_uuid)).status = "suspended"
    else:
        member = await _role(db, "member", {}, kind="team")
        db.add(
            UserRoleAssign(
                user_uuid=citizen_uuid, role_uuid=member.uuid, team_uuid=team_uuid, role_kind="team"
            )
        )
    await db.commit()

    with pytest.raises(role_request.RoleRequestConflictError):
        await _approve(db, reviewer, request_uuid)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["member", "new team", "data auditor"])
async def test_approval_stores_the_name_given_as_the_real_name(db, kind):
    """ADR-355 point 4: the nickname stays; the back office gets the confirmed name."""
    await _team_roles(db)
    await _role(db, "data_auditor", {})
    team = await _team(db)
    team_uuid = team.uuid
    reviewer = await _reviewer(db)
    citizen = await _citizen(db, "小明")
    citizen_uuid = citizen.uuid
    application = {
        "member": {"requested_role": "ngo", "team_uuid": team_uuid},
        "new team": {"requested_role": "ngo", "new_team_name": "又一個新隊"},
        "data auditor": {"requested_role": "data_auditor"},
    }[kind]
    request = await _apply(db, citizen, **application)

    await _approve(db, reviewer, request.uuid)

    name, real_name = (
        await db.execute(select(User.name, User.real_name).where(User.uuid == citizen_uuid))
    ).one()
    assert (name, real_name) == ("小明", "王小明")


@pytest.mark.asyncio
async def test_rejecting_or_withdrawing_leaves_the_real_name_alone(db):
    """Only an approval writes it."""
    await _team_roles(db)
    team = await _team(db)
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _apply(db, citizen, requested_role="ngo", team_uuid=team.uuid)
    await refresh_actor(db, reviewer)

    await role_request.reject(db, actor=reviewer, request_uuid=request.uuid, note="不認識你")

    real_name = (await db.execute(select(User.real_name).where(User.uuid == citizen_uuid))).scalar_one()
    assert real_name is None


@pytest.mark.asyncio
async def test_the_applicant_hears_which_team_they_joined(db):
    """The notice names the team, in the prototype's tone."""
    await _team_roles(db)
    team = await _team(db, "光復互助")
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _apply(db, citizen, requested_role="ngo", team_uuid=team.uuid)

    await _approve(db, reviewer, request.uuid)

    [notice] = (
        await db.execute(select(Notification).where(Notification.type == "role_request_approved"))
    ).scalars()
    assert notice.recipient_uuid == citizen_uuid
    assert notice.body.startswith("你已加入「光復互助」。")


@pytest.mark.asyncio
async def test_the_teams_admins_hear_of_a_member_request(db):
    """They decide it by default; super admins hear too."""
    await _team_roles(db)
    team = await _team(db)
    admin = await _team_admin(db, team)
    admin_uuid = admin.uuid
    reviewer = await _reviewer(db)
    reviewer_uuid = reviewer.uuid
    citizen = await _citizen(db)

    await _apply(db, citizen, requested_role="ngo", team_uuid=team.uuid)

    notices = (
        await db.execute(select(Notification).where(Notification.type == "role_request_submitted"))
    ).scalars()
    recipients = sorted(str(n.recipient_uuid) for n in notices)
    assert recipients == sorted({str(admin_uuid), str(reviewer_uuid)})


@pytest.mark.asyncio
async def test_a_team_admin_and_a_super_admin_deciding_together_settle_one_way(db):
    """First decision wins across both queues (BE-038 step 4); the other gets 409."""
    await _team_roles(db)
    team = await _team(db)
    team_uuid = team.uuid
    admin = await _team_admin(db, team)
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = str(citizen.uuid)
    # Read before applying: submitting commits and expires them.
    deciders = [(str(admin.uuid), admin.active_identity), (str(reviewer.uuid), reviewer.active_identity)]
    request = await _apply(db, citizen, requested_role="ngo", team_uuid=team_uuid)
    request_uuid = request.uuid

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def decide(session, user_uuid, identity):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identity
            await role_request.approve(session, actor=actor, request_uuid=request_uuid, note=None)

        outcomes = await asyncio.gather(
            *(decide(session, *who) for session, who in zip(sessions, deciders, strict=True)),
            return_exceptions=True,
        )
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [o for o in outcomes if isinstance(o, role_request.RoleRequestConflictError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    db.expire_all()
    assert await _team_identities(db, citizen_uuid) == {("光復在地互助協會", "member")}
