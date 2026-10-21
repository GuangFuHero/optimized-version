"""Registration endpoints: salt retrieval, verify-then-create register, and resend."""

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.normalize import normalize_email, normalize_phone
from app.core.redis import get_redis
from app.messaging.email import build_verification_email, get_email_sender
from app.messaging.sms import build_verification_sms, get_sms_sender
from app.repositories.auth_repository import (
    contact_repository,
    identity_repository,
)
from app.repositories.verification_repository import VerificationRepository
from app.schemas.auth import (
    RegisterRequest,
    ResendVerificationRequest,
    TokenPair,
    UserSaltResponse,
    VerifyRequest,
)
from app.services import auth_session

from .deps import _normalize_identifier, get_rate_limiter, issue_token_pair

router = APIRouter()


@router.get("/salt/{value}", response_model=UserSaltResponse,
            dependencies=[Depends(get_rate_limiter(10, 60))])
async def get_user_salt(value: str, db: AsyncSession = Depends(security.get_db)):
    """Return the frontend salt for an identifier's password identity, or a deterministic fake salt."""
    seed = value
    for type_, normalizer in (("email", normalize_email), ("phone", normalize_phone)):
        try:
            ident = normalizer(value)
        except ValueError:
            continue
        seed = ident  # hash the normalized form so case/format variants collapse to one fake salt
        user = await contact_repository.get_user_by_contact(db, type_=type_, value=ident)
        if user is not None:
            identity = await identity_repository.get_password_identity(db, str(user.uuid))
            if identity and identity.password_hash:
                salt = security.parse_salt_frontend(identity.password_hash)
                if salt:
                    return {"salt_frontend": salt}
        break  # matched a type (email or phone) but no account -> fake salt on normalized seed
    fake_salt = security.hashlib.sha256((seed + settings.SECRET_KEY).encode()).hexdigest()[:32]
    return {"salt_frontend": fake_salt}


@router.post("/register", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(get_rate_limiter(3, 60))])
async def register(
        body: RegisterRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Verify-then-create: store a pending registration and send a 6-digit code by email or SMS.

    Never writes an unverified DB row.
    """
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.IDENTIFIER_INVALID, detail="Invalid identifier",
        ) from err

    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise ApiError(
            status.HTTP_409_CONFLICT, ErrorCode.IDENTIFIER_TAKEN,
            detail=f"{body.type.capitalize()} already in use",
        )

    password_hash = security.get_password_hash(body.password, body.salt_frontend)
    code = await VerificationRepository(redis).issue_registration(
        type_=body.type, value=ident, password_hash=password_hash, name=body.name
    )
    if body.type == "email":
        subject, html, text = build_verification_email(code)
        await email_sender.send(ident, subject, html, text)
    else:
        await sms_sender.send(ident, build_verification_sms(code))
    return {"detail": "Verification code sent"}


@router.post("/verify", response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def verify(
        body: VerifyRequest,
        request: Request,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Consume a 6-digit code, create the account, and issue a session (verify == login)."""
    user = await auth_session.verify_registration(db, redis, body)
    return await issue_token_pair(redis, request, str(user.uuid))


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(get_rate_limiter(2, 60))])
async def resend_verification(
        body: ResendVerificationRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
        sms_sender=Depends(get_sms_sender),
):
    """Resend the 6-digit code for a still-pending email or phone registration (rate limited)."""
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY, ErrorCode.IDENTIFIER_INVALID, detail="Invalid identifier",
        ) from err
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        # already a real account → nothing to resend; do not leak beyond the register 409 policy
        raise ApiError(status.HTTP_409_CONFLICT, ErrorCode.IDENTIFIER_TAKEN, detail="Already in use")
    code = await VerificationRepository(redis).reissue_registration(type_=body.type, value=ident)
    if code is None:
        raise ApiError(
            status.HTTP_404_NOT_FOUND, ErrorCode.NO_PENDING_REGISTRATION, detail="No pending registration",
        )
    if body.type == "email":
        subject, html, text = build_verification_email(code)
        await email_sender.send(ident, subject, html, text)
    else:
        await sms_sender.send(ident, build_verification_sms(code))
    return {"detail": "Verification code re-sent"}
