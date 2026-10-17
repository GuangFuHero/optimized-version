"""The browser's session endpoints: sign in, refresh, switch identity, sign out, finish a registration.

They answer with the sign-in cookies (ADR-326) and never put a token in the body, so a script on the page
has nothing to read (ADR-325). Each runs the same checks as its Bearer twin — `/auth/login`,
`/auth/refresh`, `/auth/switch-identity`, `/auth/verify`, `/auth/logout` — through `services.auth_session`.

Signing in, finishing a registration and signing out carry no access cookie for `accept_access_token` to
check, so they check the origin themselves, before the body is validated (ADR-327 point 4): otherwise
another page could sign the browser into an account of its choosing. Refreshing is not checked: the
frontend's server refreshes before rendering a page, and a page request carries no `Origin`.
"""

import logging

from fastapi import APIRouter, Depends, Request, Response, status
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import auth_cookies, security
from app.core.api_errors import ApiError, ErrorCode
from app.core.redis import get_redis
from app.core.request_auth import (
    authenticated_by_cookie,
    mark_authenticated_by_cookie,
    require_allowed_origin,
)
from app.models.auth import User
from app.repositories.session_repository import SessionRepository
from app.schemas.auth import (
    SessionIdentityResponse,
    SessionSignInRequest,
    SignedInResponse,
    SignedInUser,
    SwitchIdentityRequest,
    VerifyRequest,
)
from app.services import auth_session

from .deps import PASSWORD_SIGN_IN_BUCKET, device_of, get_rate_limiter

logger = logging.getLogger(__name__)

router = APIRouter()


async def _sign_browser_in(
    db: AsyncSession, redis, request: Request, response: Response, user: User
) -> SignedInResponse:
    """Open a session on the account's default identity and hand the browser its cookies.

    The back office reaches its own identity by its marker (ADR-329).
    """
    access_token, refresh_token, identity = await auth_session.open_default_session(
        db, redis, user, device_of(request)
    )
    auth_cookies.set_session_cookies(response, access_token, refresh_token)
    return SignedInResponse(
        user=SignedInUser(uuid=user.uuid, name=user.name),
        identity=identity.to_view() if identity else None,
    )


@router.post(
    "/session",
    response_model=SignedInResponse,
    dependencies=[
        Depends(get_rate_limiter(5, 60, bucket=PASSWORD_SIGN_IN_BUCKET)),
        Depends(require_allowed_origin),
    ],
)
async def sign_in(
    body: SessionSignInRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
):
    """Sign the browser in with an email or phone number and a password.

    A wrong password clears nothing: whoever is already signed in on this browser stays signed in.
    """
    user = await auth_session.authenticate_password(db, body.username, body.password)
    await auth_session.record_login(db, user)
    return await _sign_browser_in(db, redis, request, response, user)


@router.post(
    "/session/refresh",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_rate_limiter(10, 60))],
)
async def refresh_browser_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
):
    """Exchange the refresh cookie for a new pair of cookies; the session keeps its identity (ADR-188).

    A replay within the grace period gets the same new refresh token (ADR-330). Any failure is a
    sign-out, so the error handler clears both cookies: the request is marked as signing in by cookie.
    """
    mark_authenticated_by_cookie(request)
    access_token, new_refresh, _identity = await auth_session.refresh_session(
        db, redis, auth_cookies.read_refresh_cookie(request)
    )
    auth_cookies.set_session_cookies(response, access_token, new_refresh)


@router.post(
    "/session/identity",
    response_model=SessionIdentityResponse,
    dependencies=[Depends(get_rate_limiter(10, 60))],
)
async def switch_browser_identity(
    body: SwitchIdentityRequest,
    request: Request,
    response: Response,
    session=Depends(security.get_current_session),
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
):
    """Act as another identity the account holds; the new access token goes into the cookie.

    The browser's `/auth/switch-identity`, under the same rules (`auth_session.switch_identity`). The
    access cookie it replaces is stale from now on (ADR-195), and a refresh carries the new identity
    forward (ADR-188). A cookie-authenticated write, so it needs one of our origins (ADR-327).

    **Cookie only** (ADR-325). A Bearer client would get its new token in a cookie it does not read,
    and be left holding one that acts as the identity it switched away from; it is refused, and switches
    through `/auth/switch-identity`.
    """
    if not authenticated_by_cookie(request):
        raise ApiError(
            status.HTTP_403_FORBIDDEN,
            ErrorCode.COOKIE_SESSION_REQUIRED,
            detail="A Bearer client switches identity through POST /auth/switch-identity",
        )
    _user_uuid, sid = session
    access_token, identity = await auth_session.switch_identity(db, redis, current_user, sid, body)
    auth_cookies.set_access_cookie(response, access_token)
    return SessionIdentityResponse(identity=identity.to_view())


async def _session_of_cookies(request: Request, repo: SessionRepository) -> str | None:
    """The session the browser's cookies belong to, or None.

    The access cookie names it even once expired. Without a usable one, the refresh cookie's record
    does.
    """
    access_token = auth_cookies.read_access_cookie(request)
    sid = security.session_id_of_access_token(access_token) if access_token else None
    if sid:
        return sid
    raw_refresh = auth_cookies.read_refresh_cookie(request)
    record = await repo.get_refresh_for_token(raw_refresh) if raw_refresh else None
    return record["sid"] if record else None


@router.delete(
    "/session",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_allowed_origin)],
)
async def sign_out(
    request: Request,
    response: Response,
    redis=Depends(get_redis),
):
    """Sign this browser out: end its session and clear both cookies.

    Always 204, like `/auth/logout` (ADR-190): a browser with no session, or one already ended, is
    already where it asked to be. The one exception is a session store that cannot be reached: then
    the session may still be running, so the answer is 503 and the cookies stay.
    """
    repo = SessionRepository(redis)
    try:
        sid = await _session_of_cookies(request, repo)
        if sid:
            await repo.revoke_session(sid)
    except RedisError as err:
        logger.exception("signing out could not reach Redis (the session store)")
        raise ApiError(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code=ErrorCode.SESSION_STORE_UNAVAILABLE,
            detail="Session store is unavailable; you are not signed out",
        ) from err
    auth_cookies.clear_session_cookies(response)


@router.post(
    "/session/verify",
    response_model=SignedInResponse,
    dependencies=[Depends(get_rate_limiter(10, 60)), Depends(require_allowed_origin)],
)
async def verify_and_sign_in(
    body: VerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
):
    """Finish a registration with its 6-digit code, and sign the new account in."""
    user = await auth_session.verify_registration(db, redis, body)
    return await _sign_browser_in(db, redis, request, response, user)
