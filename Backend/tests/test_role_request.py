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
    await db.flush()  # assigns the uuid; the session does not autoflush, as the app's does not
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
    """An account acting as super_admin with role_request.review, as the seed gives it."""
    reviewer = User(name="超級管理員")
    db.add(reviewer)
    await db.flush()  # assigns the uuid, as in _citizen
    super_admin = await _role(db, "super_admin", {Perm.ROLE_REQUEST_REVIEW: "all"})
    db.add(UserRoleAssign(user_uuid=reviewer.uuid, role_uuid=super_admin.uuid))
    await db.flush()
    return acting_as(reviewer, super_admin)


async def _reject(db, reviewer: User, request_uuid, note: str | None = None):
    """Turn an application down as `reviewer`, refreshed first for the same reason as in _submit."""
    await refresh_actor(db, reviewer)
    return await role_request.reject(db, actor=reviewer, request_uuid=request_uuid, note=note)


async def _approve(db, reviewer: User, request_uuid, note: str | None = None):
    """Approve an application as `reviewer`, refreshed first for the same reason as in _submit."""
    await refresh_actor(db, reviewer)
    return await role_request.approve(db, actor=reviewer, request_uuid=request_uuid, note=note)


async def _platform_roles(db, user_uuid) -> list[str]:
    """Names of the platform roles the account holds, sorted."""
    names = await db.execute(
        select(Role.name)
        .join(UserRoleAssign, UserRoleAssign.role_uuid == Role.uuid)
        .where(UserRoleAssign.user_uuid == user_uuid, UserRoleAssign.team_uuid.is_(None))
    )
    return sorted(names.scalars().all())


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
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    first = await _submit(db, citizen, "data_auditor")
    await _reject(db, reviewer, first.uuid)

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
    """ADR-287: everyone holding role_request.review is told, so the back office need not be polled."""
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
    """ADR-287: the drawer goes back to the form at once, with no cooldown."""
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
    request.status = status  # arranging state only: approval arrives in C-B6
    await db.commit()

    with pytest.raises(ValueError, match="^Role request is no longer pending$"):
        await _withdraw(db, citizen, request_uuid)
    [still] = (await _state(db, citizen)).requests
    assert still.status == status


@pytest.mark.asyncio
async def test_withdrawing_tells_no_one(db):
    """ADR-287: the reviewers keep the notice of the application, and nothing further is sent."""
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


@pytest.mark.asyncio
async def test_rejecting_records_who_decided_and_their_reply(db):
    """The reply is what the applicant reads on the card; the decision names its reviewer."""
    reviewer = await _reviewer(db)
    reviewer_uuid = reviewer.uuid
    citizen = await _citizen(db)
    request = await _submit(db, citizen)

    rejected = await _reject(db, reviewer, request.uuid, note="  請改用單位信箱再申請一次  ")

    assert rejected.status == "rejected"
    assert (rejected.reviewed_by, rejected.review_note) == (reviewer_uuid, "請改用單位信箱再申請一次")
    assert rejected.closed_at is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("note", [None, "   "])
async def test_a_blank_reply_is_no_reply(db, note):
    """Nothing typed and only spaces typed read the same: the card falls back to its default."""
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    request = await _submit(db, citizen)

    rejected = await _reject(db, reviewer, request.uuid, note=note)

    assert rejected.review_note is None


@pytest.mark.asyncio
async def test_an_oversized_reply_is_refused(db):
    """Refused with a message the back office can show, before the table's CHECK is reached."""
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    request = await _submit(db, citizen)
    request_uuid = request.uuid

    with pytest.raises(ValueError, match="^Note must be at most 500 characters$"):
        await _reject(db, reviewer, request_uuid, note="字" * 501)
    [still] = (await _state(db, citizen)).requests
    assert still.status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["approved", "rejected", "withdrawn"])
async def test_a_closed_application_cannot_be_rejected(db, status):
    """A decision, once made, stands; so does a withdrawal. The back office answers 409."""
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    request = await _submit(db, citizen)
    request_uuid = request.uuid
    request.status = status  # arranging state only: approval arrives in C-B6
    await db.commit()

    with pytest.raises(role_request.RoleRequestConflictError, match="^Role request is no longer pending$"):
        await _reject(db, reviewer, request_uuid)
    [still] = (await _state(db, citizen)).requests
    assert still.status == status


@pytest.mark.asyncio
async def test_rejecting_an_application_that_does_not_exist_is_not_found(db):
    """The back office answers 404."""
    reviewer = await _reviewer(db)

    with pytest.raises(role_request.RoleRequestNotFoundError, match="^Role request not found$"):
        await _reject(db, reviewer, uuid.uuid4())


