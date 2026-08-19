"""Contact endpoints: verify-then-attach add/replace, verify, resend and delete.

Thin per ADR-014/089: parse input, call `app.services.auth_contact`, map its errors onto
HTTP status codes. The branch-dense security logic (step-up, login-channel guard) lives in
the service so it can be tested without going through HTTP.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.redis import get_redis
from app.messaging.email import build_contact_verification_email, get_email_sender
from app.messaging.sms import build_verification_sms, get_sms_sender
from app.models.auth import User
from app.repositories.auth_repository import contact_repository
from app.repositories.verification_repository import VerificationRepository
from app.schemas.auth import AddContactRequest, VerifyContactRequest
from app.services import auth_contact as contact_service
from app.services.auth_contact import (
    ContactConflict,
    ContactNotFound,
    LastLoginChannel,
    StepUpFailed,
    StepUpRequired,
)

from .deps import _normalize_identifier, get_rate_limiter

router = APIRouter()

# Each use-case error maps to exactly one status code (ADR-086/088).
_STATUS_BY_ERROR = {
    ContactConflict: status.HTTP_409_CONFLICT,
    LastLoginChannel: status.HTTP_409_CONFLICT,
    ContactNotFound: status.HTTP_404_NOT_FOUND,
    StepUpRequired: status.HTTP_422_UNPROCESSABLE_ENTITY,
    StepUpFailed: status.HTTP_401_UNAUTHORIZED,
}


def _as_http(err: Exception) -> HTTPException:
    """Translate a contact use-case error into its HTTP equivalent."""
    return HTTPException(status_code=_STATUS_BY_ERROR[type(err)], detail=str(err))


def _normalized_or_422(type_: str, value: str) -> str:
    """Normalize an identifier, or 422."""
    try:
        return _normalize_identifier(type_, value)
    except ValueError as err:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid identifier"
        ) from err


@router.post("/contacts", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(get_rate_limiter(3, 60))])
async def add_contact(
        body: AddContactRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Start adding or replacing a contact: send a 6-digit code to the new value.

    Replacing an existing contact of the same type additionally requires step-up (ADR-086).
    For an SSO-only account, the first call without `step_up` is what delivers the code to
    the OLD channel, and answers 422 asking for it back.
    """
    ident = _normalized_or_422(body.type, body.value)
    try:
        await contact_service.start_contact_change(
            db, redis, actor=current_user, type_=body.type, value=ident,
            step_up=body.step_up, email_sender=email_sender, sms_sender=sms_sender,
        )
    except (ContactConflict, StepUpRequired, StepUpFailed) as err:
        raise _as_http(err) from err
    return {"detail": "Verification code sent"}


@router.post("/contacts/verify", dependencies=[Depends(get_rate_limiter(10, 60))])
async def verify_contact(
        body: VerifyContactRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Verify a 6-digit code and attach — or atomically swap in — the verified contact."""
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code") from err
    try:
        replaced = await contact_service.commit_contact_change(
            db, redis, actor=current_user, type_=body.type, value=ident, code=body.code,
            email_sender=email_sender, sms_sender=sms_sender,
        )
    except ContactConflict as err:
        raise _as_http(err) from err
    except ContactNotFound as err:  # a bad/expired code reads as 400, not 404
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(err)) from err
    except IntegrityError as err:  # rare race: value claimed between the check and the insert
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use") from err
    return {"detail": "Contact replaced" if replaced else "Contact added"}


@router.delete("/contacts/{type}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(get_rate_limiter(5, 60))])
async def delete_contact(
        type: str,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
):
    """Remove one of the caller's contacts, refusing to leave the account unreachable."""
    if type not in ("email", "phone"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid contact type")
    try:
        await contact_service.delete_contact(db, actor=current_user, type_=type)
    except (ContactNotFound, LastLoginChannel) as err:
        raise _as_http(err) from err
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/contacts/resend", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(get_rate_limiter(2, 60))])
async def resend_contact(
        body: AddContactRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Resend the contact-verification code for a still-pending add/replace (rate limited)."""
    ident = _normalized_or_422(body.type, body.value)
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use")
    code = await VerificationRepository(redis).reissue_contact_verification(
        user_uuid=str(current_user.uuid), type_=body.type, value=ident)
    if code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No pending contact verification")
    if body.type == "email":
        subject, html, text = build_contact_verification_email(code)
        await email_sender.send(ident, subject, html, text)
    else:
        await sms_sender.send(ident, build_verification_sms(code))
    return {"detail": "Verification code re-sent"}
