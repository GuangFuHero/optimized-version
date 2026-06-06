"""Password endpoints: change, first-set, forgot, and logged-out reset."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.redis import get_redis
from app.messaging.email import (
    build_password_reset_email,
    build_sso_notice_email,
    get_email_sender,
)
from app.messaging.sms import (
    build_password_reset_sms,
    build_sso_notice_sms,
    get_sms_sender,
)
from app.models.auth import User
from app.repositories.auth_repository import (
    contact_repository,
    identity_repository,
    user_repository,
)
from app.repositories.session_repository import SessionRepository
from app.repositories.verification_repository import VerificationRepository
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    SetPasswordRequest,
)

from .deps import _normalize_identifier, get_rate_limiter

router = APIRouter()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def change_password(
        body: ChangePasswordRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Verify old password against the password identity, write the new hash, revoke all sessions."""
    user_uuid = str(current_user.uuid)
    identity = await identity_repository.get_password_identity(db, user_uuid)
    if identity is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="No password set; use /auth/set-password")
    if not security.verify_password(body.old_password, identity.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect current password")
    new_hash = security.get_password_hash(body.new_password, body.salt_frontend)
    await identity_repository.update(db, db_obj=identity, obj_in={"password_hash": new_hash})
    await SessionRepository(redis).revoke_all_for_user(user_uuid)


@router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def set_password(
        body: SetPasswordRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
):
    """Create a first password identity for an SSO-only account (no old-password check)."""
    user_uuid = str(current_user.uuid)
    if await identity_repository.get_password_identity(db, user_uuid) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="Password already set; use /auth/change-password")
    password_hash = security.get_password_hash(body.password, body.salt_frontend)
    try:
        await identity_repository.create(db, obj_in={
            "user_uuid": current_user.uuid, "provider": "password", "password_hash": password_hash,
        })
    except IntegrityError as err:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Password already set") from err


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(get_rate_limiter(3, 60))])
async def forgot_password(
        body: ForgotPasswordRequest,
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Start a logged-out password reset. Always 202 (anti-enumeration).

    Real accounts with a password get a 6-digit reset code; SSO-only accounts get a generic
    "use third-party sign-in" notice. Unknown/unreachable identifiers get nothing. The HTTP response is
    identical in every branch; only the owner's inbox/phone sees what differs.

    Delivery is dispatched via BackgroundTasks so every branch returns in ~constant time — otherwise the
    awaited send on the account-exists branch leaks account existence via response latency once a real
    email/SMS provider is wired (the response body is already identical across branches).
    """
    generic = {"detail": "If an account exists, we've sent it instructions to reset the password"}
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid identifier") from err
    user = await contact_repository.get_user_by_contact(db, type_=body.type, value=ident)
    if user is None:
        return generic
    identity = await identity_repository.get_password_identity(db, str(user.uuid))
    if identity is not None:
        code = await VerificationRepository(redis).issue_password_reset(
            user_uuid=str(user.uuid), type_=body.type, value=ident)
        if body.type == "email":
            subject, content = build_password_reset_email(code)
            background_tasks.add_task(email_sender.send, ident, subject, content)
        else:
            background_tasks.add_task(sms_sender.send, ident, build_password_reset_sms(code))
    elif body.type == "email":
        subject, content = build_sso_notice_email()
        background_tasks.add_task(email_sender.send, ident, subject, content)
    else:
        background_tasks.add_task(sms_sender.send, ident, build_sso_notice_sms())
    return generic


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def reset_password(
        body: ResetPasswordRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Complete a logged-out reset: consume the code, write the new password, revoke all sessions."""
    bad = HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise bad from err
    payload = await VerificationRepository(redis).consume_password_reset(
        type_=body.type, value=ident, code=body.code)
    if payload is None:
        raise bad
    user = await user_repository.get_by_uuid(db, payload["user_uuid"])
    if user is None:
        raise bad
    user_uuid = str(user.uuid)  # capture before update() commits and expires the instance
    identity = await identity_repository.get_password_identity(db, user_uuid)
    if identity is None:
        raise bad  # defensive: SSO-only never receives a code
    new_hash = security.get_password_hash(body.new_password, body.salt_frontend)
    await identity_repository.update(db, db_obj=identity, obj_in={"password_hash": new_hash})
    await SessionRepository(redis).revoke_all_for_user(user_uuid)
