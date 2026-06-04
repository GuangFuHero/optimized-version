"""contact unique user type

Revision ID: fdaee08d6cd9
Revises: d19cda4d9871
Create Date: 2026-06-04 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'fdaee08d6cd9'
down_revision: str | Sequence[str] | None = 'd19cda4d9871'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Enforce at most one contact per (user, type) at the DB layer.

    Plain (non-partial) unique is safe because every persisted contact row is verified=True.
    """
    op.create_unique_constraint(
        "uq_contact_user_type", "user_contacts", ["user_uuid", "type"]
    )


def downgrade() -> None:
    """Drop the per-user contact-type uniqueness constraint."""
    op.drop_constraint("uq_contact_user_type", "user_contacts", type_="unique")
