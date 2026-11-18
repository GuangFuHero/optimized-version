"""mcp.use and mcp.unlimited_use: every role may connect an MCP client, all but `user` without a limit

Revision ID: 76849bb41898
Revises: 162b65c8ff5f
Create Date: 2026-11-15 12:00:00.000000

Registers both keys and grants them at `all` as the RBAC seed does for a new database: `mcp.use` to every
role, `mcp.unlimited_use` to every role but the platform `user`, so either can later be changed per role at
/admin/rbac. Only missing grants are inserted, so a scope someone set at runtime stays; downgrade removes
both keys with every grant of them.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "76849bb41898"
down_revision: str | Sequence[str] | None = "162b65c8ff5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KEYS = ("mcp.use", "mcp.unlimited_use")


def upgrade() -> None:
    """Register the keys if missing, then insert each role's missing grants at `all`."""
    for key in _KEYS:
        op.execute(
            f"INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), '{key}') "
            "ON CONFLICT (key) DO NOTHING"
        )
    op.execute(
        "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
        "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
        "WHERE p.key = 'mcp.use' "
        "OR (p.key = 'mcp.unlimited_use' AND NOT (r.name = 'user' AND r.kind = 'platform')) "
        "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
    )


def downgrade() -> None:
    """Drop both keys and every role or user grant of them."""
    keys = "(SELECT uuid FROM permissions WHERE key IN ('mcp.use', 'mcp.unlimited_use'))"
    op.execute(f"DELETE FROM role_permission_assign WHERE permission_uuid IN {keys}")
    op.execute(f"DELETE FROM user_permission_assign WHERE permission_uuid IN {keys}")
    op.execute("DELETE FROM permissions WHERE key IN ('mcp.use', 'mcp.unlimited_use')")
