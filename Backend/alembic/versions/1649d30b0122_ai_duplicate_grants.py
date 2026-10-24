"""ai_duplicate.*: grant the review queue to super_admin and data_auditor (ADR-337, ADR-342)

Revision ID: 1649d30b0122
Revises: 209c4375c3e1
Create Date: 2026-10-20 12:00:00.000000

Spec 025 opens the AI 重複審核 queue. Until now no role held `ai_duplicate.view` or
`ai_duplicate.review`, because nothing checked them. The RBAC seed is an additive bootstrap that
never overwrites an existing grant (ADR-055), and an existing database only gains new grants
when someone re-runs it, so this revision writes them as well:

- registers `ai_duplicate.revoke` (new in ADR-342: undoing someone else's verdict);
- super_admin: view, review, revoke at `all`;
- data_auditor: view, review at `all`.

Only missing grants are inserted. A grant someone already set at runtime through
/api/v1/admin/rbac keeps its scope (the runtime database is the source of truth, ADR-055), and a
database without those roles yet (seeded later) is left for the seed.

Downgrade removes `ai_duplicate.revoke` with every grant of it, and the view/review grants these
two roles hold at `all`. No role held view/review before this revision, so the only grants it can
take away are ones set by hand to `all` in between.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1649d30b0122"
down_revision: str | Sequence[str] | None = "209c4375c3e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KEYS = ("ai_duplicate.view", "ai_duplicate.review", "ai_duplicate.revoke")
_GRANTS = {
    "super_admin": ("ai_duplicate.view", "ai_duplicate.review", "ai_duplicate.revoke"),
    "data_auditor": ("ai_duplicate.view", "ai_duplicate.review"),
}


def upgrade() -> None:
    """Register the three keys if missing, then insert each missing grant at `all`."""
    for key in _KEYS:
        op.execute(
            f"INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), '{key}') "
            f"ON CONFLICT (key) DO NOTHING"
        )
    for role, keys in _GRANTS.items():
        for key in keys:
            op.execute(
                "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
                "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
                f"WHERE r.name = '{role}' AND r.kind = 'platform' AND p.key = '{key}' "
                "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
            )


def downgrade() -> None:
    """Drop ai_duplicate.revoke and its grants, and the two roles' view/review grants at `all`."""
    revoke = "(SELECT uuid FROM permissions WHERE key = 'ai_duplicate.revoke')"
    op.execute(f"DELETE FROM role_permission_assign WHERE permission_uuid IN {revoke}")
    op.execute(f"DELETE FROM user_permission_assign WHERE permission_uuid IN {revoke}")
    op.execute("DELETE FROM permissions WHERE key = 'ai_duplicate.revoke'")
    op.execute(
        "DELETE FROM role_permission_assign WHERE scope = 'all' "
        "AND permission_uuid IN (SELECT uuid FROM permissions "
        "WHERE key IN ('ai_duplicate.view', 'ai_duplicate.review')) "
        "AND role_uuid IN (SELECT uuid FROM roles "
        "WHERE name IN ('super_admin', 'data_auditor') AND kind = 'platform')"
    )
