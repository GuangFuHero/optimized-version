"""secondary_locations: split the address into its official parts

Revision ID: 7370daf4c8f7
Revises: 79a19cabc98a
Create Date: 2026-10-20 18:00:00.000000

Stores an address as its official parts (縣市 鄉鎮市區 村里 鄰 路 段 巷 弄 號), plus the whole line and
whether TGOS confirmed it. Plain DDL with no data moved, since local data is mock: `city` and `lane`
are renamed to `town` and `road` and keep their values, and `alley` (巷 and 弄 together) is replaced.

Downgrade restores the old columns; the parts they cannot hold are lost, and a road longer than
20 characters is cut to fit `lane`.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7370daf4c8f7"
down_revision: str | Sequence[str] | None = "79a19cabc98a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "secondary_locations"
_NEW_COLUMNS = (
    ("full_address", 255, "完整地址（不含樓、室）"),
    ("village", 50, "村里"),
    ("neighborhood", 10, "鄰，例如 3鄰"),
    ("section", 10, "段，例如 一段"),
    ("lane", 20, "巷，例如 469巷"),
    ("alley", 20, "弄，例如 1弄"),
    ("normalization_status", 20, "地址是否經 TGOS 確認：verified / pin_mismatch / unverified"),
)
_COMMENTS = {
    "county": "縣市",
    "town": "鄉鎮市區",
    "road": "路／街／大道",
    "no": "號，例如 19號、19之1號",
}


def _search_text(*columns: str) -> None:
    # Must match the model's search_text expression exactly.
    expr = " || ".join(f"coalesce({c}, '')" for c in columns)
    op.execute(
        f"ALTER TABLE {_TABLE} ADD COLUMN search_text varchar GENERATED ALWAYS AS ({expr}) STORED NOT NULL"
    )
    op.execute(f"CREATE INDEX ix_{_TABLE}_search_text_trgm ON {_TABLE} USING gin (search_text gin_trgm_ops)")


def _drop_search_text() -> None:
    # Goes first: it reads the columns about to be renamed and dropped.
    op.execute(f"DROP INDEX IF EXISTS ix_{_TABLE}_search_text_trgm")
    op.execute(f"ALTER TABLE {_TABLE} DROP COLUMN IF EXISTS search_text")


def upgrade() -> None:
    """Rename city→town and lane→road, replace alley, add the new parts, rebuild search_text."""
    _drop_search_text()
    op.alter_column(_TABLE, "city", new_column_name="town")
    op.alter_column(_TABLE, "lane", new_column_name="road", type_=sa.String(100))
    op.drop_column(_TABLE, "alley")
    for name, length, comment in _NEW_COLUMNS:
        op.add_column(_TABLE, sa.Column(name, sa.String(length), nullable=True, comment=comment))
    for name, comment in _COMMENTS.items():
        op.execute(f"COMMENT ON COLUMN {_TABLE}.{name} IS '{comment}'")
    _search_text("county", "town", "road", "section", "lane", "alley", "no", "floor", "room", "pole_id")


def downgrade() -> None:
    """Restore city/lane/alley and the old search_text; the parts they cannot hold are dropped."""
    _drop_search_text()
    for name, _, _ in reversed(_NEW_COLUMNS):
        op.drop_column(_TABLE, name)
    op.alter_column(
        _TABLE, "road", new_column_name="lane", type_=sa.String(20), postgresql_using="left(road, 20)"
    )
    op.alter_column(_TABLE, "town", new_column_name="city")
    op.add_column(_TABLE, sa.Column("alley", sa.String(20), nullable=True))
    for name in ("county", "city", "no"):
        op.execute(f"COMMENT ON COLUMN {_TABLE}.{name} IS NULL")
    op.execute(f"COMMENT ON COLUMN {_TABLE}.lane IS '路／街名（road）——欄位名為 lane，但實際存路名，非巷'")
    op.execute(f"COMMENT ON COLUMN {_TABLE}.alley IS '巷弄——欄位名為 alley，但實際存巷弄'")
    _search_text("county", "city", "lane", "alley", "no", "floor", "room", "pole_id")
