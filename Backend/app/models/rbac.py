"""SQLAlchemy models for the capability-based RBAC engine (RBAC_V1_DECISIONS.md §2B).

Replaces the old Group/Policy/PolicyGroupAssign/PolicyUserAssign/UserGroupAssign engine
(ADR-026 drop-and-replace). See app/core/permissions.py for the Perm key catalog and
app/core/rbac_scopes.py for the Scope enum these tables carry.

Note on team assignment: `UserRoleAssign` deliberately has NO team_uuid column. Since a
user has at most one team (ADR-019, `users.team_uuid`), storing team_uuid a second time on
the assignment row would create two sources of truth that can drift. A "team" role grant
(kind="team") always applies against the actor's own `users.team_uuid` at resolution time.
"""

from sqlalchemy import ForeignKey, String, UniqueConstraint
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
    super_admin (RBAC_V1_DECISIONS.md Appendix B, point 1).
    """

    __tablename__ = "role_permission_assign"
    __table_args__ = (UniqueConstraint("role_uuid", "permission_uuid", name="uq_role_perm"),)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    scope: Mapped[str] = mapped_column(String(10), default="none")  # none/own/team/zone/all (ADR-049)


class UserRoleAssign(Base, UUIDPKMixin):
    """Assigns a Role to a User.

    A user holds at most one "platform" role and one "team" role at a time (ADR-019);
    that invariant is enforced by the role-assignment use case, not by a DB constraint
    (two roles of the same kind is a data-quality bug, not a security boundary — see
    RBAC_V1_DECISIONS.md T117).
    """

    __tablename__ = "user_role_assign"
    __table_args__ = (UniqueConstraint("user_uuid", "role_uuid", name="uq_user_role"),)
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    role_uuid: Mapped[str] = mapped_column(ForeignKey("roles.uuid"), index=True)


class UserPermissionAssign(Base, UUIDPKMixin):
    """Exception direct grant straight to a user, additive.

    ADR-018 — no `effect` column, since union-only means there is nothing to "deny".
    """

    __tablename__ = "user_permission_assign"
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    scope: Mapped[str] = mapped_column(String(10), default="none")
