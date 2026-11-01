"""The browser signs in, refreshes, switches identity and signs out through cookies (ADR-325).

`/auth/session*` are the browser's endpoints. They answer with `Set-Cookie` and never put a token in
the body, so a script injected into a page has nothing to read. `/auth/login`, `/auth/refresh`,
`/auth/switch-identity` and `/auth/verify` stay for Bearer clients, and each pair runs the same checks.
Switching identity is the one operation each kind of client may only do its own way. The endpoints that
end the caller's session also clear the cookies, but only on a request that authenticated with them.
"""

import logging
import uuid
from datetime import timedelta

import pytest
from jose import jwt
from redis.exceptions import RedisError
from sqlalchemy import delete

from app.core import auth_cookies
from app.core.config import settings
from app.core.security import create_access_token, generate_salt, get_password_hash
from app.models.auth import UserIdentity
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.repositories.session_repository import SessionRepository
from app.services.auth_account import create_account
from tests.conftest import sign_in, token_for
from tests.cookies import cookie_header, cookies_set_by

pytestmark = pytest.mark.asyncio

SITE = "https://site.test"
ORIGIN = {"Origin": SITE}
DOMAIN = ".site.test"
EMAIL = "browser@x.com"
PHONE = "0912345678"
PASSWORD = "secret"

SESSION = "/api/v1/auth/session"
REFRESH = "/api/v1/auth/session/refresh"
VERIFY = "/api/v1/auth/session/verify"
IDENTITY = "/api/v1/auth/session/identity"
SWITCH = "/api/v1/auth/switch-identity"


@pytest.fixture(autouse=True)
def _site_is_allowed(monkeypatch):
    """One allowed origin and a parent domain, whatever the environment configured."""
    monkeypatch.setattr(settings, "AUTH_ALLOWED_ORIGINS", SITE)
    monkeypatch.setattr(settings, "AUTH_COOKIE_DOMAIN", DOMAIN)


def _at() -> str:
    return auth_cookies.access_cookie_name()


def _rt() -> str:
    return auth_cookies.refresh_cookie_name()


def _cookies(at: str | None = None, rt: str | None = None) -> dict:
    """A `Cookie` header carrying whichever of the two sign-in cookies are given."""
    sent = {name: value for name, value in ((_at(), at), (_rt(), rt)) if value is not None}
    return cookie_header(**sent)


async def _account(db, *, contact_type: str = "email", value: str = EMAIL) -> str:
    """A committed account that signs in with PASSWORD; returns its uuid."""
    user = await create_account(
        db,
        contact_type=contact_type,
        value=value,
        name="瀏覽器的人",
        password_hash=get_password_hash(PASSWORD, generate_salt()),
    )
    return str(user.uuid)


async def _member_of_a_team(db) -> dict:
    """An account that signs in with PASSWORD and is also `member` of 慈濟; returns the switch body."""
    account = await _account(db)
    member = Role(name="member", kind="team")
    team = Team(name="慈濟", type="ngo")
    db.add_all([member, team])
    await db.flush()
    db.add(UserRoleAssign(user_uuid=account, role_uuid=member.uuid, team_uuid=team.uuid))
    body = {"role_uuid": str(member.uuid), "team_uuid": str(team.uuid)}
    await db.commit()
    return body


async def _sign_in(client, username: str = EMAIL, password: str = PASSWORD, headers: dict = ORIGIN):
    return await client.post(SESSION, json={"username": username, "password": password}, headers=headers)


def _assert_signed_in(response) -> tuple[str, str]:
    """Assert the response signed the browser in, and return the (access, refresh) cookie values.

    Both cookies as ADR-326 describes them, and neither token anywhere in the body.
    """
    cookies = cookies_set_by(response)
    assert set(cookies) == {_at(), _rt()}, cookies
    for cookie in cookies.values():
        assert cookie["httponly"] is True and cookie["secure"] is True
        assert cookie["samesite"].lower() == "lax"
        assert (cookie["path"], cookie["domain"]) == ("/", DOMAIN)
        assert cookie["max-age"] == str(settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)
        assert cookie["value"] not in response.text
    return cookies[_at()]["value"], cookies[_rt()]["value"]


