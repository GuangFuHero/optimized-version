"""Role requests: a citizen applies to become back-office staff (Spec/019, AC-FEAT-002)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.core.security import resolve_scope
from app.models.auth import User
from app.models.role_request import (
    CONTACT_MAX_LENGTH,
    REASON_MAX_LENGTH,
    REQUESTED_ROLES,
    REVIEW_NOTE_MAX_LENGTH,
    RoleRequest,
)
from app.repositories.active_identity_repository import active_identity_repository
from app.services.auth_account import DEFAULT_PLATFORM_ROLE
from app.services.authz import require_scope
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

_ONE_PENDING_INDEX = "uq_role_requests_one_pending"

# The applicant-facing names, as the application form shows them (site-actions.jsx).
ROLE_LABELS = {"government": "政府單位人員", "ngo": "社福團體人員", "data_auditor": "資料檢核員"}

# Q6: what a turned-down applicant reads when the reviewer left no reply (wg-bridge.js).
_REJECTED_WITHOUT_REPLY = "你原本的權限沒有任何改變，可以再送一次申請。"


class RoleRequestNotFoundError(ValueError):
    """No such application, or not one the caller may act on. REST answers 404."""


class RoleRequestConflictError(ValueError):
    """The application has already left `pending`. REST answers 409."""


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


async def _has_backoffice_identity(db: AsyncSession, user_uuid) -> bool:
    """True if the account holds anything beyond the platform `user` role (AC-RE-101).

    Any other platform role, or any team role at all: a team identity already opens the back
    office, and joining a team goes by invitation rather than through this form.
    """
    identities = await active_identity_repository.list_for_user(db, str(user_uuid))
    return any(
        identity.team_uuid is not None or identity.role_name != DEFAULT_PLATFORM_ROLE
        for identity in identities
    )


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

    # Q9: tell whoever can decide it. The back office that shows this does not exist yet, but
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
    """Take back one's own pending application (Q10). Nobody is told.

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


async def list_for_review(
    db: AsyncSession, *, status: str | None, skip: int, limit: int
) -> list[ReviewEntry]:
    """Applications oldest first, so whoever applied first is reviewed first (2026-09-29).

    The caller gates this on role_request.review: reason and contact are the applicant's own
    words and often name their unit and phone number (Q11).
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
