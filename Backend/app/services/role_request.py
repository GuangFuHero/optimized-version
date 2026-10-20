"""Role requests: applying to become back-office staff (Spec/019, AC-FEAT-002; Spec/026)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi import status as http_status
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.normalize import normalize_email
from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, active_team
from app.core.security import resolve_scope
from app.models.auth import User, UserContact
from app.models.rbac import UserRoleAssign
from app.models.role_request import (
    APPLICANT_NAME_MAX_LENGTH,
    REASON_MAX_LENGTH,
    REQUESTED_ROLES,
    REVIEW_NOTE_MAX_LENGTH,
    TEAM_NAME_MAX_LENGTH,
    RoleRequest,
)
from app.models.team import Team
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.auth_repository import role_repository
from app.repositories.team_repository import team_repository
from app.services.admin import DEFAULT_TEAM_ROLE, grant_team_role
from app.services.auth_account import DEFAULT_PLATFORM_ROLE
from app.services.authz import require_scope
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

_ONE_PENDING_INDEX = "uq_role_requests_one_pending"

# The applicant-facing names, as the application form shows them (site-actions.jsx).
ROLE_LABELS = {"government": "政府單位人員", "ngo": "社福團體人員", "data_auditor": "資料檢核員"}

# What an approved data auditor reads. Approval adds an identity, so nobody is signed out (ADR-288).
_APPROVED_DATA_AUDITOR = "右上角會出現「前往管理平台」，不需要重新登入。"

# The one application that can be approved yet (ADR-288). The requested role and the platform role
# it grants share the name, unlike `government` / `ngo`, which name a type of team.
_DATA_AUDITOR = "data_auditor"

# The team role a founder gets (ADR-350 point 6); the one a member gets is DEFAULT_TEAM_ROLE.
TEAM_ADMIN_ROLE = "admin"

# The team type each team identity picks from and founds (ADR-352 point 1).
TEAM_TYPE_FOR_ROLE = {"government": "gov", "ngo": "ngo"}


class RoleRequestNotFoundError(ValueError):
    """No such application, or not one the caller may act on. REST answers 404."""


class RoleRequestConflictError(ValueError):
    """The application cannot be decided as asked. REST answers 409.

    It has already left `pending`, or its applicant has gained another back-office identity since
    sending it.
    """


@dataclass
class ReviewEntry:
    """One row of the review list: the application, who sent it, and the team it names."""

    request: RoleRequest
    applicant_name: str
    team_name: str | None = None


# The kinds the review list filters on (Spec 026).
KINDS = ("member", "new_team", "data_auditor")


@dataclass
class ReviewerReach:
    """What a caller may review (ADR-354): everything, or member requests for some teams.

    `teams` is None for every team, else the team uuids their team.member.manage covers.
    """

    everything: bool
    teams: frozenset[str] | None = frozenset()


@dataclass
class RoleRequestState:
    """What the 申請成為後台人員 entry and its drawer need to know about the caller."""

    # Any identity beyond the platform `user` — another platform role or any team role. The
    # entry offers 前往後台 to these and 申請成為後台人員 to everyone else (AC-RE-101).
    has_backoffice_identity: bool
    can_apply: bool
    requests: list[RoleRequest]


@dataclass
class Target:
    """What a request asks to join (ADR-350 point 2): an existing team, a new one, or neither."""

    team: Team | None = None
    new_team_name: str | None = None


def _checked_text(reason: str, name: str) -> tuple[str, str]:
    """Refuse what the table's CHECKs would, with messages a caller can act on; return trimmed text.

    The CHECKs stay as the backstop, but a violation reaching them surfaces as a driver error
    that GraphQL masks to "Unexpected error." — so every one of them is checked here first.
    """
    reason = reason.strip()
    if not reason:
        raise ValueError("Reason is required")
    if len(reason) > REASON_MAX_LENGTH:
        raise ValueError(f"Reason must be at most {REASON_MAX_LENGTH} characters")
    name = name.strip()
    if not name:
        raise ValueError("Name is required")
    if len(name) > APPLICANT_NAME_MAX_LENGTH:
        raise ValueError(f"Name must be at most {APPLICANT_NAME_MAX_LENGTH} characters")
    return reason, name


async def _checked_target(
    db: AsyncSession, requested_role: str, team_uuid, new_team_name: str | None
) -> Target:
    """The team a request names, checked against its identity (ADR-350 point 2, ADR-352)."""
    if requested_role not in REQUESTED_ROLES:
        raise ValueError(f"Cannot apply for {requested_role}")
    new_team_name = (new_team_name or "").strip() or None
    if requested_role == _DATA_AUDITOR:
        if team_uuid is not None or new_team_name is not None:
            raise ValueError("A data auditor application names no team")
        return Target()
    if team_uuid is None and new_team_name is None:
        raise ValueError("Pick a team or name a new one")
    if team_uuid is not None and new_team_name is not None:
        raise ValueError("Pick a team or a new name, not both")
    if new_team_name is not None:
        if len(new_team_name) > TEAM_NAME_MAX_LENGTH:
            raise ValueError(f"Team name must be at most {TEAM_NAME_MAX_LENGTH} characters")
        if await team_repository.name_taken(db, new_team_name):
            raise ValueError("A team with this name already exists")
        return Target(new_team_name=new_team_name)
    team = await db.scalar(
        select(Team).where(
            Team.uuid == team_uuid,
            Team.delete_at.is_(None),
            Team.status == "active",
            Team.type == TEAM_TYPE_FOR_ROLE[requested_role],
        )
    )
    # Unknown, not active and the wrong type read the same: none of them can be joined.
    if team is None:
        raise ValueError("Team not found")
    return Target(team=team)


async def _verified_contact(db: AsyncSession, user_uuid, type_: str) -> str | None:
    """The account's verified contact of `type_`, normalized as stored, or None."""
    return await db.scalar(
        select(UserContact.value).where(
            UserContact.user_uuid == user_uuid, UserContact.type == type_, UserContact.verified.is_(True)
        )
    )


