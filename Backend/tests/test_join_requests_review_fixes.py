"""Regressions from the Spec/026 code review (ADR-359 points 3-5)."""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import UserRoleAssign
from app.models.team import Team
from app.services import admin as admin_service
from app.services import rbac_admin, role_request, team_invite
from app.services.admin import AdminConflictError
from app.services.authz import refresh_actor
from tests.conftest import TEST_DB_URL, acting_as
from tests.test_role_request import REASON, _citizen, _reviewer, _role


async def _team(db, name="光復隊", status="active") -> Team:
    team = Team(name=name, type="ngo", status=status)
    db.add(team)
    await db.flush()
    return team


async def _super(db) -> User:
    """A super admin holding what these paths ask for."""
    user = User(name="超管")
    db.add(user)
    await db.flush()
    role = await _role(
        db,
        "super_admin",
        {
            Perm.TEAM_EDIT: "all",
            Perm.TEAM_MEMBER_MANAGE: "all",
            Perm.RBAC_ASSIGN: "all",
            Perm.ROLE_REQUEST_REVIEW: "all",
        },
    )
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


@pytest.mark.asyncio
async def test_creating_a_team_with_a_taken_name_is_refused(db):
    """ADR-352 point 3 holds for POST /admin/teams too."""
    await _team(db, "光復隊")
    boss = await _super(db)

    with pytest.raises(AdminConflictError, match="^A team with this name already exists$"):
        await admin_service.create_team(db, actor=boss, name=" 光復隊 ", type_="ngo")


@pytest.mark.asyncio
async def test_renaming_to_null_is_a_field_to_fix(db):
    """`{"name": null}` was a 500; it is now refused like a blank name."""
    team = await _team(db)
    boss = await _super(db)

    with pytest.raises(admin_service.AdminValidationError, match="^Team name is required$"):
        await admin_service.update_team(db, actor=boss, team_uuid=str(team.uuid), changes={"name": None})


@pytest.mark.asyncio
async def test_no_invite_for_a_suspended_team(db):
    """The link would 404 at once; say so instead of issuing it."""
    team = await _team(db, status="suspended")
    boss = await _super(db)

    with pytest.raises(team_invite.TeamNotActiveError):
        await team_invite.create_invite(db, actor=boss, team_uuid=team.uuid)


@pytest.mark.asyncio
async def test_the_rbac_revoke_keeps_a_teams_last_admin(db):
    """ADR-356 covers every path that takes the grant away, not just the members endpoints."""
    team = await _team(db)
    boss = await _super(db)
    admin = await _role(db, "admin", {Perm.TEAM_MEMBER_MANAGE: "team"}, kind="team")
    captain = User(name="隊長")
    db.add(captain)
    await db.flush()
    db.add(
        UserRoleAssign(user_uuid=captain.uuid, role_uuid=admin.uuid, team_uuid=team.uuid, role_kind="team")
    )
    await db.flush()

    with pytest.raises(rbac_admin.RbacConflictError, match="^Cannot remove the team's only admin$"):
        await rbac_admin.unassign_user_role(
            db, actor=boss, user_uuid=str(captain.uuid), role_uuid=str(admin.uuid), team_uuid=str(team.uuid)
        )


@pytest.mark.asyncio
async def test_a_suspended_teams_member_still_cannot_become_a_data_auditor(db):
    """Eligibility asks what the account holds, not what it may act as (ADR-359 point 3)."""
    team = await _team(db, status="suspended")
    citizen = await _citizen(db)
    member = await _role(db, "member", {}, kind="team")
    db.add(
        UserRoleAssign(user_uuid=citizen.uuid, role_uuid=member.uuid, team_uuid=team.uuid, role_kind="team")
    )
    await db.flush()
    await refresh_actor(db, citizen)

    with pytest.raises(ValueError, match="^Only an account without a back-office identity can apply$"):
        await role_request.submit(
            db, actor=citizen, requested_role="data_auditor", reason=REASON, name="王小明"
        )


@pytest.mark.asyncio
async def test_approving_while_the_team_is_suspended_settles_one_way(db):
    """Approval locks the team before the request, as suspending does, so they cannot interleave.

    Either the approval lands first (approved, and the grant kept for when the team is restored)
    or the suspension does (the request rejected with its note, no grant). Never an approved
    request without its grant, or a grant for a request the suspension closed.
    """
    await _role(db, "member", {}, kind="team")
    team = await _team(db)
    team_uuid = team.uuid
    boss = await _super(db)  # first: _reviewer would create `super_admin` with review only
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    who = [(str(reviewer.uuid), reviewer.active_identity), (str(boss.uuid), boss.active_identity)]
    request = await role_request.submit(
        db, actor=citizen, requested_role="ngo", reason=REASON, name="王小明", team_uuid=team_uuid
    )
    request_uuid = request.uuid

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def actor(session, user_uuid, identity):
            user = await session.get(User, user_uuid)
            user.active_identity = identity
            return user

        async def approve(session):
            await role_request.approve(
                session, actor=await actor(session, *who[0]), request_uuid=request_uuid, note=None
            )

        async def suspend(session):
            await admin_service.set_team_status(
                session, actor=await actor(session, *who[1]), team_uuid=str(team_uuid), new_status="suspended"
            )

        outcomes = await asyncio.gather(approve(sessions[0]), suspend(sessions[1]), return_exceptions=True)
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    unexpected = [
        o
        for o in outcomes
        if isinstance(o, Exception) and not isinstance(o, role_request.RoleRequestConflictError)
    ]
    assert not unexpected, outcomes
    db.expire_all()
    status = (await db.execute(select(role_request.RoleRequest.status))).scalar_one()
    granted = (
        await db.execute(select(UserRoleAssign).where(UserRoleAssign.team_uuid == team_uuid))
    ).first() is not None
    assert (status, granted) in {("approved", True), ("rejected", False)}


def test_data_auditors_read_applicant_details_masked():
    """ADR-359 point 5: what only reviewers read is replaced, everything else kept."""
    from app.services.audit_log import REDACTED, redact_applicant_details

    values = {"status": "pending", "applicant_phone": "+886912345678", "reason": "我是…", "contact": None}

    assert redact_applicant_details("role_requests", values) == {
        "status": "pending",
        "applicant_phone": REDACTED,
        "reason": REDACTED,
        "contact": None,
    }
    assert redact_applicant_details("users", {"name": "小明", "real_name": "王小明"}) == {
        "name": "小明",
        "real_name": REDACTED,
    }
    assert redact_applicant_details("teams", {"name": "x"}) == {"name": "x"}
    # PR #93 review: login contacts and SSO subjects too, or the masking above is undone.
    assert redact_applicant_details("user_contacts", {"type": "phone", "value": "+886912345678"}) == {
        "type": "phone",
        "value": REDACTED,
    }
    assert redact_applicant_details("user_identities", {"provider": "line", "provider_subject": "U1234"}) == {
        "provider": "line",
        "provider_subject": REDACTED,
    }
