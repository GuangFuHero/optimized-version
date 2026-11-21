# SPDX-License-Identifier: GPL-3.0-only
"""analytics.view: lock the BI dashboard to the back-office roles

Revision ID: 162b65c8ff5f
Revises: 42cb936beed5
Create Date: 2026-11-14 12:00:00.000000

Registers `analytics.view` and grants it at `all` to data_auditor, super_admin and the team roles
admin and member, as the RBAC seed does for a new database. Only missing grants are inserted, so a
scope someone set at runtime stays; downgrade removes the key with every grant of it.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "162b65c8ff5f"
down_revision: str | Sequence[str] | None = "42cb936beed5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ROLES = (("data_auditor", "platform"), ("super_admin", "platform"), ("admin", "team"), ("member", "team"))


def upgrade() -> None:
    """Register the key if missing, then insert each missing grant at `all`."""
    op.execute(
        "INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'analytics.view') "
        "ON CONFLICT (key) DO NOTHING"
    )
    for role, kind in _ROLES:
        op.execute(
            "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
            "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
            f"WHERE r.name = '{role}' AND r.kind = '{kind}' AND p.key = 'analytics.view' "
            "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
        )


def downgrade() -> None:
    """Drop analytics.view and every role or user grant of it."""
    key = "(SELECT uuid FROM permissions WHERE key = 'analytics.view')"
    op.execute(f"DELETE FROM role_permission_assign WHERE permission_uuid IN {key}")
    op.execute(f"DELETE FROM user_permission_assign WHERE permission_uuid IN {key}")
    op.execute("DELETE FROM permissions WHERE key = 'analytics.view'")
