"""tickets.replaced_by_uuid, ticket_tasks.merged_into_uuid: where a dedup-merged record went (ADR-371)

Revision ID: c3f1a9d27b54
Revises: 7370daf4c8f7
Create Date: 2026-10-24 12:00:00.000000

Spec 028 lets a reviewer resolve a duplicate pair: the other ticket is cancelled and points at the
ticket that replaced it, and a need folded into one of that ticket's needs points at it. Both are
plain records, nullable foreign keys with no index: nothing looks a ticket up by them.

Downgrade drops both columns, which would lose those records, so it fails while either holds a
value.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3f1a9d27b54"
down_revision: str | Sequence[str] | None = "7370daf4c8f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REFS = (
    ("tickets", "replaced_by_uuid", "tickets.uuid", "fk_tickets_replaced_by_uuid"),
    ("ticket_tasks", "merged_into_uuid", "ticket_tasks.uuid", "fk_ticket_tasks_merged_into_uuid"),
)


def upgrade() -> None:
    """Add both references."""
    for table, column, target, name in _REFS:
        op.add_column(table, sa.Column(column, sa.UUID(), nullable=True))
        op.create_foreign_key(name, table, target.split(".")[0], [column], ["uuid"])


def downgrade() -> None:
    """Drop both references; fails while any ticket or need still holds one."""
    bind = op.get_bind()
    for table, column, _, _ in _REFS:
        held = bind.execute(sa.text(f"SELECT count(*) FROM {table} WHERE {column} IS NOT NULL")).scalar_one()
        if held:
            raise RuntimeError(
                f"{held} row(s) of {table} still have {column} set: a downgrade would lose where "
                "those dedup-merged records went"
            )
    for table, column, _, name in _REFS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.drop_column(table, column)
