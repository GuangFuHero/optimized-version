"""add status, updated_at, and uniqueness to task_assignments

Revision ID: c3f2a1b4d5e6
Revises: 71bd05e07df3
Create Date: 2026-06-08 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f2a1b4d5e6"
down_revision: str | Sequence[str] | None = "71bd05e07df3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Make task_assignments fillable and trackable for the HR progress bar.

    Adds `status` (accepted/en_route/completed) which drives the work-completion
    progress bar, `updated_at` to stamp status changes (the row is now mutable),
    and a uniqueness guard so the same actor can't be linked to the same task
    twice. The raw `IF NOT EXISTS` / `pg_constraint` guards keep this idempotent
    for DBs already patched manually.
    """
    op.execute(
        "ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'accepted'"
    )
    op.execute(
        "ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
    )
    # `op.create_unique_constraint(if_not_exists=...)` silently drops the kwarg, so guard explicitly.
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_assignment_task_actor') THEN
            ALTER TABLE task_assignments
              ADD CONSTRAINT uq_assignment_task_actor UNIQUE (task_uuid, actor_uuid);
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    """Reverse the task_assignments additions."""
    op.execute("ALTER TABLE task_assignments DROP CONSTRAINT IF EXISTS uq_assignment_task_actor")
    op.execute("ALTER TABLE task_assignments DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE task_assignments DROP COLUMN IF EXISTS status")
