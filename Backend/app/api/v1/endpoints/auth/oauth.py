"""Sign in with Google or LINE through the backend's own OAuth flow (ADR-331).

`start` sends the browser to the provider; `callback` is where the provider sends it back. Both are
navigations rather than API calls, so they answer with redirects: the provider's sign-in page, the page
the user came from once signed in, or the app's sign-in page with `?error=<code>`. Only a start that
names no app of ours is answered with JSON, because there is no sign-in page to send it back to.

Nothing here logs the code, the `id_token`, the state, the PKCE verifier or the nonce, and uvicorn's
access log has their query replaced (`core/access_log.py`).
"""

import hmac
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import auth_cookies, security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.redis import get_redis
from app.core.request_auth import require_allowed_origin
from app.models.auth import User
from app.repositories.oauth_state_repository import OAuthStateRepository
from app.services import auth_session, sso_login
from app.sso import get_sso_verifiers
from app.sso.google import GoogleTokenVerificationError
from app.sso.line import LineTokenVerificationError
from app.sso.oauth import (
    OAuthCodeExchanger,
    OAuthExchangeError,
    build_authorize_url,
    get_oauth_exchanger,
    oauth_provider,
)

from .deps import device_of, get_rate_limiter

router = APIRouter()

_SIGN_IN_REFUSALS = {
    sso_login.EmailUnverified: ErrorCode.SSO_EMAIL_UNVERIFIED,
    sso_login.EmailTaken: ErrorCode.SSO_EMAIL_TAKEN,
    sso_login.SignInRace: ErrorCode.SSO_SIGNIN_RACE,
}


class _TokenRefused(Exception):
    """The provider's `id_token` does not verify, or was issued for another sign-in."""


def _constant_time_equal(a: str, b: str) -> bool:
    """Compare two secrets without leaking, through timing, how much of them matched."""
    return hmac.compare_digest(a.encode(), b.encode())


async def _google_account(db: AsyncSession, verifiers: dict, id_token: str, nonce: str) -> User:
    """Who Google's `id_token` signs in as; its nonce is compared here, by us."""
    try:
        gid = await verifiers["google"].verify(id_token)
    except GoogleTokenVerificationError as err:
        raise _TokenRefused from err
    # The nonce ties the token to this sign-in: one replayed from another, or minted for another client,
    # carries a different one or none.
    if gid.nonce is None or not _constant_time_equal(gid.nonce, nonce):
        raise _TokenRefused
    return await sso_login.sign_in_with_google(db, gid)


async def _line_account(db: AsyncSession, verifiers: dict, id_token: str, nonce: str) -> User:
    """Who LINE's `id_token` signs in as; LINE's verify API compares the nonce it is handed."""
    try:
        lid = await verifiers["line"].verify(id_token, nonce=nonce)
    except LineTokenVerificationError as err:
        raise _TokenRefused from err
    return await sso_login.sign_in_with_line(db, lid)


# How each provider's `id_token` is verified and becomes an account. A provider takes part in the sign-in
# only once it is here and `oauth_provider` knows it; `start` checks both, so a half-added one refuses there.
_SIGN_IN_WITH = {"google": _google_account, "line": _line_account}


def _app_url(app: str | None) -> str | None:
    """The URL of the app a sign-in was started for, or None if it is not one of ours."""
    return {"site": settings.SITE_APP_URL, "admin": settings.ADMIN_APP_URL}.get(app or "")


def _is_path_on_our_site(return_to: str | None) -> bool:
    """A path to append to the app's URL, and nothing that could take the browser to another host.

    `//host` is scheme-relative, and a browser reads a slash then a backslash the same way, so no
    backslash is accepted at all. A `.` or `..` segment, even percent-encoded, is resolved away by the
    browser and can leave `//host` behind (`/.//host`). Characters that are not printable could split the
    `Location` header or hide what the path really is.
    """
    if not return_to or not return_to.startswith("/") or return_to.startswith("//"):
        return False
    if "\\" in return_to or not return_to.isprintable():
        return False
    path = unquote(return_to.split("?", 1)[0].split("#", 1)[0])
    return not any(segment in (".", "..") for segment in path.split("/"))


def _to_sign_in_page(app_url: str, code: ErrorCode) -> RedirectResponse:
    """Send the browser to the app's sign-in page with the reason."""
    return RedirectResponse(f"{app_url.rstrip('/')}/login?error={code}", status_code=status.HTTP_302_FOUND)


def _sign_in_failed(app_url: str, code: ErrorCode) -> RedirectResponse:
    """A callback that cannot sign the browser in: to the sign-in page, and the sign-in forgotten."""
    response = _to_sign_in_page(app_url, code)
    auth_cookies.clear_oauth_cookie(response)
    return response


