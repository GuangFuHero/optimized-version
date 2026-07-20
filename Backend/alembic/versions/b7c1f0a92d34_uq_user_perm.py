"""add uq_user_perm to user_permission_assign (ADR-058)

Revision ID: b7c1f0a92d34
Revises: f1a2b3c4d5e6
Create Date: 2026-07-13 00:00:00.000000

Re-pointed from a3f8d1c9e2b5 to f1a2b3c4d5e6 (PR #24's work_zones GIST migration) so the two
sibling migrations that both branched off a3f8d1c9e2b5 form one linear RBAC chain instead of a
fork. The announcement migration (a7c9e1f4b2d8) is still a separate head — reconciled with the
announcement work (see decisions.md ADR-063 [0]).

Enforces one grant row per (user_uuid, permission_uuid). Before adding the constraint we
dedup any pre-existing rows, keeping the widest scope (all>zone>team>own>none, matching
app/core/rbac_scopes.py:WIDTH and the effective-permission resolver), tie-broken by the
smallest uuid so the result is deterministic. On a fresh / user-less DB the dedup is a no-op.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'b7c1f0a92d34'
down_revision: str | Sequence[str] | None = 'f1a2b3c4d5e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_WIDTH = "CASE {col} WHEN 'all' THEN 4 WHEN 'zone' THEN 3 WHEN 'team' THEN 2 WHEN 'own' THEN 1 ELSE 0 END"
_A = _WIDTH.format(col="a.scope")
_B = _WIDTH.format(col="b.scope")


def upgrade() -> None:
    """Dedup to the widest scope per (user, permission), then add uq_user_perm."""
    op.execute(f"""
        DELETE FROM user_permission_assign a
        USING user_permission_assign b
        WHERE a.user_uuid = b.user_uuid
          AND a.permission_uuid = b.permission_uuid
          AND a.uuid <> b.uuid
          AND (
            ({_A}) < ({_B})
            OR (({_A}) = ({_B}) AND a.uuid > b.uuid)
          )
    """)
    op.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_perm') THEN
            ALTER TABLE user_permission_assign
              ADD CONSTRAINT uq_user_perm UNIQUE (user_uuid, permission_uuid);
          END IF;
        END $$;
    """)


def downgrade() -> None:
    """Drop uq_user_perm (rows are not un-deduped)."""
    op.execute("ALTER TABLE user_permission_assign DROP CONSTRAINT IF EXISTS uq_user_perm")
