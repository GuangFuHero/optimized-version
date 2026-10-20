"""Sign in with Google or LINE through the backend's own OAuth flow (ADR-331).

`start` sends the browser to the provider; `callback` is where the provider sends it back. Both are
navigations rather than API calls, so they answer with redirects: the provider's sign-in page, the page
the user came from once signed in, or the app's sign-in page with `?error=<code>`. Only a start that
names no app of ours is answered with JSON, because there is no sign-in page to send it back to.

Nothing here logs the code, the `id_token`, the state, the PKCE verifier or the nonce, and uvicorn's
access log has their query replaced (`core/access_log.py`).
"""

import hmac
import time
from typing import Literal
from urllib.parse import unquote, urlencode

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import auth_cookies, security
from app.core.api_errors import ApiError, ErrorCode
from app.core.config import settings
from app.core.redis import get_redis
from app.core.request_auth import authenticated_by_cookie, presented_access_token, require_allowed_origin
from app.models.auth import User
from app.repositories.auth_repository import identity_repository
from app.repositories.oauth_state_repository import OAuthStateRepository
from app.repositories.session_repository import SessionRepository
from app.repositories.step_up_proof_repository import StepUpProofRepository
from app.services import auth_session, sso_login
from app.services.auth_contact import REAUTH_ACTIONS, REAUTH_PROVIDERS
from app.sso import get_sso_verifiers
from app.sso.google import GoogleTokenVerificationError
from app.sso.line import LineTokenVerificationError
from app.sso.oauth import (
    FRESH_SIGN_IN_MAX_AGE,
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


def _back_to_page(app_url: str, return_to: str, **query: str) -> RedirectResponse:
    """Send a signed-in browser back to the page it came from, `query` added to the page's own (ADR-361)."""
    path, hash_mark, fragment = return_to.partition("#")
    joiner = "&" if "?" in path else "?"
    location = f"{app_url.rstrip('/')}{path}{joiner}{urlencode(query)}{hash_mark}{fragment}"
    return RedirectResponse(location, status_code=status.HTTP_302_FOUND)


def _sign_in_failed(app_url: str, code: ErrorCode) -> RedirectResponse:
    """A callback that cannot sign the browser in: to the sign-in page, and the sign-in forgotten."""
    response = _to_sign_in_page(app_url, code)
    auth_cookies.clear_oauth_cookie(response)
    return response


class _SignedOut(Exception):
    """The browser stepping up holds no live session: nothing a refresh could fix."""


# What a refresh fixes. A step-up's start answers these as any request would, so the site's proxy refreshes
# and sends the start again (ADR-361).
_REFRESH_FIXES = frozenset({ErrorCode.ACCESS_TOKEN_EXPIRED, ErrorCode.ACCESS_TOKEN_STALE})


async def _account_stepping_up(request: Request, db: AsyncSession, redis) -> tuple[User, str]:
    """The signed-in account a step-up proves, and its session; raises `_SignedOut` when there is none.

    Authenticated as any request is (ADR-328). A token that needs refreshing, and a session store that cannot
    be reached, keep their usual answers; any other 401 means signed out, which a navigation cannot show.
    """
    try:
        token = await security.get_access_token(request)
        account = await security.get_current_user(db=db, token=token, redis=redis, realm=None)
    except ApiError as err:
        if err.status_code != status.HTTP_401_UNAUTHORIZED or err.code in _REFRESH_FIXES:
            raise
        raise _SignedOut from err
    return account, security.session_id_of_access_token(token)


async def _still_the_session(request: Request, redis, sign_in) -> bool:
    """Whether the browser coming back holds the live session that started the step-up (ADR-361).

    Its access token is read even when expired, signature still checked: the round trip to the provider can
    outlast it, and a refresh keeps the session's `sid`. Nothing here answers 401, since the site's proxy
    would refresh and send this callback again with a state already spent.
    """
    token, _ = presented_access_token(request)
    sid = security.session_id_of_access_token(token) if token else None
    if sid is None or sign_in.sid is None or not _constant_time_equal(sid, sign_in.sid):
        return False
    session = await SessionRepository(redis).get_session(sid)
    return session is not None and session.get("user_uuid") == sign_in.user_uuid


def _step_up_ended(app_url: str, return_to: str, **query: str) -> RedirectResponse:
    """Back to the page a step-up came from, with how it ended, and the step-up forgotten."""
    response = _back_to_page(app_url, return_to, **query)
    auth_cookies.clear_oauth_cookie(response)
    return response


def _callback_failed(sign_in, app_url: str, code: ErrorCode) -> RedirectResponse:
    """A callback that cannot finish: a sign-in to the sign-in page, a step-up back to its page (ADR-361)."""
    if sign_in.purpose == "step_up":
        return _step_up_ended(app_url, sign_in.return_to, step_up_error=code)
    return _sign_in_failed(app_url, code)


async def _id_token_from(
    exchanger: OAuthCodeExchanger, oauth, sign_in, code: str | None, error: str | None
) -> str | ErrorCode:
    """The provider's `id_token` for this sign-in, or the code for why there is none."""
    if error is not None:
        return ErrorCode.OAUTH_CANCELLED if error == "access_denied" else ErrorCode.OAUTH_EXCHANGE_FAILED
    if not code:
        return ErrorCode.OAUTH_EXCHANGE_FAILED
    try:
        return await exchanger.exchange(oauth, code, sign_in.code_verifier)
    except OAuthExchangeError:
        return ErrorCode.OAUTH_EXCHANGE_FAILED


async def _finish_step_up(
    db: AsyncSession, redis, verifiers: dict, id_token: str, sign_in, app_url: str
) -> RedirectResponse:
    """The provider checked the person again: a proof for this session and action, and back to their page.

    The token must be for the identity already on this account, as `_sso_proof` requires: one for anyone
    else's account at the provider verifies, and proves nothing about this one. It must also say the person
    signed in there within `FRESH_SIGN_IN_MAX_AGE`, which the start asked for. The browser stays signed in
    as it was: no session cookie is touched (ADR-361).
    """
    try:
        verified = await verifiers[sign_in.provider].verify(id_token, nonce=sign_in.nonce)
    except (GoogleTokenVerificationError, LineTokenVerificationError):
        return _step_up_ended(app_url, sign_in.return_to, step_up_error=ErrorCode.SSO_TOKEN_INVALID)
    identity = await identity_repository.get_user_identity(db, sign_in.user_uuid, sign_in.provider)
    is_this_account = identity is not None and str(verified.sub) == str(identity.provider_subject)
    fresh = verified.auth_time is not None and time.time() - verified.auth_time <= FRESH_SIGN_IN_MAX_AGE
    if not (is_this_account and fresh):
        return _step_up_ended(app_url, sign_in.return_to, step_up_error=ErrorCode.STEP_UP_INVALID)
    await StepUpProofRepository(redis).record(sign_in.sid, sign_in.action, sign_in.user_uuid)
    return _step_up_ended(app_url, sign_in.return_to, step_up="ok")


async def _can_prove(db: AsyncSession, account: User, provider: str) -> bool:
    """Whether signing in again at `provider` proves `account`: one we re-check with, and one it holds."""
    if provider not in REAUTH_PROVIDERS:
        return False
    return await identity_repository.get_user_identity(db, str(account.uuid), provider) is not None


def _signed_out(request: Request, app_url: str) -> RedirectResponse:
    """To the sign-in page; cookies naming a session that is gone are cleared, as ADR-328 clears them."""
    response = _to_sign_in_page(app_url, ErrorCode.SESSION_EXPIRED)
    if authenticated_by_cookie(request):
        auth_cookies.clear_session_cookies(response)
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
    purpose: Literal["sign_in", "step_up"] = "sign_in",
    action: str | None = None,
    db: AsyncSession = Depends(security.get_db),
    redis=Depends(get_redis),
):
    """Send the browser to the provider's sign-in page, bound to this browser, this sign-in and this server.

    `app` (`site` or `admin`) is the app to come back to, at `return_to`, a path on it. The request must
    come from one of our pages (ADR-327), which for a navigation means its `Referer`. A start that is
    refused leaves `{p}_oauth` alone: a link from another site must not end a sign-in in another tab.

    `purpose=step_up` proves a signed-in account at its provider instead of signing in (ADR-361): the
    provider is asked to check the person afresh.
    """
    app_url = _app_url(app)
    if app_url is None:
        raise ApiError(status.HTTP_400_BAD_REQUEST, ErrorCode.OAUTH_REQUEST_INVALID, detail="Unknown app")
    try:
        require_allowed_origin(request)
    except ApiError as err:
        return _to_sign_in_page(app_url, err.code)
    account = sid = None
    if purpose == "step_up":
        try:
            account, sid = await _account_stepping_up(request, db, redis)
        except _SignedOut:
            return _signed_out(request, app_url)
    oauth = oauth_provider(provider)
    usable = oauth is not None and oauth.configured and provider in _SIGN_IN_WITH
    if not usable or not _is_path_on_our_site(return_to):
        return _to_sign_in_page(app_url, ErrorCode.OAUTH_REQUEST_INVALID)
    if account is not None and not (action in REAUTH_ACTIONS and await _can_prove(db, account, provider)):
        return _back_to_page(app_url, return_to, step_up_error=ErrorCode.OAUTH_REQUEST_INVALID)
    sign_in = await OAuthStateRepository(redis).create(
        provider,
        app,
        return_to,
        purpose=purpose,
        action=action if account is not None else None,
        sid=sid,
        user_uuid=str(account.uuid) if account is not None else None,
    )
    response = RedirectResponse(
        build_authorize_url(
            oauth,
            state=sign_in.state,
            nonce=sign_in.nonce,
            code_verifier=sign_in.code_verifier,
            fresh_sign_in=purpose == "step_up",
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
    It must match the browser's `{p}_oauth` cookie and still be on record, and is spent on the spot. A
    state that does not match leaves the cookie alone, as a refused start does.
    """
    cookie_state = auth_cookies.read_oauth_cookie(request)
    if not (state and cookie_state and _constant_time_equal(state, cookie_state)):
        # Not a sign-in this browser started. The callback is a top-level GET, so a link from another site
        # brings the cookie along; clearing it would end a sign-in another tab has in progress (ADR-331).
        return _to_sign_in_page(settings.SITE_APP_URL, ErrorCode.OAUTH_STATE_INVALID)
    sign_in = await OAuthStateRepository(redis).consume(state)
    if sign_in is None:
        # This browser's state, but expired or already used: nothing is left to finish, so forget it. With
        # no record there is no telling which app it was for either.
        return _sign_in_failed(settings.SITE_APP_URL, ErrorCode.OAUTH_STATE_INVALID)
    app_url = _app_url(sign_in.app)
    oauth = oauth_provider(provider)
    sign_in_with = _SIGN_IN_WITH.get(provider)
    if sign_in.provider != provider or oauth is None or sign_in_with is None:
        return _sign_in_failed(app_url, ErrorCode.OAUTH_STATE_INVALID)
    if sign_in.purpose == "step_up" and not await _still_the_session(request, redis, sign_in):
        return _sign_in_failed(app_url, ErrorCode.SESSION_EXPIRED)
    id_token = await _id_token_from(exchanger, oauth, sign_in, code, error)
    if isinstance(id_token, ErrorCode):
        return _callback_failed(sign_in, app_url, id_token)
    if sign_in.purpose == "step_up":
        return await _finish_step_up(db, redis, verifiers, id_token, sign_in, app_url)
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
