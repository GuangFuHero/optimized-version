"""mcp.use: let every role connect an MCP client

Revision ID: 76849bb41898
Revises: 42cb936beed5
Create Date: 2026-11-15 12:00:00.000000

Registers `mcp.use` and grants it at `all` to every role, as the RBAC seed does for a new database, so
access can later be taken away per role at /admin/rbac. Only missing grants are inserted, so a scope
someone set at runtime stays; downgrade removes the key with every grant of it.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "76849bb41898"
down_revision: str | Sequence[str] | None = "42cb936beed5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Register the key if missing, then insert each role's missing grant at `all`."""
    op.execute(
        "INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'mcp.use') "
        "ON CONFLICT (key) DO NOTHING"
    )
    op.execute(
        "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
        "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
        "WHERE p.key = 'mcp.use' "
        "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
    )


def downgrade() -> None:
    """Drop mcp.use and every role or user grant of it."""
    key = "(SELECT uuid FROM permissions WHERE key = 'mcp.use')"
    op.execute(f"DELETE FROM role_permission_assign WHERE permission_uuid IN {key}")
    op.execute(f"DELETE FROM user_permission_assign WHERE permission_uuid IN {key}")
    op.execute("DELETE FROM permissions WHERE key = 'mcp.use'")
