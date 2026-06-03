"""Authentication endpoints: user registration, login, and salt retrieval."""

import os
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_limiter.depends import RateLimiter
from pyrate_limiter import Duration, Limiter, Rate
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.email import build_verification_email, get_email_sender
from app.core.google_verifier import (
    GoogleTokenVerificationError,
    GoogleTokenVerifier,
    get_google_verifier,
)
from app.core.normalize import normalize_email, normalize_phone
from app.core.redis import get_redis
from app.core.sms import build_verification_sms, get_sms_sender
from app.models.auth import User
from app.repositories.auth_repository import (
    contact_repository,
    identity_repository,
    user_repository,
)
from app.repositories.session_repository import (
    InvalidRefreshToken,
    RefreshTokenReuse,
    SessionRepository,
)
from app.repositories.verification_repository import VerificationRepository
from app.schemas.auth import (
    AddContactRequest,
    ChangePasswordRequest,
    GoogleSsoRequest,
    LinkGoogleRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    SetPasswordRequest,
    TokenPair,
    UserSaltResponse,
    VerifyContactRequest,
    VerifyRequest,
)
from app.services.auth_account import create_account

router = APIRouter()


def _normalize_identifier(type_: str, value: str) -> str:
    """Normalize an email or phone identifier; raise ValueError if invalid for the type."""
    return normalize_email(value) if type_ == "email" else normalize_phone(value)


