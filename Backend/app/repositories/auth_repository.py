"""Repositories for User, Role, and Permission models with RBAC query helpers."""

import logging
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac_scopes import Scope, widest
from app.infrastructure.repository.base import GenericRepository
from app.models.auth import User, UserContact, UserIdentity
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)

logger = logging.getLogger(__name__)


class UserRepository(GenericRepository[User]):
    """Repository for User model CRUD and permission queries."""

    def __init__(self):
        """Initialize with User as the managed model."""
        super().__init__(User)

    async def get_user_permissions(
        self, db: AsyncSession, user_uuid: str, *, identity=None
    ) -> dict[str, Scope]:
        """Resolve the capabilities of ONE identity to their widest scope (ADR-018/021/074).

        Only the active identity's grants count. Union still applies, but within a single
        identity: that identity's role grants, plus the direct grants bound to the same team.
        A super_admin acting as a team member therefore holds the member's grants and none
        of their own — the switch is real, not cosmetic.

        `identity=None` means no usable identity, which yields no grants at all. That is the
        fail-closed direction and covers both the roleless-account edge case and any caller
        that resolves scopes for a `User` never bound to a request.
        """
        if identity is None:
            return {}
        role_grants_query = (
            select(Permission.key, RolePermissionAssign.scope)
            .join(RolePermissionAssign, RolePermissionAssign.permission_uuid == Permission.uuid)
            .join(UserRoleAssign, UserRoleAssign.role_uuid == RolePermissionAssign.role_uuid)
            .where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.role_uuid == identity.role_uuid,
                UserRoleAssign.team_uuid.is_not_distinct_from(identity.team_uuid),
            )
        )
        direct_grants_query = (
            select(Permission.key, UserPermissionAssign.scope)
            .join(UserPermissionAssign, UserPermissionAssign.permission_uuid == Permission.uuid)
            .where(
                UserPermissionAssign.user_uuid == user_uuid,
                # Direct grants have no role, so they key off the team alone: NULL belongs to
                # the platform identity, a value to that team's identity (ADR-073).
                UserPermissionAssign.team_uuid.is_not_distinct_from(identity.team_uuid),
            )
        )
        role_rows = (await db.execute(role_grants_query)).all()
        direct_rows = (await db.execute(direct_grants_query)).all()

        scopes_by_key: dict[str, list[Scope]] = {}
        for key, scope in [*role_rows, *direct_rows]:
            try:
                parsed = Scope(scope)
            except ValueError:
                logger.warning(
                    "skipping malformed scope %r for permission %s (user %s)", scope, key, user_uuid
                )
                continue
            scopes_by_key.setdefault(key, []).append(parsed)
        return {key: widest(scopes) for key, scopes in scopes_by_key.items()}

    async def get_role_refs(self, db: AsyncSession, user_uuid: str) -> list[Role]:
        """The roles a user currently holds."""
        result = await db.execute(
            select(Role)
            .join(UserRoleAssign, UserRoleAssign.role_uuid == Role.uuid)
            .where(UserRoleAssign.user_uuid == user_uuid)
        )
        return list(result.scalars().all())

    async def get_direct_grants(
        self, db: AsyncSession, user_uuid: str
    ) -> list[tuple[str, str, str | None]]:
        """A user's direct (per-user) capability->scope grants, with the team each binds to.

        The team is part of the answer now (ADR-073): a grant with no team belongs to the
        platform identity, one with a team belongs to that team's identity only.
        """
        result = await db.execute(
            select(Permission.key, UserPermissionAssign.scope, UserPermissionAssign.team_uuid)
            .join(UserPermissionAssign, UserPermissionAssign.permission_uuid == Permission.uuid)
            .where(UserPermissionAssign.user_uuid == user_uuid)
        )
        return [(key, scope, str(team) if team else None) for key, scope, team in result.all()]

    async def assign_role(
        self, db: AsyncSession, user_uuid: str, role_uuid: str, *, role_kind: str = "platform"
    ) -> bool:
        """將使用者指派特定角色 (role)。

        使用 PostgreSQL ON CONFLICT 優化為單一 SQL 語句，確保原子性與效能。

        Platform-only: `bootstrap_admin.py` is the sole caller and grants super_admin, so
        there is no team to attach (feature 010, ADR-073). The conflict target is the partial
        index on platform grants, since the plain unique key includes team_uuid and Postgres
        does not treat two NULLs as equal.

        **Replaces whatever platform role the user already held**, the same way
        `admin_service.assign_role` does (ADR-019). Adding alongside would leave the account
        with two platform identities, and `default_for_user` would then pick between them by
        whatever order the index returned — a bootstrapped super_admin could log in as a
        plain `user` (ADR-184).
        """
        await db.execute(
            delete(UserRoleAssign).where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.team_uuid.is_(None),
                UserRoleAssign.role_uuid != role_uuid,
            )
        )
        stmt = insert(UserRoleAssign).values(
            user_uuid=user_uuid,
            role_uuid=role_uuid,
            team_uuid=None,
            role_kind=role_kind,
        )
        # index_where names the partial index's predicate; without it Postgres cannot tell
        # which index the conflict target means and rejects the statement outright.
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["user_uuid", "role_uuid"], index_where=text("team_uuid IS NULL")
        )
        stmt = stmt.returning(UserRoleAssign.uuid)

        result = await db.execute(stmt)
        await db.commit()

        # 若有回傳值代表成功插入新紀錄 (True)；否則代表記錄已存在 (False)
        return result.fetchone() is not None

    async def upsert_grant(
        self,
        db: AsyncSession,
        *,
        user_uuid: str,
        permission_uuid: str,
        scope: str,
        team_uuid: str | None = None,
    ) -> None:
        """Insert or update one per-user grant's scope, for one identity (ADR-073).

        A grant is per-identity, so the same capability can be held at different scopes in
        different teams. Which unique key the upsert targets depends on whether a team is
        given: platform grants collide on the partial index (Postgres does not treat two
        NULL team_uuids as equal, so the plain key would let duplicates through), team grants
        on uq_user_perm.
        """
        stmt = insert(UserPermissionAssign).values(
            user_uuid=user_uuid,
            permission_uuid=permission_uuid,
            scope=scope,
            team_uuid=team_uuid,
        )
        if team_uuid is None:
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_uuid", "permission_uuid"],
                index_where=text("team_uuid IS NULL"),
                set_={"scope": scope},
            )
        else:
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_uuid", "permission_uuid", "team_uuid"],
                set_={"scope": scope},
            )
        await db.execute(stmt)
        await db.commit()

    async def delete_grant(
        self, db: AsyncSession, *, user_uuid: str, permission_uuid: str, team_uuid: str | None = None
    ) -> int:
        """Delete one per-user grant from one identity; returns rows removed (0 when absent).

        `is_not_distinct_from` rather than `==` so a platform grant (team_uuid NULL) is
        matched — SQL equality against NULL is never true.
        """
        result = await db.execute(
            delete(UserPermissionAssign).where(
                UserPermissionAssign.user_uuid == user_uuid,
                UserPermissionAssign.permission_uuid == permission_uuid,
                UserPermissionAssign.team_uuid.is_not_distinct_from(team_uuid),
            )
        )
        await db.commit()
        return result.rowcount

    async def unassign_role(
        self, db: AsyncSession, *, user_uuid: str, role_uuid: str, team_uuid: str | None = None
    ) -> int:
        """Delete one identity (user↔role↔team); returns rows removed (0 when absent).

        Holding the same role in two teams is two identities (ADR-073), so revoking has to
        say which one — dropping every row for the role would kick the user out of teams the
        caller never mentioned.
        """
        result = await db.execute(
            delete(UserRoleAssign).where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.role_uuid == role_uuid,
                UserRoleAssign.team_uuid.is_not_distinct_from(team_uuid),
            )
        )
        await db.commit()
        return result.rowcount


