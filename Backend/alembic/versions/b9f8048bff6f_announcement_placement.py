"""announcement placement: which page shows an announcement

`placement` is "admin_page", "public_page" or "all" (both pages). Existing rows become "all",
so they keep showing everywhere they did before.

Revision ID: b9f8048bff6f
Revises: 5e2c8a9f1b47
Create Date: 2026-10-02

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b9f8048bff6f"
down_revision: str | Sequence[str] | None = "5e2c8a9f1b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add announcements.placement, defaulting existing and new rows to "all"."""
    op.add_column(
        "announcements",
        sa.Column("placement", sa.Text(), nullable=False, server_default="all"),
    )


def downgrade() -> None:
    """Drop announcements.placement."""
    op.drop_column("announcements", "placement")
