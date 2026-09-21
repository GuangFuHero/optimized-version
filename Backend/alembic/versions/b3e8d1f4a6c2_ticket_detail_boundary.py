"""ticket detail boundary: h3 extensions + title/task-name trigram indexes

Spec/018-ticket-disaster-fields/decisions.md ADR-281~283.

1. `h3` and `h3_postgis` — a caller without `ticket.view_detail` gets the centre of the H3
   cell a ticket falls in (app/db/h3.py). Computed in Postgres so the exact point never leaves
   the database for that caller, and so `tickets(bounds:)` can match on the same centre
   (ADR-282). Needs the `postgresql-16-h3` package in the server image
   (Backend/docker/postgres-h3/Dockerfile); `CREATE EXTENSION` fails loudly without it.
   `h3_postgis` pulls in `postgis_raster` through CASCADE — a dependency of the extension,
   not something this code uses.
2. Trigram indexes on `tickets.title` and `ticket_tasks.task_name` — the public half of the
   keyword search. Without ticket.view_detail `q` matches these on their own, because
   `search_text` also carries the description the caller cannot read (ADR-281), and ADR-152 is
   why that half needs an index: it is the one an anonymous caller runs.

The `ticket.view_detail` grants are not here: capability rows belong to
`scripts/seed_rbac.py`, which `deploy.sh` runs after `alembic upgrade head`.

Hand-written: extensions and gin_trgm_ops operator classes are outside what autogenerate
detects.

Revision ID: b3e8d1f4a6c2
Revises: e7b249d0af31
Create Date: 2026-09-19

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3e8d1f4a6c2'
down_revision: str | Sequence[str] | None = 'e7b249d0af31'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Keep in sync with trigram_index(...) in app/models/request.py and app/models/ticket_task.py.
_INDEXES = [("tickets", "title"), ("ticket_tasks", "task_name")]


def upgrade() -> None:
    """Enable h3 and add the public-search trigram indexes."""
    op.execute("CREATE EXTENSION IF NOT EXISTS h3")
    op.execute("CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE")
    for table, column in _INDEXES:
        op.execute(
            f"CREATE INDEX IF NOT EXISTS ix_{table}_{column}_trgm "
            f"ON {table} USING gin ({column} gin_trgm_ops)"
        )


def downgrade() -> None:
    """Drop the indexes, then the extensions (h3_postgis before the h3 it depends on).

    `postgis_raster`, which CASCADE installed on the way up, is deliberately left: nothing
    records whether it was there before this revision, and dropping an extension someone
    else relies on is worse than leaving an unused one behind.
    """
    for table, column in _INDEXES:
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_{column}_trgm")
    op.execute("DROP EXTENSION IF EXISTS h3_postgis")
    op.execute("DROP EXTENSION IF EXISTS h3")
