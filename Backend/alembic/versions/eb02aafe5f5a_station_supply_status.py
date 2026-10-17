"""station supply status: what a station is short of, and when that last changed

`supply_status` is the public free-text line the site's suggest-an-edit form calls 物資狀況;
`supply_status_updated_at` moves only when it changes (Spec/024 ADR-333). Both start empty.

Revision ID: eb02aafe5f5a
Revises: d4c8b1e07a92
Create Date: 2026-10-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eb02aafe5f5a"
down_revision: str | Sequence[str] | None = "d4c8b1e07a92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add stations.supply_status and stations.supply_status_updated_at, both nullable."""
    op.add_column("stations", sa.Column("supply_status", sa.String(), nullable=True))
    op.add_column(
        "stations", sa.Column("supply_status_updated_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    """Drop the two supply status columns."""
    op.drop_column("stations", "supply_status_updated_at")
    op.drop_column("stations", "supply_status")
