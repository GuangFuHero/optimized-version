"""add role_requests (feature 019: a citizen applies to become back-office staff)

Revision ID: 666b59ab2581
Revises: e3b8f1a6c2d7
Create Date: 2026-09-27 12:00:00.000000

One row per application. A partial unique index keeps at most one `pending` row per applicant
(AC-RE-106), so two tabs submitting at once cannot slip a second one past the service check.
The CHECKs mirror the model's: the value sets and the length caps the form enforces.

Audited from the start. Adding the name to `app.db.triggers.AUDITED_TABLES` does not attach
anything by itself — the original audit migration iterates a frozen snapshot of that list — so
the trigger is created here, the same way b3f1c07d2a95 did for the dynamic-field tables.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = "666b59ab2581"
down_revision: str | Sequence[str] | None = "e3b8f1a6c2d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the table, its constraints and indexes, and its audit trigger."""
    op.create_table(
        "role_requests",
        sa.Column("uuid", postgresql.UUID(as_uuid=True), primary_key=True, comment="主鍵 UUID"),
        sa.Column("requested_role", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("contact", sa.String(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("review_note", sa.String(), nullable=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.uuid"), nullable=True),
        sa.Column(
            "granted_team_uuid", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.uuid"), nullable=True
        ),
        sa.Column(
            "granted_role_uuid", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.uuid"), nullable=True
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.uuid"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="建立時間",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
            comment="最後更新時間",
        ),
        sa.Column("delete_at", sa.DateTime(timezone=True), nullable=True, comment="軟刪除時間"),
        sa.CheckConstraint(
            "requested_role IN ('government', 'ngo', 'data_auditor')", name="ck_role_requests_role"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'withdrawn')", name="ck_role_requests_status"
        ),
        sa.CheckConstraint("char_length(reason) <= 500", name="ck_role_requests_reason"),
        sa.CheckConstraint("char_length(contact) <= 100", name="ck_role_requests_contact"),
        sa.CheckConstraint("char_length(review_note) <= 500", name="ck_role_requests_review_note"),
    )
    op.create_index("ix_role_requests_created_by", "role_requests", ["created_by"])
    op.create_index(
        "uq_role_requests_one_pending",
        "role_requests",
        ["created_by"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index("ix_role_requests_status_created_at", "role_requests", ["status", "created_at"])
    op.execute(get_audit_trigger_sql("role_requests"))


def downgrade() -> None:
    """Drop the audit trigger, then the table (its indexes and constraints go with it)."""
    op.execute("DROP TRIGGER IF EXISTS audit_trigger_role_requests ON role_requests;")
    op.drop_table("role_requests")
