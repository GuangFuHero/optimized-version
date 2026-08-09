"""create station_update_suggestions table

Revision ID: d7e4f1a9c2b8
Revises: c3f2a1b4d5e6
Create Date: 2026-06-08 22:30:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd7e4f1a9c2b8'
down_revision: str | Sequence[str] | None = 'c3f2a1b4d5e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the user-suggestion → admin-review workflow table for station edits.

    One row per proposed change to a single field of a station or a station property.
    ``target_type``/``target_uuid`` polymorphically reference stations or
    station_properties (no FK, like photos.ref_type/ref_uuid). ``new_value`` is stored
    as text and coerced to the field's type on approval. IF NOT EXISTS keeps this
    idempotent for DBs already patched manually.
    """
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS station_update_suggestions (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            target_type VARCHAR(20) NOT NULL,
            target_uuid VARCHAR NOT NULL,
            field_name VARCHAR(100) NOT NULL,
            new_value VARCHAR NOT NULL,
            comment VARCHAR,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            review_note VARCHAR,
            reviewed_by UUID REFERENCES users(uuid),
            created_by UUID NOT NULL REFERENCES users(uuid),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            delete_at TIMESTAMPTZ
        )
        """
    )


def downgrade() -> None:
    """Drop the station_update_suggestions table."""
    op.execute("DROP TABLE IF EXISTS station_update_suggestions")
