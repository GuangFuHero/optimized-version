"""notifications.params: the values a client needs to write each notice's sentence itself

Revision ID: 42cb936beed5
Revises: d8a3f6c2e417
Create Date: 2026-11-02

One nullable JSONB column with no backfill: the values an older notice named are only in its
title and body, which the client keeps showing for a row whose params is null. Downgrade drops the
column, and with it every value recorded.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "42cb936beed5"
down_revision: str | Sequence[str] | None = "d8a3f6c2e417"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add params, null on every existing row."""
    op.add_column(
        "notifications",
        sa.Column(
            "params",
            postgresql.JSONB(),
            nullable=True,
            comment="前端組句子用的值，各 type 的 key 見 PARAM_KEYS；舊通知為 NULL，照 title/body 顯示",
        ),
    )


def downgrade() -> None:
    """Drop it."""
    op.drop_column("notifications", "params")
