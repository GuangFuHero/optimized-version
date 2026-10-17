"""A browser signs in with the access cookie alone (ADR-325, ADR-327, ADR-328).

Scripts and tests keep sending a Bearer token, and it wins whenever both arrive. Without one, the
`{p}_at` cookie is read instead — and because a browser attaches cookies to requests other pages
start too, a cookie-authenticated write must come from an allowed page. When the session behind
the cookie is gone, the backend clears it, so the browser stops sending a dead token.
"""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core import auth_cookies
from app.core.config import settings
from app.core.identity import encode_act
from app.core.security import create_access_token
from app.main import app
from app.models.rbac import Role
from app.repositories.session_repository import SessionRepository
from tests.conftest import sign_in
from tests.cookies import cookie_header, cookies_set_by

pytestmark = pytest.mark.asyncio

SITE = "https://site.test"
MY_TICKETS = "{ myTickets { title } }"


@pytest.fixture(autouse=True)
def _site_is_allowed(monkeypatch):
    """One allowed origin, whatever the environment configured."""
    monkeypatch.setattr(settings, "AUTH_ALLOWED_ORIGINS", f"{SITE},https://admin.site.test")


def _access_cookie(token: str) -> dict:
    return cookie_header(**{auth_cookies.access_cookie_name(): token})


async def _new_session_token(db, redis) -> str:
    """Sign a new account in and return an access token for its session."""
    user_uuid, act, sid = await sign_in(db, redis)
    return create_access_token({"sub": user_uuid}, sid=sid, act=act)


@pytest.fixture(params=["rest", "graphql"])
def ask_as_signed_in(request, client, fresh_app_engine):
    """Ask for something only a signed-in caller gets, once on REST and once on GraphQL.

    Returns (response, signed in?). GraphQL answers a guest with an error inside a 200, so the
    second value is what says whether the token was accepted.
    """

    async def _ask(headers: dict):
        if request.param == "rest":
            res = await client.get("/api/v1/users/me", headers=headers)
            return res, res.status_code == 200
        res = await client.post("/graphql", json={"query": MY_TICKETS}, headers=headers)
        return res, res.status_code == 200 and res.json().get("data") == {"myTickets": []}

    return _ask


async def test_the_access_cookie_alone_signs_the_browser_in(ask_as_signed_in, db_session, redis):
    """No Authorization header: the cookie is the credential (GraphQL's POST also needs our Origin)."""
    token = await _new_session_token(db_session, redis)

    res, signed_in = await ask_as_signed_in({**_access_cookie(token), "Origin": SITE})

    assert signed_in, res.text


async def test_a_bearer_token_wins_over_the_cookie(ask_as_signed_in, db_session, redis):
    """A valid Bearer token is used even beside a cookie that holds nothing usable."""
    token = await _new_session_token(db_session, redis)

    res, signed_in = await ask_as_signed_in({"Authorization": f"Bearer {token}", **_access_cookie("garbage")})

    assert signed_in, res.text


async def test_a_failing_bearer_token_is_not_rescued_by_the_cookie(ask_as_signed_in, db_session, redis):
    """It authenticated by Bearer and failed; it is not cookie-authenticated, so nothing is cleared."""
    token = await _new_session_token(db_session, redis)

    res, _ = await ask_as_signed_in(
        {"Authorization": "Bearer garbage", **_access_cookie(token), "Origin": SITE}
    )

    assert res.status_code == 401
    assert res.json()["code"] == "credentials_invalid"
    assert cookies_set_by(res) == {}


async def test_no_token_at_all_is_a_coded_401_that_clears_nothing(client):
    """A guest asking for a signed-in page: 401 with a code (ADR-328), and no cookie to clear."""
    res = await client.get("/api/v1/users/me")

    assert res.status_code == 401
    assert res.json() == {"detail": "Not authenticated", "code": "credentials_invalid"}
    assert res.headers["www-authenticate"] == "Bearer"
    assert cookies_set_by(res) == {}


async def test_a_guest_on_graphql_is_still_a_guest(client, fresh_app_engine):
    """No Bearer and no cookie on GraphQL is a guest, served as before."""
    res = await client.post("/graphql", json={"query": "{ __typename }"})

    assert res.status_code == 200, res.text


# --------------------------------------------------------------------------------------
# A cookie-authenticated write must come from one of our own pages (ADR-327)
# --------------------------------------------------------------------------------------


async def _switch_to_user(client, db, redis, headers: dict):
    """A POST: switch to the `user` identity the account already acts as, the browser's way (ADR-325)."""
    token = await _new_session_token(db, redis)
    role = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one()
    return await client.post(
        "/api/v1/auth/session/identity",
        json={"role_uuid": str(role.uuid)},
        headers={**_access_cookie(token), **headers},
    )


@pytest.mark.parametrize(
    "headers",
    [
        {"Origin": SITE},
        {"Origin": "https://ADMIN.site.test/"},
        {"Referer": f"{SITE}/account/security?tab=1"},
    ],
)
async def test_a_write_from_our_own_page_goes_through(client, db_session, redis, headers):
    """`Origin` names the page; without it, the `Referer` does. Case and a trailing slash do not matter."""
    res = await _switch_to_user(client, db_session, redis, headers)

    assert res.status_code == 200, res.text


