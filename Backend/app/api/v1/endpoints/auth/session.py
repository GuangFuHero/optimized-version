"""Session endpoints: password login, refresh-token rotation, and logout."""

import logging

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import auth_cookies, security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.identity import encode_act
from app.core.redis import get_redis
from app.core.request_auth import authenticated_by_cookie
from app.models.auth import User
from app.repositories.active_identity_repository import active_identity_repository
from app.repositories.session_repository import SessionRepository
from app.schemas.auth import (
    AccessTokenResponse,
    RefreshRequest,
    SwitchIdentityRequest,
    TokenPair,
)
from app.services import auth_session

from .deps import (
    PASSWORD_SIGN_IN_BUCKET,
    clear_cookies_if_cookie_authenticated,
    get_rate_limiter,
    issue_token_pair,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/login",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(5, 60, bucket=PASSWORD_SIGN_IN_BUCKET))])
async def login(
        request: Request,
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Email/phone + password login: contact → user → password identity → verify."""
    user = await auth_session.authenticate_password(db, form_data.username, form_data.password)
    await auth_session.record_login(db, user)
    identity = None
    if form_data.scopes:
        # OAuth2PasswordRequestForm carries `scope`; the client passes the identity it
        # remembers from last time here (ADR-069). An identity it no longer holds falls back
        # to the default rather than erroring: a stale client-side memory is not a failure —
        # and the response now says which identity it landed on, so that is observable
        # (ADR-205).
        #
        # `scope` is OAuth2's authorization-scope list and this is not one; the trade-off is
        # recorded in ADR-207 rather than left as an intent comment. Only `scopes[0]` is
        # read, by definition: this field carries one identity, not a list.
        identity = await active_identity_repository.resolve(db, str(user.uuid), form_data.scopes[0])
    if identity is None:
        identity = await active_identity_repository.default_for_user(db, str(user.uuid))
    return await issue_token_pair(redis, request, str(user.uuid), identity=identity)


@router.post("/refresh",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def refresh(
        body: RefreshRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """以 refresh token 換發新的 access token，並 rotate refresh token。

    `body.identity`, when given, names the identity the new token acts as; otherwise the
    session's own carries forward (ADR-188). See `auth_session.refresh_session` for the rest.
    """
    access_token, new_refresh, identity = await auth_session.refresh_session(
        db, redis, body.refresh_token, body.identity
    )
    return TokenPair(
        access_token=access_token, refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        identity=identity.to_view() if identity else None,
    )


@router.post("/switch-identity", response_model=AccessTokenResponse,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def switch_identity(
        body: SwitchIdentityRequest,
        request: Request,
        response: Response,
        session=Depends(security.get_current_session),
        current_user: User = Depends(security.get_current_user),
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """Act as a different identity you already hold; returns a re-signed access token.

    Deliberately gated by nothing but being logged in. Requiring a capability here would let
    a user downgrade into an identity that cannot switch back, locking themselves out of
    their own permissions (ADR-070).

    Only re-signs the access token — the session is untouched and the refresh token is not
    rotated, because switching is not a credential event.

    **The session it re-signs from has to still exist** (ADR-183). This mints a fresh
    access token with a fresh expiry, so without that check the endpoint is a token
    refresher gated on nothing but holding an unexpired token: after `logout` or
    `logout-all`, `/auth/refresh` correctly refuses, but calling this before each expiry
    would keep a revoked session alive indefinitely. Rate limited for the same reason —
    it mints credentials, and `login` and `refresh` both are.
    """
    identity = await active_identity_repository.resolve(
        db, str(current_user.uuid),
        encode_act(str(body.role_uuid), str(body.team_uuid) if body.team_uuid else None),
    )
    if identity is None:
        # Switching may only move between identities already held; it never grants one.
        raise ApiError(
            status_code=status.HTTP_403_FORBIDDEN,
            code=ErrorCode.IDENTITY_NOT_HELD,
            detail="You do not hold that identity",
        )
    _user_uuid, sid = session
    if sid is None or await SessionRepository(redis).get_session(sid) is None:
        raise ApiError(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code=ErrorCode.SESSION_EXPIRED,
            detail="Session is no longer active",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # The switch has to outlive the token it returns (ADR-188): without this the session
    # still remembers the identity it was created with, and the next refresh that does not
    # name one would undo the switch.
    await SessionRepository(redis).set_identity(sid, identity.to_claim())
    access_token = security.create_access_token(
        data={"sub": str(current_user.uuid)}, sid=sid, act=identity.to_claim()
    )
    # A browser holds the token in the cookie, and the one it holds is stale as of now (ADR-195).
    if authenticated_by_cookie(request):
        auth_cookies.set_access_cookie(response, access_token)
    return AccessTokenResponse(
        access_token=access_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        identity=identity.to_view(),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
        session=Depends(security.get_current_session),
        redis=Depends(get_redis),
):
    """Log out the CURRENT device only: revoke this session (its refresh token).

    Idempotent (ADR-190): this endpoint asks for the end state "this device is signed out",
    and a token whose session is already gone — a second logout, or one issued from a 401
    interceptor — is asking for a state that already holds. `revoke_session` no-ops on a
    session that is not there, so both cases answer 204. A token that never carried a `sid`
    is the same case: there is nothing to revoke and nothing to report.

    Use /auth/logout-all to sign out every device.
    """
    _user_uuid, sid = session
    if not sid:
        return
    try:
        await SessionRepository(redis).revoke_session(sid)
    except RedisError as err:
        # Fail closed and say so. Answering 204 here would tell the caller they are signed
        # out when the session store never heard the request, which is the one lie a logout
        # endpoint must not tell.
        logger.exception("logout could not reach Redis (the session store)")
        raise ApiError(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code=ErrorCode.SESSION_STORE_UNAVAILABLE,
            detail="Session store is unavailable; you are not signed out",
        ) from err


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
        request: Request,
        response: Response,
        session=Depends(security.get_current_session),
        redis=Depends(get_redis),
):
    """Log out EVERY device: revoke all of the user's sessions.

    Idempotent for the same reason `logout` is, but it cannot simply revoke and let the
    no-op handle it: unlike `logout`, this acts on sessions OTHER than the caller's. A token
    whose own session has already been revoked must not reach them (ADR-180) — otherwise an
    intruder holding a stolen-then-revoked token can keep calling this to kick the victim out
    of every session they create afterwards, for the rest of the token's 15 minutes. So the
    caller's own session has to be live for this to revoke anything; when it is not, the
    answer is still 204, because "every device is signed out" is what the caller asked for
    and this token's own device already is (ADR-190).

    A browser signed in by cookie has them cleared, on both 204s: either way its session is over.
    """
    _, sid = session
    repo = SessionRepository(redis)
    try:
        live = await repo.get_session(sid) if sid is not None else None
        if live is None:
            clear_cookies_if_cookie_authenticated(request, response)
            return
        # The session record's own `user_uuid`, not the token's `sub` (ADR-223). Both claims
        # are signed, so no path mints a mismatched pair today — but this is the endpoint
        # that revokes EVERY session a uuid owns, which is the worst place to take the uuid
        # on trust, and `_require_live_session` pins exactly this pairing for every other
        # authenticated route (`security.py`). ADR-190 moved this endpoint out from under
        # that check; taking the uuid from the record puts the invariant back.
        await repo.revoke_all_for_user(live["user_uuid"])
    except RedisError as err:
        logger.exception("logout-all could not reach Redis (the session store)")
        raise ApiError(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code=ErrorCode.SESSION_STORE_UNAVAILABLE,
            detail="Session store is unavailable; you are not signed out",
        ) from err
    clear_cookies_if_cookie_authenticated(request, response)
