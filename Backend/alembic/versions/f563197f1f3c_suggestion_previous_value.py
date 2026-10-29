"""station_update_suggestions.previous_value: the field's value when the suggestion was sent (ADR-420)

Revision ID: f563197f1f3c
Revises: ba24b9c49284
Create Date: 2026-10-29

One nullable column with no backfill: what a field held before a suggestion was sent is not recorded
anywhere for the pending and rejected rows, and an approved row's merge holds the value at the review,
not at the submit. A field with no value is recorded as '', so null means only that the row came
before this revision; the site then shows only what was suggested. Downgrade drops the column, and
with it every value recorded.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f563197f1f3c"
down_revision: str | Sequence[str] | None = "ba24b9c49284"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the value before, empty on every existing row."""
    op.add_column(
        "station_update_suggestions",
        sa.Column(
            "previous_value",
            sa.String(),
            nullable=True,
            comment="送出建議時這個欄位的值（文字，沒有值存空字串）；這欄上線前送出的是 NULL",
        ),
    )


def downgrade() -> None:
    """Drop it."""
    op.drop_column("station_update_suggestions", "previous_value")
