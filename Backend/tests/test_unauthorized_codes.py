"""Every 401 a token earns says why (ADR-328): refresh and try again, or you are signed out.

The browser cannot tell the two apart from the status alone, and they need opposite handling: an
expired or stale access token is answered by refreshing it, while a dead session or a token that
proves nothing means the user is signed out. REST and GraphQL answer in the same shape — HTTP 401,
`{"detail", "code"}` — because the frontend's proxy refreshes on the code whichever it was calling.
"""

import time
import uuid
from datetime import timedelta

import pytest
from jose import jwt
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.identity import encode_act
from app.core.security import create_access_token
from app.repositories.session_repository import SessionRepository
from tests.conftest import sign_in

pytestmark = pytest.mark.asyncio


@pytest.fixture(params=["rest", "graphql"])
def ask_each_entrypoint(request, client, fresh_app_engine):
    """Send one authenticated request; every test using it runs once on REST, once on GraphQL."""

    async def _ask(token: str):
        headers = {"Authorization": f"Bearer {token}"}
        if request.param == "rest":
            return await client.get("/api/v1/users/me", headers=headers)
        return await client.post("/graphql", json={"query": "{ __typename }"}, headers=headers)

    return _ask


def _assert_401(res, code: str) -> None:
    assert res.status_code == 401, res.text
    assert res.json() == {"detail": "Could not validate credentials", "code": code}
    assert res.headers["www-authenticate"] == "Bearer"


async def test_an_expired_access_token_asks_for_a_refresh(ask_each_entrypoint, db_session, redis):
    """The session is fine; only the 15-minute token ran out, so refreshing fixes it."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, expires_delta=timedelta(minutes=-1), sid=sid, act=act)

    _assert_401(await ask_each_entrypoint(token), "access_token_expired")


async def test_logout_reports_an_expired_token_the_same_way(client, db_session, redis):
    """`get_current_session` decodes the token itself (logout, logout-all, switch-identity).

    It never looks at the session, but it reads the token through the same decoder, so an
    expired token reaching it is answered with the same refresh-me code.
    """
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, expires_delta=timedelta(minutes=-1), sid=sid, act=act)

    res = await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    _assert_401(res, "access_token_expired")


async def test_a_token_from_before_an_identity_switch_asks_for_a_refresh(
    ask_each_entrypoint, db_session, redis
):
    """The session moved to another identity (ADR-195); a refresh signs for the one it has now."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, sid=sid, act=act)
    await SessionRepository(redis).set_identity(sid, encode_act(str(uuid.uuid4()), None))

    _assert_401(await ask_each_entrypoint(token), "access_token_stale")


async def test_a_revoked_session_signs_the_user_out(ask_each_entrypoint, db_session, redis):
    """Logout, a password change or an admin's kick ended the session: refreshing cannot help."""
    user_uuid, act, sid = await sign_in(db_session, redis)
    token = create_access_token({"sub": user_uuid}, sid=sid, act=act)
    await SessionRepository(redis).revoke_session(sid)

    _assert_401(await ask_each_entrypoint(token), "session_expired")


async def _forged_signature(db, redis, monkeypatch):
    user_uuid, act, sid = await sign_in(db, redis)
    claims = {"sub": user_uuid, "sid": sid, "act": act, "type": "access", "exp": time.time() + 600}
    return jwt.encode(claims, "not-our-key", algorithm=settings.ALGORITHM)


async def _not_an_access_token(db, redis, monkeypatch):
    user_uuid, act, sid = await sign_in(db, redis)
    claims = {"sub": user_uuid, "sid": sid, "act": act, "type": "refresh", "exp": time.time() + 600}
    return jwt.encode(claims, settings.JWT_SIGNING_KEY, algorithm=settings.ALGORITHM)


async def _no_session_id(db, redis, monkeypatch):
    user_uuid, act, _ = await sign_in(db, redis)
    return create_access_token({"sub": user_uuid}, act=act)


async def _someone_elses_session(db, redis, monkeypatch):
    _, act, sid = await sign_in(db, redis)
    return create_access_token({"sub": str(uuid.uuid4())}, sid=sid, act=act)


async def _account_gone(db, redis, monkeypatch):
    ghost = str(uuid.uuid4())
    sid, _ = await SessionRepository(redis).create_session(ghost, "test")
    return create_access_token({"sub": ghost}, sid=sid)


async def _identity_taken_away(db, redis, monkeypatch):
    user_uuid, _, _ = await sign_in(db, redis)
    act = encode_act(str(uuid.uuid4()), None)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test", act=act)
    return create_access_token({"sub": user_uuid}, sid=sid, act=act)


async def _session_store_down(db, redis, monkeypatch):
    user_uuid, act, sid = await sign_in(db, redis)

    async def unreachable(self, sid):
        raise RedisError("connection refused")

    monkeypatch.setattr(SessionRepository, "get_session", unreachable)
    return create_access_token({"sub": user_uuid}, sid=sid, act=act)


@pytest.mark.parametrize(
    "token_for_case",
    [
        _forged_signature,
        _not_an_access_token,
        _no_session_id,
        _someone_elses_session,
        _account_gone,
        _identity_taken_away,
    ],
)
async def test_a_token_that_proves_nothing_signs_the_user_out(
    ask_each_entrypoint, db_session, redis, monkeypatch, token_for_case
):
    """Nothing a refresh could repair: the browser treats it as signed out (ADR-328)."""
    token = await token_for_case(db_session, redis, monkeypatch)

    _assert_401(await ask_each_entrypoint(token), "credentials_invalid")


async def test_an_unreachable_session_store_refuses_without_signing_anyone_out(
    ask_each_entrypoint, db_session, redis, monkeypatch
):
    """Still refused, as ADR-100 requires, but not as signed out: the session may well be alive.

    A 503 of its own, so a browser keeps its cookies and carries on once Redis is back (ADR-328).
    """
    token = await _session_store_down(db_session, redis, monkeypatch)

    res = await ask_each_entrypoint(token)

    assert res.status_code == 503, res.text
    assert res.json() == {"detail": "Session store is unavailable", "code": "session_store_unavailable"}
    assert "www-authenticate" not in res.headers


async def test_a_guest_on_graphql_is_still_served(client, fresh_app_engine):
    """No token is not a failed token: GraphQL serves a guest as before, with no 401 at all."""
    res = await client.post("/graphql", json={"query": "{ __typename }"})

    assert res.status_code == 200, res.text