def _assert_cleared(response) -> None:
    """Both sign-in cookies removed, under the path and domain they were set with."""
    cookies = cookies_set_by(response)
    assert set(cookies) == {_at(), _rt()}, cookies
    for cookie in cookies.values():
        assert (cookie["max-age"], cookie["path"], cookie["domain"]) == ("0", "/", DOMAIN)


def _sid_of(access_token: str) -> str:
    return jwt.get_unverified_claims(access_token)["sid"]


async def _acting_as(client, access_token: str) -> str:
    """The role `/users/me` reports when the browser sends this access cookie."""
    response = await client.get("/api/v1/users/me", headers=_cookies(at=access_token))
    assert response.status_code == 200, response.text
    return response.json()["active_identity"]["role"]


# --- POST /auth/session: sign in with a password ------------------------------------------------


async def test_signing_in_sets_the_cookies_and_returns_who_signed_in(client, db_session):
    """The body names the account and its identity; the tokens are only in the cookies (ADR-325 point 2)."""
    account = await _account(db_session)

    response = await _sign_in(client)

    assert response.status_code == 200, response.text
    _assert_signed_in(response)
    body = response.json()
    assert body["user"] == {"uuid": account, "name": "瀏覽器的人"}
    assert body["identity"]["role"] == "user"
    assert "access_token" not in body and "refresh_token" not in body


async def test_the_access_cookie_signs_the_browser_in(client, db_session):
    """Every login lands on `user` (ADR-290), and the cookie is what carries it from then on."""
    await _account(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    assert await _acting_as(client, access) == "user"


async def test_a_phone_number_signs_in_too(client, db_session):
    """The username is tried as an email, then as a phone number, like `/auth/login`."""
    await _account(db_session, contact_type="phone", value="+886912345678")

    response = await _sign_in(client, username=PHONE)

    assert response.status_code == 200, response.text


async def test_a_wrong_password_is_401_and_leaves_the_cookies_alone(client, db_session):
    """A failed attempt is not a sign-out: whoever is signed in on this browser stays signed in."""
    await _account(db_session)

    response = await _sign_in(client, password="wrong-password", headers={**ORIGIN, **_cookies(at="x")})

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "credentials_invalid"
    assert cookies_set_by(response) == {}


async def test_a_username_over_320_characters_is_refused_unread(client, db_session):
    """The same cap `/auth/login`'s normaliser applies (#75), here in the schema."""
    response = await _sign_in(client, username="a" * 309 + "@example.com")

    assert response.status_code == 422, response.text


async def test_a_referer_stands_in_for_a_missing_origin(client, db_session, capture_email):
    """A browser that sends no `Origin` still names the page in `Referer` (ADR-327), on all three."""
    referer = {"Referer": f"{SITE}/login"}
    await _account(db_session)
    await _register(client, value="new@x.com")

    signed_in = await _sign_in(client, headers=referer)
    verified = await client.post(
        VERIFY, json={"type": "email", "value": "new@x.com", "code": capture_email.last_code}, headers=referer
    )
    signed_out = await client.delete(SESSION, headers=referer)

    assert (signed_in.status_code, verified.status_code, signed_out.status_code) == (200, 200, 204)


@pytest.mark.parametrize("method, path", [("POST", SESSION), ("POST", VERIFY), ("DELETE", SESSION)])
@pytest.mark.parametrize("origin", [{"Origin": "https://elsewhere.test"}, {}])
async def test_the_session_endpoints_refuse_another_origin(client, method, path, origin):
    """Signing in, finishing a registration and signing out all check where the request came from.

    None of them carries an access cookie for the usual check to look at, so they check themselves:
    otherwise another page could sign the browser into an account of its choosing. The check comes
    before the body is validated, so an empty one is refused for its origin, not its content.
    """
    response = await client.request(method, path, json={} if method == "POST" else None, headers=origin)

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "origin_not_allowed"


# --- POST /auth/session/refresh -------------------------------------------------------------------


@pytest.mark.parametrize("origin", [{}, {"Origin": "https://elsewhere.test"}])
async def test_refreshing_replaces_both_cookies(client, db_session, origin):
    """204 and a new pair, whatever the origin: the frontend's server refreshes before a page loads."""
    await _account(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))

    response = await client.post(REFRESH, headers={**origin, **_cookies(access, refresh)})

    assert response.status_code == 204, response.text
    new_access, new_refresh = _assert_signed_in(response)
    assert (new_access, new_refresh) != (access, refresh)
    assert await _acting_as(client, new_access) == "user"


