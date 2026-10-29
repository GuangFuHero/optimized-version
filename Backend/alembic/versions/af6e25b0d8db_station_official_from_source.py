"""stations: `source` says whether a station is official, and `is_official` follows it (ADR-438)

Revision ID: af6e25b0d8db
Revises: b5d8e2a41c07
Create Date: 2026-10-29 21:00:00.000000

`is_official` was a second answer to "is this station official", and only the seed wrote it, so a
station the back office made had `source = 'official'` and `is_official = false` (3NF audit F1).
Now the database works it out from `source`, and `source` holds one of two values:

- `official`: what was `gov` (the seed's), `import` or `official`, and any row marked official;
- `user`: kept;
- anything else becomes NULL: not known, so not official. On staging there is nothing else
  (2026-10-29: 17 `gov`, 10 `user`).

Rewrites rows, so a deploy carrying it is asked about first. Downgrade makes `is_official` a plain
column again, filled from `source`; `gov` and `import` do not come back.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "af6e25b0d8db"
down_revision: str | Sequence[str] | None = "b5d8e2a41c07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OFFICIAL = "COALESCE(source = 'official', false)"
_CHECK = "ck_stations_source"


def upgrade() -> None:
    """Fold the old values into two, then make `is_official` a column the database computes."""
    op.execute(
        "UPDATE stations SET source = 'official'"
        " WHERE source IS DISTINCT FROM 'official' AND (source IN ('gov', 'import') OR is_official)"
    )
    op.execute("UPDATE stations SET source = NULL WHERE source NOT IN ('user', 'official')")
    op.create_check_constraint(_CHECK, "stations", "source IN ('user', 'official')")
    op.drop_column("stations", "is_official")
    op.add_column(
        "stations",
        sa.Column("is_official", sa.Boolean(), sa.Computed(_OFFICIAL, persisted=True), nullable=False),
    )


def downgrade() -> None:
    """A plain `is_official` again, true where `source` is official; the CHECK goes."""
    op.drop_column("stations", "is_official")
    op.add_column("stations", sa.Column("is_official", sa.Boolean(), nullable=False, server_default="false"))
    op.execute("UPDATE stations SET is_official = true WHERE source = 'official'")
    op.drop_constraint(_CHECK, "stations", type_="check")
