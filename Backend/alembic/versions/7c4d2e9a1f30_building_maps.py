"""building maps: building_maps subtype, building_map_ticket_map link, audit trigger

A building map is a building pinned once on the map, with floor counts and an optional list of
areas per floor, so that tickets inside it can be filed by floor and area. `building_maps` is a
`base_geometries` subtype, and its address is its `secondary_locations` row, like a station's.
`building_map_ticket_map` records which building a ticket was filed under, keyed by the ticket
so that each ticket has at most one.

Revision ID: 7c4d2e9a1f30
Revises: 5e2c8a9f1b47
Create Date: 2026-10-02

"""
from collections.abc import Sequence

from alembic import op

from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = "7c4d2e9a1f30"
down_revision: str | Sequence[str] | None = "5e2c8a9f1b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen snapshot of the tables this revision audits, not read from AUDITED_TABLES. That list
# grows later, and a historical migration must not change with it.
_BUILDING_MAP_AUDITED_TABLES = [
    "building_maps",
]


def upgrade() -> None:
    """Create the building map subtype and its ticket link, and audit the subtype."""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS building_maps (
            uuid UUID PRIMARY KEY REFERENCES base_geometries(uuid),
            name VARCHAR(100) NOT NULL,
            floors_above_ground INTEGER NOT NULL,
            floors_below_ground INTEGER NOT NULL DEFAULT 0,
            floor_areas JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS building_map_ticket_map (
            ticket_uuid UUID PRIMARY KEY REFERENCES tickets(uuid),
            building_map_uuid UUID NOT NULL REFERENCES building_maps(uuid),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_building_map_ticket_map_building_map_uuid "
        "ON building_map_ticket_map (building_map_uuid)"
    )

    for table in _BUILDING_MAP_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
        op.execute(get_audit_trigger_sql(table))


def downgrade() -> None:
    """Drop the trigger, the ticket link, then the building map subtype and its base rows."""
    for table in _BUILDING_MAP_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
    op.execute("DROP TABLE IF EXISTS building_map_ticket_map")
    # The subtype's base rows and addresses would otherwise be orphans with an unknown
    # polymorphic identity, which the ORM cannot load.
    op.execute(
        "DELETE FROM secondary_locations WHERE geometry_uuid IN (SELECT uuid FROM building_maps)"
    )
    op.execute("DROP TABLE IF EXISTS building_maps")
    op.execute("DELETE FROM base_geometries WHERE property_name = 'building_map'")