async def test_a_refresh_replayed_within_the_grace_period_gets_the_same_token(client, db_session):
    """Two tabs refreshing at once must not sign each other out (ADR-330)."""
    await _account(db_session)
    _, refresh = _assert_signed_in(await _sign_in(client))

    first = await client.post(REFRESH, headers=_cookies(rt=refresh))
    second = await client.post(REFRESH, headers=_cookies(rt=refresh))

    assert first.status_code == second.status_code == 204, second.text
    assert _assert_signed_in(first)[1] == _assert_signed_in(second)[1]


async def test_refreshing_without_a_cookie_is_401_and_clears(client):
    """Nothing to refresh with: signed out, and whatever access cookie is left is cleared too."""
    response = await client.post(REFRESH, headers=_cookies(at="left-over"))

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "refresh_token_invalid"
    _assert_cleared(response)


async def test_refreshing_a_revoked_session_is_401_and_clears(client, db_session, redis):
    """Logged out elsewhere: the refresh cookie can never work again, so the browser drops it."""
    await _account(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))
    await SessionRepository(redis).revoke_session(_sid_of(access))

    response = await client.post(REFRESH, headers=_cookies(access, refresh))

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "refresh_token_invalid"
    _assert_cleared(response)


async def test_refreshing_a_revoked_identity_is_reset_and_keeps_the_cookies(client, db_session):
    """The identity the session acts as is gone: reset, not signed out (Spec 029, ADR-403).

    Nothing is rotated, so the same cookies refresh again, now on the default identity.
    """
    account = await _account(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))
    await db_session.execute(delete(UserRoleAssign).where(UserRoleAssign.user_uuid == account))
    await db_session.commit()

    response = await client.post(REFRESH, headers=_cookies(access, refresh))

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "identity_reset"
    assert cookies_set_by(response) == {}
    again = await client.post(REFRESH, headers=_cookies(access, refresh))
    assert again.status_code == 204, again.text


async def test_a_failed_bearer_refresh_clears_nothing(client):
    """`/auth/refresh` is the Bearer one: it never set a cookie, so it never clears one."""
    response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": "not-a-token"}, headers=_cookies(at="a", rt="b")
    )

    assert response.status_code == 401, response.text
    assert cookies_set_by(response) == {}


# --- DELETE /auth/session: sign this browser out ----------------------------------------------


async def test_signing_out_ends_the_session_and_clears(client, db_session):
    """204, both cookies cleared, and neither token works afterwards."""
    await _account(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))

    response = await client.delete(SESSION, headers={**ORIGIN, **_cookies(access, refresh)})

    assert response.status_code == 204, response.text
    _assert_cleared(response)
    after = await client.get("/api/v1/users/me", headers=_cookies(at=access))
    assert after.json()["code"] == "session_expired"
    assert (await client.post(REFRESH, headers=_cookies(rt=refresh))).status_code == 401