async def _applicant_contacts(db: AsyncSession, user_uuid, typed_email: str | None) -> tuple[str, str | None]:
    """Phone and email the request keeps (ADR-355 points 1–2).

    The phone must be a verified contact of the account; the site adds one through the contact
    flow first. The account's verified email wins over a typed one, which is optional.
    """
    phone = await _verified_contact(db, user_uuid, "phone")
    if phone is None:
        raise ValueError("A verified phone number is required")
    email = await _verified_contact(db, user_uuid, "email")
    if email is None and (typed_email or "").strip():
        try:
            email = normalize_email(typed_email)
        except ValueError as err:
            raise ValueError("Email is not valid") from err
    return phone, email


async def _is_member(db: AsyncSession, user_uuid, team_uuid) -> bool:
    """Whether the account holds any grant in the team — that is membership (ADR-072)."""
    found = await db.scalar(
        select(UserRoleAssign.uuid).where(
            UserRoleAssign.user_uuid == user_uuid, UserRoleAssign.team_uuid == team_uuid
        )
    )
    return found is not None


async def _has_backoffice_identity(db: AsyncSession, user_uuid, *, besides: str | None = None) -> bool:
    """True if the account holds anything beyond the platform `user` role (AC-RE-101).

    Any other platform role, or any team role at all: a team identity already opens the back
    office, and joining a team goes by invitation rather than through this form. `besides` leaves
    one more platform role out of the count, for approval to ask what else turned up meanwhile.
    """
    plain = {DEFAULT_PLATFORM_ROLE, besides}
    identities = await active_identity_repository.list_for_user(db, str(user_uuid))
    return any(identity.team_uuid is not None or identity.role_name not in plain for identity in identities)


