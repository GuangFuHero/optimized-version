"""add description and category to policies

Revision ID: b5d1c8e9f3a2
Revises: fdaee08d6cd9
Create Date: 2026-06-06 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b5d1c8e9f3a2'
down_revision: str | Sequence[str] | None = 'fdaee08d6cd9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable description/category columns the Policy model expects.

    The initial schema (60fa7227481a) created `policies` without these columns, but the ORM model
    (app/models/auth.py) declares them, so any SELECT on policies failed with UndefinedColumnError.
    IF NOT EXISTS keeps this idempotent: DBs that already got the columns via the documented manual
    ALTER workaround upgrade cleanly, and fresh DBs get them created.
    """
    op.execute("ALTER TABLE policies ADD COLUMN IF NOT EXISTS description VARCHAR(255)")
    op.execute("ALTER TABLE policies ADD COLUMN IF NOT EXISTS category VARCHAR(50)")


def downgrade() -> None:
    """Drop the description/category columns from policies."""
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS category")
    op.execute("ALTER TABLE policies DROP COLUMN IF EXISTS description")
