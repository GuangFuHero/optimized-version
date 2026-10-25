"""duplicate_pairs.status: confirmed -> confirmed_duplicate, rejected -> not_duplicate (ADR-391)

Revision ID: a8d3e6b1c207
Revises: c3f1a9d27b54
Create Date: 2026-10-25 12:00:00.000000

A pair card's verdicts said "confirmed" and "rejected", which read like approved and refused in the
other review queues (station suggestions, role requests) and backwards for a card: "rejected" meant
"not a duplicate", the good outcome for both tickets. They are renamed to say what was decided.

The values already written are renamed in place and the CHECK rebuilt. The audit event types keep
"confirmed" / "rejected": an event records what the reviewer did, which reads the same either way.

Downgrade renames the values back and restores the old CHECK.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a8d3e6b1c207"
down_revision: str | Sequence[str] | None = "c3f1a9d27b54"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NAME = "ck_duplicate_pairs_status"
_RENAMES = (("confirmed", "confirmed_duplicate"), ("rejected", "not_duplicate"))
_PENDING = ("dup_ignored", "suggested")


def _rebuild(verdicts: tuple[str, ...], renames: tuple[tuple[str, str], ...]) -> None:
    op.drop_constraint(_NAME, "duplicate_pairs", type_="check")
    bind = op.get_bind()
    for old, new in renames:
        bind.execute(
            sa.text("UPDATE duplicate_pairs SET status = :new WHERE status = :old"), {"old": old, "new": new}
        )
    allowed = ", ".join(repr(v) for v in (*_PENDING, *verdicts))
    op.create_check_constraint(_NAME, "duplicate_pairs", f"status IN ({allowed})")


def upgrade() -> None:
    """Rename the verdict statuses and rebuild the CHECK."""
    _rebuild(tuple(new for _, new in _RENAMES), _RENAMES)


def downgrade() -> None:
    """Rename them back and restore the old CHECK."""
    _rebuild(tuple(old for old, _ in _RENAMES), tuple((new, old) for old, new in _RENAMES))
