"""merge announcements and disaster_type heads

Revision ID: 7c69fe901c4c
Revises: a7c9e1f4b2d8, e8b3c5f2a1d4
Create Date: 2026-07-20 00:02:17.639922

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c69fe901c4c'
down_revision: Union[str, Sequence[str], None] = ('a7c9e1f4b2d8', 'e8b3c5f2a1d4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
