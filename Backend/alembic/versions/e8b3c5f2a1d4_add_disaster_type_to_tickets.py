"""add_disaster_type_to_tickets

Revision ID: e8b3c5f2a1d4
Revises: d7e4f1a9c2b8
Create Date: 2026-06-08 23:30:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e8b3c5f2a1d4'
down_revision: str | Sequence[str] | None = 'd7e4f1a9c2b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the free-form disaster_type column to tickets."""
    op.add_column('tickets', sa.Column('disaster_type', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Drop the disaster_type column from tickets."""
    op.drop_column('tickets', 'disaster_type')