async def submit(
    db: AsyncSession,
    *,
    actor: User,
    requested_role: str,
    reason: str,
    name: str,
    email: str | None = None,
    team_uuid=None,
    new_team_name: str | None = None,
    invite_uuid=None,
) -> RoleRequest:
    """File an application for review. It stays `pending` until decided or withdrawn.

    `government` / `ngo` name an existing team or a new one; `data_auditor` names neither
    (ADR-350). `invite_uuid` is set only by the invite path (ADR-353), which has already checked
    the invite and passes its team.
    """
    await require_scope(actor, Perm.ROLE_REQUEST_ADD, db)
    reason, name = _checked_text(reason, name)
    target = await _checked_target(db, requested_role, team_uuid, new_team_name)
    # ADR-351: a platform role still asks for no back-office identity at all (AC-RE-101); a team
    # request only asks that the applicant is not in that team already.
    if requested_role == _DATA_AUDITOR:
        if await _has_backoffice_identity(db, actor.uuid):
            raise ValueError("Only an account without a back-office identity can apply")
    elif target.team is not None and await _is_member(db, actor.uuid, target.team.uuid):
        raise ValueError("You are already a member of this team")
    phone, email = await _applicant_contacts(db, actor.uuid, email)
    # Read before committing: the session expires `actor` on commit, and async SQLAlchemy cannot
    # lazily reload it afterwards.
    applicant_uuid, applicant_name = actor.uuid, actor.name
    joined_team_uuid = target.team.uuid if target.team is not None else None
    team_name = target.team.name if target.team is not None else None
    request_uuid = uuid.uuid4()  # chosen here so the notice below can name it without a reload
    request = RoleRequest(
        uuid=request_uuid,
        requested_role=requested_role,
        reason=reason,
        team_uuid=joined_team_uuid,
        new_team_name=target.new_team_name,
        invite_uuid=invite_uuid,
        applicant_name=name,
        applicant_phone=phone,
        applicant_email=email,
        created_by=applicant_uuid,
    )
    db.add(request)
    try:
        await db.commit()
    except IntegrityError as exc:
        # AC-RE-106 is enforced by uq_role_requests_one_pending rather than by reading first,
        # so two tabs submitting at once cannot both get through. Any other violation is a bug.
        await db.rollback()
        if _ONE_PENDING_INDEX not in str(exc.orig):
            raise
        raise ValueError("You already have a pending request") from exc

    # Tell whoever can decide it (ADR-287). The back office that shows this does not exist yet, but
    # the notice is written now so nothing on the server has to change when it does.
    reviewers = await NotificationRecipientResolver.resolve_permission(db, Perm.ROLE_REQUEST_REVIEW.value)
    if team_name is not None:
        # The team's own admins decide it by default (ADMIN-027 review rules).
        team_admins = await NotificationRecipientResolver.resolve_team_admin(db, team_uuid=joined_team_uuid)
        reviewers = list(dict.fromkeys([*map(str, reviewers), *map(str, team_admins)]))
        body = f"{applicant_name} 申請加入「{team_name}」。"
    elif target.new_team_name is not None:
        body = f"{applicant_name} 申請成立新團隊「{target.new_team_name}」。"
    else:
        body = f"{applicant_name} 申請成為「{ROLE_LABELS[requested_role]}」。"
    await NotificationService.dispatch(
        db,
        event_type="role_request_submitted",
        title="有新的管理權限申請",
        body=body,
        actor_uuid=applicant_uuid,
        ref_type="role_request",
        ref_uuid=request_uuid,
        explicit_recipients=reviewers,
    )
    # dispatch() commits, which expires `request` again.
    await db.refresh(request)
    return request


async def _lock_pending(
    db: AsyncSession,
    request_uuid: uuid.UUID,
    *,
    applicant_uuid: uuid.UUID | None = None,
    reviewer: User | None = None,
) -> RoleRequest:
    """Lock the application FOR UPDATE and check it is still pending.

    Every way out of `pending` goes through here, so a withdrawal and a decision sent together
    are settled one after the other and the later one is refused. `applicant_uuid` narrows the
    lookup to that applicant's own: anyone else's is not found, so its existence is not given away.
    `reviewer` is checked before the status for the same reason: a request outside their reach is
    not found, whether or not it is still pending (ADR-354).
    """
    query = select(RoleRequest).where(RoleRequest.uuid == request_uuid)
    if applicant_uuid is not None:
        query = query.where(RoleRequest.created_by == applicant_uuid)
    request = await db.scalar(query.with_for_update().execution_options(populate_existing=True))
    if request is None:
        raise RoleRequestNotFoundError("Role request not found")
    if reviewer is not None:
        await _require_reviewer(db, reviewer, request)
    if request.status != "pending":
        raise RoleRequestConflictError("Role request is no longer pending")
    return request


