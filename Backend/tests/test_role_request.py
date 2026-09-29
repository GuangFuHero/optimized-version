"""A citizen applies to become back-office staff (Spec/019, AC-FEAT-002).

Service-level (root conftest): the rules live in `app.services.role_request`, so that is where
they are observed. The GraphQL layer only has to hand them through — see
tests/test_graphql/test_role_requests.py.
"""

import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from app.services import role_request
from app.services.authz import refresh_actor
from tests.conftest import TEST_DB_URL, acting_as

REASON = "我是光復鄉公所民政課，要協助檢查重複通報"


async def _role(db, name: str, grants: dict[Perm, str], kind: str = "platform") -> Role:
    """The role called `name`, created on first use with the given capability grants."""
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is not None:
        return role
    role = Role(name=name, kind=kind)
    db.add(role)
    await db.flush()
    for perm, scope in grants.items():
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


async def _citizen(db, name: str = "申請人") -> User:
    """A signed-in account holding only the platform `user` role, as registration leaves it."""
    user = User(name=name)
    db.add(user)
    role = await _role(db, "user", {Perm.ROLE_REQUEST_ADD: "all"})
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return acting_as(user, role)


async def _submit(db, actor: User, requested_role: str = "data_auditor", reason: str = REASON, contact=None):
    """Apply as `actor`. Submitting commits, so an actor loaded earlier may be expired by now."""
    await refresh_actor(db, actor)
    return await role_request.submit(
        db, actor=actor, requested_role=requested_role, reason=reason, contact=contact
    )


async def _state(db, actor: User) -> role_request.RoleRequestState:
    await refresh_actor(db, actor)
    return await role_request.my_role_requests(db, actor=actor)


async def _withdraw(db, actor: User, request_uuid):
    """Withdraw as `actor`, refreshed first for the same reason as in _submit."""
    await refresh_actor(db, actor)
    return await role_request.withdraw(db, actor=actor, request_uuid=request_uuid)


async def _reviewer(db) -> User:
    """An account holding role_request.review, as the seed gives super_admin."""
    reviewer = User(name="超級管理員")
    db.add(reviewer)
    super_admin = await _role(db, "super_admin", {Perm.ROLE_REQUEST_REVIEW: "all"})
    db.add(UserRoleAssign(user_uuid=reviewer.uuid, role_uuid=super_admin.uuid))
    await db.flush()
    return reviewer


@pytest.mark.asyncio
async def test_a_citizen_who_never_applied_may_apply(db):
    """The entry offers 申請成為後台人員 and the drawer opens on an empty form."""
    citizen = await _citizen(db)

    state = await role_request.my_role_requests(db, actor=citizen)

    assert state.requests == []
    assert state.has_backoffice_identity is False
    assert state.can_apply is True


@pytest.mark.asyncio
async def test_an_application_waits_for_review_and_blocks_another(db):
    """Once sent, the drawer shows only the pending card (AC-RE-106)."""
    citizen = await _citizen(db)

    await _submit(db, citizen, "data_auditor", REASON, contact="03-8701234 分機 12")

    state = await _state(db, citizen)
    [request] = state.requests
    assert (request.requested_role, request.status) == ("data_auditor", "pending")
    assert (request.reason, request.contact) == (REASON, "03-8701234 分機 12")
    assert state.can_apply is False


@pytest.mark.asyncio
@pytest.mark.parametrize("backoffice", ["team member", "data auditor"])
async def test_someone_with_a_backoffice_identity_cannot_apply(db, backoffice):
    """A team identity or another platform role already opens the back office.

    Joining a team goes by invitation, not through this form. A data auditor keeps `user`
    alongside (Spec/019: approval adds rather than replaces), so it is the extra role that
    counts, not the absence of `user`.
    """
    citizen = await _citizen(db)
    if backoffice == "team member":
        team = Team(name="慈濟", type="ngo")
        db.add(team)
        member = await _role(db, "member", {}, kind="team")
        db.add(UserRoleAssign(user_uuid=citizen.uuid, role_uuid=member.uuid, team_uuid=team.uuid))
    else:
        auditor = await _role(db, "data_auditor", {})
        db.add(UserRoleAssign(user_uuid=citizen.uuid, role_uuid=auditor.uuid))
    await db.flush()

    state = await _state(db, citizen)
    assert (state.has_backoffice_identity, state.can_apply) == (True, False)
    with pytest.raises(ValueError, match="back-office identity"):
        await _submit(db, citizen)