@router.get(
    "/oauth/{provider}/start",
    response_class=RedirectResponse,
    status_code=status.HTTP_302_FOUND,
    dependencies=[Depends(get_rate_limiter(10, 60))],
)
async def start_oauth(
    provider: str,
    request: Request,
    app: str | None = None,
    return_to: str | None = None,
    redis=Depends(get_redis),
):
    """Send the browser to the provider's sign-in page, bound to this browser, this sign-in and this server.

    `app` (`site` or `admin`) is the app to come back to, at `return_to`, a path on it. The request must
    come from one of our pages (ADR-327), which for a navigation means its `Referer`. A start that is
    refused leaves `{p}_oauth` alone: a link from another site must not end a sign-in in another tab.
    """
    app_url = _app_url(app)
    if app_url is None:
        raise ApiError(status.HTTP_400_BAD_REQUEST, ErrorCode.OAUTH_REQUEST_INVALID, detail="Unknown app")
    try:
        require_allowed_origin(request)
    except ApiError as err:
        return _to_sign_in_page(app_url, err.code)
    oauth = oauth_provider(provider)
    usable = oauth is not None and oauth.configured and provider in _SIGN_IN_WITH
    if not usable or not _is_path_on_our_site(return_to):
        return _to_sign_in_page(app_url, ErrorCode.OAUTH_REQUEST_INVALID)
    sign_in = await OAuthStateRepository(redis).create(provider, app, return_to)
    response = RedirectResponse(
        build_authorize_url(
            oauth, state=sign_in.state, nonce=sign_in.nonce, code_verifier=sign_in.code_verifier
        ),
        status_code=status.HTTP_302_FOUND,
    )
    auth_cookies.set_oauth_cookie(response, sign_in.state)
    return response


@router.get(
    "/oauth/{provider}/callback",
    response_class=RedirectResponse,
    status_code=status.HTTP_302_FOUND,
    dependencies=[Depends(get_rate_limiter(10, 60))],
)
async def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
    exchanger: OAuthCodeExchanger = Depends(get_oauth_exchanger),
    verifiers=Depends(get_sso_verifiers),
):
    """Finish a sign-in: check it is this browser's, exchange the code, check the token, sign in.

    The provider's redirect, so no `Origin` to check: the state does that job, and it is checked first.
    It must match the browser's `{p}_oauth` cookie and still be on record, and is spent on the spot.
    """
    cookie_state = auth_cookies.read_oauth_cookie(request)
    sign_in = None
    if state and cookie_state and _constant_time_equal(state, cookie_state):
        sign_in = await OAuthStateRepository(redis).consume(state)
    if sign_in is None:
        # Not a sign-in this browser started, so there is no telling which app it was for.
        return _sign_in_failed(settings.SITE_APP_URL, ErrorCode.OAUTH_STATE_INVALID)
    app_url = _app_url(sign_in.app)
    oauth = oauth_provider(provider)
    sign_in_with = _SIGN_IN_WITH.get(provider)
    if sign_in.provider != provider or oauth is None or sign_in_with is None:
        return _sign_in_failed(app_url, ErrorCode.OAUTH_STATE_INVALID)
    if error is not None:
        cancelled = error == "access_denied"
        return _sign_in_failed(
            app_url, ErrorCode.OAUTH_CANCELLED if cancelled else ErrorCode.OAUTH_EXCHANGE_FAILED
        )
    if not code:
        return _sign_in_failed(app_url, ErrorCode.OAUTH_EXCHANGE_FAILED)
    try:
        id_token = await exchanger.exchange(oauth, code, sign_in.code_verifier)
    except OAuthExchangeError:
        return _sign_in_failed(app_url, ErrorCode.OAUTH_EXCHANGE_FAILED)
    try:
        user = await sign_in_with(db, verifiers, id_token, sign_in.nonce)
    except _TokenRefused:
        return _sign_in_failed(app_url, ErrorCode.SSO_TOKEN_INVALID)
    except sso_login.SsoSignInRefused as err:
        return _sign_in_failed(app_url, _SIGN_IN_REFUSALS[type(err)])
    await auth_session.record_login(db, user)
    access_token, refresh_token, _identity = await auth_session.open_default_session(
        db, redis, user, device_of(request)
    )
    response = RedirectResponse(app_url.rstrip("/") + sign_in.return_to, status_code=status.HTTP_302_FOUND)
    auth_cookies.set_session_cookies(response, access_token, refresh_token)
    auth_cookies.clear_oauth_cookie(response)
    return response