async def withdraw(db: AsyncSession, *, actor: User, request_uuid: uuid.UUID) -> RoleRequest:
    """Take back one's own pending application (ADR-287). Nobody is told.

    Asks only that the application is the caller's, not for role_request.add: pausing
    applications stops new ones and must not strand one already sent.
    """
    request = await _lock_pending(db, request_uuid, applicant_uuid=actor.uuid)
    request.status = "withdrawn"
    request.closed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(request)
    return request


async def _reach(db: AsyncSession, actor: User) -> ReviewerReach | None:
    """What `actor` may review, or None if nothing (ADR-354).

    role_request.review reaches every request. team.member.manage reaches member requests:
    at `all` for every team, at `team` for the active identity's team. Approving someone into a
    team is adding a member to it, which the capability already allows.
    """
    if await resolve_scope(actor, Perm.ROLE_REQUEST_REVIEW, db) != Scope.NONE:
        return ReviewerReach(everything=True, teams=None)
    manage = await resolve_scope(actor, Perm.TEAM_MEMBER_MANAGE, db)
    if manage == Scope.ALL:
        return ReviewerReach(everything=False, teams=None)
    team_uuid = active_team(actor)
    if manage != Scope.NONE and team_uuid is not None:
        return ReviewerReach(everything=False, teams=frozenset({str(team_uuid)}))
    return None


def _forbidden() -> HTTPException:
    return HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Permission Denied.")


async def _require_reviewer(db: AsyncSession, actor: User, request: RoleRequest) -> None:
    """Refuse a decision the caller may not make.

    Nothing to review at all → 403. A request outside their reach → not found, so a team admin
    cannot learn of another team's requests or of new-team and data auditor ones (ADR-354).
    Checkpoint 2 for a member request goes through `require_scope`, as add_team_member's does.
    """
    reach = await _reach(db, actor)
    if reach is None:
        raise _forbidden()
    if reach.everything:
        return
    if request.team_uuid is None:
        raise RoleRequestNotFoundError("Role request not found")
    try:
        await require_scope(
            actor,
            Perm.TEAM_MEMBER_MANAGE,
            db,
            resource=SimpleNamespace(created_by=None, team_uuid=request.team_uuid, geometry=None),
        )
    except HTTPException as err:
        raise RoleRequestNotFoundError("Role request not found") from err


def _checked_note(note: str | None) -> str | None:
    """The reviewer's reply trimmed, or None if blank; refused if longer than the table's CHECK allows."""
    note = (note or "").strip() or None
    if note is not None and len(note) > REVIEW_NOTE_MAX_LENGTH:
        raise ValueError(f"Note must be at most {REVIEW_NOTE_MAX_LENGTH} characters")
    return note


async def reject(db: AsyncSession, *, actor: User, request_uuid: uuid.UUID, note: str | None) -> RoleRequest:
    """Turn a pending application down and tell the applicant why.

    The reason is required (BE-038 step 4), so the applicant always hears it.
    """
    if await _reach(db, actor) is None:
        raise _forbidden()
    note = _checked_note(note)
    if note is None:
        raise ValueError("A reason is required")
    reviewer_uuid = actor.uuid  # read before the commit expires `actor`
    request = await _lock_pending(db, request_uuid, reviewer=actor)
    request.status = "rejected"
    request.reviewed_by = reviewer_uuid
    request.review_note = note
    request.closed_at = datetime.now(UTC)
    applicant_uuid, label = request.created_by, ROLE_LABELS[request.requested_role]
    await db.commit()

    await NotificationService.dispatch(
        db,
        event_type="role_request_rejected",
        title=f"你的「{label}」申請沒有通過",
        body=note,
        actor_uuid=reviewer_uuid,
        ref_type="role_request",
        ref_uuid=request_uuid,
        explicit_recipients=[applicant_uuid],
    )
    # dispatch() commits, which expires `request` again.
    await db.refresh(request)
    return request


