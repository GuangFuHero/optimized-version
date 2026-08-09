"""add_unique_constraint_to_user_group_assign

Revision ID: ecff746c61a6
Revises: 4d87b614aece
Create Date: 2026-03-27 21:05:58.930499

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ecff746c61a6"
down_revision: str | Sequence[str] | None = "4d87b614aece"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema.

    `op.create_unique_constraint(if_not_exists=...)` silently drops the kwarg, so guard each
    constraint explicitly via `pg_constraint` to keep the migration idempotent.
    """
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_group') THEN
            ALTER TABLE user_group_assign
              ADD CONSTRAINT uq_user_group UNIQUE (user_uuid, group_uuid);
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_crowd_sourcing_user_item') THEN
            ALTER TABLE crowd_sourcing
              ADD CONSTRAINT uq_crowd_sourcing_user_item UNIQUE (user_uuid, item_uuid);
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE crowd_sourcing DROP CONSTRAINT IF EXISTS uq_crowd_sourcing_user_item")
    op.execute("ALTER TABLE user_group_assign DROP CONSTRAINT IF EXISTS uq_user_group")
