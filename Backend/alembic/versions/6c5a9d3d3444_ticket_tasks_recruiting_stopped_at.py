"""add ticket_tasks.recruiting_stopped_at (a requester stopped recruiting for this need by hand)

Revision ID: 6c5a9d3d3444
Revises: e3b8f1a6c2d7
Create Date: 2026-09-29 12:00:00.000000

A need becomes `fulfilled` two ways: the claim that fills it, or its requester stopping
recruitment with its quantity cut to the people already on it. Only the first reopens when
someone gives their place back, so the row has to say which it was. Nullable, no backfill: no
existing need was stopped this way — the old 停止招募 canceled needs rather than fulfilling them.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6c5a9d3d3444'
down_revision: str | Sequence[str] | None = 'e3b8f1a6c2d7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable recruiting_stopped_at column."""
    op.add_column(
        'ticket_tasks', sa.Column('recruiting_stopped_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    """Drop the column."""
    op.drop_column('ticket_tasks', 'recruiting_stopped_at')
