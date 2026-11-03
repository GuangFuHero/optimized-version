"""gov members import, export, review station suggestions, draw zones and open spaces: grant member (BE-RBAC-3 B3)

Revision ID: c4e7a2b91d05
Revises: f563197f1f3c
Create Date: 2026-11-02 19:00:00.000000

Carol, 2026-11-01 and 2026-11-02: a gov team's members do what its admins do on import, export,
the station review queue, 互助地圖 and 開啟空間; an NGO team's members do not. Gov and NGO members
share the team role `member`, so the role gets the grants and `resolve_scope` keeps them to gov
teams (GOV_MEMBER_ONLY_PERMS). The RBAC seed writes them on a new database, but it is an additive
bootstrap an existing database only sees when someone re-runs it (ADR-055), so this revision writes
them too.

Only missing grants are inserted: a grant someone already set at runtime through /admin/rbac keeps
its scope, and a database without the role yet is left for the seed. No capability key is new.

Downgrade removes the member's grants of these capabilities at the scopes this revision writes.
Before it `member` held none of them, so those are the only grants it can take.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e7a2b91d05"
down_revision: str | Sequence[str] | None = "f563197f1f3c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (capability, scope) for the team role `member`, as the admin role holds them.
_GRANTS = (
    ("ticket.export", "zone"),
    ("ticket.import", "all"),
    ("station.export", "team"),
    ("station.import", "all"),
    ("station.review", "team"),
    ("work_zone.view", "all"),
    ("work_zone.add", "all"),
    ("work_zone.edit", "all"),
    ("work_zone.assign", "all"),
    ("work_zone.delete", "all"),
)


def upgrade() -> None:
    """Insert each missing grant for the team role `member`."""
    for key, scope in _GRANTS:
        op.execute(
            "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
            f"SELECT gen_random_uuid(), r.uuid, p.uuid, '{scope}' FROM roles r, permissions p "
            f"WHERE r.name = 'member' AND r.kind = 'team' AND p.key = '{key}' "
            "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
        )


def downgrade() -> None:
    """Remove the member's grants this revision writes."""
    for key, scope in _GRANTS:
        op.execute(
            f"DELETE FROM role_permission_assign WHERE scope = '{scope}' "
            f"AND permission_uuid IN (SELECT uuid FROM permissions WHERE key = '{key}') "
            "AND role_uuid IN (SELECT uuid FROM roles WHERE name = 'member' AND kind = 'team')"
        )
