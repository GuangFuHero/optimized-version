"""notifications: `read` is true exactly when `read_at` is set

Revision ID: 9dd1f61063fe
Revises: af6e25b0d8db
Create Date: 2026-10-29 21:30:00.000000

`read` repeats what `read_at` says. It stays, because the unread count's index is built on it, and the
two writers in the notification repository set both; this CHECK makes the database hold them together
too, whatever writes a row. Which of the two is right cannot be told from the data, so where a row
disagrees the upgrade stops and says how many there are and how to list them, rather than guess.
Downgrade drops the CHECK.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9dd1f61063fe"
down_revision: str | Sequence[str] | None = "af6e25b0d8db"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CHECK = "ck_notifications_read_matches_read_at"
_RULE = "read = (read_at IS NOT NULL)"
# The rows the CHECK would refuse: NOT of its rule, so a row it lets through is not listed.
_LIST = f"SELECT uuid, read, read_at FROM notifications WHERE NOT ({_RULE})"


def upgrade() -> None:
    """Add the CHECK, once no row breaks it."""
    disagreeing = op.get_bind().scalar(sa.text(f"SELECT count(*) FROM notifications WHERE NOT ({_RULE})"))
    if disagreeing:
        raise RuntimeError(
            f"{disagreeing} notifications have `read` and `read_at` disagreeing, and which is right "
            f"cannot be told from the data. List them with: {_LIST}; fix them, then upgrade again."
        )
    op.create_check_constraint(_CHECK, "notifications", _RULE)


def downgrade() -> None:
    """Drop it."""
    op.drop_constraint(_CHECK, "notifications", type_="check")
