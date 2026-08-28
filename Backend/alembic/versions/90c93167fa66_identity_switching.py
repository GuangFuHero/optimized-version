"""identity switching: grants carry their team, users no longer do

Feature 010 (ADR-068/073/076). An identity is one row of user_role_assign — a role plus,
for team roles, the team it applies to — and exactly one is active per request. That makes
the grant row the place a team lives, so `users.team_uuid` goes away and both grant tables
gain one.

Two things here are worth reading before editing:

`role_kind` on user_role_assign is deliberately redundant with `roles.kind`. The invariant
"platform grants carry no team, team grants must carry one" has to see the role's kind,
which a plain CHECK cannot reach across tables; copying the kind onto the grant lets CHECK
do it, and the composite FK to roles(uuid, kind) stops the copy from drifting.

The unique keys come in pairs. `UNIQUE(user, role, team)` does not stop a user collecting
duplicate platform grants, because Postgres does not treat two NULLs as equal, so each
table also gets a partial unique index over the rows whose team is NULL.

Backfill: a team role held by a user with no team is an orphan the old schema allowed and
the new one forbids. Those rows are deleted rather than repaired — there is no team to
repair them to, and the project is pre-production with mock data only.

Revision ID: 90c93167fa66
Revises: a1b2c3d4e5f6
Create Date: 2026-08-19

Chained after main's current head rather than after `e1f2a3b4c5d6`, which this feature
branched from. Leaving it on the old parent makes it a sibling of whatever main has added
since, and `alembic upgrade head` refuses to run with more than one head.

The parent has moved twice while this branch was open — `8ebfc3903041` when notifications
and station photos merged, and now `a1b2c3d4e5f6` (PR #32, analytics columns). That is the
standing cost of a single-line migration history with several branches open at once: this
revision is pinned to whatever main's head is at merge time, and has to be re-pointed each
time main moves.

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '90c93167fa66'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# The audit trigger function, in both shapes. Inlined rather than imported from
# app.db.triggers so this revision keeps applying the same SQL after the application code
# moves on: a migration that reads today's constant would rewrite an old database with a
# body from a future it knows nothing about.
_AUDIT_FUNC_WITH_CONTEXT = """
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
    user_id UUID := NULL;
    ip_addr VARCHAR := NULL;
    r_id UUID := NULL;
    ctx JSONB := NULL;
