"""drop base_geometries.team_uuid (ADR-049 乙: geo jurisdiction is geographic, not org-owned)

Revision ID: 2f9a1c7b6e04
Revises: 1d52ab265e50
Create Date: 2026-07-09 10:00:00.000000

ADR-049 (pure-geography model): a geo resource's jurisdiction is decided by whether its
point falls inside a WorkZone polygon assigned to a team (`zone` scope), not by a stored
owning-org. `team_uuid` on base_geometries had no remaining consumer, so it is removed.
`users.team_uuid` (team membership) is untouched.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '2f9a1c7b6e04'
down_revision: str | Sequence[str] | None = '1d52ab265e50'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop the index and team_uuid column from base_geometries."""
    op.execute("DROP INDEX IF EXISTS ix_base_geometries_team_uuid")
    op.execute("ALTER TABLE base_geometries DROP COLUMN IF EXISTS team_uuid")


def downgrade() -> None:
    """Recreate the team_uuid column and its index on base_geometries."""
    op.execute(
        "ALTER TABLE base_geometries ADD COLUMN IF NOT EXISTS team_uuid UUID REFERENCES teams(uuid)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_base_geometries_team_uuid ON base_geometries(team_uuid)"
    )
