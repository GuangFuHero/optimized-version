"""briefings: a status column, and at most one live version per state

Revision ID: da152a6a9d7c
Revises: 7370daf4c8f7
Create Date: 2026-10-23

`status` is draft, published (live) or inactive (replaced or taken down). The backfill keeps each
state's newest published row live and marks its older published rows inactive, as publishing them
one by one under the new rule would have; unpublished rows stay drafts.

Downgrade soft-deletes the inactive rows before dropping the column, because the old schema lists
every published row publicly and would put taken-down notices back on the site.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "da152a6a9d7c"
down_revision: str | Sequence[str] | None = "7370daf4c8f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and backfill status, then constrain it and index one live row per state."""
    op.add_column(
        "briefings", sa.Column("status", sa.String(20), server_default=sa.text("'draft'"), nullable=False)
    )
    op.execute("UPDATE briefings SET status = 'inactive' WHERE published_at IS NOT NULL")
    op.execute(
        """
        UPDATE briefings SET status = 'published' WHERE uuid IN (
            SELECT DISTINCT ON (state) uuid FROM briefings
            WHERE published_at IS NOT NULL AND delete_at IS NULL
            ORDER BY state, published_at DESC, uuid DESC
        )
        """
    )
    op.create_check_constraint(
        "ck_briefings_status", "briefings", "status IN ('draft', 'published', 'inactive')"
    )
    op.create_check_constraint(
        "ck_briefings_published_at", "briefings", "(status = 'draft') = (published_at IS NULL)"
    )
    op.create_index(
        "uq_briefings_live_per_state",
        "briefings",
        ["state"],
        unique=True,
        postgresql_where=sa.text("status = 'published' AND delete_at IS NULL"),
    )


def downgrade() -> None:
    """Soft-delete inactive briefings, which the old schema would list publicly, then drop status."""
    op.execute("UPDATE briefings SET delete_at = now() WHERE status = 'inactive' AND delete_at IS NULL")
    op.drop_index("uq_briefings_live_per_state", table_name="briefings")
    op.drop_constraint("ck_briefings_published_at", "briefings", type_="check")
    op.drop_constraint("ck_briefings_status", "briefings", type_="check")
    op.drop_column("briefings", "status")
