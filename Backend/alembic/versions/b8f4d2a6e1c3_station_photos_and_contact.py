"""station photos and contact fields

Generalizes photo attachment beyond tickets: ``photos.ref_type='ticket'`` becomes
``'geometry'``, since a ticket photo's ``ref_uuid`` already stores ``tickets.uuid``,
which IS ``base_geometries.uuid`` (shared PK via joined-table inheritance). The same
mechanism now covers stations (and any future base_geometries subtype) with no other
data change — ``ref_type='pole'`` (secondary_locations) is untouched.

Also adds contact_name/contact_email/contact_phone directly to ``stations``, independent
of (and unrelated to) ``tickets``' own contact columns — NOT promoted to base_geometries,
since that would also hand them to closure_areas and other subtypes.

Revision ID: b8f4d2a6e1c3
Revises: e1f2a3b4c5d6
Create Date: 2026-08-06

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8f4d2a6e1c3'
down_revision: str | Sequence[str] | None = 'e1f2a3b4c5d6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename photos.ref_type='ticket' to 'geometry'; add station contact columns."""
    # photos is not an audited table (see _AUDITED_TABLES_AT_THIS_REVISION in
    # 71bd05e07df3 and c219aac56556's RBAC-tables list), so this UPDATE needs no
    # trigger-disable handling.
    op.execute("UPDATE photos SET ref_type = 'geometry' WHERE ref_type = 'ticket'")

    op.add_column('stations', sa.Column('contact_name', sa.String(100), nullable=True))
    op.add_column('stations', sa.Column('contact_email', sa.String(100), nullable=True))
    op.add_column('stations', sa.Column('contact_phone', sa.String(50), nullable=True))


def downgrade() -> None:
    """Drop station contact columns; rename photos.ref_type='geometry' back to 'ticket'."""
    op.drop_column('stations', 'contact_phone')
    op.drop_column('stations', 'contact_email')
    op.drop_column('stations', 'contact_name')

    # Station photos added since the upgrade get relabelled 'ticket' here too: this UPDATE
    # cannot tell the two apart, because station and ticket photos both store a
    # base_geometries uuid in ref_uuid. That is safe rather than lossy — re-running the
    # upgrade turns them back into 'geometry', and while downgraded their ref_uuid points at
    # a station, so the ticket-photo queries that existed at this older revision never
    # match them.
    op.execute("UPDATE photos SET ref_type = 'ticket' WHERE ref_type = 'geometry'")
