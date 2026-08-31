"""audit triggers for the dynamic-field value tables

Backfills the audit triggers for `station_properties` and `task_properties`. Both tables
predate this revision (a2a8e4d8c51d created them) but were never in any audit snapshot, so
every change to a station's stock quantity, a crowd-sourced entry's review status, or a
task's dynamic field went unrecorded (feature 015, ADR-124).

Adding a name to `app.db.triggers.AUDITED_TABLES` does nothing on its own: the original
audit migration (71bd05e07df3) iterates a frozen snapshot of that list as it stood at its
own revision. A table added later needs a migration of its own — the same shape
c219aac56556 used for the RBAC v1 tables.

Revision ID: b3f1c07d2a95
Revises: 07ac630e0009
Create Date: 2026-08-22

"""
from collections.abc import Sequence

from alembic import op

from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = "b3f1c07d2a95"
down_revision: str | Sequence[str] | None = "07ac630e0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen snapshot: the tables THIS revision attaches. Deliberately not read from
# AUDITED_TABLES, so a later edit to that list never rewrites what this migration did.
_DYNAMIC_FIELD_AUDITED_TABLES = [
    "station_properties",
    "task_properties",
]


def upgrade() -> None:
    """Create audit triggers on the dynamic-field value tables (idempotent)."""
    for table in _DYNAMIC_FIELD_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
        op.execute(get_audit_trigger_sql(table))


def downgrade() -> None:
    """Drop the dynamic-field audit triggers."""
    for table in _DYNAMIC_FIELD_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
