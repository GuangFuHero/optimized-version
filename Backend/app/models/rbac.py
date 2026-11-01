"""SQLAlchemy models for the capability-based RBAC engine (Spec/008-rbac-authorization/decisions.md §2B).

Replaces the old Group/Policy/PolicyGroupAssign/PolicyUserAssign/UserGroupAssign engine
(ADR-026 drop-and-replace). See app/core/permissions.py for the Perm key catalog and
app/core/rbac_scopes.py for the Scope enum these tables carry.

Note on team assignment (feature 010, ADR-073 — supersedes ADR-039): a grant row carries
its own `team_uuid`, because a user can now hold the same role in several teams and a
different role in each. `users.team_uuid` is gone; the grant row IS where the team lives.

An identity is one row of `user_role_assign`: a role plus, for team roles, the team it
applies to. Exactly one identity is active per request, chosen by the access token's `act`
claim (ADR-068/069) — platform roles included, so a super_admin acting as a team member is
genuinely downgraded.
"""

from sqlalchemy import (
    DDL,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPKMixin


class Role(Base, UUIDPKMixin):
    """A named, reusable bundle of permission grants. Definition is global (not per-team)."""

    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(50), unique=True)
    kind: Mapped[str] = mapped_column(String(10))  # "platform" | "team"


class Permission(Base, UUIDPKMixin):
    """A capability key, e.g. "ticket.review" (ADR-012). See app/core/permissions.py:Perm."""

    __tablename__ = "permissions"
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255))


class RolePermissionAssign(Base, UUIDPKMixin):
    """Grants a Role a Permission at a given Scope.

    Scope lives HERE (not on Permission) so the same permission can carry a different
    scope per role — e.g. `ticket.view` is `team` for a team member but `all` for
    super_admin (Spec/008-rbac-authorization/decisions.md Appendix B, point 1).
    """

    __tablename__ = "role_permission_assign"
    __table_args__ = (UniqueConstraint("role_uuid", "permission_uuid", name="uq_role_perm"),)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    scope: Mapped[str] = mapped_column(String(10), default="none")  # none/own/team/zone/all (ADR-049)


class UserRoleAssign(Base, UUIDPKMixin):
    """One identity: a Role granted to a User, for a team when the role is team-kind.

    The invariant "platform grants carry no team, team grants must carry one" depends on the
    role's kind, which lives on `roles`. A CHECK cannot read another table, so a trigger on
    this table enforces it (`USER_ROLE_ASSIGN_KIND_TRIGGER`), and a second one on `roles` stops
    a role's kind changing while any grant holds it. Both raise `check_violation` for the
    constraint `ck_ura_role_team_kind`, so callers see an IntegrityError as they always did.

    A user holds exactly one platform identity and any number of team identities.
    """

    __tablename__ = "user_role_assign"
    __table_args__ = (
        # Includes team_uuid: holding `member` in two different teams is two identities, and
        # the old (user, role) key would have rejected the second one outright.
        UniqueConstraint("user_uuid", "role_uuid", "team_uuid", name="uq_user_role"),
        # Postgres does not compare NULLs in a UNIQUE, so the constraint above would let a
        # user collect duplicate platform grants. A partial index closes that.
        Index(
            "uq_user_role_platform",
            "user_uuid",
            "role_uuid",
            unique=True,
            postgresql_where=text("team_uuid IS NULL"),
        ),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"), index=True)
    team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), nullable=True, index=True)


class UserPermissionAssign(Base, UUIDPKMixin):
    """Exception direct grant straight to a user, additive.

    ADR-018 — no `effect` column, since union-only means there is nothing to "deny".
    ADR-058 — one row per (user, permission, team); scope edits upsert this row.

    Carries `team_uuid` for the same reason role grants do (ADR-073): a direct grant cannot
    be identity-independent, because its own scope may be `team` or `zone`, and those mean
    nothing without a team. NULL binds the grant to the platform identity; a value binds it
    to that team's identity.
    """

    __tablename__ = "user_permission_assign"
    __table_args__ = (
        UniqueConstraint("user_uuid", "permission_uuid", "team_uuid", name="uq_user_perm"),
        Index(
            "uq_user_perm_platform",
            "user_uuid",
            "permission_uuid",
            unique=True,
            postgresql_where=text("team_uuid IS NULL"),
        ),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    team_uuid: Mapped[str | None] = mapped_column(ForeignKey("teams.uuid"), nullable=True, index=True)
    scope: Mapped[str] = mapped_column(String(10), default="none")


USER_ROLE_ASSIGN_KIND_FUNCTION = """
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
USER_ROLE_ASSIGN_KIND_TRIGGER = """
CREATE TRIGGER user_role_assign_check_kind_trigger
BEFORE INSERT OR UPDATE OF role_uuid, team_uuid ON user_role_assign
FOR EACH ROW EXECUTE FUNCTION user_role_assign_check_kind()
"""
ROLES_KIND_FUNCTION = """
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
ROLES_KIND_TRIGGER = """
CREATE TRIGGER roles_kind_in_use_trigger
BEFORE UPDATE OF kind ON roles
FOR EACH ROW WHEN (OLD.kind IS DISTINCT FROM NEW.kind)
EXECUTE FUNCTION roles_kind_in_use()
"""

# Created with the tables so a schema built from the models enforces the rule too. `roles` exists
# by the time `user_role_assign` does, and the functions only name tables when they run.
for _statement in (
    USER_ROLE_ASSIGN_KIND_FUNCTION,
    USER_ROLE_ASSIGN_KIND_TRIGGER,
    ROLES_KIND_FUNCTION,
    ROLES_KIND_TRIGGER,
):
    event.listen(UserRoleAssign.__table__, "after_create", DDL(_statement))
