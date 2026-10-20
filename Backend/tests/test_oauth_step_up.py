"""Proving a LINE-only account at LINE before it gains a new way in (ADR-361).

An account with no password and no contact can prove itself only with the provider it holds (ADR-234), and
since ADR-331 the browser never holds that provider's `id_token`. So the site sends the person to LINE to
sign in again; the callback records a proof for this session and this action, and the request they were
making then goes through.

LINE's token endpoint and verify API are faked, as in `tests/test_oauth_line.py`.
"""

import json
import time
from datetime import timedelta
from urllib.parse import parse_qsl, urlsplit

import pytest

from app.core import auth_cookies
from app.core.config import settings
from app.core.security import create_access_token
from app.main import app
from app.models.auth import UserIdentity
from app.repositories.session_repository import SessionRepository
from app.services.auth_account import create_account
from app.sso.oauth import get_oauth_exchanger
from tests import oauth_flow
from tests.conftest import auth_headers_for, token_for
from tests.cookies import cookie_header, cookies_set_by
from tests.fakes import FakeOAuthExchanger

pytestmark = pytest.mark.asyncio

LINE_AUTHORIZE = "https://access.line.me/oauth2/v2.1/authorize"
LINE_SUB = "U-line-only"
RETURN_TO = "/map?apply=1"


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    """LINE configured, and the two apps on hosts of their own, whatever the environment says."""
    monkeypatch.setattr(settings, "LINE_CHANNEL_ID", "line-channel")
    monkeypatch.setattr(settings, "LINE_CHANNEL_SECRET", "line-secret")
    oauth_flow.configure_apps(monkeypatch)


async def _line_only(db, redis):
    """An account whose only credential is a LINE identity: no password, no contact."""
    user = await create_account(db, name="只用 LINE", provider="line", provider_subject=LINE_SUB)
    return str(user.uuid), await auth_headers_for(redis, user.uuid)


@pytest.fixture
def exchanger(client):
    """LINE's token endpoint, faked."""
    fake = FakeOAuthExchanger()
    app.dependency_overrides[get_oauth_exchanger] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_oauth_exchanger, None)


def _line_token(nonce: str, *, sub: str = LINE_SUB, signed_in_ago: int | None = 5) -> str:
    """An `id_token` the fake verifier accepts, for someone who signed in at LINE `signed_in_ago` seconds ago.

    None leaves `auth_time` out, as LINE does when it was not asked for one.
    """
    claims = {"sub": sub, "nonce": nonce}
    if signed_in_ago is not None:
        claims["auth_time"] = int(time.time()) - signed_in_ago
    return json.dumps(claims)


async def _come_back(client, started, token: str, **params):
    """Come back from LINE to the callback, carrying the browser's OAuth cookie and its access cookie.

    `params` replace or add to LINE's query; None leaves one out.
    """
    cookies = {
        oauth_flow.oauth_cookie_name(): oauth_flow.oauth_cookie(started),
        auth_cookies.access_cookie_name(): token,
    }
    query = {"code": oauth_flow.CODE, "state": oauth_flow.oauth_cookie(started), **params}
    query = {name: value for name, value in query.items() if value is not None}
    return await client.get(
        "/api/v1/auth/oauth/line/callback", params=query, headers=cookie_header(**cookies)
    )


async def _step_up_at_line(client, exchanger, token: str, *, action: str = "add_contact", **claims):
    """Start a step-up for `action`, have LINE vouch with the right nonce, and come back to the callback."""
    started = await _start_step_up(client, token, action=action)
    params = oauth_flow.sent_to(started, LINE_AUTHORIZE)
    exchanger.id_token = _line_token(params["nonce"], **claims)
    return await _come_back(client, started, token)


def _signed_in_browser(token: str) -> dict:
    """What a signed-in browser sends on a navigation from one of our pages: its access cookie and Referer."""
    return {**cookie_header(**{auth_cookies.access_cookie_name(): token}), **oauth_flow.FROM_OUR_PAGE}


def _from_the_site(token: str) -> dict:
    """What a signed-in browser sends on a request from one of our pages: its access cookie and Origin."""
    return {**cookie_header(**{auth_cookies.access_cookie_name(): token}), "Origin": oauth_flow.SITE}


async def _start_step_up(client, token: str, *, action: str = "add_contact", provider: str = "line"):
    """Go to the provider to prove the account, from the site's page at `RETURN_TO`."""
    return await client.get(
        f"/api/v1/auth/oauth/{provider}/start",
        params={"purpose": "step_up", "action": action, "app": "site", "return_to": RETURN_TO},
        headers=_signed_in_browser(token),
    )