BEGIN
    BEGIN
        user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        user_id := NULL;
    END;

    BEGIN
        ip_addr := NULLIF(current_setting('app.client_ip', true), '');
    EXCEPTION WHEN OTHERS THEN
        ip_addr := NULL;
    END;

    BEGIN
        ctx := NULLIF(current_setting('app.active_identity', true), '')::JSONB;
    EXCEPTION WHEN OTHERS THEN
        ctx := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        r_id := OLD.uuid;
        old_val := to_jsonb(OLD) - 'password_hash';
    ELSIF TG_OP = 'UPDATE' THEN
        r_id := NEW.uuid;
        old_val := to_jsonb(OLD) - 'password_hash';
        new_val := to_jsonb(NEW) - 'password_hash';
    ELSE
        r_id := NEW.uuid;
        new_val := to_jsonb(NEW) - 'password_hash';
    END IF;

    INSERT INTO audit_logs (
        uuid, table_name, action, row_id, old_values, new_values,
        user_uuid, client_ip, context
    ) VALUES (
        gen_random_uuid(), TG_TABLE_NAME, TG_OP, r_id, old_val, new_val,
        user_id, ip_addr, ctx
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
"""

_AUDIT_FUNC_WITHOUT_CONTEXT = """
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    old_val JSONB := NULL;
    new_val JSONB := NULL;
    user_id UUID := NULL;
    ip_addr VARCHAR := NULL;
    r_id UUID := NULL;
BEGIN
    BEGIN
        user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        user_id := NULL;
    END;

    BEGIN
        ip_addr := NULLIF(current_setting('app.client_ip', true), '');
    EXCEPTION WHEN OTHERS THEN
        ip_addr := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        r_id := OLD.uuid;
        old_val := to_jsonb(OLD) - 'password_hash';
    ELSIF TG_OP = 'UPDATE' THEN
        r_id := NEW.uuid;
        old_val := to_jsonb(OLD) - 'password_hash';
        new_val := to_jsonb(NEW) - 'password_hash';
    ELSE
        r_id := NEW.uuid;
        new_val := to_jsonb(NEW) - 'password_hash';
    END IF;

    INSERT INTO audit_logs (
        uuid, table_name, action, row_id, old_values, new_values, user_uuid, client_ip
    ) VALUES (
        gen_random_uuid(), TG_TABLE_NAME, TG_OP, r_id, old_val, new_val, user_id, ip_addr
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    # 1. The composite FK below needs a unique key to point at. uuid is already the PK, so a
    #    UNIQUE that merely includes it costs nothing.
    op.create_unique_constraint("uq_roles_uuid_kind", "roles", ["uuid", "kind"])

    # 2. user_role_assign: widen, backfill, then tighten. The backfill has to run while
    #    users.team_uuid still exists, which is why step 4 comes last.
    op.add_column("user_role_assign", sa.Column("team_uuid", postgresql.UUID(), nullable=True))
    op.add_column("user_role_assign", sa.Column("role_kind", sa.String(10), nullable=True))
    op.execute(
        """
        UPDATE user_role_assign ura
           SET role_kind = r.kind,
               team_uuid = CASE WHEN r.kind = 'team' THEN u.team_uuid ELSE NULL END
          FROM roles r, users u
         WHERE ura.role_uuid = r.uuid AND ura.user_uuid = u.uuid
        """
    )
    # Orphans the old schema tolerated: a team role held by someone with no team.
    op.execute("DELETE FROM user_role_assign WHERE role_kind = 'team' AND team_uuid IS NULL")
    # A grant whose user or role vanished cannot be classified at all; the joins above skip it.
    op.execute("DELETE FROM user_role_assign WHERE role_kind IS NULL")
    op.alter_column("user_role_assign", "role_kind", nullable=False)

    # Named as SQLAlchemy's default would name it, so the alembic-built schema and a
    # create_all-built one (which the test suite uses) stay byte-identical.
    op.create_foreign_key(
        "user_role_assign_team_uuid_fkey", "user_role_assign", "teams", ["team_uuid"], ["uuid"]
    )
    op.create_foreign_key(
        "fk_ura_role_kind", "user_role_assign", "roles",
        ["role_uuid", "role_kind"], ["uuid", "kind"],
    )
    op.create_check_constraint(
        "ck_ura_role_team_kind", "user_role_assign",
        "(role_kind = 'platform' AND team_uuid IS NULL)"
        " OR (role_kind = 'team' AND team_uuid IS NOT NULL)",
    )
    op.drop_constraint("uq_user_role", "user_role_assign", type_="unique")
    op.create_unique_constraint(
        "uq_user_role", "user_role_assign", ["user_uuid", "role_uuid", "team_uuid"]
    )
    op.create_index(
        "uq_user_role_platform", "user_role_assign", ["user_uuid", "role_uuid"],
        unique=True, postgresql_where=sa.text("team_uuid IS NULL"),
    )

    # 3. user_permission_assign: same shape, no backfill — the seed creates none of these.
    op.add_column(
        "user_permission_assign", sa.Column("team_uuid", postgresql.UUID(), nullable=True)
    )
    op.create_index(
        "ix_user_permission_assign_team_uuid", "user_permission_assign", ["team_uuid"]
    )
    op.create_foreign_key(
        "user_permission_assign_team_uuid_fkey", "user_permission_assign", "teams",
        ["team_uuid"], ["uuid"],
    )
    op.drop_constraint("uq_user_perm", "user_permission_assign", type_="unique")
    op.create_unique_constraint(
        "uq_user_perm", "user_permission_assign",
        ["user_uuid", "permission_uuid", "team_uuid"],
    )
    op.create_index(
        "uq_user_perm_platform", "user_permission_assign", ["user_uuid", "permission_uuid"],
        unique=True, postgresql_where=sa.text("team_uuid IS NULL"),
    )
    op.create_index("ix_user_role_assign_team_uuid", "user_role_assign", ["team_uuid"])

    # 4. Which team someone belongs to is now a property of the roles they hold.
    op.drop_column("users", "team_uuid")

    # 5. The identity a change was made under, snapshotted (ADR-076). The trigger has to be
    #    replaced in the same step: it names the columns it inserts, so a database whose
    #    function predates this column would keep writing rows without one.
    op.add_column("audit_logs", sa.Column("context", postgresql.JSONB(), nullable=True))
    op.execute(_AUDIT_FUNC_WITH_CONTEXT)


def downgrade() -> None:
    # Function first: dropping the column out from under a trigger that still inserts into it
    # would break every audited write.
    op.execute(_AUDIT_FUNC_WITHOUT_CONTEXT)
    op.drop_column("audit_logs", "context")

    # users.team_uuid comes back and is refilled from the grants. Someone holding roles in
    # several teams cannot be represented by one column, so they keep whichever team sorts
    # first — arbitrary, but deterministic, and the multi-team grants are about to be
    # collapsed anyway. This is a real loss of information: downgrading a database where
    # anyone joined a second team discards that membership.
    op.add_column("users", sa.Column("team_uuid", postgresql.UUID(), nullable=True))
    op.create_foreign_key("users_team_uuid_fkey", "users", "teams", ["team_uuid"], ["uuid"])
    op.create_index("ix_users_team_uuid", "users", ["team_uuid"])
    op.execute(
        """
        UPDATE users u
           SET team_uuid = picked.team_uuid
          FROM (
                SELECT user_uuid, MIN(team_uuid::text)::uuid AS team_uuid
                  FROM user_role_assign
                 WHERE team_uuid IS NOT NULL
              GROUP BY user_uuid
               ) AS picked
         WHERE u.uuid = picked.user_uuid
        """
    )
    # The old unique key is (user, role); a user holding one role in two teams would break
    # it, so keep only the grant that matches the team they were just given.
    op.execute(
        """
        DELETE FROM user_role_assign ura
              USING users u
              WHERE ura.user_uuid = u.uuid
                AND ura.team_uuid IS NOT NULL
                AND ura.team_uuid IS DISTINCT FROM u.team_uuid
        """
    )
    # Same problem on the direct grants, which have no team on the user to fall back to.
    op.execute(
        """
        DELETE FROM user_permission_assign upa
              WHERE upa.team_uuid IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM user_permission_assign other
                     WHERE other.user_uuid = upa.user_uuid
                       AND other.permission_uuid = upa.permission_uuid
                       AND other.uuid <> upa.uuid
                       AND (other.team_uuid IS NULL OR other.team_uuid < upa.team_uuid)
                )
        """
    )

    op.drop_index("uq_user_perm_platform", table_name="user_permission_assign")
    op.drop_constraint("uq_user_perm", "user_permission_assign", type_="unique")
    op.create_unique_constraint(
        "uq_user_perm", "user_permission_assign", ["user_uuid", "permission_uuid"]
    )
    op.drop_constraint(
        "user_permission_assign_team_uuid_fkey", "user_permission_assign", type_="foreignkey"
    )
    op.drop_index("ix_user_permission_assign_team_uuid", table_name="user_permission_assign")
    op.drop_column("user_permission_assign", "team_uuid")

    op.drop_index("uq_user_role_platform", table_name="user_role_assign")
    op.drop_constraint("uq_user_role", "user_role_assign", type_="unique")
    op.create_unique_constraint("uq_user_role", "user_role_assign", ["user_uuid", "role_uuid"])
    op.drop_constraint("ck_ura_role_team_kind", "user_role_assign", type_="check")
    op.drop_constraint("fk_ura_role_kind", "user_role_assign", type_="foreignkey")
    op.drop_constraint("user_role_assign_team_uuid_fkey", "user_role_assign", type_="foreignkey")
    op.drop_index("ix_user_role_assign_team_uuid", table_name="user_role_assign")
    op.drop_column("user_role_assign", "role_kind")
    op.drop_column("user_role_assign", "team_uuid")

    op.drop_constraint("uq_roles_uuid_kind", "roles", type_="unique")