class RoleRepository(GenericRepository[Role]):
    """Repository for Role model CRUD."""

    def __init__(self):
        """Initialize with Role as the managed model."""
        super().__init__(Role)

    async def get_by_name(self, db: AsyncSession, name: str) -> Role | None:
        """透過名稱搜尋角色。"""
        query = select(Role).where(Role.name == name)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def list_all(self, db: AsyncSession) -> list[Role]:
        """Every role, ordered by kind then name (for the matrix display)."""
        result = await db.execute(select(Role).order_by(Role.kind, Role.name))
        return list(result.scalars().all())

    async def get_grants(
        self, db: AsyncSession, *, role_uuid: str | None = None
    ) -> list[tuple[str, str, str]]:
        """Return (role_uuid, capability_key, scope) rows; all roles when role_uuid is None."""
        stmt = select(
            RolePermissionAssign.role_uuid, Permission.key, RolePermissionAssign.scope
        ).join(Permission, Permission.uuid == RolePermissionAssign.permission_uuid)
        if role_uuid is not None:
            stmt = stmt.where(RolePermissionAssign.role_uuid == role_uuid)
        rows = (await db.execute(stmt)).all()
        return [(str(role), key, scope) for role, key, scope in rows]

    async def upsert_grant(
        self, db: AsyncSession, *, role_uuid: str, permission_uuid: str, scope: str
    ) -> None:
        """Insert or update one role→permission grant's scope (PG ON CONFLICT on uq_role_perm)."""
        stmt = insert(RolePermissionAssign).values(
            role_uuid=role_uuid, permission_uuid=permission_uuid, scope=scope
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["role_uuid", "permission_uuid"], set_={"scope": scope}
        )
        await db.execute(stmt)
        await db.commit()

    async def delete_grant(
        self, db: AsyncSession, *, role_uuid: str, permission_uuid: str
    ) -> int:
        """Delete one role→permission grant; returns rows removed (0 when absent)."""
        result = await db.execute(
            delete(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role_uuid,
                RolePermissionAssign.permission_uuid == permission_uuid,
            )
        )
        await db.commit()
        return result.rowcount

    async def count_assignments(self, db: AsyncSession, role_uuid: str) -> int:
        """Number of users currently assigned this role."""
        rows = (
            await db.execute(
                select(UserRoleAssign.uuid).where(UserRoleAssign.role_uuid == role_uuid)
            )
        ).all()
        return len(rows)

    async def delete_with_grants(self, db: AsyncSession, role_uuid: str) -> None:
        """Delete a role's permission grants then the role itself, in one transaction."""
        await db.execute(
            delete(RolePermissionAssign).where(RolePermissionAssign.role_uuid == role_uuid)
        )
        await db.execute(delete(Role).where(Role.uuid == role_uuid))
        await db.commit()


