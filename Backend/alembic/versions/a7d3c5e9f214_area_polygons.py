"""area polygons: closure_areas -> hazardous_zones, work_zones -> team_zones, mark zones (ADR-311)

The three map areas (危險區, 責任區, 標示區) become joined-table children of one
`area_polygons` table under `base_geometries`. 標示區 has no columns of its own, so it has no
table. `team_zone_assign` now points at `team_zones`, which means only a 責任區 can carry a team.
Hazard writes move from `map.add/edit/delete` to `work_zone.*`, so those three permissions are
deleted.

No area data is carried over: local data is mock data reloaded by
scripts/seed_mock_scenarios.sql, so the old tables are dropped rather than backfilled.

Revision ID: a7d3c5e9f214
Revises: 5e2c8a9f1b47
Create Date: 2026-10-04

"""
from collections.abc import Sequence

from alembic import op

from app.db.triggers import get_audit_trigger_sql

# revision identifiers, used by Alembic.
revision: str = "a7d3c5e9f214"
down_revision: str | Sequence[str] | None = "5e2c8a9f1b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Frozen snapshot of the tables this revision audits, not read from AUDITED_TABLES. That list
# grows later, and a historical migration must not change with it.
_AREA_AUDITED_TABLES = [
    "area_polygons",
    "hazardous_zones",
    "team_zones",
]
_LEGACY_AUDITED_TABLES = [
    "closure_areas",
    "work_zones",
]
_MAP_WRITE_KEYS = "('map.add', 'map.edit', 'map.delete')"


def upgrade() -> None:
    """Replace closure_areas and work_zones with the area_polygons hierarchy."""
    op.execute("DELETE FROM team_zone_assign")
    op.execute("ALTER TABLE team_zone_assign DROP CONSTRAINT IF EXISTS team_zone_assign_zone_uuid_fkey")
    op.execute("DROP TABLE IF EXISTS work_zones")
    op.execute("DROP TABLE IF EXISTS closure_areas")
    op.execute("DELETE FROM base_geometries WHERE property_name = 'closure_area'")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS area_polygons (
            uuid UUID PRIMARY KEY REFERENCES base_geometries(uuid),
            name VARCHAR(100),
            note VARCHAR,
            is_public BOOLEAN NOT NULL DEFAULT false
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS hazardous_zones (
            uuid UUID PRIMARY KEY REFERENCES area_polygons(uuid),
            status VARCHAR(50) NOT NULL,
            information_source VARCHAR
        )
        """
    )
    op.execute(
        "CREATE TABLE IF NOT EXISTS team_zones (uuid UUID PRIMARY KEY REFERENCES area_polygons(uuid))"
    )

    op.execute(
        "ALTER TABLE team_zone_assign ADD CONSTRAINT team_zone_assign_zone_uuid_fkey "
        "FOREIGN KEY (zone_uuid) REFERENCES team_zones(uuid)"
    )

    op.execute(
        "DELETE FROM role_permission_assign WHERE permission_uuid IN "
        f"(SELECT uuid FROM permissions WHERE key IN {_MAP_WRITE_KEYS})"
    )
    op.execute(
        "DELETE FROM user_permission_assign WHERE permission_uuid IN "
        f"(SELECT uuid FROM permissions WHERE key IN {_MAP_WRITE_KEYS})"
    )
    op.execute(f"DELETE FROM permissions WHERE key IN {_MAP_WRITE_KEYS}")

    for table in _AREA_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
        op.execute(get_audit_trigger_sql(table))


def downgrade() -> None:
    """Restore empty closure_areas and work_zones tables and the map.* write permissions."""
    op.execute("DELETE FROM team_zone_assign")
    op.execute("ALTER TABLE team_zone_assign DROP CONSTRAINT IF EXISTS team_zone_assign_zone_uuid_fkey")
    op.execute("DROP TABLE IF EXISTS team_zones")
    op.execute("DROP TABLE IF EXISTS hazardous_zones")
    op.execute("DROP TABLE IF EXISTS area_polygons")
    op.execute(
        "DELETE FROM base_geometries "
        "WHERE property_name IN ('hazardous_zone', 'team_zone', 'mark_zone')"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS closure_areas (
            uuid UUID PRIMARY KEY REFERENCES base_geometries(uuid),
            status VARCHAR(50) NOT NULL,
            information_source VARCHAR,
            comment VARCHAR
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS work_zones (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            geometry geometry(MultiPolygon, 4326),
            created_by UUID REFERENCES users(uuid),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            delete_at TIMESTAMPTZ
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_work_zones_geometry ON work_zones USING GIST (geometry)"
    )
    op.execute(
        "ALTER TABLE team_zone_assign ADD CONSTRAINT team_zone_assign_zone_uuid_fkey "
        "FOREIGN KEY (zone_uuid) REFERENCES work_zones(uuid)"
    )

    op.execute(
        "INSERT INTO permissions (key) VALUES ('map.add'), ('map.edit'), ('map.delete') "
        "ON CONFLICT (key) DO NOTHING"
    )
    op.execute(
        f"""
        INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)
        SELECT gen_random_uuid(), r.uuid, p.uuid, 'all'
        FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'super_admin' AND p.key IN {_MAP_WRITE_KEYS}
        ON CONFLICT (role_uuid, permission_uuid) DO NOTHING
        """
    )

    for table in _LEGACY_AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_trigger_{table} ON {table};")
        op.execute(get_audit_trigger_sql(table))