@pytest.mark.asyncio
async def test_only_a_reviewer_can_reject(db):
    """Holding role_request.review is what makes a reviewer; seed gives it to super_admin only."""
    applicant = await _citizen(db, "甲")
    someone_else = await _citizen(db, "乙")
    request = await _submit(db, applicant)
    request_uuid = request.uuid

    with pytest.raises(HTTPException) as refused:
        await _reject(db, someone_else, request_uuid)
    assert refused.value.status_code == 403
    [still] = (await _state(db, applicant)).requests
    assert still.status == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("note", "body"),
    [
        ("請附上單位證明後再申請", "請附上單位證明後再申請"),
        (None, "你原本的權限沒有任何改變，可以再送一次申請。"),
    ],
)
async def test_the_applicant_hears_they_were_turned_down(db, note, body):
    """ADR-287, in the prototype's words (wg-bridge.js): the reply if there is one, else reassurance."""
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _submit(db, citizen, "government")
    request_uuid = request.uuid

    await _reject(db, reviewer, request_uuid, note=note)

    [notice] = await _notices(db, "role_request_rejected")
    assert notice.recipient_uuid == citizen_uuid
    assert (notice.ref_type, notice.ref_uuid) == ("role_request", request_uuid)
    assert notice.title == "你的「政府單位人員」申請沒有通過"
    assert (notice.body, notice.priority) == (body, "medium")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "skip", "limit", "applicants"),
    [
        (None, 0, 100, ["甲", "乙", "丙"]),
        ("pending", 0, 100, ["甲", "丙"]),
        ("withdrawn", 0, 100, ["乙"]),
        (None, 1, 1, ["乙"]),
    ],
)
async def test_the_review_list_is_oldest_first_and_names_the_applicant(db, status, skip, limit, applicants):
    """A queue: whoever applied first is reviewed first (2026-09-29). Filter by status, page by skip."""
    for name in ("甲", "乙", "丙"):
        citizen = await _citizen(db, name)
        request = await _submit(db, citizen)
        if name == "乙":
            await _withdraw(db, citizen, request.uuid)

    entries = await role_request.list_for_review(db, status=status, skip=skip, limit=limit)

    assert [entry.applicant_name for entry in entries] == applicants
    assert all(entry.request.reason == REASON for entry in entries)


_NOT_OPEN_YET = "Approving government and NGO applications is not available yet"


@pytest.mark.asyncio
async def test_an_approved_data_auditor_keeps_user_beside_the_new_role(db):
    """ADR-288: approval adds `data_auditor` and leaves `user`, so nothing signs them out."""
    reviewer = await _reviewer(db)
    auditor_role = await _role(db, "data_auditor", {})
    citizen = await _citizen(db)
    reviewer_uuid, auditor_role_uuid, citizen_uuid = reviewer.uuid, auditor_role.uuid, citizen.uuid
    request = await _submit(db, citizen, "data_auditor")

    approved = await _approve(db, reviewer, request.uuid, note="  歡迎加入資料檢核  ")

    assert approved.status == "approved"
    assert (approved.reviewed_by, approved.review_note) == (reviewer_uuid, "歡迎加入資料檢核")
    assert approved.granted_role_uuid == auditor_role_uuid
    assert approved.closed_at is not None
    assert await _platform_roles(db, citizen_uuid) == ["data_auditor", "user"]
    state = await _state(db, citizen)
    assert (state.has_backoffice_identity, state.can_apply) == (True, False)


@pytest.mark.asyncio
@pytest.mark.parametrize("requested_role", ["government", "ngo"])
async def test_a_government_or_ngo_application_cannot_be_approved_yet(db, requested_role):
    """ADR-288: which team they join is not decided yet, so it stays pending."""
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _submit(db, citizen, requested_role)
    request_uuid = request.uuid

    with pytest.raises(ValueError, match=f"^{_NOT_OPEN_YET}$"):
        await _approve(db, reviewer, request_uuid)
    [still] = (await _state(db, citizen)).requests
    assert still.status == "pending"
    assert await _platform_roles(db, citizen_uuid) == ["user"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["approved", "rejected", "withdrawn"])
async def test_a_closed_application_cannot_be_approved(db, status):
    """A decision, once made, stands; so does a withdrawal. The back office answers 409."""
    reviewer = await _reviewer(db)
    await _role(db, "data_auditor", {})
    citizen = await _citizen(db)
    request = await _submit(db, citizen)
    request_uuid = request.uuid
    request.status = status  # arranging state only
    await db.commit()

    with pytest.raises(role_request.RoleRequestConflictError, match="^Role request is no longer pending$"):
        await _approve(db, reviewer, request_uuid)
    [still] = (await _state(db, citizen)).requests
    assert still.status == status


