"""Signing in with Google through the backend's own OAuth flow (ADR-331).

`start` sends the browser to Google with a state bound to it by the `{p}_oauth` cookie, a nonce and a PKCE
challenge. Google sends it back to `callback` with a one-time code, which the backend exchanges for the
`id_token` with the verifier and the client secret, checks, and signs the browser in. Whatever goes wrong,
the browser lands on the app's sign-in page with `?error=<code>`.

The exchange is faked (`FakeOAuthExchanger`), and so is the verifier, which reads the `id_token` as JSON.
"""

import base64
import hashlib
import json
import logging

import pytest
from sqlalchemy import select

from app.core import auth_cookies
from app.core.access_log import OAuthQueryRedactor
from app.core.config import settings
from app.main import app
from app.models.auth import User, UserContact, UserIdentity
from app.services.auth_account import create_account
from app.sso.oauth import get_oauth_exchanger
from tests import oauth_flow
from tests.cookies import cookie_header, cookies_set_by
from tests.fakes import FakeOAuthExchanger

pytestmark = pytest.mark.asyncio

GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    """Google configured, and the two apps on hosts of their own, whatever the environment says."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "google-client")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "google-secret")
    oauth_flow.configure_apps(monkeypatch)


@pytest.fixture
def exchanger(client):
    """Google's token endpoint, faked."""
    fake = FakeOAuthExchanger()
    app.dependency_overrides[get_oauth_exchanger] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_oauth_exchanger, None)


async def _start(client, *, provider: str = "google", **kwargs):
    return await oauth_flow.start(client, provider, **kwargs)


def _sent_to_google(response) -> dict[str, str]:
    """Assert the browser is sent to Google's sign-in page, and return the query it is sent with."""
    return oauth_flow.sent_to(response, GOOGLE_AUTHORIZE)


def _google_token(nonce: str | None, **claims) -> str:
    """An `id_token` the fake verifier accepts: the claims as JSON."""
    defaults = {"sub": "g-1", "email": "g@x.com", "email_verified": True, "name": "G 使用者"}
    return json.dumps({**defaults, **claims, **({"nonce": nonce} if nonce is not None else {})})


async def _callback(client, state: str | None, *, cookie: str | None, provider: str = "google", **params):
    return await oauth_flow.callback(client, provider, state, cookie=cookie, **params)


async def _round_trip(client, exchanger, *, app: str = "site", return_to: str = "/tickets", **claims):
    """Start, have Google vouch for `claims` with the right nonce, and come back to the callback."""
    started = await _start(client, app=app, return_to=return_to)
    params = _sent_to_google(started)
    exchanger.id_token = _google_token(params["nonce"], **claims)
    return await _callback(client, params["state"], cookie=oauth_flow.oauth_cookie(started))


# --- start --------------------------------------------------------------------------------------


async def test_start_sends_the_browser_to_google_with_everything_it_needs(client, redis):
    """The code it asks for is bound to this browser (state), this sign-in (nonce) and this server (PKCE)."""
    response = await _start(client)

    params = _sent_to_google(response)
    assert {k: params[k] for k in ("response_type", "client_id", "redirect_uri", "scope")} == {
        "response_type": "code",
        "client_id": "google-client",
        "redirect_uri": f"{oauth_flow.SITE}/api/v1/auth/oauth/google/callback",
        "scope": "openid email profile",
    }
    record = json.loads(await redis.get(f"oauth_state:{params['state']}"))
    verifier = record["code_verifier"]
    digest = hashlib.sha256(verifier.encode()).digest()
    assert params["code_challenge"] == base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    assert params["code_challenge_method"] == "S256"
    assert 43 <= len(verifier) <= 128
    assert record["nonce"] == params["nonce"]
    assert (record["app"], record["return_to"]) == ("site", "/tickets")
    assert 0 < await redis.ttl(f"oauth_state:{params['state']}") <= 600


