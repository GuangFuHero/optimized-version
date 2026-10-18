"""Signing in with LINE through the backend's own OAuth flow (ADR-331).

The flow is Google's (`tests/test_oauth_google.py` covers the state, the cookie and every way back to the
sign-in page); what differs is LINE itself. Its verify API checks the nonce the backend hands it, its email
is optional, and a first sign-in never fails over one.

The exchange is faked, and so is the verifier: it reads the `id_token` as JSON and checks the nonce the
way LINE's verify API would.
"""

import json

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core import auth_cookies
from app.core.config import settings
from app.main import app
from app.models.auth import User, UserContact, UserIdentity
from app.services import sso_login
from app.services.auth_account import create_account
from app.sso.oauth import get_oauth_exchanger
from tests import oauth_flow
from tests.cookies import cookies_set_by
from tests.fakes import FakeOAuthExchanger

pytestmark = pytest.mark.asyncio

LINE_AUTHORIZE = "https://access.line.me/oauth2/v2.1/authorize"


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    """LINE configured, and the two apps on hosts of their own, whatever the environment says."""
    monkeypatch.setattr(settings, "LINE_CHANNEL_ID", "line-channel")
    monkeypatch.setattr(settings, "LINE_CHANNEL_SECRET", "line-secret")
    oauth_flow.configure_apps(monkeypatch)


@pytest.fixture
def exchanger(client):
    """LINE's token endpoint, faked."""
    fake = FakeOAuthExchanger()
    app.dependency_overrides[get_oauth_exchanger] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_oauth_exchanger, None)


def _line_token(nonce: str | None, **claims) -> str:
    """An `id_token` the fake verifier accepts: the claims as JSON."""
    defaults = {"sub": "U1234567890", "name": "阿美"}
    return json.dumps({**defaults, **claims, **({"nonce": nonce} if nonce is not None else {})})


async def _round_trip(client, exchanger, **claims):
    """Start, have LINE vouch for `claims` with the right nonce, and come back to the callback."""
    started = await oauth_flow.start(client, "line")
    params = oauth_flow.sent_to(started, LINE_AUTHORIZE)
    exchanger.id_token = _line_token(params["nonce"], **claims)
    return await oauth_flow.callback(client, "line", params["state"], cookie=oauth_flow.oauth_cookie(started))


async def _contacts(db) -> list[tuple[str, str, bool]]:
    return [(c.type, c.value, c.verified) for c in (await db.execute(select(UserContact))).scalars().all()]


def _signed_in(response) -> None:
    """Assert the browser lands where it started, signed in."""
    assert response.status_code == 302, response.text
    assert response.headers["location"] == f"{oauth_flow.SITE}/tickets"
    assert auth_cookies.access_cookie_name() in cookies_set_by(response)


async def test_start_sends_the_browser_to_line(client):
    """LINE's sign-in page, for our channel, with the same state, nonce and PKCE as Google's."""
    params = oauth_flow.sent_to(await oauth_flow.start(client, "line"), LINE_AUTHORIZE)

    assert {k: params[k] for k in ("response_type", "client_id", "redirect_uri", "scope")} == {
        "response_type": "code",
        "client_id": "line-channel",
        "redirect_uri": f"{oauth_flow.SITE}/api/v1/auth/oauth/line/callback",
        "scope": "openid profile",
    }
    assert params["code_challenge_method"] == "S256"
    assert params["state"] and params["nonce"] and params["code_challenge"]


async def test_start_refuses_line_without_its_secret(client, monkeypatch):
    """The sign-in could never finish, so it does not begin."""
    monkeypatch.setattr(settings, "LINE_CHANNEL_SECRET", "")

    oauth_flow.start_refused(await oauth_flow.start(client, "line"), "oauth_request_invalid")


async def test_a_first_sign_in_without_an_email_creates_an_account_with_no_contact(
    client, db_session, exchanger
):
    """LINE need not share an email, and the account works without one."""
    response = await _round_trip(client, exchanger)

    _signed_in(response)
    assert exchanger.exchanges[0][:2] == ("line", oauth_flow.CODE)
    [identity] = (await db_session.execute(select(UserIdentity))).scalars().all()
    assert (identity.provider, identity.provider_subject) == ("line", "U1234567890")
    assert await _contacts(db_session) == []


async def test_a_first_sign_in_with_an_email_keeps_it_as_a_verified_contact(client, db_session, exchanger):
    """LINE has verified the email it shares, so it becomes the account's verified contact."""
    _signed_in(await _round_trip(client, exchanger, email="mei@x.com"))

    assert await _contacts(db_session) == [("email", "mei@x.com", True)]


async def test_an_email_another_account_holds_is_left_out_not_refused(client, db_session, exchanger):
    """Unlike Google: LINE's email is optional, so a taken one is skipped and the sign-in goes on."""
    await create_account(
        db_session, name="Owner", contact_type="email", value="taken@x.com", password_hash="h"
    )

    _signed_in(await _round_trip(client, exchanger, email="taken@x.com"))

    assert len((await db_session.execute(select(User))).scalars().all()) == 2
    assert await _contacts(db_session) == [("email", "taken@x.com", True)]


async def test_a_malformed_email_is_left_out(client, db_session, exchanger):
    """Not an email at all: the account is created without it, and no error."""
    _signed_in(await _round_trip(client, exchanger, email="not-an-email"))

    assert await _contacts(db_session) == []


async def test_a_first_sign_in_without_a_name_is_named_after_the_line_id(client, db_session, exchanger):
    """No display name from LINE: the account is called `LINE-` and the first 8 characters of its id."""
    _signed_in(await _round_trip(client, exchanger, name=None))

    assert (await db_session.execute(select(User))).scalars().one().name == "LINE-U1234567"


async def test_a_second_sign_in_lands_on_the_same_account(client, db_session, exchanger):
    """The LINE login method finds its account; no second one is created."""
    _signed_in(await _round_trip(client, exchanger))
    _signed_in(await _round_trip(client, exchanger))

    assert len((await db_session.execute(select(User))).scalars().all()) == 1


@pytest.mark.parametrize("nonce", ["another-sign-in's-nonce", None])
async def test_an_id_token_from_another_sign_in_is_refused(client, exchanger, nonce):
    """The callback hands LINE's verify API the nonce it sent, and a token without that one fails."""
    started = await oauth_flow.start(client, "line")
    state = oauth_flow.sent_to(started, LINE_AUTHORIZE)["state"]
    exchanger.id_token = _line_token(nonce)

    response = await oauth_flow.callback(client, "line", state, cookie=oauth_flow.oauth_cookie(started))

    oauth_flow.sent_back_with(response, "sso_token_invalid")


async def test_a_first_sign_in_that_loses_a_race_is_refused(client, exchanger, monkeypatch):
    """Two first sign-ins at once, and this one's account was not the one created: try again."""

    async def _raced(*args, **kwargs):
        raise IntegrityError("insert", {}, Exception("duplicate"))

    monkeypatch.setattr(sso_login, "create_account", _raced)

    oauth_flow.sent_back_with(await _round_trip(client, exchanger), "sso_signin_race")