async def test_a_first_contact_asks_the_person_to_prove_it_at_line(client, db_session, redis, capture_sms):
    """Nothing else can prove this account, so the answer says where to go, and nothing is sent yet."""
    _, headers = await _line_only(db_session, redis)

    response = await client.post(
        "/api/v1/auth/contacts", headers=headers, json={"type": "phone", "value": "0912345678"}
    )

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "step_up_reauth_required"
    assert response.json()["providers"] == ["line"]
    assert capture_sms.last_code is None


async def _set_password(client, token: str):
    """Ask, as the signed-in browser, for a first password."""
    return await client.post(
        "/api/v1/auth/set-password",
        headers=_from_the_site(token),
        json={"password": "a" * 64, "salt_frontend": "aa"},
    )


async def test_a_first_password_asks_the_person_to_prove_it_at_line(client, db_session, redis):
    """The same gate as a first contact (ADR-215), so the same answer."""
    user_uuid, _ = await _line_only(db_session, redis)

    response = await _set_password(client, await token_for(redis, user_uuid))

    assert response.status_code == 422, response.text
    assert (response.json()["code"], response.json()["providers"]) == ("step_up_reauth_required", ["line"])


async def test_linking_a_provider_asks_the_person_to_prove_it_at_line(client, db_session, redis):
    """Linking goes through the same gate, so it gives the same answer rather than failing on it."""
    _, headers = await _line_only(db_session, redis)

    response = await client.post(
        "/api/v1/auth/link/google", headers=headers, json={"id_token": json.dumps({"sub": "google-sub"})}
    )

    assert response.status_code == 422, response.text
    assert (response.json()["code"], response.json()["providers"]) == ("step_up_reauth_required", ["line"])


async def test_a_step_up_asks_line_to_check_the_person_afresh(client, db_session, redis):
    """LINE shows its sign-in screen even to someone signed in there, and says when they signed in."""
    user_uuid, _ = await _line_only(db_session, redis)

    started = await _start_step_up(client, await token_for(redis, user_uuid))

    params = oauth_flow.sent_to(started, LINE_AUTHORIZE)
    assert (params["prompt"], params["max_age"]) == ("login", "300")
    assert params["state"] == oauth_flow.oauth_cookie(started)


async def test_a_step_up_without_a_session_goes_to_the_sign_in_page(client):
    """Nobody to prove: a navigation, so the sign-in page rather than a page of JSON."""
    started = await client.get(
        "/api/v1/auth/oauth/line/start",
        params={"purpose": "step_up", "action": "add_contact", "app": "site", "return_to": RETURN_TO},
        headers=oauth_flow.FROM_OUR_PAGE,
    )

    oauth_flow.start_refused(started, "session_expired")


async def test_a_step_up_from_a_session_that_has_ended_goes_to_the_sign_in_page(client, db_session, redis):
    """Signed out elsewhere: the sign-in page, and the cookies that can never work again are cleared."""
    user_uuid, _ = await _line_only(db_session, redis)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test")
    token = create_access_token({"sub": user_uuid}, sid=sid)
    await SessionRepository(redis).revoke_session(sid)

    started = await _start_step_up(client, token)

    assert started.status_code == 302, started.text
    assert started.headers["location"] == f"{oauth_flow.SITE}/login?error=session_expired"
    cleared = cookies_set_by(started)
    assert set(cleared) == {auth_cookies.access_cookie_name(), auth_cookies.refresh_cookie_name()}
    assert {cookie["max-age"] for cookie in cleared.values()} == {"0"}


async def test_a_step_up_with_an_expired_token_is_answered_for_the_proxy_to_refresh(
    client, db_session, redis
):
    """A refresh fixes it: the site's proxy refreshes and sends the start again, so the cookies stay."""
    user_uuid, _ = await _line_only(db_session, redis)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test")
    token = create_access_token({"sub": user_uuid}, expires_delta=timedelta(minutes=-1), sid=sid)

    started = await _start_step_up(client, token)

    assert started.status_code == 401, started.text
    assert started.json()["code"] == "access_token_expired"
    assert cookies_set_by(started) == {}