async def test_start_binds_the_sign_in_to_this_browser(client):
    """The state rides in a cookie that only the OAuth endpoints see, for the length of the round trip."""
    response = await _start(client)

    cookie = cookies_set_by(response)[oauth_flow.oauth_cookie_name()]
    assert cookie["value"] == _sent_to_google(response)["state"]
    assert (cookie["path"], cookie["max-age"]) == ("/api/v1/auth/oauth", "600")
    assert cookie["httponly"] is True and cookie["secure"] is True


@pytest.mark.parametrize("app_name", [None, "elsewhere"])
async def test_start_without_a_known_app_is_a_400(client, app_name):
    """With no app there is no sign-in page to send the browser back to, so it gets an answer instead."""
    response = await _start(client, app=app_name)

    assert response.status_code == 400, response.text
    assert response.json()["code"] == "oauth_request_invalid"


@pytest.mark.parametrize(
    "return_to",
    [
        "https://evil.com",
        "//evil.com",
        "/\\evil.com",
        "/.//evil.com",
        "/%2E//evil.com",
        "/a/../b",
        "/a\r\nb",
        "/a\x85b",
        "",
        None,
    ],
)
async def test_start_returns_only_to_a_path_on_our_own_site(client, return_to):
    """Anything that could leave our site, or hide what the path really is, is refused.

    Another host, a scheme-relative path, a backslash, a dot segment (even percent-encoded) that a browser
    resolves into `//host`, a character that is not printable, or nothing at all.
    """
    response = await _start(client, return_to=return_to)

    oauth_flow.start_refused(response, "oauth_request_invalid")


async def test_start_accepts_a_path_with_its_query(client):
    """An ordinary path keeps its query and its non-ASCII characters."""
    _sent_to_google(await _start(client, return_to="/tickets?q=花蓮&page=2"))


async def test_start_refuses_an_unknown_provider(client):
    """A provider this API does not know: back to the sign-in page of the app that asked."""
    response = await _start(client, provider="facebook", app="admin")

    oauth_flow.start_refused(response, "oauth_request_invalid", oauth_flow.ADMIN)


async def test_start_refuses_a_provider_without_its_secret(client, monkeypatch):
    """The sign-in could never finish, so it does not begin."""
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")

    oauth_flow.start_refused(await _start(client), "oauth_request_invalid")


@pytest.mark.parametrize(
    "headers", [{}, {"Referer": "https://elsewhere.test/"}, {"Origin": "https://elsewhere.test"}]
)
async def test_start_must_be_reached_from_one_of_our_pages(client, headers):
    """Otherwise another page could start a sign-in into an account of its choosing (ADR-327)."""
    oauth_flow.start_refused(await _start(client, headers=headers), "origin_not_allowed")


async def test_the_back_office_may_start_one_too(client):
    """Clicking the button sends no `Origin` on a navigation, but the back office's `Referer` will do."""
    response = await _start(client, app="admin", headers={"Referer": f"{oauth_flow.ADMIN}/login"})

    assert _sent_to_google(response)["redirect_uri"] == f"{oauth_flow.SITE}/api/v1/auth/oauth/google/callback"


# --- callback: signing in -------------------------------------------------------------------------


async def test_a_first_sign_in_creates_the_account_and_signs_the_browser_in(
    client, db_session, redis, exchanger
):
    """A verified email contact and a google login method; the browser lands where it started, signed in."""
    started = await _start(client)
    params = _sent_to_google(started)
    verifier = json.loads(await redis.get(f"oauth_state:{params['state']}"))["code_verifier"]
    exchanger.id_token = _google_token(params["nonce"])

    response = await _callback(client, params["state"], cookie=oauth_flow.oauth_cookie(started))

    assert response.status_code == 302, response.text
    assert response.headers["location"] == f"{oauth_flow.SITE}/tickets"
    assert exchanger.exchanges == [("google", oauth_flow.CODE, verifier)]
    cookies = cookies_set_by(response)
    assert cookies[oauth_flow.oauth_cookie_name()]["max-age"] == "0"
    access = cookies[auth_cookies.access_cookie_name()]["value"]
    assert cookies[auth_cookies.refresh_cookie_name()]["value"]
    me = await client.get(
        "/api/v1/users/me", headers=cookie_header(**{auth_cookies.access_cookie_name(): access})
    )
    assert me.status_code == 200, me.text
    assert me.json()["active_identity"]["role"] == "user"
    [contact] = (await db_session.execute(select(UserContact))).scalars().all()
    assert (contact.type, contact.value, contact.verified) == ("email", "g@x.com", True)
    [identity] = (await db_session.execute(select(UserIdentity))).scalars().all()
    assert (identity.provider, identity.provider_subject) == ("google", "g-1")