class PermissionRepository(GenericRepository[Permission]):
    """Repository for Permission model CRUD."""

    def __init__(self):
        """Initialize with Permission as the managed model."""
        super().__init__(Permission)

    async def get_by_key(self, db: AsyncSession, key: str) -> Permission | None:
        """透過 capability key 搜尋權限。"""
        query = select(Permission).where(Permission.key == key)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def ensure_by_key(self, db: AsyncSession, key: str) -> Permission:
        """Return the Permission row for a code-owned capability key, creating it if absent.

        Capability rows mirror `Perm` (ADR-057); auto-creating on first grant keeps the
        write path working on a DB seeded before the key existed.
        """
        permission = await self.get_by_key(db, key)
        if permission is None:
            permission = Permission(key=key)
            db.add(permission)
            await db.flush()
        return permission


class ContactRepository(GenericRepository[UserContact]):
    """Queries over verified contact methods (the login identifier)."""

    def __init__(self):
        """Initialize with UserContact as the managed model."""
        super().__init__(UserContact)

    async def get_user_by_contact(self, db: AsyncSession, *, type_: str, value: str) -> User | None:
        """Return the User owning a VERIFIED contact (value must be pre-normalized)."""
        q = (
            select(User)
            .join(UserContact, UserContact.user_uuid == User.uuid)
            .where(UserContact.type == type_, UserContact.value == value, UserContact.verified.is_(True))
        )
        return (await db.execute(q)).scalar_one_or_none()

    async def is_value_taken(self, db: AsyncSession, *, type_: str, value: str) -> bool:
        """True if any contact row (verified or not) already holds this (type, value)."""
        q = select(UserContact.uuid).where(UserContact.type == type_, UserContact.value == value)
        return (await db.execute(q)).first() is not None

    async def user_has_contact_type(self, db: AsyncSession, *, user_uuid: str, type_: str) -> bool:
        """Return True if the user already owns any contact row of the given type.

        Args:
            db: Active async session.
            user_uuid: Owner of the contacts to check.
            type_: Contact type to look for ("email" or "phone").

        Returns:
            True if a contact row of that type exists for the user, else False.
        """
        q = select(UserContact.uuid).where(
            UserContact.user_uuid == user_uuid, UserContact.type == type_
        )
        return (await db.execute(q)).first() is not None

    async def create_verified(self, db: AsyncSession, *, user_uuid, type_: str, value: str) -> UserContact:
        """Attach a VERIFIED contact (value pre-normalized) to an existing user."""
        contact = UserContact(
            user_uuid=user_uuid, type=type_, value=value, verified=True, verified_at=datetime.now(UTC)
        )
        db.add(contact)
        await db.commit()
        await db.refresh(contact)
        return contact

    async def get_by_user_and_type(
        self, db: AsyncSession, *, user_uuid: str, type_: str
    ) -> UserContact | None:
        """Return the user's contact row of that type, or None."""
        q = select(UserContact).where(
            UserContact.user_uuid == user_uuid, UserContact.type == type_
        )
        return (await db.execute(q)).scalar_one_or_none()

    async def list_by_user(self, db: AsyncSession, user_uuid: str) -> list[UserContact]:
        """Every contact the user owns, oldest first."""
        q = (
            select(UserContact)
            .where(UserContact.user_uuid == user_uuid)
            .order_by(UserContact.created_at)
        )
        return list((await db.execute(q)).scalars().all())

    async def count_by_user(self, db: AsyncSession, user_uuid: str) -> int:
        """How many contacts the user owns — the login-channel guard counts these (ADR-087)."""
        q = select(func.count()).select_from(UserContact).where(UserContact.user_uuid == user_uuid)
        return (await db.execute(q)).scalar() or 0

    async def replace_verified(
        self, db: AsyncSession, *, existing: UserContact, value: str
    ) -> UserContact:
        """Swap a contact's value in ONE transaction (ADR-098).

        Delete-then-insert rather than an in-place UPDATE so the row identity changes and the
        audit trail shows a DELETE plus an INSERT — `user_contacts` is in AUDITED_TABLES and
        `UserContact` has no soft-delete column, so audit_logs is where the old value lives on.

        Both statements share one commit: the account is never momentarily left with no
        contact, which would be a permanent lockout if the transaction then failed.
        """
        user_uuid, type_ = existing.user_uuid, existing.type
        await db.delete(existing)
        await db.flush()
        contact = UserContact(
            user_uuid=user_uuid, type=type_, value=value, verified=True, verified_at=datetime.now(UTC)
        )
        db.add(contact)
        await db.commit()
        await db.refresh(contact)
        return contact

    async def delete_contact(self, db: AsyncSession, *, contact: UserContact) -> None:
        """Hard-delete a contact row; audit_logs keeps the history (ADR-087)."""
        await db.delete(contact)
        await db.commit()


