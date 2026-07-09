"""create announcements

Revision ID: a7c9e1f4b2d8
Revises: 71bd05e07df3
Create Date: 2026-06-27 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7c9e1f4b2d8'
down_revision: str | Sequence[str] | None = '71bd05e07df3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the announcements table. No unique constraint on display_order (app-enforced)."""
    op.create_table(
        "announcements",
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("display_order", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("uuid", sa.UUID(as_uuid=True), nullable=False, comment="主鍵 UUID"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="建立時間"),  # noqa: E501
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="最後更新時間"),  # noqa: E501
        sa.Column("delete_at", sa.DateTime(timezone=True), nullable=True, comment="軟刪除時間"),
        sa.ForeignKeyConstraint(["created_by"], ["users.uuid"]),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index(op.f("ix_announcements_created_by"), "announcements", ["created_by"])


def downgrade() -> None:
    """Drop the announcements table."""
    op.drop_index(op.f("ix_announcements_created_by"), table_name="announcements")
    op.drop_table("announcements")
