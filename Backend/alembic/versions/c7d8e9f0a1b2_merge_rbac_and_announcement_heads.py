"""merge rbac and announcement heads

Revision ID: c7d8e9f0a1b2
Revises: b7c1f0a92d34, a7c9e1f4b2d8
Create Date: 2026-07-22 10:59:06.650744

No-op reconciliation of the two alembic heads that fork at 71bd05e07df3 (ADR-065, pulling
forward ADR-063 [0]): the RBAC chain (…→ b7c1f0a92d34 uq_user_perm) and the announcement
migration (a7c9e1f4b2d8, inherited from main via the rebase). Two heads make `alembic upgrade
head` fail with "Multiple head revisions"; this merge revision gives a single head so a fresh
DB can migrate end-to-end. It changes no schema — both branches already applied their DDL.
The announcement *code* port (Perm.ANN_* / require_authenticated) still lives on
feature/backend-annoucement-rbac; only the migration-DAG reconciliation is done here.
"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = 'c7d8e9f0a1b2'
down_revision: str | Sequence[str] | None = ('b7c1f0a92d34', 'a7c9e1f4b2d8')
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
