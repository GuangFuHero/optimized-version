"""Session endpoints: password login, refresh-token rotation, and logout."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.normalize import normalize_email, normalize_phone
from app.core.redis import get_redis
from app.db.session import attribute_writes_to
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

logger = logging.getLogger(__name__)

router = APIRouter()


async def _record_activity(db: AsyncSession, user_uuid: str) -> None:
    """Stamp `users.last_activity_at`, swallowing any failure (ADR-093).

    Called only after the refresh token has already been rotated, so raising here would cost
    the caller their session — see the note in `refresh`. The session is rolled back on
    failure so the request's remaining work is not left inside an aborted transaction.

    `users` is an audited table, so the write appends an `audit_logs` row; naming the actor
    first is what keeps that row attributable (ADR-102).
    """
    try:
        user = await user_repository.get_by_uuid(db, user_uuid)
        if user is not None:
            # `rotate()` resolved this uuid from the refresh token it just accepted, so the
            # actor is known even though the request carried no access token (ADR-102).
            await attribute_writes_to(db, user_uuid)
            await user_repository.update(
                db, db_obj=user, obj_in={"last_activity_at": datetime.now(UTC)}
            )
    except Exception:  # noqa: BLE001 — observability must never fail the token exchange
        logger.warning("Could not record last_activity_at for %s", user_uuid, exc_info=True)
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001 — the session is already unusable; nothing to salvage
            logger.warning("Rollback after the activity write also failed", exc_info=True)


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
    # The request carries no access token, so nothing has named an actor for the audit
    # trigger — but the password check above just proved who this is (ADR-102).
    await attribute_writes_to(db, str(user.uuid))
    await user_repository.update(db, db_obj=user, obj_in={"last_login_at": datetime.now(UTC)})
    return await issue_token_pair(redis, request, str(user.uuid))


@router.post("/refresh",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def refresh(
        body: RefreshRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """以 refresh token 換發新的 access token，並 rotate refresh token。

    Rotation is also where `users.last_activity_at` is recorded (ADR-093). Access tokens
    live 15 minutes, so an active user rotates about that often — precise enough to answer
    "has this account been used lately?", which is all the admin console needs. It is
    deliberately NOT updated per request: `users` is in AUDITED_TABLES, so that would append
    one `audit_logs` row per request and bury the audit trail under activity noise.

    `SessionRepository` stays a pure Redis component — the DB write happens here, not there.

    The write is deliberately best-effort. By the time `rotate()` returns it has already
    burned the old refresh token (`session_repository.py:78` claims the `refresh_used:` flag),
    so letting a DB error escape would 500 the request *after* the old token died: the client
    never receives `new_refresh`, retries with the old one, and `rotate()` reads that as a
    replay and revokes the entire session. A transient DB outage would sign the device out
    permanently. `last_activity_at` is observability — it is not worth a user's session.
    """
    repo = SessionRepository(redis)
    try:
        sid, user_uuid, new_refresh = await repo.rotate(body.refresh_token)
    except (InvalidRefreshToken, RefreshTokenReuse) as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    await _record_activity(db, user_uuid)
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
