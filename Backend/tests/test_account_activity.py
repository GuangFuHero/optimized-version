"""Tests for account activity tracking and the three new admin user-list columns.

Feature 013 (ADR-093/094): `users.last_activity_at` is written on refresh-token rotation
and nowhere else, and `GET /admin/users` surfaces last login, last activity and the live
Redis session count.
"""

import logging

import pytest
from sqlalchemy import select, text

from app.core.permissions import Perm
from app.core.security import create_access_token, generate_salt, get_password_hash
from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, get_audit_trigger_sql
from app.models.auth import User, UserContact, UserIdentity
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign

pytestmark = pytest.mark.asyncio

_PASSWORD = "correct-horse-battery-staple"


def _auth_header(user_uuid: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user_uuid)})}"}


async def _make_admin(db) -> str:
    """Create a user holding user.view and return their uuid as a plain str."""
    role = Role(name="super_admin", kind="platform")
    permission = Permission(key=Perm.USER_VIEW.value)
    db.add_all([role, permission])
    await db.flush()
    db.add(RolePermissionAssign(
        role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"
    ))
    user = User(name="Super Admin")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid


async def _make_login_user(db, email: str = "activity@example.com") -> str:
    """Create a password-login user and return their uuid as a plain str."""
    user = User(name="活動使用者")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add_all([
        UserContact(user_uuid=user.uuid, type="email", value=email, verified=True),
        UserIdentity(
            user_uuid=user.uuid, provider="password",
            password_hash=get_password_hash(_PASSWORD, generate_salt()),
        ),
    ])
    await db.commit()
    return user_uuid


async def _login(client, email: str = "activity@example.com") -> dict:
    """Log in and return the token pair body."""
    resp = await client.post(
        "/api/v1/auth/login", data={"username": email, "password": _PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _last_activity(db, user_uuid: str):
    """Re-read last_activity_at straight from the DB."""
    return await db.scalar(select(User.last_activity_at).where(User.uuid == user_uuid))


async def test_login_alone_leaves_last_activity_null(client, db_session):
    """The write point is refresh, not login — logging in must not set it (ADR-093)."""
    user_uuid = await _make_login_user(db_session)

    await _login(client)

    assert await _last_activity(db_session, user_uuid) is None


async def test_refresh_updates_last_activity(client, db_session):
    """Rotating the refresh token records that the account is still in use."""
    user_uuid = await _make_login_user(db_session)
    tokens = await _login(client)

    resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert resp.status_code == 200, resp.text
    assert await _last_activity(db_session, user_uuid) is not None


async def test_an_ordinary_authenticated_request_does_not_update_last_activity(client, db_session):
    """Per-request updates are the thing ADR-093 rejects — `users` is an audited table."""
    admin_uuid = await _make_admin(db_session)
    user_uuid = await _make_login_user(db_session)
    await _login(client)

    resp = await client.get("/api/v1/admin/users", headers=_auth_header(admin_uuid))

    assert resp.status_code == 200, resp.text
    assert await _last_activity(db_session, user_uuid) is None


async def test_user_list_exposes_login_activity_and_session_count(client, db_session):
    """The admin list carries all three new columns (ADR-094)."""
    admin_uuid = await _make_admin(db_session)
    user_uuid = await _make_login_user(db_session)
    await _login(client)

    resp = await client.get("/api/v1/admin/users", headers=_auth_header(admin_uuid))

    rows = {r["uuid"]: r for r in resp.json()}
    assert rows[user_uuid]["last_login_at"] is not None
    assert rows[user_uuid]["last_activity_at"] is None  # not refreshed yet
    assert rows[user_uuid]["active_session_count"] == 1
    # The admin authenticated with a bare token, never through /auth/login — no session.
    assert rows[admin_uuid]["active_session_count"] == 0


async def test_active_session_count_tracks_each_device(client, db_session):
    """Two logins = two sessions; an unusually high count is a credential-leak signal."""
    admin_uuid = await _make_admin(db_session)
    user_uuid = await _make_login_user(db_session)
    await _login(client)
    await _login(client)

    resp = await client.get("/api/v1/admin/users", headers=_auth_header(admin_uuid))

    rows = {r["uuid"]: r for r in resp.json()}
    assert rows[user_uuid]["active_session_count"] == 2


async def test_session_count_degrades_to_null_when_redis_is_unavailable(client, db_session):
    """Redis being down must not take the whole user list down with it (ADR-094)."""
    from app.core.redis import get_redis
    from app.main import app

    class _BrokenRedis:
        def pipeline(self):
            raise ConnectionError("redis is down")

    admin_uuid = await _make_admin(db_session)
    previous = app.dependency_overrides[get_redis]
    app.dependency_overrides[get_redis] = lambda: _BrokenRedis()
    try:
        resp = await client.get("/api/v1/admin/users", headers=_auth_header(admin_uuid))
    finally:
        app.dependency_overrides[get_redis] = previous

    assert resp.status_code == 200, resp.text
    assert all(row["active_session_count"] is None for row in resp.json())


# ──────────────────────────────────────────────
# PR #36 review findings (ADR-102)
# ──────────────────────────────────────────────


async def test_the_refresh_activity_write_names_an_actor(client, db_session):
    """`users` is audited, and /auth/refresh carries no access token (ADR-102).

    The audit trigger reads the actor from `app.current_user_id`, which the middleware fills
    from the caller's access token. This request has none — it is presenting a refresh token —
    so without naming the actor explicitly, every refresh appends an `audit_logs` row with
    `user_uuid = NULL`, and the PR's claim that audit rows land "with an actor" is untrue for
    exactly the rows this feature adds.
    """
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("users")))
    await db_session.commit()
    user_uuid = await _make_login_user(db_session)
    tokens = await _login(client)

    resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert resp.status_code == 200, resp.text

    actor = await db_session.scalar(text(
        "SELECT user_uuid FROM audit_logs WHERE table_name = 'users' AND action = 'UPDATE' "
        "ORDER BY created_at DESC LIMIT 1"
    ))
    assert actor is not None, "the refresh audit row has no actor"
    assert str(actor) == user_uuid


