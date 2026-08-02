"""add GIST spatial index on work_zones.geometry (PR #24 [15])

work_zones was created via raw SQL (1d52ab265e50) with no spatial index, so every zone-scope
`ST_Contains(WorkZone.geometry, ...)` sequentially scans the table. The geoalchemy2 model
implies a spatial index (default `spatial_index=True`); this adds the matching GIST index so
model and DDL agree.

Revision ID: f1a2b3c4d5e6
Revises: a3f8d1c9e2b5
Create Date: 2026-07-20 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: str | Sequence[str] | None = 'a3f8d1c9e2b5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the GIST index on work_zones.geometry (idempotent)."""
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_work_zones_geometry ON work_zones USING GIST (geometry)"
    )


def downgrade() -> None:
    """Drop the GIST index."""
    op.execute("DROP INDEX IF EXISTS ix_work_zones_geometry")