# 頻率限制包裝器：支援測試環境繞過
def get_rate_limiter(times: int, seconds: int):
    """Build a rate-limiter FastAPI dependency that is bypassed in testing."""
    _limiter = Limiter(Rate(times, Duration.SECOND * seconds))
    
    async def dynamic_rate_limiter(request: Request, response: Response):
        # 只有在非測試環境下才執行限制
        if os.getenv("ENV") != "testing":
            limiter_dep = RateLimiter(_limiter)
            return await limiter_dep(request, response)
        return None

    return dynamic_rate_limiter


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
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid identifier") from err

    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"{body.type.capitalize()} already in use")

    password_hash = security.get_password_hash(body.password, body.salt_frontend)
    code = await VerificationRepository(redis).issue_registration(
        type_=body.type, value=ident, password_hash=password_hash, name=body.name
    )
    if body.type == "email":
        subject, content = build_verification_email(code)
        await email_sender.send(ident, subject, content)
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
    try:
        ident = _normalize_identifier(body.type, body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code") from err
    payload = await VerificationRepository(redis).consume_registration(
        type_=body.type, value=ident, code=body.code
    )
    if payload is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")
    # guard a stale pending (pre-required-name deploy) that has no usable name: the pending is already
    # consumed (burned) above, so the user simply re-registers instead of hitting a 500 on the NOT NULL
    name = payload.get("name")
    if not name or not str(name).strip():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Registration expired, please register again"
        )
    # re-check the race: someone may have verified the same identifier between register and now
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use")
    user = await create_account(
        db, contact_type=body.type, value=ident, password_hash=payload["password_hash"],
        name=name,
    )
    device = request.headers.get("user-agent", "unknown")
    sid, refresh_token = await SessionRepository(redis).create_session(str(user.uuid), device)
    access_token = security.create_access_token(data={"sub": str(user.uuid)}, sid=sid)
    return TokenPair(access_token=access_token, refresh_token=refresh_token,
                     expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


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
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid identifier") from err
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        # already a real account → nothing to resend; do not leak beyond the register 409 policy
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use")
    code = await VerificationRepository(redis).reissue_registration(type_=body.type, value=ident)
    if code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No pending registration")
    if body.type == "email":
        subject, content = build_verification_email(code)
        await email_sender.send(ident, subject, content)
    else:
        await sms_sender.send(ident, build_verification_sms(code))
    return {"detail": "Verification code re-sent"}


@router.post("/login",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def login(
        request: Request,
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Email/phone + password login: contact → user → password identity → verify."""
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )
    raw = form_data.username
    user = None
    for type_, normalizer in (("email", normalize_email), ("phone", normalize_phone)):
        try:
            ident = normalizer(raw)
        except ValueError:
            continue
        user = await contact_repository.get_user_by_contact(db, type_=type_, value=ident)
        if user:
            break
    if user is None:
        raise cred_exc
    identity = await identity_repository.get_password_identity(db, str(user.uuid))
    if identity is None or not security.verify_password(form_data.password, identity.password_hash):
        raise cred_exc
    await user_repository.update(db, db_obj=user, obj_in={"last_login_at": datetime.now(UTC)})
    device = request.headers.get("user-agent", "unknown")
    sid, refresh_token = await SessionRepository(redis).create_session(str(user.uuid), device)
    access_token = security.create_access_token(data={"sub": str(user.uuid)}, sid=sid)
    return TokenPair(access_token=access_token, refresh_token=refresh_token,
                     expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/sso/google", response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def sso_google(
        body: GoogleSsoRequest,
        request: Request,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        verifier: GoogleTokenVerifier = Depends(get_google_verifier),
):
    """Verify a Google id_token; log in an existing google identity or create the account on first login."""
    try:
        gid = await verifier.verify(body.id_token)
    except GoogleTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from err

    identity = await identity_repository.get_by_provider_subject(db, provider="google", subject=gid.sub)
    if identity is None:
        if not gid.email_verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Google email not verified")
        try:
            email = normalize_email(gid.email)
        except ValueError as err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Google email not verified") from err
        if await contact_repository.is_value_taken(db, type_="email", value=email):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Email already in use; log in and link Google in settings",
            )
        name = gid.name or email.split("@")[0]
        try:
            user = await create_account(
                db, name=name, provider="google", provider_subject=gid.sub,
                contact_type="email", value=email,
            )
        except IntegrityError as err:  # concurrent first-login race
            await db.rollback()
            identity = await identity_repository.get_by_provider_subject(
                db, provider="google", subject=gid.sub)
            if identity is None:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="Email already in use; log in and link Google in settings",
                ) from err
            user = await user_repository.get_by_uuid(db, identity.user_uuid)
    else:
        user = await user_repository.get_by_uuid(db, identity.user_uuid)

    await user_repository.update(db, db_obj=user, obj_in={"last_login_at": datetime.now(UTC)})
    device = request.headers.get("user-agent", "unknown")
    sid, refresh_token = await SessionRepository(redis).create_session(str(user.uuid), device)
    access_token = security.create_access_token(data={"sub": str(user.uuid)}, sid=sid)
    return TokenPair(access_token=access_token, refresh_token=refresh_token,
                     expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.post("/link/google", status_code=status.HTTP_200_OK,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def link_google(
        body: LinkGoogleRequest,
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        verifier: GoogleTokenVerifier = Depends(get_google_verifier),
):
    """Attach a verified Google identity to the current account (login method only; no contact change)."""
    try:
        gid = await verifier.verify(body.id_token)
    except GoogleTokenVerificationError as err:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from err

    # this Google sub already bound somewhere?
    existing = await identity_repository.get_by_provider_subject(db, provider="google", subject=gid.sub)
    if existing is not None:
        if str(existing.user_uuid) == str(current_user.uuid):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Google account already linked")
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail="This Google account is already linked to another account")
    # current user already has a (different) google identity?
    if await identity_repository.get_user_identity(db, str(current_user.uuid), "google") is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Google account already linked")
    try:
        await identity_repository.create(db, obj_in={
            "user_uuid": current_user.uuid, "provider": "google", "provider_subject": gid.sub,
        })
    except IntegrityError as err:  # concurrent link race
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already linked") from err
    return {"detail": "Google account linked"}


@router.post("/refresh",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def refresh(
        body: RefreshRequest,
        redis=Depends(get_redis),
):
    """以 refresh token 換發新的 access token，並 rotate refresh token。"""
    repo = SessionRepository(redis)
    try:
        sid, user_uuid, new_refresh = await repo.rotate(body.refresh_token)
    except (InvalidRefreshToken, RefreshTokenReuse) as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    access_token = security.create_access_token(data={"sub": user_uuid}, sid=sid)
    return TokenPair(
        access_token=access_token, refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
        session=Depends(security.get_current_session),
        redis=Depends(get_redis),
):
    """登出：撤銷該使用者的所有 session（全域登出）。"""
    user_uuid, _sid = session
    await SessionRepository(redis).revoke_all_for_user(user_uuid)


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
    payload = await VerificationRepository(redis).consume_contact_verification(
        user_uuid=str(current_user.uuid), type_=body.type, value=ident, code=body.code)
    if payload is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")
    if await contact_repository.is_value_taken(db, type_=body.type, value=ident):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already in use")
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
