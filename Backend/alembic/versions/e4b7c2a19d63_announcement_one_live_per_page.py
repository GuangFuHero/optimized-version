"""announcements: one live per page, and publishing replaces it (ADR-363)

Revision ID: e4b7c2a19d63
Revises: 79a19cabc98a
Create Date: 2026-10-21

Each page (the site, the admin portal) shows at most one live announcement, and one on "all" takes
both. Before the unique indexes go on, every live announcement that a later-published live one
overlaps on a page is taken down: the result of publishing them one by one, in order, under the new
rule. Then `display_order`, which only ordered several live ones, is dropped.

Downgrade puts `display_order` back, numbering the live rows 1..N by when they went live, and drops
the indexes. The announcements the upgrade took down stay down.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4b7c2a19d63"
down_revision: str | Sequence[str] | None = "79a19cabc98a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Kept equal to the model's index predicates (app/models/announcement.py).
_PUBLIC_PAGE = "active AND delete_at IS NULL AND placement IN ('public_page', 'all')"
_ADMIN_PAGE = "active AND delete_at IS NULL AND placement <> 'public_page'"


def upgrade() -> None:
    """Take down every live announcement a newer live one overlaps, index one per page, drop the order."""
    op.execute(
        """
        UPDATE announcements AS older SET active = false
        WHERE older.active AND older.delete_at IS NULL AND EXISTS (
            SELECT 1 FROM announcements AS newer
            WHERE newer.active AND newer.delete_at IS NULL
              AND (COALESCE(newer.published_at, newer.created_at), newer.uuid)
                > (COALESCE(older.published_at, older.created_at), older.uuid)
              AND (
                (newer.placement IN ('public_page', 'all') AND older.placement IN ('public_page', 'all'))
                OR (newer.placement <> 'public_page' AND older.placement <> 'public_page')
              )
        )
        """
    )
    op.create_index(
        "uq_announcements_live_public_page",
        "announcements",
        ["active"],
        unique=True,
        postgresql_where=sa.text(_PUBLIC_PAGE),
    )
    op.create_index(
        "uq_announcements_live_admin_page",
        "announcements",
        ["active"],
        unique=True,
        postgresql_where=sa.text(_ADMIN_PAGE),
    )
    op.drop_column("announcements", "display_order")


def downgrade() -> None:
    """Restore display_order, numbering the live rows by when they went live, and drop the indexes."""
    op.add_column("announcements", sa.Column("display_order", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE announcements AS a SET display_order = ranked.n
        FROM (
            SELECT uuid, row_number() OVER (ORDER BY COALESCE(published_at, created_at), uuid) AS n
            FROM announcements WHERE active AND delete_at IS NULL
        ) AS ranked
        WHERE a.uuid = ranked.uuid
        """
    )
    op.drop_index("uq_announcements_live_admin_page", table_name="announcements")
    op.drop_index("uq_announcements_live_public_page", table_name="announcements")
