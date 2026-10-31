"""third normal form: role kind, need timestamps, address line

Revision ID: 197c174410bd
Revises: 9dd1f61063fe
Create Date: 2026-10-30 10:00:00.000000

Three facts the schema stored twice are stored once.

1. `user_role_assign.role_kind` copied `roles.kind` so a CHECK could see it. The column, the CHECK, the
   composite foreign key and `uq_roles_uuid_kind` go; two triggers keep the rule instead. One refuses a
   grant that gives a platform role a team or a team role none (raising the old constraint's name), the
   other refuses a change of a role's kind while any grant holds it.

2. `ticket_tasks.completed_at` and `canceled_at` agree with `status`: set exactly when it is `fulfilled` or
   `canceled`. The upgrade says how many rows disagree and repairs them from the status, stamping with
   `updated_at` where a time is missing, then adds the CHECK.

3. `secondary_locations.full_address` becomes a generated column, the parts and a new `remainder` joined.
   `user_input_address` keeps the line as received; rows from before this hold the parsed line there, since
   the raw input was never stored. Each row is parsed again to fill `remainder` and the 衖/衕 kept in
   `alley`; if any row would then rebuild to a different line than it holds, the upgrade stops and says so.
   The audit trigger is off for that backfill, which rewrites derived columns only.

Downgrade restores a plain `full_address` with its values and the copied `role_kind` with its constraints,
and drops the CHECK and the new columns.
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.address import join_address, parse_tw_address

# revision identifiers, used by Alembic.
revision: str = "197c174410bd"
down_revision: str | Sequence[str] | None = "9dd1f61063fe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

log = logging.getLogger("alembic.runtime.migration")

_ADDRESSES = "secondary_locations"
_PARTS = ("county", "town", "village", "neighborhood", "road", "section", "lane", "alley", "no")
_FULL_ADDRESS = "NULLIF(" + " || ".join(f"COALESCE({c}, '')" for c in (*_PARTS, "remainder")) + ", '')"
_STAMPS = (
    "(completed_at IS NOT NULL) = (status = 'fulfilled')"
    " AND (canceled_at IS NOT NULL) = (status = 'canceled')"
)

_KIND_FUNCTION = """
CREATE OR REPLACE FUNCTION user_role_assign_check_kind() RETURNS trigger AS $$
DECLARE
    role_kind text;
BEGIN
    SELECT kind INTO role_kind FROM roles WHERE uuid = NEW.role_uuid FOR SHARE;
    IF NOT FOUND
       OR (role_kind = 'platform' AND NEW.team_uuid IS NULL)
       OR (role_kind = 'team' AND NEW.team_uuid IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    IF role_kind = 'platform' THEN
        RAISE EXCEPTION 'a platform role carries no team'
            USING ERRCODE = 'check_violation', TABLE = 'user_role_assign',
                  CONSTRAINT = 'ck_ura_role_team_kind';
    END IF;
    RAISE EXCEPTION 'a team role must carry a team'
        USING ERRCODE = 'check_violation', TABLE = 'user_role_assign',
              CONSTRAINT = 'ck_ura_role_team_kind';
END;
$$ LANGUAGE plpgsql
"""
_KIND_TRIGGER = """
CREATE TRIGGER user_role_assign_check_kind_trigger
BEFORE INSERT OR UPDATE OF role_uuid, team_uuid ON user_role_assign
FOR EACH ROW EXECUTE FUNCTION user_role_assign_check_kind()
"""
_IN_USE_FUNCTION = """
CREATE OR REPLACE FUNCTION roles_kind_in_use() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM user_role_assign WHERE role_uuid = NEW.uuid) THEN
        RAISE EXCEPTION 'the kind of a role that has been granted cannot change'
            USING ERRCODE = 'check_violation', TABLE = 'roles', CONSTRAINT = 'ck_roles_kind_in_use';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
"""
_IN_USE_TRIGGER = """
CREATE TRIGGER roles_kind_in_use_trigger
BEFORE UPDATE OF kind ON roles
FOR EACH ROW WHEN (OLD.kind IS DISTINCT FROM NEW.kind)
EXECUTE FUNCTION roles_kind_in_use()
"""


def _add_constraint(table: str, name: str, definition: str) -> None:
    """ADD CONSTRAINT unless one of that name is already on the table."""
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = '{name}' AND conrelid = '{table}'::regclass
            ) THEN
                ALTER TABLE {table} ADD CONSTRAINT {name} {definition};
            END IF;
        END
        $$
        """
    )


def _role_kind_up() -> None:
    op.execute("ALTER TABLE user_role_assign DROP CONSTRAINT IF EXISTS ck_ura_role_team_kind")
    op.execute("ALTER TABLE user_role_assign DROP CONSTRAINT IF EXISTS fk_ura_role_kind")
    op.execute("ALTER TABLE user_role_assign DROP COLUMN IF EXISTS role_kind")
    op.execute("ALTER TABLE roles DROP CONSTRAINT IF EXISTS uq_roles_uuid_kind")
    for statement in (_KIND_FUNCTION, _IN_USE_FUNCTION):
        op.execute(statement)
    op.execute("DROP TRIGGER IF EXISTS user_role_assign_check_kind_trigger ON user_role_assign")
    op.execute(_KIND_TRIGGER)
    op.execute("DROP TRIGGER IF EXISTS roles_kind_in_use_trigger ON roles")
    op.execute(_IN_USE_TRIGGER)