@pytest.mark.parametrize(
    "headers",
    [
        {"Origin": "https://evil.example"},
        {"Origin": "null"},
        {"Referer": "https://evil.example/form"},
        {"Origin": "https://evil.example", "Referer": f"{SITE}/"},
        {},
    ],
)
async def test_a_write_that_cannot_show_it_came_from_us_is_refused(client, db_session, redis, headers):
    """Another site, a sandboxed frame, or nothing to say where it came from: 403, nothing done."""
    res = await _switch_to_user(client, db_session, redis, headers)

    assert res.status_code == 403, res.text
    assert res.json()["code"] == "origin_not_allowed"


async def test_reading_needs_no_origin(client, db_session, redis):
    """A GET changes nothing, and a browser's own navigation sends no `Origin`."""
    token = await _new_session_token(db_session, redis)

    res = await client.get("/api/v1/users/me", headers=_access_cookie(token))

    assert res.status_code == 200, res.text


async def test_a_bearer_write_needs_no_origin(client, db_session, redis):
    """A script sending its token explicitly is not a browser being made to send a cookie."""
    token = await _new_session_token(db_session, redis)
    role = (await db_session.execute(select(Role).where(Role.name == "user"))).scalar_one()

    res = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(role.uuid)},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert res.status_code == 200, res.text


async def test_a_graphql_post_through_the_cookie_must_come_from_our_own_page(
    client, db_session, redis, fresh_app_engine
):
    """A mutation, or a query sent as a POST: the cookie alone is not enough."""
    token = await _new_session_token(db_session, redis)

    res = await client.post("/graphql", json={"query": MY_TICKETS}, headers=_access_cookie(token))

    assert res.status_code == 403, res.text
    assert res.json()["code"] == "origin_not_allowed"


async def test_a_graphql_query_sent_as_a_get_reads_without_an_origin(
    client, db_session, redis, fresh_app_engine
):
    """A GET only reads, like any GET; the frontend's GraphQL route forwards queries that way."""
    token = await _new_session_token(db_session, redis)

    res = await client.get("/graphql", params={"query": MY_TICKETS}, headers=_access_cookie(token))

    assert res.status_code == 200, res.text
    assert res.json() == {"data": {"myTickets": []}}


# --------------------------------------------------------------------------------------
# A cookie whose session is gone is cleared; one that only needs a refresh is kept (ADR-328)
# --------------------------------------------------------------------------------------

DOMAIN = ".site.test"


@pytest.fixture(params=["rest", "graphql"])
def ask_with_cookie(request, client, fresh_app_engine, monkeypatch):
    """Send one cookie-authenticated request, once on REST and once on GraphQL, on a parent domain."""
    monkeypatch.setattr(settings, "AUTH_COOKIE_DOMAIN", DOMAIN)

    async def _ask(token: str):
        headers = {**_access_cookie(token), "Origin": SITE}
        if request.param == "rest":
            return await client.get("/api/v1/users/me", headers=headers)
        return await client.post("/graphql", json={"query": "{ __typename }"}, headers=headers)

    return _ask


def _assert_cleared(res, code: str) -> None:
    """Both cookies cleared under the name, path and domain they were set with."""
    assert res.status_code == 401, res.text
    assert res.json()["code"] == code
    cleared = cookies_set_by(res)
    assert set(cleared) == {auth_cookies.access_cookie_name(), auth_cookies.refresh_cookie_name()}
    for cookie in cleared.values():
        assert (cookie["max-age"], cookie["path"], cookie["domain"]) == ("0", "/", DOMAIN)


async def test_a_revoked_session_clears_the_cookies(ask_with_cookie, db_session, redis):
    """The browser would otherwise keep sending a token that can never work again."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, sid=sid, act=act)
    await SessionRepository(redis).revoke_session(sid)

    _assert_cleared(await ask_with_cookie(token), "session_expired")


async def test_a_token_that_proves_nothing_clears_the_cookies(ask_with_cookie, db_session, redis):
    """A session that never belonged to an account still here is as dead as a revoked one."""
    ghost = str(uuid.uuid4())
    sid, _ = await SessionRepository(redis).create_session(ghost, "test")

    _assert_cleared(
        await ask_with_cookie(create_access_token({"sub": ghost}, sid=sid)), "credentials_invalid"
    )


async def test_an_expired_token_keeps_the_cookies_for_the_refresh(ask_with_cookie, db_session, redis):
    """Refreshing needs the refresh cookie, so a token that only ran out clears nothing."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, expires_delta=timedelta(minutes=-1), sid=sid, act=act)

    res = await ask_with_cookie(token)

    assert res.json()["code"] == "access_token_expired"
    assert cookies_set_by(res) == {}


async def test_a_stale_token_keeps_the_cookies_for_the_refresh(ask_with_cookie, db_session, redis):
    """Same for a token from before an identity switch."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, sid=sid, act=act)
    await SessionRepository(redis).set_identity(sid, encode_act(str(uuid.uuid4()), None))

    res = await ask_with_cookie(token)

    assert res.json()["code"] == "access_token_stale"
    assert cookies_set_by(res) == {}


async def test_a_bearer_token_on_a_revoked_session_clears_nothing(client, db_session, redis):
    """A script's token is not in a cookie; there is nothing to clear and nothing should be."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, sid=sid, act=act)
    await SessionRepository(redis).revoke_session(sid)

    res = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})

    assert res.json()["code"] == "session_expired"
    assert cookies_set_by(res) == {}


async def test_the_openapi_schema_still_declares_the_bearer_scheme():
    """Generated clients read the scheme from here; reading the cookie as well must not change it."""
    assert app.openapi()["components"]["securitySchemes"] == {
        "OAuth2PasswordBearer": {
            "type": "oauth2",
            "flows": {"password": {"scopes": {}, "tokenUrl": "/api/v1/auth/login"}},
        }
    }