async def test_an_expired_access_cookie_still_names_the_session(client, db_session, redis):
    """Its 15 minutes are up, but it is still ours and still says which session to end (ADR-190)."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    expired = create_access_token({"sub": user_uuid}, expires_delta=timedelta(minutes=-1), sid=sid, act=act)

    response = await client.delete(SESSION, headers={**ORIGIN, **_cookies(at=expired)})

    assert response.status_code == 204, response.text
    assert await SessionRepository(redis).get_session(sid) is None


async def test_the_refresh_cookie_names_the_session_when_the_access_cookie_cannot(client, db_session, redis):
    """No usable access cookie: the refresh cookie's record says which session it belongs to."""
    await _account(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))

    response = await client.delete(SESSION, headers={**ORIGIN, **_cookies(at="not-a-jwt", rt=refresh)})

    assert response.status_code == 204, response.text
    assert await SessionRepository(redis).get_session(_sid_of(access)) is None


async def test_signing_out_with_no_cookies_is_still_204(client):
    """What was asked for, a signed-out browser, already holds (ADR-190)."""
    response = await client.delete(SESSION, headers=ORIGIN)

    assert response.status_code == 204, response.text
    _assert_cleared(response)


async def test_signing_out_while_redis_is_down_is_503_and_keeps_the_cookies(client, db_session, monkeypatch):
    """The session was not ended, so the browser must not be told otherwise."""
    await _account(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))

    async def _unreachable(self, sid):
        raise RedisError("down")

    monkeypatch.setattr(SessionRepository, "revoke_session", _unreachable)
    response = await client.delete(SESSION, headers={**ORIGIN, **_cookies(access, refresh)})

    assert response.status_code == 503, response.text
    assert response.json()["code"] == "session_store_unavailable"
    assert cookies_set_by(response) == {}


# --- POST /auth/session/verify: finish a registration and sign in -------------------------------


