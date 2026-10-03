"""station suggestion merges: merge table, merge link, audit triggers, pending indexes

A reviewer decides every pending suggestion on a field at once and applies the result to the
station in one merge. `station_suggestion_merges` records each merge with the before/after of
every applied field, so a revoke can write the old values back, and `merge_uuid` ties each
suggestion to the merge that decided it.

Both tables get audit triggers here. Rows written before this revision have no audit history.

Revision ID: 5e2c8a9f1b47
Revises: e3b8f1a6c2d7
Create Date: 2026-09-22

"""
from collections.abc import Sequence

from alembic import op

from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = "5e2c8a9f1b47"
down_revision: str | Sequence[str] | None = "e3b8f1a6c2d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen snapshot of the tables this revision audits, not read from AUDITED_TABLES. That list
# grows later, and a historical migration must not change with it.
_SUGGESTION_AUDITED_TABLES = [
    "station_update_suggestions",
    "station_suggestion_merges",
]


def upgrade() -> None:
    """Create the merge table, link suggestions to it, audit both, and index pending rows."""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS station_suggestion_merges (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            station_uuid UUID NOT NULL REFERENCES stations(uuid),
            changes JSONB NOT NULL DEFAULT '[]'::jsonb,
            review_note VARCHAR,
            status VARCHAR(20) NOT NULL DEFAULT 'applied',
            reviewed_by UUID NOT NULL REFERENCES users(uuid),
            revoked_by UUID REFERENCES users(uuid),
            revoked_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            delete_at TIMESTAMPTZ
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_station_suggestion_merges_station_uuid "
        "ON station_suggestion_merges (station_uuid)"
    )
    op.execute(
        "ALTER TABLE station_update_suggestions ADD COLUMN IF NOT EXISTS merge_uuid UUID "
        "REFERENCES station_suggestion_merges(uuid)"
    )

    for table in _SUGGESTION_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
        op.execute(get_audit_trigger_sql(table))

    # The unique index below would fail on existing duplicates, so keep each person's newest
    # pending row per field and close the rest.
    op.execute(
        """
        UPDATE station_update_suggestions s
        SET status = 'rejected', review_note = 'duplicate', updated_at = now()
        FROM (
            SELECT uuid, row_number() OVER (
                PARTITION BY created_by, target_uuid, field_name
                ORDER BY created_at DESC, uuid DESC
            ) AS rn
            FROM station_update_suggestions
            WHERE status = 'pending'
        ) ranked
        WHERE s.uuid = ranked.uuid AND ranked.rn > 1
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_station_update_suggestions_pending_author "
        "ON station_update_suggestions (created_by, target_uuid, field_name) "
        "WHERE status = 'pending'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_station_update_suggestions_pending "
        "ON station_update_suggestions (target_uuid) WHERE status = 'pending'"
    )


def downgrade() -> None:
    """Drop the indexes, triggers, merge link and merge table."""
    op.execute("DROP INDEX IF EXISTS ix_station_update_suggestions_pending")
    op.execute("DROP INDEX IF EXISTS uq_station_update_suggestions_pending_author")
    for table in _SUGGESTION_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
    op.execute("ALTER TABLE station_update_suggestions DROP COLUMN IF EXISTS merge_uuid")
    # A revoked merge leaves rows the old status vocabulary does not have.
    op.execute("UPDATE station_update_suggestions SET status = 'rejected' WHERE status = 'revoked'")
    op.execute("DROP TABLE IF EXISTS station_suggestion_merges")
