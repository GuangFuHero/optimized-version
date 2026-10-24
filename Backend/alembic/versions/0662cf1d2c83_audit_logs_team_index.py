"""audit_logs: index the team a row names, for the team view of the audit-log API (Spec 026)

Revision ID: 0662cf1d2c83
Revises: 11f0025d521b
Create Date: 2026-10-20 18:00:00.000000

ADR-358: a team admin reads the audit rows about their own team, found by the `team_uuid` the
row's new (or, for a deletion, old) values carry. Without this index that is a scan of the
whole log.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0662cf1d2c83"
down_revision: str | Sequence[str] | None = "11f0025d521b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the expression index (mirrors app/models/audit.py)."""
    op.execute(
        "CREATE INDEX ix_audit_logs_team_uuid ON audit_logs"
        " ((COALESCE(new_values, old_values) ->> 'team_uuid'))"
    )


def downgrade() -> None:
    """Drop it."""
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_team_uuid")