async def test_a_second_sign_in_lands_on_the_same_account(client, db_session, exchanger):
    """The Google login method finds its account; no second one is created."""
    first = await _round_trip(client, exchanger)
    second = await _round_trip(client, exchanger)

    assert first.status_code == second.status_code == 302
    assert len((await db_session.execute(select(User))).scalars().all()) == 1


async def test_a_sign_in_from_the_back_office_returns_there(client, exchanger):
    """One callback on the site's host serves both apps; the state remembers which one started."""
    response = await _round_trip(client, exchanger, app="admin", return_to="/tickets?page=2")

    assert response.headers["location"] == f"{oauth_flow.ADMIN}/tickets?page=2"


# --- callback: refusals ------------------------------------------------------------------------


async def test_a_callback_without_the_cookie_is_refused(client, exchanger):
    """Another browser's state: the sign-in was not started here."""
    started = await _start(client)

    response = await _callback(client, _sent_to_google(started)["state"], cookie=None)

    oauth_flow.sent_back_with(response, "oauth_state_invalid")
    assert exchanger.exchanges == []


async def test_a_callback_whose_cookie_names_another_state_is_refused(client, exchanger):
    """Two sign-ins started, the callback of one with the cookie of the other: not the same sign-in."""
    first, second = await _start(client), await _start(client)

    response = await _callback(
        client, _sent_to_google(first)["state"], cookie=oauth_flow.oauth_cookie(second)
    )

    oauth_flow.sent_back_with(response, "oauth_state_invalid")


async def test_a_state_works_once(client, exchanger):
    """A replayed callback finds nothing, even with the right cookie."""
    started = await _start(client)
    params = _sent_to_google(started)
    exchanger.id_token = _google_token(params["nonce"])
    assert (
        await _callback(client, params["state"], cookie=oauth_flow.oauth_cookie(started))
    ).status_code == 302

    replayed = await _callback(client, params["state"], cookie=oauth_flow.oauth_cookie(started))

    oauth_flow.sent_back_with(replayed, "oauth_state_invalid")


async def test_an_expired_state_is_refused(client, redis, exchanger):
    """Ten minutes on, the record is gone: start again."""
    started = await _start(client)
    state = _sent_to_google(started)["state"]
    await redis.delete(f"oauth_state:{state}")

    oauth_flow.sent_back_with(
        await _callback(client, state, cookie=oauth_flow.oauth_cookie(started)), "oauth_state_invalid"
    )


async def test_a_state_started_for_another_provider_is_refused(client, exchanger):
    """Google's state on LINE's callback: spent, refused, and sent back to the app that started it."""
    started = await _start(client, app="admin")
    state = _sent_to_google(started)["state"]

    response = await _callback(client, state, cookie=oauth_flow.oauth_cookie(started), provider="line")

    oauth_flow.sent_back_with(response, "oauth_state_invalid", oauth_flow.ADMIN)


@pytest.mark.parametrize(
    "error, code", [("access_denied", "oauth_cancelled"), ("server_error", "oauth_exchange_failed")]
)
async def test_google_sending_back_an_error(client, exchanger, error, code):
    """The user said no, or Google could not go on; either way there is no code to exchange."""
    started = await _start(client, app="admin")

    response = await _callback(
        client, _sent_to_google(started)["state"], cookie=oauth_flow.oauth_cookie(started), error=error
    )

    oauth_flow.sent_back_with(response, code, oauth_flow.ADMIN)
    assert exchanger.exchanges == []


async def test_a_failed_exchange_is_refused(client, exchanger):
    """Google would not exchange the code, so there is no token to sign in with."""
    started = await _start(client)
    exchanger.id_token = None  # Google refuses the code

    response = await _callback(
        client, _sent_to_google(started)["state"], cookie=oauth_flow.oauth_cookie(started)
    )

    oauth_flow.sent_back_with(response, "oauth_exchange_failed")


