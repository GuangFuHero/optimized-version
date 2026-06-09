"""create_audit_system

Revision ID: 71bd05e07df3
Revises: b5d1c8e9f3a2
Create Date: 2026-06-09 17:45:12.932030

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '71bd05e07df3'
down_revision: str | Sequence[str] | None = 'b5d1c8e9f3a2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: Create audit_logs table, trigger function, and triggers on audited tables."""
    # 1. Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('table_name', sa.String(length=100), nullable=False, comment='異動資料表名稱'),
        sa.Column('action', sa.String(length=20), nullable=False, comment='異動類型 (INSERT, UPDATE, DELETE)'),
        sa.Column('row_id', sa.UUID(), nullable=False, comment='受異動資料的主鍵 UUID'),
        sa.Column('old_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='異動前資料內容'),
        sa.Column('new_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='異動後資料內容'),
        sa.Column('user_uuid', sa.UUID(), nullable=True, comment='操作者使用者 UUID'),
        sa.Column('client_ip', sa.String(length=50), nullable=True, comment='操作者 IP 位址'),
        sa.Column('uuid', sa.UUID(), nullable=False, comment='主鍵 UUID'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False, comment='建立時間'),
        sa.PrimaryKeyConstraint('uuid')
    )

    # 2. Create trigger function to log operations
    op.execute("""
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
    """)

    # 3. Create triggers on audited tables
    tables = [
        'users',
        'user_identities',
        'user_contacts',
        'base_geometries',
        'station_properties',
        'ticket_tasks',
        'task_assignments',
        'routes',
        'secondary_locations'
    ]

    for table in tables:
        op.execute(f"""
            CREATE TRIGGER audit_trigger_{table}
            AFTER INSERT OR UPDATE OR DELETE ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION audit_trigger_func();
        """)

    # 4. Prevent updates/deletes on audit_logs table to enforce append-only behavior
    op.execute("""
        CREATE OR REPLACE FUNCTION protect_audit_logs_func()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Audit logs table is append-only. Updates and Deletes are forbidden.';
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER protect_audit_logs_trigger
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION protect_audit_logs_func();
    """)


def downgrade() -> None:
    """Downgrade schema: Drop triggers, functions, and audit_logs table."""
    op.execute("DROP TRIGGER IF EXISTS protect_audit_logs_trigger ON audit_logs;")
    op.execute("DROP FUNCTION IF EXISTS protect_audit_logs_func();")

    tables = [
        'users',
        'user_identities',
        'user_contacts',
        'base_geometries',
        'station_properties',
        'ticket_tasks',
        'task_assignments',
        'routes',
        'secondary_locations'
    ]

    for table in tables:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")

    op.execute("DROP FUNCTION IF EXISTS audit_trigger_func();")
    op.drop_table('audit_logs')