async def _grant_data_auditor(db: AsyncSession, applicant_uuid) -> str:
    """Add the platform `data_auditor` beside `user` (ADR-288); return the role's uuid.

    An applicant who has since become a super admin, or joined a team, is refused and the
    application stays pending for the reviewer to reject: granting would leave a third platform
    role (ADR-294) or a team identity beside it, and an account holding either could not have
    applied (AC-RE-101).
    """
    if await _has_backoffice_identity(db, applicant_uuid, besides=_DATA_AUDITOR):
        raise RoleRequestConflictError("The applicant has another back-office identity now")
    role = await role_repository.get_by_name(db, _DATA_AUDITOR)
    if role is None:
        raise RuntimeError("The data_auditor role is missing: run scripts/seed_rbac.py")
    # Nothing to add if an admin granted the role another way since the application was sent.
    await db.execute(
        insert(UserRoleAssign)
        .values(user_uuid=applicant_uuid, role_uuid=role.uuid, team_uuid=None, role_kind="platform")
        .on_conflict_do_nothing(
            index_elements=["user_uuid", "role_uuid"], index_where=text("team_uuid IS NULL")
        )
    )
    return role.uuid


async def _team_role(db: AsyncSession, name: str):
    role = await role_repository.get_by_name(db, name)
    if role is None or role.kind != "team":
        raise RuntimeError(f"The team role '{name}' is missing: run scripts/seed_rbac.py")
    return role


async def _join_existing_team(db: AsyncSession, request: RoleRequest) -> tuple[str, str, str]:
    """Add the applicant to the team as `member`; return (team uuid, team name, role uuid).

    Checked again here, since days can pass after sending: the team must still be active, and
    the applicant not already in it (ADR-351 point 2).
    """
    team = await db.scalar(
        select(Team).where(Team.uuid == request.team_uuid, Team.delete_at.is_(None), Team.status == "active")
    )
    if team is None:
        raise RoleRequestConflictError("The team cannot be joined now")
    if await _is_member(db, request.created_by, team.uuid):
        raise RoleRequestConflictError("The applicant is already a member of this team")
    role = await _team_role(db, DEFAULT_TEAM_ROLE)
    await grant_team_role(db, user_uuid=request.created_by, team_uuid=team.uuid, role=role)
    return team.uuid, team.name, role.uuid


async def _found_new_team(db: AsyncSession, request: RoleRequest) -> tuple[str, str, str]:
    """Create the team with the applicant as its `admin`; return (team uuid, name, role uuid).

    The name is checked again under a transaction-scoped advisory lock on it, so two approvals
    founding the same name at once cannot both succeed (ADR-352 point 3).
    """
    name = request.new_team_name
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(lower(btrim(:name))))"), {"name": name})
    if await team_repository.name_taken(db, name):
        raise RoleRequestConflictError("A team with this name already exists")
    team = Team(name=name, type=TEAM_TYPE_FOR_ROLE[request.requested_role], status="active")
    db.add(team)
    await db.flush()
    role = await _team_role(db, TEAM_ADMIN_ROLE)
    await grant_team_role(db, user_uuid=request.created_by, team_uuid=team.uuid, role=role)
    return team.uuid, team.name, role.uuid


