"""Tests for the database trigger-based auditing system."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.core.context import request_client_ip, request_user_uuid
from app.db.triggers import (
    AUDIT_TRIGGER_FUNC_SQL,
    AUDITED_TABLES,
    PROTECT_AUDIT_LOGS_FUNC_SQL,
    PROTECT_AUDIT_LOGS_TRIGGER_SQL,
    get_audit_trigger_sql,
)
from app.models.audit import AuditLog
from app.models.auth import User, UserIdentity


@pytest_asyncio.fixture(autouse=True)
async def setup_audit_triggers(db):
    """Deploy the trigger function and user audit triggers on the clean test database connection."""
    # 1. Create trigger function
    await db.execute(text(AUDIT_TRIGGER_FUNC_SQL))

    # 2. Attach triggers on all audited tables
    for table in AUDITED_TABLES:
        await db.execute(text(get_audit_trigger_sql(table)))

    # 3. Attach protective trigger on audit_logs table to make it append-only
    await db.execute(text(PROTECT_AUDIT_LOGS_FUNC_SQL))
    await db.execute(text(PROTECT_AUDIT_LOGS_TRIGGER_SQL))
    await db.commit()



@pytest.mark.asyncio
async def test_audit_trigger_on_insert_with_context(db):
    """Verify trigger logs an INSERT and correctly attributes request context user/ip."""
    # Set request context variables
    expected_user_uuid = uuid.uuid4()
    expected_ip = "10.0.0.99"

    token_user = request_user_uuid.set(str(expected_user_uuid))
    token_ip = request_client_ip.set(expected_ip)

    try:
        # Create a new user
        new_user = User(name="Audit Test User")
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        # Verify the audit log record exists
        query = select(AuditLog).where(AuditLog.table_name == "users")
        result = await db.execute(query)
        logs = result.scalars().all()

        assert len(logs) == 1
        audit = logs[0]
        assert audit.action == "INSERT"
        assert audit.row_id == new_user.uuid
        assert audit.user_uuid == expected_user_uuid
        assert audit.client_ip == expected_ip
        assert audit.new_values is not None
        assert audit.new_values["name"] == "Audit Test User"
        assert audit.old_values is None
    finally:
        request_user_uuid.reset(token_user)
        request_client_ip.reset(token_ip)


@pytest.mark.asyncio
async def test_audit_trigger_on_update(db):
    """Verify trigger logs updates and stores old and new values correctly."""
    # Create user first without context
    new_user = User(name="Audit Base User")
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Verify insert log was created without context
    logs_q = await db.execute(select(AuditLog).where(AuditLog.row_id == new_user.uuid))
    logs = logs_q.scalars().all()
    assert len(logs) == 1
    assert logs[0].action == "INSERT"
    assert logs[0].user_uuid is None
    assert logs[0].client_ip is None

    # Update user name
    new_user.name = "Audit Updated User"
    await db.commit()
    await db.refresh(new_user)

    # Verify update log
    logs_q = await db.execute(
        select(AuditLog)
        .where(AuditLog.row_id == new_user.uuid)
        .order_by(AuditLog.created_at.asc())
    )
    logs = logs_q.scalars().all()
    assert len(logs) == 2
    update_log = logs[1]
    assert update_log.action == "UPDATE"
    assert update_log.old_values["name"] == "Audit Base User"
    assert update_log.new_values["name"] == "Audit Updated User"


@pytest.mark.asyncio
async def test_audit_trigger_on_delete(db):
    """Verify trigger logs deletion and stores old values."""
    new_user = User(name="User to Delete")
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    user_uuid = new_user.uuid

    # Delete user
    await db.delete(new_user)
    await db.commit()

    # Verify delete log
    logs_q = await db.execute(
        select(AuditLog)
        .where(AuditLog.row_id == user_uuid)
        .order_by(AuditLog.created_at.asc())
    )
    logs = logs_q.scalars().all()

    # There should be INSERT and DELETE logs
    assert len(logs) == 2
    delete_log = logs[1]
    assert delete_log.action == "DELETE"
    assert delete_log.old_values["name"] == "User to Delete"
    assert delete_log.new_values is None


@pytest.mark.asyncio
async def test_audit_logs_table_is_append_only(db):
    """Verify that any direct UPDATE, DELETE, or TRUNCATE on audit_logs raises a database exception."""
    from sqlalchemy.exc import DBAPIError

    # 1. Create a user to generate an audit log entry
    new_user = User(name="Audit Append Only Test")
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    user_uuid = new_user.uuid

    # 2. Fetch the audit log entry
    logs_q = await db.execute(select(AuditLog).where(AuditLog.row_id == user_uuid))
    audit = logs_q.scalar_one()

    # 3. Attempt to update the audit log row (should raise exception)
    audit.action = "UPDATE"
    with pytest.raises(DBAPIError) as exc_info:
        await db.commit()
    assert "Updates and Deletes are forbidden" in str(exc_info.value)

    # Rollback to reset transaction state after exception
    await db.rollback()

    # 4. Attempt to delete the audit log row (should raise exception)
    # Refetch since transaction was rolled back
    logs_q = await db.execute(select(AuditLog).where(AuditLog.row_id == user_uuid))
    audit = logs_q.scalar_one()

    await db.delete(audit)
    with pytest.raises(DBAPIError) as exc_info:
        await db.commit()
    assert "Updates and Deletes are forbidden" in str(exc_info.value)

    # Rollback to reset transaction state after exception
    await db.rollback()

    # 5. Attempt to TRUNCATE the audit log table (should raise exception)
    with pytest.raises(DBAPIError) as exc_info:
        await db.execute(text("TRUNCATE audit_logs;"))
        await db.commit()
    assert "Updates and Deletes are forbidden" in str(exc_info.value)

    await db.rollback()


@pytest.mark.asyncio
async def test_audit_log_redacts_password_hash(db):
    """Verify that user password hash is redacted from audit logs on identity creation."""
    from sqlalchemy.exc import DBAPIError  # noqa: F401

    # 1. Create a base user
    user = User(name="Password Redact Test User")
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # 2. Add a password identity
    identity = UserIdentity(
        user_uuid=user.uuid,
        provider="password",
        provider_subject="test_user_subject",
        password_hash="pbkdf2_sha256$iters$salt$hash_secret_values",
    )
    db.add(identity)
    await db.commit()
    await db.refresh(identity)

    # 3. Retrieve audit log for user_identities table
    logs_q = await db.execute(
        select(AuditLog)
        .where(AuditLog.table_name == "user_identities")
        .where(AuditLog.row_id == identity.uuid)
    )
    logs = logs_q.scalars().all()
    assert len(logs) == 1

    audit_entry = logs[0]
    assert audit_entry.action == "INSERT"

    # 4. Check that new_values does NOT contain password_hash, but does contain provider
    assert "password_hash" not in audit_entry.new_values
    assert audit_entry.new_values["provider"] == "password"
    assert audit_entry.new_values["provider_subject"] == "test_user_subject"


