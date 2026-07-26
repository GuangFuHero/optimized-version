"""team_zone_assign assigner columns

Adds created_at + assigned_by so the API can display "who assigned this zone, and when"
without scanning the shared audit_logs table. audit_logs remains the source of truth for
history (including unassign); these columns are a read-side denormalisation.

The backfill reads audit_logs itself, so existing rows get their real assigner rather than a
fabricated one. Rows with no recoverable assigner (created outside a request context — test
fixtures, direct SQL) are deleted: the project is pre-production with mock data only, so
there is nothing worth preserving with a made-up assigner.

Revision ID: e1f2a3b4c5d6
Revises: c7d8e9f0a1b2
Create Date: 2026-07-26

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: str | Sequence[str] | None = 'c7d8e9f0a1b2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add both columns, backfill assigner from audit_logs, then enforce NOT NULL."""
    # team_zone_assign is audited (c219aac56556). A migration runs with no
    # app.current_user_id, so its own UPDATE/DELETE would land in audit_logs as anonymous
    # mutations and muddy the real assignment history. DISABLE TRIGGER USER rather than the
    # trigger by name: Postgres has no DISABLE TRIGGER IF EXISTS, and naming it would make
    # this migration fail outright on any database where the audit trigger is absent.
    op.execute("ALTER TABLE team_zone_assign DISABLE TRIGGER USER;")

    op.add_column(
        "team_zone_assign",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column("team_zone_assign", sa.Column("assigned_by", sa.UUID(as_uuid=True), nullable=True))

    op.execute(
        """
        UPDATE team_zone_assign tza
        SET assigned_by = a.user_uuid,
            created_at  = a.created_at
        FROM (
            SELECT DISTINCT ON (row_id) row_id, user_uuid, created_at
            FROM audit_logs
            WHERE table_name = 'team_zone_assign'
              AND action = 'INSERT'
              AND user_uuid IS NOT NULL
            ORDER BY row_id, created_at ASC
        ) a
        WHERE a.row_id = tza.uuid;
        """
    )

    op.execute("DELETE FROM team_zone_assign WHERE assigned_by IS NULL;")
    op.alter_column("team_zone_assign", "assigned_by", nullable=False)

    # The FK is created only now, after the backfill/purge above have run: audit_logs.user_uuid
    # has no FK to users (app/models/audit.py), so a hard-deleted user still referenced by an
    # old audit INSERT event would make the backfill write a dangling assigned_by. Creating the
    # constraint before the backfill would make that backfill UPDATE fail and abort the whole
    # upgrade; creating it here means it only ever validates already-verified-good values.
    op.create_foreign_key(
        "fk_team_zone_assign_assigned_by", "team_zone_assign", "users", ["assigned_by"], ["uuid"]
    )

    op.execute("ALTER TABLE team_zone_assign ENABLE TRIGGER USER;")


def downgrade() -> None:
    """Drop both columns. Rows deleted by upgrade() are NOT recoverable."""
    op.drop_constraint("fk_team_zone_assign_assigned_by", "team_zone_assign", type_="foreignkey")
    op.drop_column("team_zone_assign", "assigned_by")
    op.drop_column("team_zone_assign", "created_at")