async def test_an_id_token_that_does_not_verify_is_refused(client, exchanger):
    """The exchange answered, but with nothing Google signed."""
    started = await _start(client)
    exchanger.id_token = "not-a-token"

    response = await _callback(
        client, _sent_to_google(started)["state"], cookie=oauth_flow.oauth_cookie(started)
    )

    oauth_flow.sent_back_with(response, "sso_token_invalid")


@pytest.mark.parametrize("nonce", ["another-sign-in's-nonce", None])
async def test_an_id_token_from_another_sign_in_is_refused(client, exchanger, nonce):
    """The nonce ties the token to the sign-in this server started; one without it is not ours."""
    started = await _start(client)
    exchanger.id_token = _google_token(nonce)

    response = await _callback(
        client, _sent_to_google(started)["state"], cookie=oauth_flow.oauth_cookie(started)
    )

    oauth_flow.sent_back_with(response, "sso_token_invalid")


async def test_an_unverified_email_is_refused(client, exchanger):
    """A first sign-in needs an email Google has verified, as `/auth/sso/google` always did."""
    oauth_flow.sent_back_with(
        await _round_trip(client, exchanger, email_verified=False), "sso_email_unverified"
    )


async def test_an_email_another_account_holds_is_refused(client, db_session, exchanger):
    """The owner of that email links Google in their settings instead (ADR-217)."""
    await create_account(db_session, name="Owner", contact_type="email", value="g@x.com", password_hash="h")

    oauth_flow.sent_back_with(await _round_trip(client, exchanger), "sso_email_taken")


# --- logs ----------------------------------------------------------------------------------


async def test_no_code_token_or_state_reaches_the_log(client, redis, exchanger, caplog):
    """A sign-in that works and one that fails, at DEBUG: none of the secrets turn up in our own records.

    The test client's own request log (`httpx`) prints the URLs it calls, query and all, so it is left out;
    the backend's access log is covered by the filter test below.
    """
    caplog.set_level(logging.DEBUG)
    started = await _start(client)
    params = _sent_to_google(started)
    verifier = json.loads(await redis.get(f"oauth_state:{params['state']}"))["code_verifier"]
    signed_in_with = exchanger.id_token = _google_token(params["nonce"])
    await _callback(client, params["state"], cookie=oauth_flow.oauth_cookie(started))
    exchanger.id_token = "not-a-token"
    failed = await _start(client)
    await _callback(client, _sent_to_google(failed)["state"], cookie=oauth_flow.oauth_cookie(failed))

    ours = "\n".join(record.getMessage() for record in caplog.records if not record.name.startswith("httpx"))
    for secret in (
        oauth_flow.CODE,
        params["state"],
        params["nonce"],
        verifier,
        signed_in_with,
        exchanger.id_token,
    ):
        assert secret not in ours


def _access_record(path: str) -> logging.LogRecord:
    """A record as uvicorn's access logger writes it."""
    return logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        0,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1:5000", "GET", path, "1.1", 302),
        None,
    )


def test_the_access_log_hides_the_query_of_an_oauth_request():
    """The access log prints the request line in full, and a callback's query carries code and state."""
    record = _access_record("/api/v1/auth/oauth/google/callback?code=secret-code&state=secret-state")

    assert OAuthQueryRedactor().filter(record) is True
    assert record.getMessage() == '127.0.0.1:5000 - "GET /api/v1/auth/oauth/google/callback?… HTTP/1.1" 302'


def test_the_access_log_leaves_every_other_request_alone():
    """Only OAuth URLs are rewritten; every other request line keeps its query."""
    record = _access_record("/api/v1/tickets?page=2")

    OAuthQueryRedactor().filter(record)

    assert "/api/v1/tickets?page=2" in record.getMessage()


def test_the_redactor_is_on_uvicorns_access_log():
    """Attached when the app is imported, after uvicorn has configured its loggers."""
    assert any(isinstance(f, OAuthQueryRedactor) for f in logging.getLogger("uvicorn.access").filters)
