"""project_settings.short_name: the disaster's short name for the public site's top bar (ADR-392)

Revision ID: 50e667b42105
Revises: da152a6a9d7c
Create Date: 2026-10-25

Nullable with no backfill: a deployment without one keeps showing its full name, as before.
Downgrade drops the column, and with it any short name that was set.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "50e667b42105"
down_revision: str | Sequence[str] | None = "da152a6a9d7c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the nullable short name."""
    op.add_column(
        "project_settings",
        sa.Column(
            "short_name",
            sa.String(30),
            nullable=True,
            comment="災害簡稱，例如「花蓮馬太鞍溪」；沒填用 name",
        ),
    )


def downgrade() -> None:
    """Drop it."""
    op.drop_column("project_settings", "short_name")
