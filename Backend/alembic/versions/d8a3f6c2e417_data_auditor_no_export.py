"""data auditors export nothing: revoke data_auditor's ticket.export and station.export (ADR-460)

Revision ID: d8a3f6c2e417
Revises: c4e7a2b91d05
Create Date: 2026-11-03 13:00:00.000000

Carol, 2026-11-03: a data auditor only checks data on the admin pages, so it exports nothing. The
RBAC seed no longer grants the two exports, but it is an additive bootstrap that never removes a
grant (ADR-055, ADR-064), so this revision takes them off an existing database.

It removes the role's grants at any scope: whatever scope a grant was set to through /admin/rbac,
the role is not to export. A direct grant to one account (ADR-073) is a super admin's own decision
and is left alone.

Downgrade puts back the `all` grants the role held before.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d8a3f6c2e417"
down_revision: str | Sequence[str] | None = "c4e7a2b91d05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KEYS = ("ticket.export", "station.export")


def upgrade() -> None:
    """Remove the data auditor's export grants."""
    for key in _KEYS:
        op.execute(
            "DELETE FROM role_permission_assign "
            f"WHERE permission_uuid IN (SELECT uuid FROM permissions WHERE key = '{key}') "
            "AND role_uuid IN (SELECT uuid FROM roles WHERE name = 'data_auditor' AND kind = 'platform')"
        )


def downgrade() -> None:
    """Grant the data auditor both exports at `all` again."""
    for key in _KEYS:
        op.execute(
            "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope) "
            "SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p "
            f"WHERE r.name = 'data_auditor' AND r.kind = 'platform' AND p.key = '{key}' "
            "ON CONFLICT ON CONSTRAINT uq_role_perm DO NOTHING"
        )
