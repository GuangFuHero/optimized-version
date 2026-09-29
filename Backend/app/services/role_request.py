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
from app.models.role_request import CONTACT_MAX_LENGTH, REASON_MAX_LENGTH, REQUESTED_ROLES, RoleRequest
from app.repositories.active_identity_repository import active_identity_repository
from app.services.auth_account import DEFAULT_PLATFORM_ROLE
from app.services.authz import require_scope
from app.services.notification_resolver import NotificationRecipientResolver
from app.services.notification_service import NotificationService

_ONE_PENDING_INDEX = "uq_role_requests_one_pending"

# The applicant-facing names, as the application form shows them (site-actions.jsx).
ROLE_LABELS = {"government": "政府單位人員", "ngo": "社福團體人員", "data_auditor": "資料檢核員"}


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


async def withdraw(db: AsyncSession, *, actor: User, request_uuid: uuid.UUID) -> RoleRequest:
    """Take back one's own pending application (Q10). Nobody is told.

    Asks only that the application is the caller's, not for role_request.add: pausing
    applications stops new ones and must not strand one already sent. Anyone else's is not
    found, so whether it exists is never given away. The row is locked, so a withdrawal and a
    decision sent together are settled one after the other and the later one is refused.
    """
    request = await db.scalar(
        select(RoleRequest)
        .where(RoleRequest.uuid == request_uuid, RoleRequest.created_by == actor.uuid)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if request is None:
        raise ValueError("Role request not found")
    if request.status != "pending":
        raise ValueError("Role request is no longer pending")
    request.status = "withdrawn"
    request.closed_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(request)
    return request


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
