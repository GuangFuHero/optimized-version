"""rbac_v1: teams, work zones, and capability-based role/permission engine

Drop-and-replace of the old Group/Policy/PolicyGroupAssign/PolicyUserAssign/UserGroupAssign
engine (ADR-026, Spec/008-rbac-authorization/decisions.md). Zero users in production at time of writing, so no
backfill is needed for the new team_uuid columns.

Revision ID: 1d52ab265e50
Revises: e8b3c5f2a1d4
Create Date: 2026-07-04 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '1d52ab265e50'
down_revision: str | Sequence[str] | None = 'e8b3c5f2a1d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the RBAC v1 schema (teams/work_zones/roles/permissions/*_assign) and drop
    the old Group/Policy engine tables.
    """
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS teams (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            type VARCHAR(10) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            delete_at TIMESTAMPTZ
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
        """
        CREATE TABLE IF NOT EXISTS team_zone_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            team_uuid UUID NOT NULL REFERENCES teams(uuid),
            zone_uuid UUID NOT NULL REFERENCES work_zones(uuid),
            CONSTRAINT uq_team_zone UNIQUE (team_uuid, zone_uuid)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_zone_assign_team_uuid ON team_zone_assign(team_uuid)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_team_zone_assign_zone_uuid ON team_zone_assign(zone_uuid)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS roles (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(50) NOT NULL UNIQUE,
            kind VARCHAR(10) NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS permissions (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            key VARCHAR(80) NOT NULL UNIQUE,
            description VARCHAR(255)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS role_permission_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            role_uuid UUID NOT NULL REFERENCES roles(uuid),
            permission_uuid UUID NOT NULL REFERENCES permissions(uuid),
            scope VARCHAR(10) NOT NULL DEFAULT 'none',
            CONSTRAINT uq_role_perm UNIQUE (role_uuid, permission_uuid)
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_role_permission_assign_role_uuid "
        "ON role_permission_assign(role_uuid)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_role_permission_assign_permission_uuid "
        "ON role_permission_assign(permission_uuid)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_role_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_uuid UUID NOT NULL REFERENCES users(uuid),
            role_uuid UUID NOT NULL REFERENCES roles(uuid),
            CONSTRAINT uq_user_role UNIQUE (user_uuid, role_uuid)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_role_assign_user_uuid ON user_role_assign(user_uuid)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_user_role_assign_role_uuid ON user_role_assign(role_uuid)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_permission_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_uuid UUID NOT NULL REFERENCES users(uuid),
            permission_uuid UUID NOT NULL REFERENCES permissions(uuid),
            scope VARCHAR(10) NOT NULL DEFAULT 'none'
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_permission_assign_user_uuid "
        "ON user_permission_assign(user_uuid)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_user_permission_assign_permission_uuid "
        "ON user_permission_assign(permission_uuid)"
    )

    # A user has at most one team (ADR-019) — single FK column, not a membership table.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS team_uuid UUID REFERENCES teams(uuid)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_team_uuid ON users(team_uuid)")

    # Every BaseGeometry subtype (Station, ClosureArea, Tickets) inherits this column, so
    # team/gov/ngo scope works uniformly across all of them.
    op.execute(
        "ALTER TABLE base_geometries ADD COLUMN IF NOT EXISTS team_uuid UUID REFERENCES teams(uuid)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_base_geometries_team_uuid ON base_geometries(team_uuid)"
    )

    # ADR-026: drop-and-replace. Junction tables first (FK dependents), then the tables
    # they reference.
    op.execute("DROP TABLE IF EXISTS policy_group_assign")
    op.execute("DROP TABLE IF EXISTS policy_user_assign")
    op.execute("DROP TABLE IF EXISTS user_group_assign")
    op.execute("DROP TABLE IF EXISTS policies")
    op.execute("DROP TABLE IF EXISTS groups")


def downgrade() -> None:
    """Recreate the old Group/Policy engine and drop the RBAC v1 schema."""
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS groups (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS policies (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL UNIQUE,
            description VARCHAR(255),
            category VARCHAR(50),
            read VARCHAR(50) NOT NULL DEFAULT 'none',
            "create" VARCHAR(50) NOT NULL DEFAULT 'none',
            edit VARCHAR(50) NOT NULL DEFAULT 'none',
            "delete" VARCHAR(50) NOT NULL DEFAULT 'none'
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_group_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_uuid UUID NOT NULL REFERENCES users(uuid),
            group_uuid UUID NOT NULL REFERENCES groups(uuid),
            CONSTRAINT uq_user_group UNIQUE (user_uuid, group_uuid)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS policy_user_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_uuid UUID NOT NULL REFERENCES users(uuid),
            policy_uuid UUID NOT NULL REFERENCES policies(uuid)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS policy_group_assign (
            uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            group_uuid UUID NOT NULL REFERENCES groups(uuid),
            policy_uuid UUID NOT NULL REFERENCES policies(uuid)
        )
        """
    )

    op.execute("DROP INDEX IF EXISTS ix_base_geometries_team_uuid")
    op.execute("ALTER TABLE base_geometries DROP COLUMN IF EXISTS team_uuid")
    op.execute("DROP INDEX IF EXISTS ix_users_team_uuid")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS team_uuid")

    op.execute("DROP TABLE IF EXISTS user_permission_assign")
    op.execute("DROP TABLE IF EXISTS user_role_assign")
    op.execute("DROP TABLE IF EXISTS role_permission_assign")
    op.execute("DROP TABLE IF EXISTS permissions")
    op.execute("DROP TABLE IF EXISTS roles")
    op.execute("DROP TABLE IF EXISTS team_zone_assign")
    op.execute("DROP TABLE IF EXISTS work_zones")
    op.execute("DROP TABLE IF EXISTS teams")
