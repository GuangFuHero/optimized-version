"""Session endpoints: password login, refresh-token rotation, and logout."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.normalize import normalize_email, normalize_phone
from app.core.redis import get_redis
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
from app.schemas.auth import RefreshRequest, TokenPair

from .deps import get_rate_limiter, issue_token_pair

router = APIRouter()


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
    return await issue_token_pair(redis, request, str(user.uuid))


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
    """Log out the CURRENT device only: revoke this session (its refresh token).

    Use /auth/logout-all to sign out every device. (A token minted without a sid is a no-op.)
    """
    _user_uuid, sid = session
    if sid:
        await SessionRepository(redis).revoke_session(sid)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
        session=Depends(security.get_current_session),
        redis=Depends(get_redis),
):
    """Log out EVERY device: revoke all of the user's sessions."""
    user_uuid, _sid = session
    await SessionRepository(redis).revoke_all_for_user(user_uuid)