@pytest.mark.asyncio
async def test_a_second_application_waits_for_the_first(db):
    """AC-RE-106: one pending application at a time, whatever it asks for."""
    citizen = await _citizen(db)
    await _submit(db, citizen, "data_auditor")

    with pytest.raises(ValueError, match="already have a pending"):
        await _submit(db, citizen, "government")
    assert len((await _state(db, citizen)).requests) == 1


@pytest.mark.asyncio
async def test_two_tabs_submitting_at_once_leave_one_application(db):
    """Two real connections insert at once; uq_role_requests_one_pending lets exactly one in.

    No rendezvous needed, unlike the claim race: nothing is read before the insert, so the
    second insert simply waits on the index for the first commit and then fails on it.
    """
    citizen = await _citizen(db)
    user_uuid, identity = str(citizen.uuid), citizen.active_identity
    await db.commit()

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def apply(session):
            actor = await session.get(User, user_uuid)
            actor.active_identity = identity
            await role_request.submit(
                session, actor=actor, requested_role="data_auditor", reason=REASON, contact=None
            )

        outcomes = await asyncio.gather(*(apply(session) for session in sessions), return_exceptions=True)
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [outcome for outcome in outcomes if isinstance(outcome, ValueError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    assert "already have a pending" in str(refused[0])
    assert len((await _state(db, citizen)).requests) == 1


@pytest.mark.asyncio
async def test_a_rejected_applicant_may_apply_again_at_once(db):
    """AC-RE-107: no cooldown (2026-09-11). The list shows the newest first."""
    citizen = await _citizen(db)
    first = await _submit(db, citizen, "data_auditor")
    first.status = "rejected"  # arranging state only: the reject API arrives in C-B4
    await db.commit()

    await _submit(db, citizen, "government")

    state = await _state(db, citizen)
    assert [(r.requested_role, r.status) for r in state.requests] == [
        ("government", "pending"),
        ("data_auditor", "rejected"),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"reason": "   "}, "Reason is required"),
        ({"reason": "字" * 501}, "Reason must be at most 500 characters"),
        ({"contact": "9" * 101}, "Contact must be at most 100 characters"),
        ({"requested_role": "super_admin"}, "Cannot apply for super_admin"),
    ],
)
async def test_an_incomplete_or_oversized_application_is_refused(db, changes, message):
    """Refused with a message the drawer can show, before the table's CHECKs are ever reached."""
    citizen = await _citizen(db)
    application = {"requested_role": "data_auditor", "reason": REASON, "contact": None, **changes}

    with pytest.raises(ValueError, match=message):
        await _submit(db, citizen, **application)
    assert (await _state(db, citizen)).requests == []


@pytest.mark.asyncio
async def test_only_your_own_applications_are_listed(db):
    """Reason and contact are the applicant's own words and often name their unit and phone."""
    me = await _citizen(db, "甲")
    someone_else = await _citizen(db, "乙")
    await _submit(db, someone_else, "government", "別人的理由")

    assert (await _state(db, me)).requests == []


async def _notices(db, event_type: str) -> list[Notification]:
    rows = await db.execute(select(Notification).where(Notification.type == event_type))
    return list(rows.scalars().all())


