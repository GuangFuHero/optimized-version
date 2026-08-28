"""merge notifications and station photos heads

Both `f3e4d5c6b7a8` (notifications table) and `b8f4d2a6e1c3` (station photos + contact
fields) branched off `e1f2a3b4c5d6` in parallel PRs. Each is a single head on its own
branch; they only collide once both are on main, where `alembic upgrade head` fails with
"Multiple head revisions are present". This is an empty merge point that rejoins them —
no schema change of its own.

Revision ID: 8ebfc3903041
Revises: b8f4d2a6e1c3, f3e4d5c6b7a8
Create Date: 2026-08-22 10:51:37.952158

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "8ebfc3903041"
down_revision: str | Sequence[str] | None = ("b8f4d2a6e1c3", "f3e4d5c6b7a8")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """No-op: this revision exists only to rejoin two parallel migration branches."""


def downgrade() -> None:
    """No-op: splitting back into two heads is handled by alembic itself."""
