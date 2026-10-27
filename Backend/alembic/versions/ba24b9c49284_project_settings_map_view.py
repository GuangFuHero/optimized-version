"""project_settings map view: where the site's map opens for this disaster (ADR-395)

Revision ID: ba24b9c49284
Revises: facf37b5c79d
Create Date: 2026-10-27

Three nullable columns with no backfill: a deployment without a view keeps opening the map where the
frontend's own default puts it. A CHECK keeps the three set together or not at all. Downgrade drops
them, and with them any view that was set.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ba24b9c49284"
down_revision: str | Sequence[str] | None = "facf37b5c79d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the centre and zoom, empty, and the all-or-none CHECK."""
    op.add_column(
        "project_settings",
        sa.Column("map_center_lat", sa.Float(), nullable=True, comment="地圖起始中心的緯度，例如 23.67"),
    )
    op.add_column(
        "project_settings",
        sa.Column("map_center_lng", sa.Float(), nullable=True, comment="地圖起始中心的經度，例如 121.418"),
    )
    op.add_column(
        "project_settings",
        sa.Column("map_zoom", sa.SmallInteger(), nullable=True, comment="地圖起始 zoom，例如 14"),
    )
    op.create_check_constraint(
        "ck_project_settings_map_view_all_or_none",
        "project_settings",
        "(map_center_lat IS NULL) = (map_center_lng IS NULL) AND (map_center_lat IS NULL) = (map_zoom IS NULL)",
    )


def downgrade() -> None:
    """Drop them."""
    op.drop_constraint("ck_project_settings_map_view_all_or_none", "project_settings", type_="check")
    op.drop_column("project_settings", "map_zoom")
    op.drop_column("project_settings", "map_center_lng")
    op.drop_column("project_settings", "map_center_lat")
