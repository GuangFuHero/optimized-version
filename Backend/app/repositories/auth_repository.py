"""Repositories for User, Role, and Permission models with RBAC query helpers."""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
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

    async def get_user_permissions(self, db: AsyncSession, user_uuid: str) -> dict[str, Scope]:
        """Resolve every capability the user holds to its widest scope (ADR-018/021).

        Unions role-derived grants (via user_role_assign → role_permission_assign) with
        direct grants (user_permission_assign), then collapses same-key scopes to the
        widest one. Callers look up a specific key with ``.get(key, Scope.NONE)``.
        """
        role_grants_query = (
            select(Permission.key, RolePermissionAssign.scope)
            .join(RolePermissionAssign, RolePermissionAssign.permission_uuid == Permission.uuid)
            .join(UserRoleAssign, UserRoleAssign.role_uuid == RolePermissionAssign.role_uuid)
            .where(UserRoleAssign.user_uuid == user_uuid)
        )
        direct_grants_query = (
            select(Permission.key, UserPermissionAssign.scope)
            .join(UserPermissionAssign, UserPermissionAssign.permission_uuid == Permission.uuid)
            .where(UserPermissionAssign.user_uuid == user_uuid)
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

    async def assign_role(self, db: AsyncSession, user_uuid: str, role_uuid: str) -> bool:
        """將使用者指派特定角色 (role)。

        使用 PostgreSQL ON CONFLICT 優化為單一 SQL 語句，確保原子性與效能。
        """
        stmt = insert(UserRoleAssign).values(
            user_uuid=user_uuid,
            role_uuid=role_uuid,
        )
        stmt = stmt.on_conflict_do_nothing(index_elements=["user_uuid", "role_uuid"])
        stmt = stmt.returning(UserRoleAssign.uuid)

        result = await db.execute(stmt)
        await db.commit()

        # 若有回傳值代表成功插入新紀錄 (True)；否則代表記錄已存在 (False)
        return result.fetchone() is not None


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


user_repository = UserRepository()
role_repository = RoleRepository()
permission_repository = PermissionRepository()
contact_repository = ContactRepository()
identity_repository = IdentityRepository()