async def test_the_login_write_names_an_actor_too(client, db_session):
    """Same gap on the password path: /auth/login stamps last_login_at with no token either."""
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("users")))
    await db_session.commit()
    user_uuid = await _make_login_user(db_session)

    await _login(client)

    actor = await db_session.scalar(text(
        "SELECT user_uuid FROM audit_logs WHERE table_name = 'users' AND action = 'UPDATE' "
        "ORDER BY created_at DESC LIMIT 1"
    ))
    assert actor is not None, "the login audit row has no actor"
    assert str(actor) == user_uuid


async def test_a_session_count_bug_is_not_reported_as_a_redis_outage(caplog):
    """A `strict=True` length mismatch is a bug here, not an outage (ADR-103).

    Inside the `except`, such a bug degraded every user's count to `null` and logged it as
    "Redis unavailable", sending whoever investigated at a subsystem that was working.
    """
    from app.api.v1.endpoints.admin import _session_counts

    class _ShortPipeline:
        def __init__(self, owner):
            self._owner = owner

        def smembers(self, key):
            pass

        def exists(self, key):
            pass

        async def execute(self):
            self._owner.round += 1
            if self._owner.round == 1:
                return [{b"sid-1", b"sid-2"}]
            return [1]  # two sids went in, one flag comes back

    class _FakeRedis:
        round = 0

        def pipeline(self):
            return _ShortPipeline(self)

    with caplog.at_level(logging.WARNING), pytest.raises(ValueError):
        await _session_counts(_FakeRedis(), ["11111111-1111-1111-1111-111111111111"])

    assert not [
        r for r in caplog.records if "Redis unavailable" in r.message
    ], "a programming error was filed as a Redis outage"


async def test_redis_being_down_still_degrades_quietly(caplog):
    """The behaviour the `except` exists for has to survive narrowing its scope."""
    from app.api.v1.endpoints.admin import _session_counts

    class _DeadRedis:
        def pipeline(self):
            raise ConnectionError("redis is down")

    with caplog.at_level(logging.WARNING):
        counts = await _session_counts(_DeadRedis(), ["11111111-1111-1111-1111-111111111111"])

    assert counts == {"11111111-1111-1111-1111-111111111111": None}
    assert any("Redis unavailable" in r.message for r in caplog.records)
