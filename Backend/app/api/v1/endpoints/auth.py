"""Authentication endpoints: user registration, login, and salt retrieval."""

import os
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi_limiter.depends import RateLimiter
from pyrate_limiter import Duration, Limiter, Rate
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.email import build_verification_email, get_email_sender
from app.core.normalize import normalize_email
from app.core.redis import get_redis
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
    ChangePasswordRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    TokenPair,
    UserSaltResponse,
    VerifyEmailRequest,
)
from app.services.auth_account import create_password_account

router = APIRouter()


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
    """Return the frontend salt for an email's password identity, or a deterministic fake salt."""
    seed = value
    try:
        email = normalize_email(value)
        seed = email  # hash the normalized form so case/space variants collapse to one fake salt
        user = await contact_repository.get_user_by_contact(db, type_="email", value=email)
        if user is not None:
            identity = await identity_repository.get_password_identity(db, str(user.uuid))
            if identity and identity.password_hash:
                salt = security.parse_salt_frontend(identity.password_hash)
                if salt:
                    return {"salt_frontend": salt}
    except ValueError:
        pass  # malformed email → fall through to fake salt
    fake_salt = security.hashlib.sha256((seed + settings.SECRET_KEY).encode()).hexdigest()[:32]
    return {"salt_frontend": fake_salt}


@router.post("/register", status_code=status.HTTP_202_ACCEPTED,
             dependencies=[Depends(get_rate_limiter(3, 60))])
async def register(
        body: RegisterRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
        email_sender=Depends(get_email_sender),
):
    """Verify-then-create: store a pending registration in Redis and email a verification link.

    Never writes an unverified DB row. Phase 1 supports email only.
    """
    if body.type != "email":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Only email registration is supported")
    try:
        email = normalize_email(body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email") from err

    if await contact_repository.is_value_taken(db, type_="email", value=email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already in use")

    password_hash = security.get_password_hash(body.password, body.salt_frontend)
    token = await VerificationRepository(redis).issue_email_registration(
        email=email, password_hash=password_hash, name=body.name
    )
    verify_url = f"{settings.APP_BASE_URL}/verify-email?token={token}"
    subject, content = build_verification_email(verify_url)
    await email_sender.send(email, subject, content)
    return {"detail": "Verification email sent"}


@router.post("/verify-email", response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def verify_email(
        body: VerifyEmailRequest,
        request: Request,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Consume a pending registration, create the account, and issue a session (verify == login)."""
    payload = await VerificationRepository(redis).consume_email_registration(body.token)
    if payload is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="Invalid or expired verification token")
    email = payload["value"]
    # re-check the race: someone may have verified the same email between register and now
    if await contact_repository.is_value_taken(db, type_="email", value=email):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already in use")
    user = await create_password_account(
        db, email=email, password_hash=payload["password_hash"], name=payload.get("name")
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
):
    """Resend the verification link for a still-pending email registration (rate limited)."""
    if body.type != "email":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only email is supported")
    try:
        email = normalize_email(body.value)
    except ValueError as err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email") from err
    if await contact_repository.is_value_taken(db, type_="email", value=email):
        # already a real account → nothing to resend; do not leak beyond the register 409 policy
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already in use")
    token = await VerificationRepository(redis).reissue_email_registration(email)
    if token is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail="No pending registration for this email")
    verify_url = f"{settings.APP_BASE_URL}/verify-email?token={token}"
    subject, content = build_verification_email(verify_url)
    await email_sender.send(email, subject, content)
    return {"detail": "Verification email re-sent"}


@router.post("/login",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(5, 60))])
async def login(
        request: Request,
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Email + password login: contact → user → password identity → verify."""
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        email = normalize_email(form_data.username)
    except ValueError:
        raise cred_exc from None
    user = await contact_repository.get_user_by_contact(db, type_="email", value=email)
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
                            detail="No password set; use /auth/set-password (available in a later phase)")
    if not security.verify_password(body.old_password, identity.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect current password")
    new_hash = security.get_password_hash(body.new_password, body.salt_frontend)
    await identity_repository.update(db, db_obj=identity, obj_in={"password_hash": new_hash})
    await SessionRepository(redis).revoke_all_for_user(user_uuid)