@pytest.mark.asyncio
async def test_approving_an_application_that_does_not_exist_is_not_found(db):
    """The back office answers 404."""
    reviewer = await _reviewer(db)

    with pytest.raises(role_request.RoleRequestNotFoundError, match="^Role request not found$"):
        await _approve(db, reviewer, uuid.uuid4())


@pytest.mark.asyncio
async def test_only_a_reviewer_can_approve(db):
    """Above all not the applicant: approving your own application would be self-service."""
    await _role(db, "data_auditor", {})
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _submit(db, citizen)
    request_uuid = request.uuid

    with pytest.raises(HTTPException) as refused:
        await _approve(db, citizen, request_uuid)
    assert refused.value.status_code == 403
    assert await _platform_roles(db, citizen_uuid) == ["user"]


@pytest.mark.asyncio
async def test_the_applicant_hears_they_were_approved(db):
    """ADR-288, in the prototype's words: nothing was taken away, so there is no need to sign in again."""
    reviewer = await _reviewer(db)
    await _role(db, "data_auditor", {})
    citizen = await _citizen(db)
    citizen_uuid = citizen.uuid
    request = await _submit(db, citizen, "data_auditor")
    request_uuid = request.uuid

    await _approve(db, reviewer, request_uuid)

    [notice] = await _notices(db, "role_request_approved")
    assert notice.recipient_uuid == citizen_uuid
    assert (notice.ref_type, notice.ref_uuid) == ("role_request", request_uuid)
    assert notice.title == "你的「資料檢核員」申請通過了"
    assert (notice.body, notice.priority) == ("右上角會出現「前往後台」，不需要重新登入。", "high")


@pytest.mark.asyncio
async def test_an_approval_and_a_withdrawal_sent_together_settle_one_way(db):
    """ADR-287: whichever reaches the row first wins and the other is refused; nothing is half done.

    Both lock the row FOR UPDATE, so the later one waits for the earlier to commit and then
    finds it no longer pending. Either way the grant and the status agree: approved means
    data_auditor was granted in the same commit, withdrawn means it never was.
    """
    await _role(db, "data_auditor", {})
    reviewer = await _reviewer(db)
    citizen = await _citizen(db)
    reviewer_uuid, citizen_uuid = str(reviewer.uuid), str(citizen.uuid)
    request = await _submit(db, citizen)
    request_uuid = request.uuid

    engines = [create_async_engine(TEST_DB_URL) for _ in range(2)]
    sessions = [sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)() for engine in engines]
    try:

        async def acting(session, user_uuid, identity) -> User:
            actor = await session.get(User, user_uuid)
            actor.active_identity = identity
            return actor

        async def approve(session):
            actor = await acting(session, reviewer_uuid, reviewer.active_identity)
            await role_request.approve(session, actor=actor, request_uuid=request_uuid, note=None)

        async def withdraw(session):
            actor = await acting(session, citizen_uuid, citizen.active_identity)
            await role_request.withdraw(session, actor=actor, request_uuid=request_uuid)

        outcomes = await asyncio.gather(approve(sessions[0]), withdraw(sessions[1]), return_exceptions=True)
    finally:
        for session in sessions:
            await session.close()
        for engine in engines:
            await engine.dispose()

    refused = [outcome for outcome in outcomes if isinstance(outcome, role_request.RoleRequestConflictError)]
    assert len(refused) == 1, f"expected exactly one refusal, got {outcomes}"
    db.expire_all()  # the other sessions changed the row; read it afresh
    [final] = (await _state(db, citizen)).requests
    granted = "data_auditor" in await _platform_roles(db, citizen_uuid)
    assert (final.status, granted) in {("approved", True), ("withdrawn", False)}


@pytest.mark.asyncio
async def test_an_applicant_who_already_became_a_data_auditor_is_not_granted_twice(db):
    """Between applying and approval an admin may have granted the role another way."""
    reviewer = await _reviewer(db)
    auditor_role = await _role(db, "data_auditor", {})
    citizen = await _citizen(db)
    auditor_role_uuid, citizen_uuid = auditor_role.uuid, citizen.uuid
    request = await _submit(db, citizen)
    request_uuid = request.uuid
    db.add(UserRoleAssign(user_uuid=citizen_uuid, role_uuid=auditor_role_uuid))
    await db.commit()

    approved = await _approve(db, reviewer, request_uuid)

    assert approved.status == "approved"
    assert await _platform_roles(db, citizen_uuid) == ["data_auditor", "user"]
