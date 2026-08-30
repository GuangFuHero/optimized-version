"""Regression tests for the defects found reviewing feature 013.

Written first as failing tests to prove each review finding was real (all 7 failed), then
kept as the guard against regressing the fixes. Each asserts the desired behaviour, so a
failure here means one of the defects is back.

Covered: H1 (a DB failure during refresh must not destroy the session), M1 (the first PATCH
must not invent a nameless disaster), M2 (a concurrent upsert must converge, not 500),
M4 (active_session_count must not count TTL-expired sessions), L3 (the RBAC matrix doc must
list the capabilities seed_rbac.py grants).
"""

import asyncio
import pathlib

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.permissions import Perm
from app.core.security import create_access_token, generate_salt, get_password_hash
from app.models.auth import User, UserContact, UserIdentity
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.repositories.auth_repository import user_repository
from app.repositories.config_repository import station_property_config_repository
from app.repositories.project_settings_repository import project_settings_repository
from tests.conftest import TEST_DB_URL

pytestmark = pytest.mark.asyncio

_PASSWORD = "correct-horse-battery-staple"
SETTINGS_URL = "/api/v1/admin/project-settings"


def _auth_header(user_uuid: str) -> dict:
    return {"Authorization": f"Bearer {create_access_token(data={'sub': str(user_uuid)})}"}


async def _make_admin(db, *perms: Perm) -> str:
    """Create a user holding the given capabilities at scope 'all'."""
    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    for perm in perms:
        permission = Permission(key=perm.value)
        db.add(permission)
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


async def _make_login_user(db, email: str = "findings@example.com") -> str:
    """Create a password-login user and return their uuid as a plain str."""
    user = User(name="測試使用者")
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


