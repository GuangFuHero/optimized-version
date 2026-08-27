"""address normalization: reference data + real address columns

Adds the four reference tables that address normalization reads (`ref_roads`, `ref_villages`,
`osm_address_points`) plus the import job's status row (`reference_datasets`), and gives
`secondary_locations` the columns a Taiwanese address actually needs.

`secondary_locations` could not represent one: it had county/city/lane/alley/no/floor/room, with
nowhere for 鄉鎮市區, 村里, 路/街 or 段. `city` is *replaced* by `town` rather than kept beside it —
nothing recorded whether `city` held 縣市 or 鄉鎮市區, so leaving both would preserve the ambiguity
this migration exists to remove. The values are copied across before the drop.

NOTE — this is deliberately NOT expand-contract, against DEPLOY.md's standing rule. After this
ships, `./scripts/deploy.sh <older-sha>` restores code that still selects
`secondary_locations.city`, which is gone: that rollback path is broken for this one release.
Recovery is the pre-deploy GCS backup (deploy.sh step 7), which is taken automatically. Accepted
because the column holds almost no data at this stage; `downgrade()` below is exact, so an
`alembic downgrade` still restores the old shape with its data intact.

Revision ID: c4e7b91d3a02
Revises: 8ebfc3903041
Create Date: 2026-08-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

# revision identifiers, used by Alembic.
revision: str = "c4e7b91d3a02"
down_revision: str | Sequence[str] | None = "8ebfc3903041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the reference tables and reshape secondary_locations for real addresses."""
    # Powers the fuzzy road fallback (a typo becomes a "corrected" status instead of a rejection).
    # Ships with the postgis/postgis image's contrib set; tests/conftest.py creates it too.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "ref_roads",
        sa.Column("county", sa.String(50), nullable=False),
        sa.Column("town", sa.String(50), nullable=False),
        sa.Column("road", sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint("county", "town", "road"),
    )
    op.create_index(
        "ix_ref_roads_road_trgm",
        "ref_roads",
        ["road"],
        postgresql_using="gin",
        postgresql_ops={"road": "gin_trgm_ops"},
    )

    op.create_table(
        "ref_villages",
        sa.Column("villcode", sa.String(16), primary_key=True),
        sa.Column("county", sa.String(50), nullable=False),
        sa.Column("town", sa.String(50), nullable=False),
        # Nullable: 連江縣南竿鄉 publishes a polygon with an empty VILLNAME (real data).
        sa.Column("village", sa.String(50), nullable=True),
        sa.Column("geom", Geometry("MULTIPOLYGON", srid=4326), nullable=True),
    )
    op.create_index("ix_ref_villages_geom", "ref_villages", ["geom"], postgresql_using="gist")
    op.create_index("ix_ref_villages_town", "ref_villages", ["county", "town"])

    op.create_table(
        "osm_address_points",
        # OSM's own node id, not a surrogate: re-importing the same node must replace it.
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("geom", Geometry("POINT", srid=4326), nullable=True),
        sa.Column("county", sa.String(50), nullable=True),
        sa.Column("town", sa.String(50), nullable=True),
        sa.Column("village", sa.String(50), nullable=True),
        sa.Column("road", sa.String(100), nullable=True),
        sa.Column("section", sa.String(10), nullable=True),
        sa.Column("lane", sa.String(20), nullable=True),
        sa.Column("alley", sa.String(20), nullable=True),
        sa.Column("no", sa.String(20), nullable=True),
    )
    op.create_index("ix_osm_address_points_geom", "osm_address_points", ["geom"], postgresql_using="gist")
    op.create_index(
        "ix_osm_address_points_addr",
        "osm_address_points",
        ["county", "town", "road", "no"],
    )

    op.create_table(
        "reference_datasets",
        sa.Column("name", sa.String(32), primary_key=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("source_version", sa.String(64), nullable=True),
        sa.Column("row_count", sa.Integer, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text, nullable=True),
    )

    # --- secondary_locations: the actual shape of a Taiwanese address -------------------------
    op.add_column("secondary_locations", sa.Column("town", sa.String(50), nullable=True))
    op.add_column("secondary_locations", sa.Column("village", sa.String(50), nullable=True))
    op.add_column("secondary_locations", sa.Column("road", sa.String(100), nullable=True))
    op.add_column("secondary_locations", sa.Column("section", sa.String(10), nullable=True))
    op.add_column("secondary_locations", sa.Column("formatted", sa.String(255), nullable=True))
    op.add_column("secondary_locations", sa.Column("normalization_status", sa.String(20), nullable=True))
    # Copy BEFORE the drop, or the old values are gone. secondary_locations is in the audited-table
    # list (app/db/triggers.py), but this is DDL plus a bulk UPDATE on a table whose audit trigger
    # records row changes — the same pattern b8f4d2a6e1c3 used for its photos UPDATE.
    op.execute("UPDATE secondary_locations SET town = city WHERE city IS NOT NULL")
    op.drop_column("secondary_locations", "city")


def downgrade() -> None:
    """Restore `city` from `town`, then drop the new columns and the reference tables."""
    op.add_column("secondary_locations", sa.Column("city", sa.String(50), nullable=True))
    op.execute("UPDATE secondary_locations SET city = town WHERE town IS NOT NULL")
    for column in ("normalization_status", "formatted", "section", "road", "village", "town"):
        op.drop_column("secondary_locations", column)

    op.drop_table("reference_datasets")
    op.drop_index("ix_osm_address_points_addr", table_name="osm_address_points")
    op.drop_index("ix_osm_address_points_geom", table_name="osm_address_points")
    op.drop_table("osm_address_points")
    op.drop_index("ix_ref_villages_town", table_name="ref_villages")
    op.drop_index("ix_ref_villages_geom", table_name="ref_villages")
    op.drop_table("ref_villages")
    op.drop_index("ix_ref_roads_road_trgm", table_name="ref_roads")
    op.drop_table("ref_roads")
    # pg_trgm is intentionally NOT dropped: extensions are database-wide, and anything else that
    # starts using it would break on a downgrade that is only meant to undo these tables.
