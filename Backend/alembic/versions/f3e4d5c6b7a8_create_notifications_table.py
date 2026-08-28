"""create notifications table

Revision ID: f3e4d5c6b7a8
Revises: e1f2a3b4c5d6
Create Date: 2026-08-09 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3e4d5c6b7a8"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the notifications table and related indexes."""
    op.create_table(
        "notifications",
        sa.Column("uuid", sa.UUID(as_uuid=True), nullable=False, comment="主鍵 UUID"),
        sa.Column("recipient_uuid", sa.UUID(as_uuid=True), nullable=False, comment="接收通知的使用者 UUID"),
        sa.Column(
            "actor_uuid",
            sa.UUID(as_uuid=True),
            nullable=True,
            comment="觸發此事件的使用者 UUID (系統觸發為 NULL)",
        ),
        sa.Column("type", sa.String(length=50), nullable=False, comment="通知類型 enum"),
        sa.Column(
            "priority", sa.String(length=20), server_default="medium", nullable=False, comment="優先級"
        ),
        sa.Column("ref_type", sa.String(length=50), nullable=True, comment="關聯實體類型"),
        sa.Column("ref_uuid", sa.UUID(as_uuid=True), nullable=True, comment="關聯實體之 UUID"),
        sa.Column("title", sa.String(length=200), nullable=False, comment="通知標題"),
        sa.Column("body", sa.Text(), nullable=False, comment="通知內文"),
        sa.Column("read", sa.Boolean(), server_default=sa.false(), nullable=False, comment="是否已讀"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True, comment="已讀時間"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="建立時間",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="最後更新時間",
        ),
        sa.Column("delete_at", sa.DateTime(timezone=True), nullable=True, comment="軟刪除時間"),
        sa.ForeignKeyConstraint(["recipient_uuid"], ["users.uuid"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_uuid"], ["users.uuid"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index(
        "ix_notifications_recipient_unread", "notifications", ["recipient_uuid", "read", "delete_at"]
    )
    op.create_index("ix_notifications_recipient_created", "notifications", ["recipient_uuid", "created_at"])


def downgrade() -> None:
    """Drop the notifications table and related indexes."""
    op.drop_index("ix_notifications_recipient_created", table_name="notifications")
    op.drop_index("ix_notifications_recipient_unread", table_name="notifications")
    op.drop_table("notifications")
