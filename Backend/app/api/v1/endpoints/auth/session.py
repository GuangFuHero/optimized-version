"""Session endpoints: password login, refresh-token rotation, and logout."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.identity import encode_act
from app.core.normalize import normalize_email, normalize_phone
from app.core.redis import get_redis
from app.models.auth import User
from app.repositories.active_identity_repository import active_identity_repository
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
from app.schemas.auth import (
    AccessTokenResponse,
    RefreshRequest,
    SwitchIdentityRequest,
    TokenPair,
)

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
    identity = None
    if form_data.scopes:
        # OAuth2PasswordRequestForm carries `scope`; the client passes the identity it
        # remembers from last time here (ADR-069). An identity it no longer holds falls back
        # to the default rather than erroring: a stale client-side memory is not a failure.
        identity = await active_identity_repository.resolve(db, str(user.uuid), form_data.scopes[0])
    if identity is None:
        identity = await active_identity_repository.default_for_user(db, str(user.uuid))
    return await issue_token_pair(
        redis, request, str(user.uuid), act=identity.to_claim() if identity else None
    )


@router.post("/refresh",
             response_model=TokenPair,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def refresh(
        body: RefreshRequest,
        db: AsyncSession = Depends(security.get_db),
        redis=Depends(get_redis),
):
    """以 refresh token 換發新的 access token，並 rotate refresh token。

    The identity is validated BEFORE rotating (ADR-096). `rotate()` burns the old refresh
    token the moment it runs, so refusing afterwards would leave the caller holding a dead
    token with no replacement — and their retry would read as a replay and revoke the whole
    session. Reading the record first is side-effect free.

    **The identity comes from the session when the caller does not name one** (ADR-188).
    `body.identity` still wins, so a client that tracks it keeps deciding; but a client that
    does not — or forgets on one request — no longer gets silently returned to its platform
    identity, which for a super_admin acting as a team member was a silent re-escalation
    every time an access token expired.
    """
    repo = SessionRepository(redis)
    record = await repo.get_refresh(SessionRepository._hash(body.refresh_token))
    session = await repo.get_session(record["sid"]) if record else None
    # What the caller asked for, else what this session was already acting as. None means a
    # session predating ADR-188, which falls back to the platform default as it used to.
    wanted = body.identity or (session or {}).get("act")
    if wanted is not None and record is not None:
        identity = await active_identity_repository.resolve(db, record["user_uuid"], wanted)
        if identity is None:
            # The identity this client was acting as is gone. Refuse here as well as on the
            # request path, so a revoked identity means signed out, not silently downgraded.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This identity no longer exists",
                headers={"WWW-Authenticate": "Bearer"},
            )
    try:
        sid, user_uuid, new_refresh = await repo.rotate(body.refresh_token)
    except (InvalidRefreshToken, RefreshTokenReuse) as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    identity = (
        await active_identity_repository.resolve(db, user_uuid, wanted) if wanted
        else await active_identity_repository.default_for_user(db, user_uuid)
    )
    # Rotation preserves the session record, so a `wanted` that came from it is already
    # stored; one the caller named has to be written back, or the next refresh without an
    # identity would revert to whatever the session remembered before.
    if identity is not None:
        await repo.set_identity(sid, identity.to_claim())
    access_token = security.create_access_token(
        data={"sub": user_uuid}, sid=sid, act=identity.to_claim() if identity else None
    )
    return TokenPair(
        access_token=access_token, refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/switch-identity", response_model=AccessTokenResponse,
             dependencies=[Depends(get_rate_limiter(10, 60))])
async def switch_identity(
        body: SwitchIdentityRequest,
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You do not hold that identity"
        )
    _user_uuid, sid = session
    if sid is None or await SessionRepository(redis).get_session(sid) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
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
    return AccessTokenResponse(
        access_token=access_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
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