async def _login(client, email: str = "findings@example.com") -> dict:
    resp = await client.post(
        "/api/v1/auth/login", data={"username": email, "password": _PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ──────────────────────────────────────────────
# H1 — a DB failure during refresh must not destroy the session
# ──────────────────────────────────────────────

async def test_h1_refresh_survives_a_failing_activity_write(client, db_session, monkeypatch):
    """last_activity_at is observability; it must not be able to fail the token exchange."""
    await _make_login_user(db_session)
    tokens = await _login(client)  # login itself writes last_login_at, so patch afterwards

    async def _boom(*args, **kwargs):
        raise RuntimeError("db is down")

    monkeypatch.setattr(user_repository, "update", _boom)

    resp = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert resp.status_code == 200, f"refresh 500s when the activity write fails: {resp.text}"


async def test_h1_the_session_survives_a_transient_db_outage(client, db_session, monkeypatch):
    """The killer consequence: rotate() burns the old token BEFORE the activity write runs.

    If that write escapes, the client never receives the new token, retries with the old one,
    and rotate() reads the retry as a replay and revokes the whole session — a transient DB
    outage signs the device out for good. The fix is that the refresh still completes, so the
    client holds a usable token and the token chain is never broken.

    Note what is NOT asserted: replaying the *old* token afterwards must still 401 and revoke.
    That is the reuse-detection contract (session_repository.py:80) and it stays intact.
    """
    await _make_login_user(db_session)
    tokens = await _login(client)

    async def _boom(*args, **kwargs):
        raise RuntimeError("db is down")

    monkeypatch.setattr(user_repository, "update", _boom)
    during_outage = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert during_outage.status_code == 200, during_outage.text
    monkeypatch.undo()  # the database recovers

    # the token handed out during the outage is a real, usable link in the chain
    after_recovery = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": during_outage.json()["refresh_token"]},
    )

    assert after_recovery.status_code == 200, (
        "the token issued during the outage was not usable — the chain broke anyway "
        f"(got {after_recovery.status_code}: {after_recovery.text})"
    )
    # and the activity write, which failed during the outage, resumes working
    assert await db_session.scalar(
        select(User.last_activity_at).where(User.name == "測試使用者")
    ) is not None


# ──────────────────────────────────────────────
# M1 — the first PATCH must not create a nameless disaster
# ──────────────────────────────────────────────

async def test_m1_first_patch_without_a_name_is_rejected(client, db_session):
    """`name` is NOT NULL and min_length=1, so creation without one should 422, not invent ""."""
    admin_uuid = await _make_admin(db_session, Perm.PROJECT_VIEW, Perm.PROJECT_EDIT)

    resp = await client.patch(SETTINGS_URL, headers=_auth_header(admin_uuid),
                              json={"disaster_types": ["fire"]})

    assert resp.status_code == 422, (
        f"created a nameless disaster instead: {resp.status_code} {resp.text}"
    )


# ──────────────────────────────────────────────
# M2 — concurrent upsert must not 500
# ──────────────────────────────────────────────

async def _two_sessions():
    """Two independent sessions on the test DB, for real concurrent transactions."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, factory(), factory()


async def test_m2_concurrent_project_settings_upsert(db):
    """Two first-time PATCHes race: both see an empty table, both INSERT, one hits the index."""
    engine, s1, s2 = await _two_sessions()
    try:
        results = await asyncio.gather(
            project_settings_repository.upsert(s1, values={"name": "A"}),
            project_settings_repository.upsert(s2, values={"name": "B"}),
            return_exceptions=True,
        )
    finally:
        await s1.close()
        await s2.close()
        await engine.dispose()

    failures = [r for r in results if isinstance(r, BaseException)]
    assert not failures, f"concurrent upsert raised instead of converging: {failures!r}"


async def test_m2_concurrent_config_upsert(db):
    """Same race on the config tables, which this PR just gave a UNIQUE key."""
    engine, s1, s2 = await _two_sessions()
    kwargs = dict(
        station_type="shelter", property_name="發電機", data_type="integer", enum_options=None
    )
    try:
        results = await asyncio.gather(
            station_property_config_repository.upsert(s1, **kwargs),
            station_property_config_repository.upsert(s2, **kwargs),
            return_exceptions=True,
        )
    finally:
        await s1.close()
        await s2.close()
        await engine.dispose()

    failures = [r for r in results if isinstance(r, BaseException)]
    assert not failures, f"concurrent upsert raised instead of converging: {failures!r}"


# ──────────────────────────────────────────────
# M4 — active_session_count must not count expired sessions
# ──────────────────────────────────────────────

async def test_m4_expired_session_is_not_counted(client, db_session, redis):
    """A session whose `session:<sid>` key expired by TTL is never SREM'd from the user's set.

    ADR-094 reads a high count as a credential-leak signal, so a phantom device is a false
    alarm. Deleting the session key is exactly what Redis TTL expiry does.
    """
    admin_uuid = await _make_admin(db_session, Perm.USER_VIEW)
    user_uuid = await _make_login_user(db_session)
    await _login(client)
    await _login(client)

    sids = sorted(await redis.smembers(f"user_sessions:{user_uuid}"))
    assert len(sids) == 2
    expired = sids[0].decode() if isinstance(sids[0], bytes) else sids[0]
    await redis.delete(f"session:{expired}")  # simulate TTL expiry of one device

    resp = await client.get("/api/v1/admin/users", headers=_auth_header(admin_uuid))
    rows = {r["uuid"]: r for r in resp.json()}

    assert rows[user_uuid]["active_session_count"] == 1, (
        "an expired session is still reported as an active device"
    )


# ──────────────────────────────────────────────
# L3 — the RBAC matrix doc must list the new capabilities
# ──────────────────────────────────────────────

def test_l3_rbac_matrix_documents_the_new_capabilities():
    """seed_rbac.py grants project.view/edit to super_admin; the matrix must agree."""
    matrix = pathlib.Path(__file__).resolve().parents[1] / "RBAC_RESOURCE_ROLE_MATRIX.md"
    text = matrix.read_text(encoding="utf-8")

    missing = [key for key in ("project.view", "project.edit") if key not in text]

    assert not missing, f"capabilities granted in seed_rbac.py but absent from the matrix: {missing}"
