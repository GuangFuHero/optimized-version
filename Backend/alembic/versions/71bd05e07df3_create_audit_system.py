"""create_audit_system

Revision ID: 71bd05e07df3
Revises: b5d1c8e9f3a2
Create Date: 2026-06-09 17:45:12.932030

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.db.triggers import (
    AUDIT_TRIGGER_FUNC_SQL,
    PROTECT_AUDIT_LOGS_FUNC_SQL,
    PROTECT_AUDIT_LOGS_TRIGGER_SQL,
    get_audit_trigger_sql,
)

# revision identifiers, used by Alembic.
revision: str = '71bd05e07df3'
down_revision: str | Sequence[str] | None = 'b5d1c8e9f3a2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Snapshot of the audited tables that exist AS OF this revision. Deliberately hardcoded and
# NOT imported from app.db.triggers.AUDITED_TABLES: that list grows over time, and importing
# the live version makes this historical migration try to CREATE TRIGGER on tables created by
# LATER migrations (RBAC v1's teams/roles/etc. from 1d52ab265e50), which fails on a fresh
# `alembic upgrade head` with "relation does not exist". Tables added after this revision get
# their audit triggers in their own migration (see c219aac56556).
_AUDITED_TABLES_AT_THIS_REVISION = [
    "users",
    "user_identities",
    "user_contacts",
    "base_geometries",
    "stations",
    "closure_areas",
    "tickets",
    "ticket_tasks",
    "task_assignments",
    "routes",
    "secondary_locations",
]


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
    op.execute(AUDIT_TRIGGER_FUNC_SQL)

    # 3. Create triggers on the tables that exist as of this revision
    for table in _AUDITED_TABLES_AT_THIS_REVISION:
        op.execute(get_audit_trigger_sql(table))

    # 4. Prevent updates/deletes on audit_logs table to enforce append-only behavior
    op.execute(PROTECT_AUDIT_LOGS_FUNC_SQL)
    op.execute(PROTECT_AUDIT_LOGS_TRIGGER_SQL)


def downgrade() -> None:
    """Downgrade schema: Drop triggers, functions, and audit_logs table."""
    op.execute("DROP TRIGGER IF EXISTS protect_audit_logs_trigger ON audit_logs;")
    op.execute("DROP FUNCTION IF EXISTS protect_audit_logs_func();")

    for table in _AUDITED_TABLES_AT_THIS_REVISION:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")

    op.execute("DROP FUNCTION IF EXISTS audit_trigger_func();")
    op.drop_table('audit_logs')


