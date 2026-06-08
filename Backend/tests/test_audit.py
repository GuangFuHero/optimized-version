"""Tests for the database trigger-based auditing system."""

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select, text

from app.core.context import request_client_ip, request_user_uuid
from app.models.audit import AuditLog
from app.models.auth import User


@pytest_asyncio.fixture(autouse=True)
async def setup_audit_triggers(db):
    """Deploy the trigger function and user audit triggers on the clean test database connection."""
    # 1. Create trigger function
    await db.execute(text("""
        CREATE OR REPLACE FUNCTION audit_trigger_func()
        RETURNS TRIGGER AS $$
        DECLARE
            old_val JSONB := NULL;
            new_val JSONB := NULL;
            user_id UUID := NULL;
            ip_addr VARCHAR := NULL;
            r_id UUID := NULL;
        BEGIN
            -- Resolve context variables
            BEGIN
                user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
            EXCEPTION WHEN OTHERS THEN
                user_id := NULL;
            END;

            BEGIN
                ip_addr := NULLIF(current_setting('app.client_ip', true), '');
            EXCEPTION WHEN OTHERS THEN
                ip_addr := NULL;
            END;

            -- Extract row identifier and states
            IF TG_OP = 'DELETE' THEN
                r_id := OLD.uuid;
                old_val := to_jsonb(OLD);
            ELSIF TG_OP = 'UPDATE' THEN
                r_id := NEW.uuid;
                old_val := to_jsonb(OLD);
                new_val := to_jsonb(NEW);
            ELSE
                r_id := NEW.uuid;
                new_val := to_jsonb(NEW);
            END IF;

            -- Log to audit table
            INSERT INTO audit_logs (
                uuid,
                table_name,
                action,
                row_id,
                old_values,
                new_values,
                user_uuid,
                client_ip
            ) VALUES (
                gen_random_uuid(),
                TG_TABLE_NAME,
                TG_OP,
                r_id,
                old_val,
                new_val,
                user_id,
                ip_addr
            );

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            ELSE
                RETURN NEW;
            END IF;
        END;
        $$ LANGUAGE plpgsql;
    """))

    # 2. Attach trigger on users table
    await db.execute(text("""
        CREATE TRIGGER audit_trigger_users
        AFTER INSERT OR UPDATE OR DELETE ON users
        FOR EACH ROW
        EXECUTE FUNCTION audit_trigger_func();
    """))
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
