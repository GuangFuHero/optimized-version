"""station operational status and task completed_at/canceled_at

Adds ``stations.operational_status`` (active/temporarily_closed/permanently_closed,
default active) + ``stations.status_changed_at`` (stamped whenever operational_status
changes), and ``ticket_tasks.completed_at`` / ``ticket_tasks.canceled_at`` (stamped when
status transitions to fulfilled / canceled). Backs the analytics dashboard's station
freshness-trend, ticket time-to-completion, and backlog-drain metrics.

Revision ID: a1b2c3d4e5f6
Revises: 8ebfc3903041
Create Date: 2026-08-07

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '8ebfc3903041'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add station operational_status/status_changed_at and task completed_at/canceled_at."""
    op.add_column(
        'stations',
        sa.Column('operational_status', sa.String(20), nullable=False, server_default='active'),
    )
    op.add_column('stations', sa.Column('status_changed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ticket_tasks', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ticket_tasks', sa.Column('canceled_at', sa.DateTime(timezone=True), nullable=True))

    # Backfill rows that reached these states before the columns existed. Analytics reads
    # `status` to decide a task is done or called off, but plots it by timestamp — so a NULL
    # here silently drops the row from every date-based chart. `updated_at` (last write of
    # any kind) only approximates the transition, but it is the only signal these rows have.
    op.execute(
        """
        UPDATE ticket_tasks
           SET completed_at = updated_at
         WHERE status = 'fulfilled' AND completed_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE ticket_tasks
           SET canceled_at = updated_at
         WHERE status = 'canceled' AND canceled_at IS NULL
        """
    )

    # Value constraint for operational_status. The GraphQL enum covers the API paths, but
    # anything writing outside them (scripts, manual SQL) could otherwise store a typo
    # that silently drops out of station_analytics.CLOSED_OPERATIONAL_STATUSES.
    # Guarded DO block rather than create_check_constraint(if_not_exists=True), which is
    # a silent no-op — same pattern as b7c1f0a92d34.
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_stations_operational_status') THEN
            ALTER TABLE stations
              ADD CONSTRAINT ck_stations_operational_status
              CHECK (operational_status IN ('active', 'temporarily_closed', 'permanently_closed'));
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Drop the task timestamps and station operational_status/status_changed_at."""
    op.execute("ALTER TABLE stations DROP CONSTRAINT IF EXISTS ck_stations_operational_status")
    op.drop_column('ticket_tasks', 'canceled_at')
    op.drop_column('ticket_tasks', 'completed_at')
    op.drop_column('stations', 'status_changed_at')
    op.drop_column('stations', 'operational_status')
