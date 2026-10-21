"""team admins edit their team, list its members, read its audit log: grant the new capabilities (Spec 026)

Revision ID: 79a19cabc98a
Revises: 0662cf1d2c83
Create Date: 2026-10-20 20:00:00.000000

ADR-357 gives the team role `admin` `team.edit` at `team`; ADR-358 adds `team.audit.view`, held by
`admin` at `team` and `super_admin` at `all`; the member list adds `team.member.view`, held by `admin`
and `member` at `team` and `super_admin` at `all`. The RBAC seed writes them on a new database, but it is
an additive bootstrap an existing database only sees when someone re-runs it (ADR-055), so this
revision writes them too.

Only missing grants are inserted: a grant someone already set at runtime through /admin/rbac keeps
its scope, and a database without these roles yet is left for the seed.

Downgrade removes `team.audit.view` and `team.member.view` with every grant of them, and the team
admin's `team.edit` at `team`. Before this revision no team role held `team.edit`, so that is the only
grant of it it can take.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "79a19cabc98a"
down_revision: str | Sequence[str] | None = "0662cf1d2c83"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (role name, role kind, capability, scope)
_NEW_KEYS = ("team.audit.view", "team.member.view")
_GRANTS = (
    ("admin", "team", "team.edit", "team"),
    ("admin", "team", "team.audit.view", "team"),
    ("super_admin", "platform", "team.audit.view", "all"),
    ("admin", "team", "team.member.view", "team"),
    ("member", "team", "team.member.view", "team"),
    ("super_admin", "platform", "team.member.view", "all"),
)


def upgrade() -> None:
    """Register the new keys if missing, then insert each missing grant."""
    for key in _NEW_KEYS:
        op.execute(
            f"INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), '{key}') "
            "ON CONFLICT (key) DO NOTHING"
        )
    for role, kind, key, scope in _GRANTS:
        op.execute(
            "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
            f"SELECT gen_random_uuid(), r.uuid, p.uuid, '{scope}' FROM roles r, permissions p "
            f"WHERE r.name = '{role}' AND r.kind = '{kind}' AND p.key = '{key}' "
            "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
        )


def downgrade() -> None:
    """Drop the new keys and their grants, and the team admin's team.edit at team."""
    for key in _NEW_KEYS:
        new = f"(SELECT uuid FROM permissions WHERE key = '{key}')"
        op.execute(f"DELETE FROM role_permission_assign WHERE permission_uuid IN {new}")
        op.execute(f"DELETE FROM user_permission_assign WHERE permission_uuid IN {new}")
        op.execute(f"DELETE FROM permissions WHERE key = '{key}'")
    op.execute(
        "DELETE FROM role_permission_assign WHERE scope = 'team' "
        "AND permission_uuid IN (SELECT uuid FROM permissions WHERE key = 'team.edit') "
        "AND role_uuid IN (SELECT uuid FROM roles WHERE name = 'admin' AND kind = 'team')"
    )
