"""audit triggers for RBAC v1 tables

Backfills the audit triggers for the RBAC v1 tables (teams / work zones / role-permission
engine). These tables are created by 1d52ab265e50, which runs AFTER the audit-system
migration (71bd05e07df3), so that migration cannot trigger them — it only covers the tables
that existed at its point (see its _AUDITED_TABLES_AT_THIS_REVISION snapshot). This migration
runs at head, once every audited table exists, and is idempotent (DROP IF EXISTS + CREATE) so
it is safe on both fresh and already-migrated databases.

Revision ID: c219aac56556
Revises: 2f9a1c7b6e04
Create Date: 2026-07-11

"""
from collections.abc import Sequence

from alembic import op
from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = 'c219aac56556'
down_revision: str | Sequence[str] | None = '2f9a1c7b6e04'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# RBAC v1 tables created by 1d52ab265e50 (after the audit migration). Hardcoded, not imported
# from AUDITED_TABLES, so this migration stays an immutable snapshot.
_RBAC_V1_AUDITED_TABLES = [
    "teams",
    "work_zones",
    "team_zone_assign",
    "roles",
    "permissions",
    "role_permission_assign",
    "user_role_assign",
    "user_permission_assign",
]


def upgrade() -> None:
    """Create audit triggers on the RBAC v1 tables (idempotent)."""
    for table in _RBAC_V1_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
        op.execute(get_audit_trigger_sql(table))


def downgrade() -> None:
    """Drop the RBAC v1 audit triggers."""
    for table in _RBAC_V1_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
