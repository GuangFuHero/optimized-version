"""Contact endpoints: verify-then-attach add, verify, and resend for the current account."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.redis import get_redis
from app.messaging.email import build_verification_email, get_email_sender
from app.messaging.sms import build_verification_sms, get_sms_sender
from app.models.auth import User
from app.repositories.auth_repository import contact_repository
from app.repositories.verification_repository import VerificationRepository
from app.schemas.auth import AddContactRequest, VerifyContactRequest

from .deps import _normalize_identifier, get_rate_limiter

router = APIRouter()


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
    """Start adding a contact to the current account: send a 6-digit code (verify-then-attach)."""
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid identifier") from err
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"{body.type.capitalize()} already in use")
    if await contact_repository.user_has_contact_type(
            db, user_uuid=str(current_user.uuid), type_=body.type):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail=f"This account already has a verified {body.type}")
    code = await VerificationRepository(redis).issue_contact_verification(
        user_uuid=str(current_user.uuid), type_=body.type, value=ident)
    if body.type == "email":
        subject, content = build_verification_email(code)
        await email_sender.send(ident, subject, content)
    else:
        await sms_sender.send(ident, build_verification_sms(code))
    return {"detail": "Verification code sent"}


@router.post("/contacts/verify", dependencies=[Depends(get_rate_limiter(10, 60))])
async def verify_contact(
        body: VerifyContactRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Verify a 6-digit code and attach the verified contact to the current account."""
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code") from err
    # Conflict checks BEFORE consuming the code: a 409 must not burn the user's pending code (they keep
    # the code and can retry once the conflict clears). Order: normalize (422/400) → 409 → consume (400).
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use")
    if await contact_repository.user_has_contact_type(
            db, user_uuid=str(current_user.uuid), type_=body.type):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail=f"This account already has a verified {body.type}")
    payload = await VerificationRepository(redis).consume_contact_verification(
        user_uuid=str(current_user.uuid), type_=body.type, value=ident, code=body.code)
    if payload is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")
    try:
        await contact_repository.create_verified(
            db, user_uuid=current_user.uuid, type_=body.type, value=ident)
    except IntegrityError as err:  # F-C: rare race — value claimed between the check above and the insert
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use") from err
    return {"detail": "Contact added"}


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
    """Resend the contact-verification code for a still-pending add (rate limited)."""
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid identifier") from err
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use")
    if await contact_repository.user_has_contact_type(
            db, user_uuid=str(current_user.uuid), type_=body.type):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail=f"This account already has a verified {body.type}")
    code = await VerificationRepository(redis).reissue_contact_verification(
        user_uuid=str(current_user.uuid), type_=body.type, value=ident)
    if code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No pending contact verification")
    if body.type == "email":
        subject, content = build_verification_email(code)
        await email_sender.send(ident, subject, content)
    else:
        await sms_sender.send(ident, build_verification_sms(code))
    return {"detail": "Verification code re-sent"}
