"""Role requests: a citizen applies to become back-office staff (Spec/019, AC-FEAT-002)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.rbac import UserRoleAssign
from app.models.role_request import (
    CONTACT_MAX_LENGTH,
    REASON_MAX_LENGTH,
    REQUESTED_ROLES,
    REVIEW_NOTE_MAX_LENGTH,
    RoleRequest,
)
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.auth_repository import role_repository
from app.services.auth_account import DEFAULT_PLATFORM_ROLE
from app.services.authz import require_scope
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

_ONE_PENDING_INDEX = "uq_role_requests_one_pending"

# The applicant-facing names, as the application form shows them (site-actions.jsx).
ROLE_LABELS = {"government": "政府單位人員", "ngo": "社福團體人員", "data_auditor": "資料檢核員"}

# What a turned-down applicant reads when the reviewer left no reply (ADR-287; wg-bridge.js).
_REJECTED_WITHOUT_REPLY = "你原本的權限沒有任何改變，可以再送一次申請。"
# What an approved data auditor reads. Approval adds an identity, so nobody is signed out (ADR-288).
_APPROVED_DATA_AUDITOR = "右上角會出現「前往後台」，不需要重新登入。"

# The one application that can be approved yet (ADR-288). The requested role and the platform role
# it grants share the name, unlike `government` / `ngo`, which name a type of team.
_DATA_AUDITOR = "data_auditor"


class RoleRequestNotFoundError(ValueError):
    """No such application, or not one the caller may act on. REST answers 404."""


class RoleRequestConflictError(ValueError):
    """The application cannot be decided as asked. REST answers 409.

    It has already left `pending`, or its applicant has gained another back-office identity since
    sending it.
    """


@dataclass
class ReviewEntry:
    """One row of the review list: the application and the name of whoever sent it."""

    request: RoleRequest
    applicant_name: str


@dataclass
class RoleRequestState:
    """What the 申請成為後台人員 entry and its drawer need to know about the caller."""

    # Any identity beyond the platform `user` — another platform role or any team role. The
    # entry offers 前往後台 to these and 申請成為後台人員 to everyone else (AC-RE-101).
    has_backoffice_identity: bool
    can_apply: bool
    requests: list[RoleRequest]


def _checked_application(requested_role: str, reason: str, contact: str | None) -> tuple[str, str | None]:
    """Refuse what the table's CHECKs would, with messages a caller can act on; return trimmed text.

    The CHECKs stay as the backstop, but a violation reaching them surfaces as a driver error
    that GraphQL masks to "Unexpected error." — so every one of them is checked here first.
    """
    if requested_role not in REQUESTED_ROLES:
        raise ValueError(f"Cannot apply for {requested_role}")
    reason = reason.strip()
    if not reason:
        raise ValueError("Reason is required")
    if len(reason) > REASON_MAX_LENGTH:
        raise ValueError(f"Reason must be at most {REASON_MAX_LENGTH} characters")
    contact = (contact or "").strip() or None
    if contact is not None and len(contact) > CONTACT_MAX_LENGTH:
        raise ValueError(f"Contact must be at most {CONTACT_MAX_LENGTH} characters")
    return reason, contact


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
    db: AsyncSession, *, actor: User, requested_role: str, reason: str, contact: str | None
) -> RoleRequest:
    """File an application for review. It stays `pending` until decided or withdrawn."""
    await require_scope(actor, Perm.ROLE_REQUEST_ADD, db)
    reason, contact = _checked_application(requested_role, reason, contact)
    if await _has_backoffice_identity(db, actor.uuid):
        raise ValueError("Only an account without a back-office identity can apply")
    # Read before committing: the session expires `actor` on commit, and async SQLAlchemy cannot
    # lazily reload it afterwards.
    applicant_uuid, applicant_name = actor.uuid, actor.name
    request_uuid = uuid.uuid4()  # chosen here so the notice below can name it without a reload
    request = RoleRequest(
        uuid=request_uuid,
        requested_role=requested_role,
        reason=reason,
        contact=contact,
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
    await NotificationService.dispatch(
        db,
        event_type="role_request_submitted",
        title="有新的後台人員申請",
        body=f"{applicant_name} 申請成為「{ROLE_LABELS[requested_role]}」。",
        actor_uuid=applicant_uuid,
        ref_type="role_request",
        ref_uuid=request_uuid,
        explicit_recipients=reviewers,
    )
    # dispatch() commits, which expires `request` again.
    await db.refresh(request)
    return request


async def _lock_pending(
    db: AsyncSession, request_uuid: uuid.UUID, *, applicant_uuid: uuid.UUID | None = None
) -> RoleRequest:
    """Lock the application FOR UPDATE and check it is still pending.

    Every way out of `pending` goes through here, so a withdrawal and a decision sent together
    are settled one after the other and the later one is refused. `applicant_uuid` narrows the
    lookup to that applicant's own: anyone else's is not found, so its existence is not given away.
    """
    query = select(RoleRequest).where(RoleRequest.uuid == request_uuid)
    if applicant_uuid is not None:
        query = query.where(RoleRequest.created_by == applicant_uuid)
    request = await db.scalar(query.with_for_update().execution_options(populate_existing=True))
    if request is None:
        raise RoleRequestNotFoundError("Role request not found")
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


def _checked_note(note: str | None) -> str | None:
    """The reviewer's reply trimmed, or None if blank; refused if longer than the table's CHECK allows."""
    note = (note or "").strip() or None
    if note is not None and len(note) > REVIEW_NOTE_MAX_LENGTH:
        raise ValueError(f"Note must be at most {REVIEW_NOTE_MAX_LENGTH} characters")
    return note


async def reject(db: AsyncSession, *, actor: User, request_uuid: uuid.UUID, note: str | None) -> RoleRequest:
    """Turn a pending application down and tell the applicant, with the reply if there is one."""
    await require_scope(actor, Perm.ROLE_REQUEST_REVIEW, db)
    note = _checked_note(note)
    reviewer_uuid = actor.uuid  # read before the commit expires `actor`
    request = await _lock_pending(db, request_uuid)
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
        body=note or _REJECTED_WITHOUT_REPLY,
        actor_uuid=reviewer_uuid,
        ref_type="role_request",
        ref_uuid=request_uuid,
        explicit_recipients=[applicant_uuid],
    )
    # dispatch() commits, which expires `request` again.
    await db.refresh(request)
    return request


async def approve(db: AsyncSession, *, actor: User, request_uuid: uuid.UUID, note: str | None) -> RoleRequest:
    """Grant what a pending application asked for and tell the applicant (ADR-288).

    Only a data auditor can be approved yet: which team a government or NGO applicant joins
    is still to be decided, so those are refused and stay pending.
    Approval *adds* the platform `data_auditor` grant beside `user` rather than calling
    `assign_role`, which would replace it: the site acts as `user` (ADR-289), and an added
    identity signs nobody out, since ADR-096 refuses only one that is gone. The grant and the
    new status are one commit, so a withdrawal racing this one finds both or neither.

    Days can pass between sending and deciding. An applicant who has since become a super admin,
    or joined a team, is refused and the application stays pending for the reviewer to reject:
    granting would leave a third platform role (ADR-294) or a team identity beside it, and an
    account holding either could not have applied (AC-RE-101).
    """
    await require_scope(actor, Perm.ROLE_REQUEST_REVIEW, db)
    note = _checked_note(note)
    reviewer_uuid = actor.uuid  # read before the commit expires `actor`
    request = await _lock_pending(db, request_uuid)
    if request.requested_role != _DATA_AUDITOR:
        raise ValueError("Approving government and NGO applications is not available yet")
    applicant_uuid = request.created_by
    if await _has_backoffice_identity(db, applicant_uuid, besides=_DATA_AUDITOR):
        raise RoleRequestConflictError("The applicant has another back-office identity now")
    role = await role_repository.get_by_name(db, _DATA_AUDITOR)
    if role is None:
        raise RuntimeError("The data_auditor role is missing: run scripts/seed_rbac.py")
    role_uuid = role.uuid
    # Nothing to add if an admin granted the role another way since the application was sent.
    await db.execute(
        insert(UserRoleAssign)
        .values(user_uuid=applicant_uuid, role_uuid=role_uuid, team_uuid=None, role_kind="platform")
        .on_conflict_do_nothing(
            index_elements=["user_uuid", "role_uuid"], index_where=text("team_uuid IS NULL")
        )
    )
    request.status = "approved"
    request.reviewed_by = reviewer_uuid
    request.review_note = note
    request.granted_role_uuid = role_uuid
    request.closed_at = datetime.now(UTC)
    label = ROLE_LABELS[request.requested_role]
    await db.commit()

    await NotificationService.dispatch(
        db,
        event_type="role_request_approved",
        title=f"你的「{label}」申請通過了",
        body=_APPROVED_DATA_AUDITOR,
        priority="high",
        actor_uuid=reviewer_uuid,
        ref_type="role_request",
        ref_uuid=request_uuid,
        explicit_recipients=[applicant_uuid],
    )
    # dispatch() commits, which expires `request` again.
    await db.refresh(request)
    return request


async def list_for_review(
    db: AsyncSession, *, status: str | None, skip: int, limit: int
) -> list[ReviewEntry]:
    """Applications oldest first, so whoever applied first is reviewed first (2026-09-29).

    The caller gates this on role_request.review: reason and contact are the applicant's own
    words and often name their unit and phone number (ADR-287).
    """
    query = select(RoleRequest, User.name).join(User, User.uuid == RoleRequest.created_by)
    if status is not None:
        query = query.where(RoleRequest.status == status)
    rows = await db.execute(
        query.order_by(RoleRequest.created_at, RoleRequest.uuid).offset(skip).limit(limit)
    )
    return [ReviewEntry(request=request, applicant_name=name) for request, name in rows.all()]


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
    return RoleRequestState(
        has_backoffice_identity=has_backoffice_identity,
        can_apply=switched_on and not has_backoffice_identity and not pending,
        requests=requests,
    )
