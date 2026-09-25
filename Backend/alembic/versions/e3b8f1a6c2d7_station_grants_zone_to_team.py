"""station.* grants: zone -> team (ADR-285 decision 3)

Revision ID: e3b8f1a6c2d7
Revises: d4a7e2c9b1f5
Create Date: 2026-09-23 18:00:00.000000

Stations left the zone model: a team now reaches the stations assigned to it (`team`), and
`zone` on a station capability no longer means anything the product wants. The RBAC seed is an
additive bootstrap that never overwrites an existing grant (ADR-055), so the seed change alone
would leave every existing database on `zone`. This converts them.

Only grants still at `zone` move — role grants and per-user grants alike. A grant someone set
to another scope at runtime through /api/v1/admin/rbac is left alone: the runtime database is
the source of truth (ADR-055).

Downgrade turns every station `team` grant back into `zone`. It cannot tell which were `team`
before this revision, but none were: `team` on a station could never match until ADR-285 gave
stations a team_uuid, so nothing had a reason to hold it.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e3b8f1a6c2d7'
down_revision: str | Sequence[str] | None = 'd4a7e2c9b1f5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GRANT_TABLES = ("role_permission_assign", "user_permission_assign")


def _move(old: str, new: str) -> None:
    for table in _GRANT_TABLES:
        op.execute(
            f"UPDATE {table} SET scope = '{new}' "
            f"WHERE scope = '{old}' "
            f"AND permission_uuid IN (SELECT uuid FROM permissions WHERE key LIKE 'station.%')"
        )


def upgrade() -> None:
    """Move every station grant still at `zone` to `team`."""
    _move("zone", "team")


def downgrade() -> None:
    """Move every station grant at `team` back to `zone`."""
    _move("team", "zone")
