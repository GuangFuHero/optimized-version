"""End-to-end coverage for AuditContextMiddleware -> audit_logs attribution (T115).

tests/test_audit.py exercises the trigger/contextvar mechanism by setting the contextvars
directly; that leaves the one link it deliberately bypasses untested — whether a real HTTP
request's JWT actually reaches those contextvars via app.core.context.AuditContextMiddleware.
This test goes through the full ASGI stack (real Bearer token, real middleware) instead.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, get_audit_trigger_sql
from app.models.audit import AuditLog
from app.models.auth import User
from tests.conftest import auth_headers_for


@pytest_asyncio.fixture(autouse=True)
async def _install_audit_trigger_on_users(db_session):
    """Install the real trigger onto the `users` table for this test's schema instance.

    `db_session`'s schema is dropped/recreated per test (tests/conftest.py), which drops any
    trigger along with the table — so this has to run fresh every test, same as
    tests/test_audit.py's own fixture does for the `db` fixture's schema.
    """
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("users")))
    await db_session.commit()


@pytest.mark.asyncio
async def test_authenticated_request_attributes_audit_log_to_the_real_caller(client, db_session, redis):
    """A PATCH /users/me under a real Bearer token attributes the resulting audit row to it."""
    actor = User(name="Audit Actor")
    db_session.add(actor)
    await db_session.flush()
    actor_uuid = str(actor.uuid)  # capture before commit expires the attribute
    await db_session.commit()
    # No trailing db_session.refresh() here on purpose: SQLAlchemy autobegin would leave a
    # transaction open on the *shared* fixture session, straddling into the HTTP request
    # below. app.current_user_id is fixed at transaction-BEGIN time (ADR-024's SET LOCAL),
    # so a transaction opened before the middleware sets the actor contextvar would
    # attribute the write to no one, even though the app-level context is correct by the
    # time the write executes. Only a concern when a session survives across an await
    # boundary like this test's; get_db() hands every real request a brand new session.
    resp = await client.patch(
        "/api/v1/users/me",
        json={"name": "Renamed By Self"},
        headers=await auth_headers_for(redis, actor_uuid),
    )
    assert resp.status_code == 200, resp.json()

    logs = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.table_name == "users",
                AuditLog.row_id == actor_uuid,
                AuditLog.action == "UPDATE",
            )
        )
    ).scalars().all()
    assert len(logs) == 1
    assert str(logs[0].user_uuid) == actor_uuid
