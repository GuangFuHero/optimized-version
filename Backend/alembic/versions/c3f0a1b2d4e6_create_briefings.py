"""create briefing templates and briefings; drop unused station/task score columns

Revision ID: c3f0a1b2d4e6
Revises: 07ac630e0009
Create Date: 2026-06-27 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c3f0a1b2d4e6'
down_revision: str | Sequence[str] | None = '07ac630e0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the briefing_templates and briefings tables."""
    op.create_table(
        "briefing_templates",
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.JSONB(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("state", sa.String(length=50), server_default=sa.text("'briefing'"), nullable=False),  # noqa: E501
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("uuid", sa.UUID(as_uuid=True), nullable=False, comment="主鍵 UUID"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="建立時間"),  # noqa: E501
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="最後更新時間"),  # noqa: E501
        sa.Column("delete_at", sa.DateTime(timezone=True), nullable=True, comment="軟刪除時間"),
        sa.ForeignKeyConstraint(["created_by"], ["users.uuid"]),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index(
        op.f("ix_briefing_templates_created_by"), "briefing_templates", ["created_by"]
    )

    op.create_table(
        "briefings",
        sa.Column("template_uuid", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", postgresql.JSONB(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("state", sa.String(length=50), server_default=sa.text("'briefing'"), nullable=False),  # noqa: E501
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("uuid", sa.UUID(as_uuid=True), nullable=False, comment="主鍵 UUID"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="建立時間"),  # noqa: E501
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False, comment="最後更新時間"),  # noqa: E501
        sa.Column("delete_at", sa.DateTime(timezone=True), nullable=True, comment="軟刪除時間"),
        sa.ForeignKeyConstraint(["created_by"], ["users.uuid"]),
        sa.ForeignKeyConstraint(["template_uuid"], ["briefing_templates.uuid"]),
        sa.PrimaryKeyConstraint("uuid"),
    )
    op.create_index(op.f("ix_briefings_created_by"), "briefings", ["created_by"])
    op.create_index(op.f("ix_briefings_template_uuid"), "briefings", ["template_uuid"])

    # Drop three columns nothing ever wrote. `stations.confidence_score` /
    # `stations.priority_score` were readable in GraphQL but had no write path at all (no
    # mutation, not in SUGGESTABLE_FIELDS), so every row held NULL — which also made the
    # `priority_score DESC NULLS LAST` key in StationRepository._order_by a no-op.
    # `ticket_tasks.confidence_score` was never even exposed. IF EXISTS because this
    # revision may already have been applied on a branch checkout before the drops were
    # appended to it.
    op.execute("ALTER TABLE stations DROP COLUMN IF EXISTS confidence_score")
    op.execute("ALTER TABLE stations DROP COLUMN IF EXISTS priority_score")
    op.execute("ALTER TABLE ticket_tasks DROP COLUMN IF EXISTS confidence_score")


def downgrade() -> None:
    """Restore the score columns, then drop the briefings tables."""
    op.execute("ALTER TABLE ticket_tasks ADD COLUMN IF NOT EXISTS confidence_score double precision")  # noqa: E501
    op.execute("ALTER TABLE stations ADD COLUMN IF NOT EXISTS priority_score double precision")
    op.execute("ALTER TABLE stations ADD COLUMN IF NOT EXISTS confidence_score double precision")

    op.drop_index(op.f("ix_briefings_template_uuid"), table_name="briefings")
    op.drop_index(op.f("ix_briefings_created_by"), table_name="briefings")
    op.drop_table("briefings")
    op.drop_index(op.f("ix_briefing_templates_created_by"), table_name="briefing_templates")
    op.drop_table("briefing_templates")