def _back_on_the_page(response, **query) -> None:
    """Assert the browser goes back to the page it came from, `query` added, starting nothing."""
    assert response.status_code == 302, response.text
    location = urlsplit(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{oauth_flow.SITE}/map"
    assert dict(parse_qsl(location.query)) == {"apply": "1", **query}


async def test_a_step_up_for_an_action_it_cannot_prove_goes_back_to_the_page(client, db_session, redis):
    """Replacing a contact is proved by the contact itself, never at the provider."""
    user_uuid, _ = await _line_only(db_session, redis)

    started = await _start_step_up(client, await token_for(redis, user_uuid), action="replace")

    _back_on_the_page(started, step_up_error="oauth_request_invalid")
    assert cookies_set_by(started) == {}


async def test_a_step_up_at_a_provider_the_account_does_not_hold_goes_back_to_the_page(
    client, db_session, redis
):
    """A LINE sign-in would prove someone's LINE account, not this account."""
    user = await create_account(
        db_session,
        name="只用 Google",
        provider="google",
        provider_subject="google-sub",
        contact_type="email",
        value="g@x.com",
    )

    started = await _start_step_up(client, await token_for(redis, user.uuid))

    _back_on_the_page(started, step_up_error="oauth_request_invalid")
    assert cookies_set_by(started) == {}


async def test_signing_in_again_at_line_goes_back_to_the_page(client, db_session, redis, exchanger):
    """The person proved: back to their page, still signed in as they were, and the step-up spent."""
    user_uuid, _ = await _line_only(db_session, redis)

    back = await _step_up_at_line(client, exchanger, await token_for(redis, user_uuid))

    _back_on_the_page(back, step_up="ok")
    assert set(cookies_set_by(back)) == {oauth_flow.oauth_cookie_name()}
    assert cookies_set_by(back)[oauth_flow.oauth_cookie_name()]["max-age"] == "0"


async def _add_phone(client, token: str):
    """Ask, as the signed-in browser, to add a phone: the request the step-up was for."""
    return await client.post(
        "/api/v1/auth/contacts", headers=_from_the_site(token), json={"type": "phone", "value": "0912345678"}
    )


async def test_once_proved_at_line_the_first_contact_goes_through(
    client, db_session, redis, exchanger, capture_sms
):
    """The request is simply made again: the callback's proof lets it through, and the code is sent."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)
    _back_on_the_page(await _step_up_at_line(client, exchanger, token), step_up="ok")

    response = await _add_phone(client, token)

    assert response.status_code == 202, response.text
    assert capture_sms.last_code


async def test_another_line_account_proves_nothing(client, db_session, redis, exchanger, capture_sms):
    """Whoever holds the session signs in with their own LINE: it verifies, but it is not this account's."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)

    back = await _step_up_at_line(client, exchanger, token, sub="U-someone-else")

    _back_on_the_page(back, step_up_error="step_up_invalid")
    assert (await _add_phone(client, token)).json()["code"] == "step_up_reauth_required"
    assert capture_sms.last_code is None


@pytest.mark.parametrize("signed_in_ago", [None, 301], ids=["no auth_time", "too long ago"])
async def test_a_sign_in_that_is_not_fresh_proves_nothing(
    client, db_session, redis, exchanger, capture_sms, signed_in_ago
):
    """Only a sign-in at LINE within the last five minutes counts, and LINE must say when it was."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)

    back = await _step_up_at_line(client, exchanger, token, signed_in_ago=signed_in_ago)

    _back_on_the_page(back, step_up_error="step_up_invalid")
    assert (await _add_phone(client, token)).json()["code"] == "step_up_reauth_required"


async def _started_at_line(client, exchanger, token: str):
    """Start a step-up and have LINE vouch for the person; the browser has not come back yet."""
    started = await _start_step_up(client, token)
    exchanger.id_token = _line_token(oauth_flow.sent_to(started, LINE_AUTHORIZE)["nonce"])
    return started


def _sent_to_sign_in(response) -> None:
    """Assert a callback sends the browser to the site's sign-in page as signed out, the step-up forgotten."""
    oauth_flow.sent_back_with(response, "session_expired")


async def test_a_session_signed_out_while_at_line_is_not_proved(client, db_session, redis, exchanger):
    """Signed out elsewhere meanwhile: there is no session left to hold the proof."""
    user_uuid, _ = await _line_only(db_session, redis)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test")
    token = create_access_token({"sub": user_uuid}, sid=sid)
    started = await _started_at_line(client, exchanger, token)
    await SessionRepository(redis).revoke_session(sid)

    _sent_to_sign_in(await _come_back(client, started, token))


async def test_a_browser_back_on_another_session_is_not_proved(client, db_session, redis, exchanger):
    """The proof belongs to the session that asked for it, not to whichever one the browser holds now."""
    user_uuid, _ = await _line_only(db_session, redis)
    started = await _started_at_line(client, exchanger, await token_for(redis, user_uuid))

    _sent_to_sign_in(await _come_back(client, started, await token_for(redis, user_uuid)))


async def test_an_access_token_that_ran_out_at_line_still_comes_back_proved(
    client, db_session, redis, exchanger, capture_sms
):
    """The round trip can outlast the token. A 401 here would have the site's proxy replay a spent state."""
    user_uuid, _ = await _line_only(db_session, redis)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test")
    started = await _started_at_line(client, exchanger, create_access_token({"sub": user_uuid}, sid=sid))
    expired = create_access_token({"sub": user_uuid}, expires_delta=timedelta(minutes=-1), sid=sid)

    _back_on_the_page(await _come_back(client, started, expired), step_up="ok")
    fresh = create_access_token({"sub": user_uuid}, sid=sid)
    assert (await _add_phone(client, fresh)).status_code == 202


@pytest.mark.parametrize(
    ("line_answers", "error"),
    [
        ({"query": {"code": None, "error": "access_denied"}}, "oauth_cancelled"),
        ({"id_token": None}, "oauth_exchange_failed"),
        ({"id_token": json.dumps({"sub": LINE_SUB, "nonce": "another sign-in's"})}, "sso_token_invalid"),
    ],
    ids=["cancelled at LINE", "no token from LINE", "a token from another sign-in"],
)
async def test_a_step_up_that_fails_at_line_goes_back_to_the_page(
    client, db_session, redis, exchanger, line_answers, error
):
    """The person is still signed in, so back to their page with what went wrong, not to the sign-in page."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)
    started = await _started_at_line(client, exchanger, token)
    if "id_token" in line_answers:
        exchanger.id_token = line_answers["id_token"]

    back = await _come_back(client, started, token, **line_answers.get("query", {}))

    _back_on_the_page(back, step_up_error=error)
    assert cookies_set_by(back)[oauth_flow.oauth_cookie_name()]["max-age"] == "0"
    assert (await _add_phone(client, token)).json()["code"] == "step_up_reauth_required"


async def test_a_proof_lets_one_request_through(client, db_session, redis, exchanger, capture_sms):
    """Spent by the request it was for: the next one asks again."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)
    await _step_up_at_line(client, exchanger, token)

    assert (await _add_phone(client, token)).status_code == 202
    assert (await _add_phone(client, token)).json()["code"] == "step_up_reauth_required"


async def test_a_proof_is_for_the_action_it_was_asked_for(client, db_session, redis, exchanger):
    """Proved for a password: adding a contact still asks, as a code is bound to its action (ADR-164)."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)
    _back_on_the_page(await _step_up_at_line(client, exchanger, token, action="set_password"), step_up="ok")

    assert (await _add_phone(client, token)).json()["code"] == "step_up_reauth_required"


async def test_once_proved_at_line_a_first_password_is_set(client, db_session, redis, exchanger):
    """The same proof, asked for this action, lets the first password through."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)
    _back_on_the_page(await _step_up_at_line(client, exchanger, token, action="set_password"), step_up="ok")

    response = await _set_password(client, token)

    assert response.status_code == 204, response.text


async def test_a_proof_is_for_the_session_that_asked_for_it(client, db_session, redis, exchanger):
    """Another session of the same account, another device say, has proved nothing."""
    user_uuid, _ = await _line_only(db_session, redis)
    await _step_up_at_line(client, exchanger, await token_for(redis, user_uuid))

    response = await _add_phone(client, await token_for(redis, user_uuid))

    assert response.json()["code"] == "step_up_reauth_required"


async def _link_google(client, token: str):
    """Ask, as the signed-in browser, to add a Google account as another way in."""
    return await client.post(
        "/api/v1/auth/link/google",
        headers=_from_the_site(token),
        json={"id_token": json.dumps({"sub": "google-sub"})},
    )


async def test_once_proved_at_line_a_provider_is_linked(client, db_session, redis, exchanger):
    """Proved for linking, the Google account is added."""
    user_uuid, _ = await _line_only(db_session, redis)
    token = await token_for(redis, user_uuid)
    _back_on_the_page(await _step_up_at_line(client, exchanger, token, action="link_identity"), step_up="ok")

    response = await _link_google(client, token)

    assert response.status_code == 200, response.text


async def test_once_proved_at_line_another_provider_is_unlinked(client, db_session, redis, exchanger):
    """Signed in with LINE and Google and nothing else, proved at LINE: the Google account comes off."""
    user_uuid, _ = await _line_only(db_session, redis)
    db_session.add(UserIdentity(user_uuid=user_uuid, provider="google", provider_subject="google-sub"))
    await db_session.commit()
    token = await token_for(redis, user_uuid)
    _back_on_the_page(
        await _step_up_at_line(client, exchanger, token, action="unlink_identity"), step_up="ok"
    )

    response = await client.delete("/api/v1/auth/link/google", headers=_from_the_site(token))

    assert response.status_code == 204, response.text
