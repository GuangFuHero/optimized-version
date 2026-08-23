"""Index the FK columns the keyword-search EXISTS subqueries correlate on.

Revision ID: b7e4c1a90d52
Revises: f2b7c9d4e0a3
Create Date: 2026-08-23

ADR-148. The search condition ORs an EXISTS per related table (ADR-080). PostgreSQL can
only flatten an EXISTS into a semi-join when it is a top-level conjunct; under OR it stays
a SubPlan. At default work_mem the planner hashes that SubPlan and runs it once, but when
the hash does not fit it degrades into a genuinely correlated subquery re-executed per
candidate row — and PostgreSQL does not index foreign keys automatically, so the
correlation lands in `Filter:` instead of `Index Cond:`. Measured on 20k parent / 60k
child rows: 0.7s hashed, 54.8s once spilled.

These four columns are exactly the correlation columns:

    station_properties.station_uuid   <- geo_repository._search_condition
    secondary_locations.geometry_uuid <- geo_repository._search_condition (station only;
                                         the ticket branch was removed, see ADR-146)
    ticket_tasks.ticket_uuid          <- tickets_repository._search_condition
    task_properties.task_uuid         <- tickets_repository._search_condition (nested)

They are useful beyond search — every "load the children of this row" path scans them —
but search is what made the absence load-bearing.
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'b7e4c1a90d52'
down_revision: str | Sequence[str] | None = 'f2b7c9d4e0a3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (index name, table, column) — names match SQLAlchemy's `index=True` convention
# (ix_<table>_<column>) so Base.metadata.create_all and this migration agree. ADR-149
# exists because they did not agree for search_text.
_INDEXES = [
    ("ix_station_properties_station_uuid", "station_properties", "station_uuid"),
    ("ix_secondary_locations_geometry_uuid", "secondary_locations", "geometry_uuid"),
    ("ix_ticket_tasks_ticket_uuid", "ticket_tasks", "ticket_uuid"),
    ("ix_task_properties_task_uuid", "task_properties", "task_uuid"),
]


def upgrade() -> None:
    """Create a btree index on each search-correlated FK column."""
    for name, table, column in _INDEXES:
        op.create_index(name, table, [column])


def downgrade() -> None:
    """Drop them again."""
    for name, table, _ in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
