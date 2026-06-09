"""add status, updated_at, and uniqueness to task_assignments

Revision ID: c3f2a1b4d5e6
Revises: b5d1c8e9f3a2
Create Date: 2026-06-08 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f2a1b4d5e6"
down_revision: str | Sequence[str] | None = "b5d1c8e9f3a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Make task_assignments fillable and trackable for the HR progress bar.

    Adds `status` (accepted/en_route/completed) which drives the work-completion
    progress bar, `updated_at` to stamp status changes (the row is now mutable),
    and a uniqueness guard so the same actor can't be linked to the same task
    twice. IF NOT EXISTS / if_not_exists keep this idempotent for DBs already
    patched manually.
    """
    op.execute(
        "ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'accepted'"
    )
    op.execute(
        "ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
    )
    op.create_unique_constraint(
        "uq_assignment_task_actor",
        "task_assignments",
        ["task_uuid", "actor_uuid"],
        if_not_exists=True,
    )


def downgrade() -> None:
    """Reverse the task_assignments additions."""
    op.drop_constraint("uq_assignment_task_actor", "task_assignments", type_="unique")
    op.execute("ALTER TABLE task_assignments DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE task_assignments DROP COLUMN IF EXISTS status")