class IdentityRepository(GenericRepository[UserIdentity]):
    """Queries over auth methods."""

    def __init__(self):
        """Initialize with UserIdentity as the managed model."""
        super().__init__(UserIdentity)

    async def get_password_identity(self, db: AsyncSession, user_uuid: str) -> UserIdentity | None:
        """Return the user's password identity, or None for SSO-only users."""
        q = select(UserIdentity).where(
            UserIdentity.user_uuid == user_uuid, UserIdentity.provider == "password"
        )
        return (await db.execute(q)).scalar_one_or_none()

    async def get_by_provider_subject(
        self, db: AsyncSession, *, provider: str, subject: str
    ) -> UserIdentity | None:
        """Return the identity for a given (provider, provider_subject), or None."""
        q = select(UserIdentity).where(
            UserIdentity.provider == provider, UserIdentity.provider_subject == subject
        )
        return (await db.execute(q)).scalar_one_or_none()

    async def get_user_identity(
        self, db: AsyncSession, user_uuid: str, provider: str
    ) -> UserIdentity | None:
        """Return the user's identity for a specific provider, or None."""
        q = select(UserIdentity).where(
            UserIdentity.user_uuid == user_uuid, UserIdentity.provider == provider
        )
        return (await db.execute(q)).scalar_one_or_none()

    async def list_by_user(self, db: AsyncSession, user_uuid: str) -> list[UserIdentity]:
        """Every login method the user holds, oldest first."""
        q = (
            select(UserIdentity)
            .where(UserIdentity.user_uuid == user_uuid)
            .order_by(UserIdentity.created_at)
        )
        return list((await db.execute(q)).scalars().all())

    async def has_sso_identity(self, db: AsyncSession, user_uuid: str) -> bool:
        """True if any non-password login method exists — a way back in without a contact."""
        q = select(UserIdentity.uuid).where(
            UserIdentity.user_uuid == user_uuid, UserIdentity.provider != "password"
        )
        return (await db.execute(q)).first() is not None


user_repository = UserRepository()
role_repository = RoleRepository()
permission_repository = PermissionRepository()
contact_repository = ContactRepository()
identity_repository = IdentityRepository()
