"""station operational status and task completed_at

Adds ``stations.operational_status`` (active/temporarily_closed/permanently_closed,
default active) + ``stations.status_changed_at`` (stamped whenever operational_status
changes), and ``ticket_tasks.completed_at`` (stamped when status transitions to
fulfilled). Backs the analytics dashboard's station freshness-trend and ticket
time-to-completion metrics.

Revision ID: a1b2c3d4e5f6
Revises: b8f4d2a6e1c3
Create Date: 2026-08-07

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = 'b8f4d2a6e1c3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add station operational_status/status_changed_at and ticket_tasks.completed_at."""
    op.add_column(
        'stations',
        sa.Column('operational_status', sa.String(20), nullable=False, server_default='active'),
    )
    op.add_column('stations', sa.Column('status_changed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ticket_tasks', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Drop ticket_tasks.completed_at and station operational_status/status_changed_at."""
    op.drop_column('ticket_tasks', 'completed_at')
    op.drop_column('stations', 'status_changed_at')
    op.drop_column('stations', 'operational_status')