async def approve(db: AsyncSession, *, actor: User, request_uuid: uuid.UUID, note: str | None) -> RoleRequest:
    """Grant what a pending application asked for and tell the applicant (ADR-288, ADR-350).

    A member request adds the applicant to the team as `member`; a new-team application creates
    the team with the applicant as its `admin`; a data auditor gains the platform role beside
    `user`. Every grant is an added identity, so nobody is signed out (ADR-096 refuses only one
    that is gone). The grant, the new status and `users.real_name` (ADR-355) are one commit, so a
    withdrawal racing this one finds all or none.
    """
    if await _reach(db, actor) is None:
        raise _forbidden()
    note = _checked_note(note)
    reviewer_uuid = actor.uuid  # read before the commit expires `actor`
    request = await _lock_pending(db, request_uuid, reviewer=actor)
    applicant_uuid, label = request.created_by, ROLE_LABELS[request.requested_role]
    team_name = None
    if request.requested_role == _DATA_AUDITOR:
        request.granted_role_uuid = await _grant_data_auditor(db, applicant_uuid)
        body = _APPROVED_DATA_AUDITOR
    elif request.team_uuid is None and request.new_team_name is None:
        # Sent before Spec 026, naming no team: nothing to grant (ADR-350 point 9).
        raise RoleRequestConflictError("This application names no team; the applicant should apply again")
    else:
        found = _join_existing_team if request.team_uuid is not None else _found_new_team
        request.granted_team_uuid, team_name, request.granted_role_uuid = await found(db, request)
        body = (
            f"你已加入「{team_name}」。{_APPROVED_DATA_AUDITOR}"
            if request.team_uuid is not None
            else f"「{team_name}」已建立，你是管理員，可以邀請其他人加入。{_APPROVED_DATA_AUDITOR}"
        )
    if request.applicant_name is not None:
        applicant = await db.get(User, applicant_uuid)
        applicant.real_name = request.applicant_name
    request.status = "approved"
    request.reviewed_by = reviewer_uuid
    request.review_note = note
    request.closed_at = datetime.now(UTC)
    await db.commit()

    await NotificationService.dispatch(
        db,
        event_type="role_request_approved",
        title=f"你的「{label}」申請通過了",
        body=body,
        priority="high",
        actor_uuid=reviewer_uuid,
        ref_type="role_request",
        ref_uuid=request_uuid,
        explicit_recipients=[applicant_uuid],
    )
    # dispatch() commits, which expires `request` again.
    await db.refresh(request)
    return request


def _kind_filter(kind: str):
    if kind == "member":
        return RoleRequest.team_uuid.is_not(None)
    if kind == "new_team":
        return RoleRequest.new_team_name.is_not(None)
    return RoleRequest.requested_role == _DATA_AUDITOR


async def list_for_review(
    db: AsyncSession,
    *,
    actor: User,
    status: str | None,
    kind: str | None = None,
    team_uuid=None,
    skip: int,
    limit: int,
) -> list[ReviewEntry]:
    """Applications oldest first, so whoever applied first is reviewed first (2026-09-29).

    Filtered to what the caller may decide (ADR-354): review holders see every request, a team
    admin the member requests for their team. Nothing to review at all is refused (403). The
    applicant's details are shown only to those who may decide (ADR-287 point 7).
    """
    reach = await _reach(db, actor)
    if reach is None:
        raise _forbidden()
    query = (
        select(RoleRequest, User.name, Team.name)
        .join(User, User.uuid == RoleRequest.created_by)
        .outerjoin(Team, Team.uuid == RoleRequest.team_uuid)
    )
    if not reach.everything:
        query = query.where(RoleRequest.team_uuid.is_not(None))
        if reach.teams is not None:
            query = query.where(RoleRequest.team_uuid.in_(reach.teams))
    if status is not None:
        query = query.where(RoleRequest.status == status)
    if kind is not None:
        query = query.where(_kind_filter(kind))
    if team_uuid is not None:
        query = query.where(RoleRequest.team_uuid == team_uuid)
    rows = await db.execute(
        query.order_by(RoleRequest.created_at, RoleRequest.uuid).offset(skip).limit(limit)
    )
    return [
        ReviewEntry(request=request, applicant_name=name, team_name=team_name)
        for request, name, team_name in rows.all()
    ]


async def my_role_requests(db: AsyncSession, *, actor: User) -> RoleRequestState:
    """The caller's own applications, newest first, and whether they may send another."""
    has_backoffice_identity = await _has_backoffice_identity(db, actor.uuid)
    requests = list(
        (
            await db.execute(
                select(RoleRequest)
                .where(RoleRequest.created_by == actor.uuid)
                .order_by(RoleRequest.created_at.desc(), RoleRequest.uuid.desc())
            )
        )
        .scalars()
        .all()
    )
    pending = any(request.status == "pending" for request in requests)
    # A super admin pauses applications by revoking role_request.add at runtime; the entry
    # should say so up front rather than let the form fail on submit.
    switched_on = await resolve_scope(actor, Perm.ROLE_REQUEST_ADD, db) != Scope.NONE
    # A back-office identity no longer rules applying out: a member of one team may ask to join
    # another (ADR-351). Only the data auditor choice still needs none, and submit says so.
    return RoleRequestState(
        has_backoffice_identity=has_backoffice_identity,
        can_apply=switched_on and not pending,
        requests=requests,
    )