async def _register(client, value: str = EMAIL) -> None:
    """Start a registration; its code goes to `capture_email`."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "type": "email",
            "value": value,
            "password": PASSWORD,
            "salt_frontend": "abc",
            "name": "新來的人",
        },
    )
    assert response.status_code == 202, response.text


async def test_verifying_signs_the_new_account_in(client, capture_email):
    """The same body as `/auth/verify`; the answer is cookies and the shape `POST /auth/session` has."""
    await _register(client)

    response = await client.post(
        VERIFY, json={"type": "email", "value": EMAIL, "code": capture_email.last_code}, headers=ORIGIN
    )

    assert response.status_code == 200, response.text
    access, _ = _assert_signed_in(response)
    assert response.json()["user"]["name"] == "新來的人"
    assert response.json()["identity"]["role"] == "user"
    assert await _acting_as(client, access) == "user"


async def test_a_wrong_code_is_400_and_signs_nobody_in(client, capture_email):
    """Same code as `/auth/verify`, and no cookie."""
    await _register(client)

    response = await client.post(
        VERIFY, json={"type": "email", "value": EMAIL, "code": "000000"}, headers=ORIGIN
    )

    assert response.status_code == 400, response.text
    assert response.json()["code"] == "code_invalid"
    assert cookies_set_by(response) == {}


# --- POST /auth/session/identity: switch identity in the browser ------------------------------


async def test_switching_in_the_browser_replaces_only_the_access_cookie(client, db_session):
    """The identity in the body, the token in the cookie; the old access cookie is stale (ADR-195)."""
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post(IDENTITY, json=body, headers={**ORIGIN, **_cookies(at=access)})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "identity": {
            "role_uuid": body["role_uuid"],
            "role": "member",
            "team_uuid": body["team_uuid"],
            "team": "慈濟",
        }
    }
    cookies = cookies_set_by(response)
    assert set(cookies) == {_at()}
    assert cookies[_at()]["value"] not in response.text
    assert await _acting_as(client, cookies[_at()]["value"]) == "member"
    stale = await client.get("/api/v1/users/me", headers=_cookies(at=access))
    assert stale.json()["code"] == "access_token_stale"


async def test_a_refresh_after_switching_in_the_browser_keeps_the_identity(client, db_session):
    """The session remembers the switch, so the next pair of cookies acts as it too (ADR-188)."""
    body = await _member_of_a_team(db_session)
    access, refresh = _assert_signed_in(await _sign_in(client))
    switched = await client.post(IDENTITY, json=body, headers={**ORIGIN, **_cookies(at=access)})
    assert switched.status_code == 200, switched.text

    refreshed = await client.post(REFRESH, headers=_cookies(rt=refresh))

    assert await _acting_as(client, _assert_signed_in(refreshed)[0]) == "member"


async def test_switching_in_the_browser_to_an_identity_not_held_is_403(client, db_session):
    """Switching never grants an identity (ADR-068)."""
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post(
        IDENTITY, json={**body, "team_uuid": str(uuid.uuid4())}, headers={**ORIGIN, **_cookies(at=access)}
    )

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "identity_not_held"
    assert cookies_set_by(response) == {}


async def test_switching_in_the_browser_on_a_dead_session_is_401_and_clears(client, db_session, redis):
    """Logged out elsewhere: nothing to switch, and the browser drops its dead cookies (ADR-328)."""
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))
    await SessionRepository(redis).revoke_session(_sid_of(access))

    response = await client.post(IDENTITY, json=body, headers={**ORIGIN, **_cookies(at=access)})

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "session_expired"
    _assert_cleared(response)


async def test_switching_in_the_browser_refuses_a_bearer_token(client, db_session):
    """Its answer is a cookie, which a Bearer client would never read: refused, and nothing changes."""
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post(IDENTITY, json=body, headers={"Authorization": f"Bearer {access}"})

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "cookie_session_required"
    assert cookies_set_by(response) == {}
    assert await _acting_as(client, access) == "user"


async def test_switching_in_the_browser_needs_one_of_our_origins(client, db_session):
    """A cookie-authenticated write like any other (ADR-327)."""
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post(
        IDENTITY, json=body, headers={"Origin": "https://elsewhere.test", **_cookies(at=access)}
    )

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "origin_not_allowed"


# --- the existing endpoints, on a cookie and on a Bearer token ---------------------------------


@pytest.fixture(params=["cookie", "bearer"])
def sent_by(request):
    """How a request carries its access token; every test using it runs once each way."""

    def _headers(access_token: str) -> dict:
        if request.param == "cookie":
            return {**ORIGIN, **_cookies(at=access_token)}
        return {"Authorization": f"Bearer {access_token}"}

    _headers.cookie = request.param == "cookie"
    return _headers


def _assert_cleared_if_cookie(response, sent_by) -> None:
    if sent_by.cookie:
        _assert_cleared(response)
    else:
        assert cookies_set_by(response) == {}


async def test_switch_identity_refuses_a_cookie_session(client, db_session):
    """Its body carries the token the cookie keeps from page scripts, so a browser is sent elsewhere.

    Nothing happens: the session still acts as `user`, and the browser's cookie still works.
    """
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post(SWITCH, json=body, headers={**ORIGIN, **_cookies(at=access)})

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "bearer_token_required"
    assert cookies_set_by(response) == {}
    assert await _acting_as(client, access) == "user"


async def test_switch_identity_stays_for_bearer_clients(client, db_session):
    """A script holds its tokens itself: it gets the new one in the body, and no cookie."""
    body = await _member_of_a_team(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post(SWITCH, json=body, headers={"Authorization": f"Bearer {access}"})

    assert response.status_code == 200, response.text
    assert response.json()["identity"]["role"] == "member"
    assert cookies_set_by(response) == {}


async def test_signing_out_everywhere_clears_the_cookies(client, db_session, sent_by):
    """This browser is one of the devices signed out."""
    await _account(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.post("/api/v1/auth/logout-all", headers=sent_by(access))

    assert response.status_code == 204, response.text
    _assert_cleared_if_cookie(response, sent_by)


async def test_signing_out_everywhere_on_a_dead_session_still_clears(client, db_session, redis, sent_by):
    """The early 204 for a session already gone (ADR-190) leaves no dead cookie behind either."""
    await _account(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))
    await SessionRepository(redis).revoke_session(_sid_of(access))

    response = await client.post("/api/v1/auth/logout-all", headers=sent_by(access))

    assert response.status_code == 204, response.text
    _assert_cleared_if_cookie(response, sent_by)


async def test_changing_the_password_clears_the_cookies(client, db_session, capture_email, sent_by):
    """Every session is revoked, this one included, so its cookies are dead."""
    await _account(db_session)
    access, _ = _assert_signed_in(await _sign_in(client))
    body = {"old_password": PASSWORD, "new_password": "brandnew", "salt_frontend": "abc"}

    response = await client.post("/api/v1/auth/change-password", json=body, headers=sent_by(access))

    assert response.status_code == 204, response.text
    _assert_cleared_if_cookie(response, sent_by)


async def test_setting_a_first_password_clears_the_cookies(client, db_session, redis, capture_email, sent_by):
    """Same for an SSO-only account's first password (ADR-160)."""
    user = await create_account(
        db_session,
        name="G",
        provider="google",
        provider_subject="g-browser",
        contact_type="email",
        value="g@x.com",
    )
    headers = sent_by(await token_for(redis, user.uuid))
    body = {"password": "hashedpw", "salt_frontend": "abc"}
    asked = await client.post("/api/v1/auth/set-password", json=body, headers=headers)
    assert asked.status_code == 422, asked.text

    response = await client.post(
        "/api/v1/auth/set-password",
        headers=headers,
        json={**body, "step_up": {"old_channel_code": capture_email.last_code}},
    )

    assert response.status_code == 204, response.text
    _assert_cleared_if_cookie(response, sent_by)


