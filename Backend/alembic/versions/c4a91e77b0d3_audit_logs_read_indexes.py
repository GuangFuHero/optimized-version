"""Index audit_logs for read access (feature 016, ADR-133)

Revision ID: c4a91e77b0d3
Revises: b3f1c07d2a95
Create Date: 2026-08-23

`audit_logs` was created (71bd05e07df3) with nothing but its primary key, while every one
of the 39 audited tables appends to it and a protect trigger forbids deletes. Every read is
therefore a sequential scan over a ledger that only grows.

Measured on 996k rows / 1.5 GB (PostgreSQL 16):

    timeline aggregation (row_id IN ...)      737 ms  ->  4.9 ms
    cancelled assignments (JSONB lookup)      415 ms  ->  0.95 ms

Both were `Parallel Seq Scan`, each touching 190,179 buffers regardless of how few rows
they returned. Writes cost about 15 microseconds more per row (20k rows: 313 ms -> 609 ms),
and the three indexes add 48 MB to a 1.5 GB table.

This is a pre-existing gap rather than something feature 016 introduces; 016 is simply the
first reader.
"""

import sqlalchemy as sa
from alembic import op

revision = "c4a91e77b0d3"
down_revision = "b3f1c07d2a95"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add the three read indexes."""
    # The timeline resolves a resource into a set of row_ids and fetches them newest-first,
    # so the sort column belongs in the index (ADR-131).
    op.create_index(
        "ix_audit_logs_row_id_created_at",
        "audit_logs",
        ["row_id", sa.text("created_at DESC")],
    )
    # Any per-table audit read — the timeline filters by table_name to decide how to
    # interpret a row, and a future audit console will want this too.
    op.create_index(
        "ix_audit_logs_table_created_at",
        "audit_logs",
        ["table_name", sa.text("created_at DESC")],
    )
    # ADR-132: an assignment removed by `unassign_task_actor` is hard-deleted
    # (app/infrastructure/repository/base.py:102) and TaskAssignment has no delete_at to
    # soft-delete into, so its row_id can no longer be derived from ticket_tasks. Reaching
    # it means matching on the payload's task_uuid, which needs an expression index. The
    # partial WHERE keeps it at ~2 MB instead of indexing the whole ledger.
    op.execute(
        """
        CREATE INDEX ix_audit_logs_assign_task ON audit_logs
        ((COALESCE(new_values->>'task_uuid', old_values->>'task_uuid')))
        WHERE table_name = 'task_assignments'
        """
    )


def downgrade() -> None:
    """Drop the three read indexes."""
    op.execute("DROP INDEX IF EXISTS ix_audit_logs_assign_task")
    op.drop_index("ix_audit_logs_table_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_row_id_created_at", table_name="audit_logs")
