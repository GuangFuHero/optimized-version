"""add stations.team_uuid (ADR-285: a station is assigned by hand to the one team that runs it)

Revision ID: d4a7e2c9b1f5
Revises: b3e8d1f4a6c2
Create Date: 2026-09-23 12:00:00.000000

ADR-285 takes stations out of ADR-049's pure-geography model: a station is governed by the team it
is assigned to, not by which WorkZone its point falls in. Tickets keep following zones, so the
column goes on `stations`, not back on `base_geometries`. Nullable — null means unassigned — and
ON DELETE SET NULL, so a team that is ever hard-deleted leaves its stations unassigned rather than
blocking the delete. No backfill: every existing station starts unassigned.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4a7e2c9b1f5'
down_revision: str | Sequence[str] | None = 'b3e8d1f4a6c2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable team_uuid column, its FK to teams and its index."""
    op.add_column('stations', sa.Column('team_uuid', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'stations_team_uuid_fkey', 'stations', 'teams', ['team_uuid'], ['uuid'], ondelete='SET NULL'
    )
    op.create_index('ix_stations_team_uuid', 'stations', ['team_uuid'])


def downgrade() -> None:
    """Drop the index, the FK and the column."""
    op.drop_index('ix_stations_team_uuid', table_name='stations')
    op.drop_constraint('stations_team_uuid_fkey', 'stations', type_='foreignkey')
    op.drop_column('stations', 'team_uuid')
