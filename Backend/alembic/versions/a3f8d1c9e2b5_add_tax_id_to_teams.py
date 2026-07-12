"""add tax_id (統一編號 / UBN) to teams

Revision ID: a3f8d1c9e2b5
Revises: c219aac56556
Create Date: 2026-07-12 00:00:00.000000

Adds an organization's Uniform Business Number (統一編號, 8 digits) to the teams table.
Nullable and non-unique on purpose: government agencies may lack one, and it is stored as
plain descriptive data — a team's scope boundary is still its own uuid (ADR-053), so this
column is never an authorization boundary.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a3f8d1c9e2b5'
down_revision: str | Sequence[str] | None = 'c219aac56556'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable tax_id column to teams."""
    op.execute("ALTER TABLE teams ADD COLUMN IF NOT EXISTS tax_id VARCHAR(8)")


def downgrade() -> None:
    """Drop the tax_id column from teams."""
    op.execute("ALTER TABLE teams DROP COLUMN IF EXISTS tax_id")
