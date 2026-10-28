"""Who reviewed a merge, and who last changed a briefing or an announcement, may be NULL (ADR-393)

station_suggestion_merges.reviewed_by, briefings.updated_by and announcements.updated_by.

Revision ID: facf37b5c79d
Revises: 50e667b42105
Create Date: 2026-10-26

NULL means the account that reviewed the merge, or last changed the briefing or announcement, is
gone: the mock seed removes the mock accounts on every SEED_MOCK run and keeps what real people
made. Nothing in the app writes a NULL here; every write path still names its actor.

Downgrade fills a briefing's or an announcement's from its author, as 209c4375c3e1 did when the
column was added, and refuses while a merge has no reviewer: nobody can be named for it, and
deleting the merge would lose the record of what it changed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "facf37b5c79d"
down_revision: str | Sequence[str] | None = "50e667b42105"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_UPDATED_BY = ("briefings", "announcements")


def upgrade() -> None:
    """Drop the three NOT NULLs."""
    op.alter_column("station_suggestion_merges", "reviewed_by", nullable=True)
    for table in _UPDATED_BY:
        op.alter_column(table, "updated_by", nullable=True)


def downgrade() -> None:
    """Restore them, naming the author where an updater is missing; stop on a merge with no reviewer."""
    orphaned = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM station_suggestion_merges WHERE reviewed_by IS NULL")
    )
    if orphaned:
        raise RuntimeError(
            f"{orphaned} station_suggestion_merges rows have no reviewer; name one for each before "
            "downgrading, since reviewed_by becomes NOT NULL again"
        )
    op.alter_column("station_suggestion_merges", "reviewed_by", nullable=False)
    for table in _UPDATED_BY:
        op.execute(f"UPDATE {table} SET updated_by = created_by WHERE updated_by IS NULL")
        op.alter_column(table, "updated_by", nullable=False)