def _role_kind_down() -> None:
    op.execute("DROP TRIGGER IF EXISTS roles_kind_in_use_trigger ON roles")
    op.execute("DROP TRIGGER IF EXISTS user_role_assign_check_kind_trigger ON user_role_assign")
    op.execute("DROP FUNCTION IF EXISTS roles_kind_in_use()")
    op.execute("DROP FUNCTION IF EXISTS user_role_assign_check_kind()")
    op.execute("ALTER TABLE user_role_assign ADD COLUMN IF NOT EXISTS role_kind varchar(10)")
    op.execute("UPDATE user_role_assign u SET role_kind = r.kind FROM roles r WHERE r.uuid = u.role_uuid")
    op.execute("ALTER TABLE user_role_assign ALTER COLUMN role_kind SET NOT NULL")
    _add_constraint("roles", "uq_roles_uuid_kind", "UNIQUE (uuid, kind)")
    _add_constraint(
        "user_role_assign",
        "fk_ura_role_kind",
        "FOREIGN KEY (role_uuid, role_kind) REFERENCES roles (uuid, kind)",
    )
    _add_constraint(
        "user_role_assign",
        "ck_ura_role_team_kind",
        "CHECK ((role_kind = 'platform' AND team_uuid IS NULL)"
        " OR (role_kind = 'team' AND team_uuid IS NOT NULL))",
    )


def _stamps_up() -> None:
    bind = op.get_bind()
    disagreeing = bind.scalar(sa.text(f"SELECT count(*) FROM ticket_tasks WHERE NOT ({_STAMPS})"))
    log.info("ticket_tasks: %s rows have completed_at or canceled_at disagreeing with status", disagreeing)
    if disagreeing:
        op.execute(
            f"""
            UPDATE ticket_tasks
               SET completed_at = CASE
                       WHEN status = 'fulfilled' THEN COALESCE(completed_at, updated_at, created_at) END,
                   canceled_at = CASE
                       WHEN status = 'canceled' THEN COALESCE(canceled_at, updated_at, created_at) END
             WHERE NOT ({_STAMPS})
            """
        )
    _add_constraint("ticket_tasks", "ck_ticket_tasks_stamps_match_status", f"CHECK ({_STAMPS})")


def _stamps_down() -> None:
    op.execute("ALTER TABLE ticket_tasks DROP CONSTRAINT IF EXISTS ck_ticket_tasks_stamps_match_status")


def _address_up() -> None:
    bind = op.get_bind()
    op.execute(f"ALTER TABLE {_ADDRESSES} ADD COLUMN IF NOT EXISTS user_input_address varchar(255)")
    op.execute(f"ALTER TABLE {_ADDRESSES} ADD COLUMN IF NOT EXISTS remainder varchar(255)")
    op.execute(f"COMMENT ON COLUMN {_ADDRESSES}.user_input_address IS '使用者輸入的地址原文'")
    op.execute(f"COMMENT ON COLUMN {_ADDRESSES}.remainder IS '解析不出來的地址文字'")
    # A derived-column rewrite, not an edit anyone made, so it stays out of the audit log.
    op.execute(f"ALTER TABLE {_ADDRESSES} DISABLE TRIGGER audit_trigger_{_ADDRESSES}")
    op.execute(f"UPDATE {_ADDRESSES} SET user_input_address = full_address WHERE user_input_address IS NULL")

    rows = bind.execute(sa.text(f"SELECT uuid, user_input_address, full_address FROM {_ADDRESSES}")).all()
    changes, differing = [], []
    for uuid, line, stored in rows:
        parts = parse_tw_address(line)
        values = {**parts.as_dict(), "remainder": parts.remainder}
        values.pop("full_address")
        if join_address(**values) != stored:
            differing.append(str(uuid))
        changes.append({"uuid": uuid, **values})
    log.info(
        "secondary_locations: %s rows re-parsed, %s would rebuild to a different line",
        len(rows),
        len(differing),
    )
    if differing:
        raise RuntimeError(
            f"{len(differing)} secondary_locations rows would rebuild to a different address line than "
            "they hold, so full_address cannot become a generated column yet. List them with: "
            "SELECT uuid, full_address FROM secondary_locations WHERE uuid IN "
            f"({', '.join(repr(u) for u in differing[:20])}{', …' if len(differing) > 20 else ''}); "
            "fix or clear them, then upgrade again."
        )
    if changes:
        assignments = ", ".join(f"{c} = :{c}" for c in (*_PARTS, "remainder"))
        bind.execute(sa.text(f"UPDATE {_ADDRESSES} SET {assignments} WHERE uuid = :uuid"), changes)
    op.execute(f"ALTER TABLE {_ADDRESSES} ENABLE TRIGGER audit_trigger_{_ADDRESSES}")

    op.execute(f"ALTER TABLE {_ADDRESSES} DROP COLUMN full_address")
    op.execute(
        f"ALTER TABLE {_ADDRESSES} ADD COLUMN full_address varchar(255)"
        f" GENERATED ALWAYS AS ({_FULL_ADDRESS}) STORED"
    )
    op.execute(f"COMMENT ON COLUMN {_ADDRESSES}.full_address IS '完整地址（不含樓、室）'")


def _address_down() -> None:
    op.execute(f"ALTER TABLE {_ADDRESSES} ALTER COLUMN full_address DROP EXPRESSION")
    op.execute(f"ALTER TABLE {_ADDRESSES} DROP COLUMN remainder")
    op.execute(f"ALTER TABLE {_ADDRESSES} DROP COLUMN user_input_address")


def upgrade() -> None:
    """Apply the three fixes; the second and third stop with a message if the data cannot take them."""
    _role_kind_up()
    _stamps_up()
    _address_up()


def downgrade() -> None:
    """Undo them; `full_address` keeps its values as a plain column."""
    _address_down()
    _stamps_down()
    _role_kind_down()
