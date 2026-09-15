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
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.models.base import Base, UUIDPKMixin


class Role(Base, UUIDPKMixin):
    """A named, reusable bundle of permission grants. Definition is global (not per-team)."""

    __tablename__ = "roles"
    # uq_roles_uuid_kind exists only so grant rows can point a composite FK at (uuid, kind)
    # and let the database keep their redundant role_kind honest (ADR-073).
    __table_args__ = (UniqueConstraint("uuid", "kind", name="uq_roles_uuid_kind"),)
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

    `role_kind` is redundant with `roles.kind` on purpose. The invariant "platform grants
    carry no team, team grants must carry one" needs to see the role's kind, which a plain
    CHECK cannot reach across tables; copying the kind here lets CHECK do it, and the
    composite FK to `roles(uuid, kind)` stops the copy from ever drifting. Chosen over a
    validation trigger so the rule stays declarative — this repo already uses triggers for
    auditing, and a second, unrelated kind of trigger would make "where is this enforced"
    harder to answer (ADR-073).

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
            "uq_user_role_platform", "user_uuid", "role_uuid",
            unique=True, postgresql_where=text("team_uuid IS NULL"),
        ),
        ForeignKeyConstraint(
            ["role_uuid", "role_kind"], ["roles.uuid", "roles.kind"], name="fk_ura_role_kind"
        ),
        CheckConstraint(
            "(role_kind = 'platform' AND team_uuid IS NULL)"
            " OR (role_kind = 'team' AND team_uuid IS NOT NULL)",
            name="ck_ura_role_team_kind",
        ),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"), index=True)
    team_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("teams.uuid"), nullable=True, index=True
    )
    # Mirror of roles.kind (see the class docstring). Filled automatically at flush time when
    # the caller omits it; the composite FK is what actually guarantees it stays correct.
    role_kind: Mapped[str] = mapped_column(String(10), nullable=False, default=None)


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
            "uq_user_perm_platform", "user_uuid", "permission_uuid",
            unique=True, postgresql_where=text("team_uuid IS NULL"),
        ),
    )
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    team_uuid: Mapped[str | None] = mapped_column(
        ForeignKey("teams.uuid"), nullable=True, index=True
    )
    scope: Mapped[str] = mapped_column(String(10), default="none")


@event.listens_for(Session, "before_flush")
def _fill_role_kind(session, _flush_context, _instances):
    """Derive `role_kind` from the granted role when the caller did not set it.

    `role_kind` exists so a CHECK can see the role's kind without crossing tables (ADR-073);
    it is bookkeeping, not something every call site should have to remember. Filling it here
    keeps the constraint declarative while leaving callers to say only what they mean — and
    the composite FK to `roles(uuid, kind)` still rejects a wrong value, so this is a
    convenience, never the thing being trusted.

    Runs inside the flush greenlet, so the `session.get` lookup is valid under AsyncSession.
    """
    for obj in session.new:
        if isinstance(obj, UserRoleAssign) and obj.role_kind is None and obj.role_uuid:
            role = session.get(Role, obj.role_uuid)
            if role is not None:
                obj.role_kind = role.kind
