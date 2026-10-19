"""ticket audit: one data check per ticket, replacing review and need moderation

A ticket's `verification_status` / `review_note` become `audit_status` / `audit_note`, with
four states (no_audit, need_audit, audited, audit_issue), and the ticket keeps who gave the
last verdict, when, and the content it was given on. An `audit_issue` must say why.

The per-need verdict (`moderation_status`, `review_note`) goes: the check is on the ticket. So
does `visibility` on tickets and needs, which nothing ever filtered on. The capability is
renamed `ticket.review` → `ticket.audit`; grants point at the permission row, so they carry over.

Every ticket starts over at no_audit: the old verification values meant something else.

Revision ID: 259489888127
Revises: d4c8b1e07a92
Create Date: 2026-10-18 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "259489888127"
down_revision: str | Sequence[str] | None = "d4c8b1e07a92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_AUDIT_STATUSES = "'no_audit', 'need_audit', 'audited', 'audit_issue'"


def upgrade() -> None:
    """Rename the review columns to audit ones, add the verdict's who/when/content, drop the rest."""
    op.alter_column("tickets", "verification_status", new_column_name="audit_status")
    op.alter_column("tickets", "review_note", new_column_name="audit_note")
    op.execute("UPDATE tickets SET audit_status = 'no_audit', audit_note = NULL")
    op.alter_column(
        "tickets",
        "audit_status",
        type_=sa.String(20),
        nullable=False,
        server_default=sa.text("'no_audit'"),
        comment="檢核狀態：no_audit/need_audit/audited/audit_issue",
    )
    op.alter_column("tickets", "audit_note", comment="檢核說明；audit_issue 時必填")
    op.add_column(
        "tickets",
        sa.Column("audited_at", sa.DateTime(timezone=True), nullable=True, comment="最近一次檢核時間"),
    )
    op.add_column(
        "tickets",
        sa.Column(
            "audited_by", sa.UUID(), sa.ForeignKey("users.uuid"), nullable=True, comment="最近一次檢核者"
        ),
    )
    op.add_column(
        "tickets",
        sa.Column(
            "audited_content",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="最近一次檢核時的內容快照",
        ),
    )
    op.create_check_constraint("ck_tickets_audit_status", "tickets", f"audit_status IN ({_AUDIT_STATUSES})")
    op.create_check_constraint(
        "ck_tickets_audit_issue_note",
        "tickets",
        "audit_status <> 'audit_issue' OR btrim(coalesce(audit_note, '')) <> ''",
    )
    op.drop_column("tickets", "visibility")

    op.drop_column("ticket_tasks", "visibility")
    op.drop_column("ticket_tasks", "moderation_status")
    op.drop_column("ticket_tasks", "review_note")

    op.execute(
        "UPDATE permissions SET key = 'ticket.audit' WHERE key = 'ticket.review' "
        "AND NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'ticket.audit')"
    )


def downgrade() -> None:
    """Put the review columns, need moderation and visibility back; the verdicts are lost."""
    op.execute(
        "UPDATE permissions SET key = 'ticket.review' WHERE key = 'ticket.audit' "
        "AND NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'ticket.review')"
    )

    op.add_column("ticket_tasks", sa.Column("review_note", sa.String(), nullable=True))
    op.add_column(
        "ticket_tasks",
        sa.Column(
            "moderation_status",
            sa.String(50),
            nullable=False,
            server_default=sa.text("'pending_review'"),
        ),
    )
    op.add_column(
        "ticket_tasks",
        sa.Column("visibility", sa.String(50), nullable=False, server_default=sa.text("'public'")),
    )

    op.add_column("tickets", sa.Column("visibility", sa.String(50), nullable=True))
    op.drop_constraint("ck_tickets_audit_issue_note", "tickets", type_="check")
    op.drop_constraint("ck_tickets_audit_status", "tickets", type_="check")
    op.drop_column("tickets", "audited_content")
    op.drop_column("tickets", "audited_by")
    op.drop_column("tickets", "audited_at")
    op.alter_column(
        "tickets",
        "audit_status",
        type_=sa.String(50),
        nullable=True,
        server_default=None,
        comment=None,
    )
    op.execute("UPDATE tickets SET audit_status = NULL")
    op.alter_column("tickets", "audit_note", comment=None)
    op.alter_column("tickets", "audit_note", new_column_name="review_note")
    op.alter_column("tickets", "audit_status", new_column_name="verification_status")
