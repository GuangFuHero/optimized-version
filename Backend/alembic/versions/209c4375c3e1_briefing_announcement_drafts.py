"""briefing and announcement drafts: published_at, published_by, updated_by

A NULL `published_at` marks a draft. Every existing row was live when it was written, so the
backfill marks them all published at their creation time, by their creator.

Revision ID: 209c4375c3e1
Revises: eb02aafe5f5a
Create Date: 2026-10-18

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "209c4375c3e1"
down_revision: str | Sequence[str] | None = "eb02aafe5f5a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _user_fk(name: str) -> sa.Column:
    return sa.Column(name, sa.UUID(as_uuid=True), sa.ForeignKey("users.uuid"), nullable=True)


def upgrade() -> None:
    """Add the draft columns to briefings and announcements and backfill existing rows."""
    for table in ("briefings", "announcements"):
        op.add_column(table, sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, _user_fk("published_by"))
        op.add_column(table, _user_fk("updated_by"))
        op.execute(
            f"UPDATE {table} SET published_at = created_at, published_by = created_by,"
            " updated_by = created_by"
        )
        op.alter_column(table, "updated_by", nullable=False)


def downgrade() -> None:
    """Soft-delete draft briefings, which the old schema would list publicly, then drop the draft columns."""
    op.execute("UPDATE briefings SET delete_at = now() WHERE published_at IS NULL AND delete_at IS NULL")
    for table in ("briefings", "announcements"):
        op.drop_column(table, "updated_by")
        op.drop_column(table, "published_by")
        op.drop_column(table, "published_at")
