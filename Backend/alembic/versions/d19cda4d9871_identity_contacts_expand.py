"""identity contacts expand

Revision ID: d19cda4d9871
Revises: a2a8e4d8c51d
Create Date: 2026-05-31 19:41:26.766112

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd19cda4d9871'
down_revision: str | Sequence[str] | None = 'a2a8e4d8c51d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Expand stage: add identity/contact tables, last_login_at, make users.password nullable."""
    op.create_table(
        "user_identities",
        sa.Column("uuid", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_uuid", sa.UUID(as_uuid=True), sa.ForeignKey("users.uuid"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("provider_subject", sa.String(length=255), nullable=True),
        sa.Column("password_hash", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "provider_subject", name="uq_identity_provider_subject"),
        sa.UniqueConstraint("user_uuid", "provider", name="uq_identity_user_provider"),
    )
    op.create_index(op.f("ix_user_identities_user_uuid"), "user_identities", ["user_uuid"])
    op.create_table(
        "user_contacts",
        sa.Column("uuid", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_uuid", sa.UUID(as_uuid=True), sa.ForeignKey("users.uuid"), nullable=False),
        sa.Column("type", sa.String(length=10), nullable=False),
        sa.Column("value", sa.String(length=320), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("type", "value", name="uq_contact_type_value"),
    )
    op.create_index(op.f("ix_user_contacts_user_uuid"), "user_contacts", ["user_uuid"])
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    # expand stage: keep the column but make it nullable; drop happens in P4 (contract stage)
    op.alter_column("users", "password", existing_type=sa.String(length=512), nullable=True)


def downgrade() -> None:
    """Reverse the expand stage."""
    op.alter_column("users", "password", existing_type=sa.String(length=512), nullable=False)
    op.drop_column("users", "last_login_at")
    op.drop_index(op.f("ix_user_contacts_user_uuid"), table_name="user_contacts")
    op.drop_table("user_contacts")
    op.drop_index(op.f("ix_user_identities_user_uuid"), table_name="user_identities")
    op.drop_table("user_identities")