async def test_unlinking_a_provider_clears_the_cookies(client, db_session, capture_email, sent_by):
    """Unlinking revokes every session; the endpoint answers with a `Response` of its own."""
    account = await _account(db_session)
    db_session.add(UserIdentity(user_uuid=account, provider="google", provider_subject="g-unlink"))
    await db_session.commit()
    access, _ = _assert_signed_in(await _sign_in(client))

    response = await client.request(
        "DELETE",
        "/api/v1/auth/link/google",
        json={"step_up": {"password": PASSWORD}},
        headers=sent_by(access),
    )

    assert response.status_code == 204, response.text
    _assert_cleared_if_cookie(response, sent_by)


# --- shared with the Bearer endpoints ----------------------------------------------------------


async def test_password_sign_in_shares_the_allowance_of_auth_login(client, db_session, monkeypatch):
    """Two doors to the same password check must not double the guesses a caller gets."""
    monkeypatch.setenv("ENV", "production")  # the limiter stands aside under ENV=testing
    caller = {"X-Forwarded-For": "203.0.113.9"}
    for _ in range(5):
        tried = await client.post(
            "/api/v1/auth/login", data={"username": EMAIL, "password": "wrong-password"}, headers=caller
        )
        assert tried.status_code == 401, tried.text

    response = await _sign_in(client, headers={**ORIGIN, **caller})

    assert response.status_code == 429, response.text
    assert response.json()["code"] == "rate_limited"


async def test_no_token_is_written_to_the_log(client, db_session, capture_email, caplog):
    """Sign in, register, refresh and sign out at DEBUG: no token value turns up in any record."""
    caplog.set_level(logging.DEBUG)
    await _register(client)
    verified = await client.post(
        VERIFY, json={"type": "email", "value": EMAIL, "code": capture_email.last_code}, headers=ORIGIN
    )
    tokens = list(_assert_signed_in(verified))
    signed_in = await _sign_in(client)
    tokens += _assert_signed_in(signed_in)
    refreshed = await client.post(REFRESH, headers=_cookies(*tokens[2:]))
    tokens += _assert_signed_in(refreshed)
    signed_out = await client.delete(SESSION, headers={**ORIGIN, **_cookies(*tokens[4:])})
    assert signed_out.status_code == 204, signed_out.text

    assert caplog.records
    for token in tokens:
        assert token not in caplog.text
