"""super admins export the audit log: register audit.export and grant it (ADR-414)

Revision ID: b5d8e2a41c07
Revises: ba24b9c49284
Create Date: 2026-10-28 12:00:00.000000

The RBAC seed writes the grant on a new database, but an existing database only sees the seed when
someone re-runs it (ADR-055), so this revision writes it too. Only a missing grant is inserted: one
set at runtime through /admin/rbac keeps its scope.

Downgrade removes `audit.export` with every grant of it.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5d8e2a41c07"
down_revision: str | Sequence[str] | None = "ba24b9c49284"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KEY = "audit.export"


def upgrade() -> None:
    """Register the key if missing, then grant it to super_admin at `all` if missing."""
    op.execute(
        f"INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), '{_KEY}') "
        "ON CONFLICT (key) DO NOTHING"
    )
    op.execute(
        "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
        "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
        f"WHERE r.name = 'super_admin' AND r.kind = 'platform' AND p.key = '{_KEY}' "
        "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
    )


def downgrade() -> None:
    """Drop the key and every grant of it."""
    key = f"(SELECT uuid FROM permissions WHERE key = '{_KEY}')"
    op.execute(f"DELETE FROM role_permission_assign WHERE permission_uuid IN {key}")
    op.execute(f"DELETE FROM user_permission_assign WHERE permission_uuid IN {key}")
    op.execute(f"DELETE FROM permissions WHERE key = '{_KEY}'")
