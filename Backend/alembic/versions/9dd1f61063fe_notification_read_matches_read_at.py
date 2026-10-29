"""notifications: `read` is true exactly when `read_at` is set (ADR-439)

Revision ID: 9dd1f61063fe
Revises: af6e25b0d8db
Create Date: 2026-10-29 21:30:00.000000

`read` repeats what `read_at` says (3NF audit F2). It stays, because the unread count's index is
built on it, and the two writers in the notification repository set both; this CHECK makes the
database hold them together too, whatever writes a row. Staging had no row that disagreed
(2026-10-29: 0 of 229), so the upgrade rewrites nothing; on a database where one does, it fails
rather than guess which column is right. Downgrade drops the CHECK.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9dd1f61063fe"
down_revision: str | Sequence[str] | None = "af6e25b0d8db"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CHECK = "ck_notifications_read_matches_read_at"


def upgrade() -> None:
    """Add the CHECK."""
    op.create_check_constraint(_CHECK, "notifications", "read = (read_at IS NOT NULL)")


def downgrade() -> None:
    """Drop it."""
    op.drop_constraint(_CHECK, "notifications", type_="check")