@pytest.mark.asyncio
async def test_reviewers_hear_of_a_new_application(db):
    """Q9: everyone holding role_request.review is told, so the back office need not be polled."""
    reviewer = await _reviewer(db)
    citizen = await _citizen(db, "王小明")
    reviewer_uuid, citizen_uuid = reviewer.uuid, citizen.uuid

    request = await _submit(db, citizen, "data_auditor")

    [notice] = await _notices(db, "role_request_submitted")
    assert notice.recipient_uuid == reviewer_uuid != citizen_uuid
    assert (notice.ref_type, notice.ref_uuid) == ("role_request", request.uuid)
    assert (notice.title, notice.body) == ("有新的後台人員申請", "王小明 申請成為「資料檢核員」。")


@pytest.mark.asyncio
async def test_no_one_can_apply_while_applying_is_switched_off(db):
    """A super admin pauses applications by revoking role_request.add from `user` at runtime."""
    user = User(name="申請人")
    db.add(user)
    role = await _role(db, "user", {})
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    citizen = acting_as(user, role)

    assert (await _state(db, citizen)).can_apply is False
    with pytest.raises(HTTPException) as refused:
        await _submit(db, citizen)
    assert refused.value.status_code == 403


@pytest.mark.asyncio
async def test_a_withdrawn_application_frees_the_applicant_to_apply_again(db):
    """Q10: the drawer goes back to the form at once, with no cooldown."""
    citizen = await _citizen(db)
    first = await _submit(db, citizen, "data_auditor")

    withdrawn = await _withdraw(db, citizen, first.uuid)

    assert withdrawn.status == "withdrawn"
    assert withdrawn.closed_at is not None
    assert withdrawn.reviewed_by is None
    assert (await _state(db, citizen)).can_apply is True
    await _submit(db, citizen, "government")
    state = await _state(db, citizen)
    assert [(r.requested_role, r.status) for r in state.requests] == [
        ("government", "pending"),
        ("data_auditor", "withdrawn"),
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["someone else's", "one that does not exist"])
async def test_only_the_applicant_can_withdraw_an_application(db, target):
    """Someone else's application is not found, exactly like one that does not exist."""
    applicant = await _citizen(db, "甲")
    someone_else = await _citizen(db, "乙")
    request = await _submit(db, applicant)
    request_uuid = request.uuid if target == "someone else's" else uuid.uuid4()

    with pytest.raises(ValueError, match="^Role request not found$"):
        await _withdraw(db, someone_else, request_uuid)
    [still] = (await _state(db, applicant)).requests
    assert still.status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["approved", "rejected", "withdrawn"])
async def test_a_closed_application_cannot_be_withdrawn(db, status):
    """Only a pending application can be taken back; a decision, once made, stands."""
    citizen = await _citizen(db)
    request = await _submit(db, citizen)
    request_uuid = request.uuid
    request.status = status  # arranging state only: approve and reject arrive in C-B4 and C-B6
    await db.commit()

    with pytest.raises(ValueError, match="^Role request is no longer pending$"):
        await _withdraw(db, citizen, request_uuid)
    [still] = (await _state(db, citizen)).requests
    assert still.status == status


@pytest.mark.asyncio
async def test_withdrawing_tells_no_one(db):
    """Q10: the reviewers keep the notice of the application, and nothing further is sent."""
    await _reviewer(db)
    citizen = await _citizen(db)
    request = await _submit(db, citizen)

    await _withdraw(db, citizen, request.uuid)

    sent = (await db.execute(select(Notification.type))).scalars().all()
    assert sent == ["role_request_submitted"]


@pytest.mark.asyncio
async def test_pausing_applications_does_not_trap_one_already_sent(db):
    """Withdrawing asks only that the application is yours, not for role_request.add.

    A super admin pausing applications stops new ones; it must not strand one already sent.
    """
    citizen = await _citizen(db)
    request = await _submit(db, citizen)
    request_uuid, user_role_uuid = request.uuid, citizen.active_identity.role_uuid
    await db.execute(delete(RolePermissionAssign).where(RolePermissionAssign.role_uuid == user_role_uuid))
    await db.commit()

    withdrawn = await _withdraw(db, citizen, request_uuid)

    assert withdrawn.status == "withdrawn"
    with pytest.raises(HTTPException) as refused:
        await _submit(db, citizen)
    assert refused.value.status_code == 403
