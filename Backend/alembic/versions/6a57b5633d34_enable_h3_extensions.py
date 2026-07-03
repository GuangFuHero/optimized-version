"""enable h3 and h3_postgis extensions

Revision ID: 6a57b5633d34
Revises: c3f0a1b2d4e6
Create Date: 2026-07-02 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '6a57b5633d34'
down_revision: str | Sequence[str] | None = 'c3f0a1b2d4e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Enable the h3 core extension and its PostGIS interop functions."""
    op.execute("CREATE EXTENSION IF NOT EXISTS h3;")
    op.execute("CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;")


def downgrade() -> None:
    """Disable the h3_postgis and h3 extensions."""
    op.execute("DROP EXTENSION IF EXISTS h3_postgis;")
    op.execute("DROP EXTENSION IF EXISTS h3;")
