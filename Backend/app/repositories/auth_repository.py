"""Repositories for User, Group, and Policy models with RBAC query helpers."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.auth import (
    Group,
    Policy,
    PolicyGroupAssign,
    PolicyUserAssign,
    User,
    UserContact,
    UserGroupAssign,
    UserIdentity,
)


class UserRepository(GenericRepository[User]):
    """Repository for User model CRUD and permission queries."""

    def __init__(self):
        """Initialize with User as the managed model."""
        super().__init__(User)

    async def get_user_permissions(self, db: AsyncSession, user_uuid: str) -> list[Policy]:
        """獲取用戶的所有權限（包含從群組繼承的）。"""
        # 1. 獲取直接分配給用戶的權限
        direct_policies_query = (
            select(Policy)
            .join(PolicyUserAssign, Policy.uuid == PolicyUserAssign.policy_uuid)
            .where(PolicyUserAssign.user_uuid == user_uuid)
        )
        direct_policies = (await db.execute(direct_policies_query)).scalars().all()

        # 2. 獲取用戶所屬群組的權限
        group_policies_query = (
            select(Policy)
            .join(PolicyGroupAssign, Policy.uuid == PolicyGroupAssign.policy_uuid)
            .join(UserGroupAssign, PolicyGroupAssign.group_uuid == UserGroupAssign.group_uuid)
            .where(UserGroupAssign.user_uuid == user_uuid)
        )
        group_policies = (await db.execute(group_policies_query)).scalars().all()

        # 合併去重 (根據權限名稱 name 去重)
        all_policies = list({p.name: p for p in (list(direct_policies) + list(group_policies))}.values())
        return all_policies

    async def add_to_group(self, db: AsyncSession, user_uuid: str, group_uuid: str) -> bool:
        """將使用者加入特定群組。

        使用 PostgreSQL ON CONFLICT 優化為單一 SQL 語句，確保原子性與效能。
        """
        stmt = insert(UserGroupAssign).values(
            user_uuid=user_uuid, 
            group_uuid=group_uuid
        )
        # 回應 Reviewer：優化為單一語句處理
        stmt = stmt.on_conflict_do_nothing(index_elements=['user_uuid', 'group_uuid'])
        stmt = stmt.returning(UserGroupAssign.uuid)
        
        result = await db.execute(stmt)
        await db.commit()
        
        # 若有回傳值代表成功插入新紀錄 (True)；否則代表記錄已存在 (False)
        return result.fetchone() is not None


class GroupRepository(GenericRepository[Group]):
    """Repository for Group model CRUD."""

    def __init__(self):
        """Initialize with Group as the managed model."""
        super().__init__(Group)

    async def get_by_name(self, db: AsyncSession, name: str) -> Group | None:
        """透過名稱搜尋角色。"""
        query = select(Group).where(Group.name == name)
        result = await db.execute(query)
        return result.scalar_one_or_none()


class PolicyRepository(GenericRepository[Policy]):
    """Repository for Policy model CRUD."""

    def __init__(self):
        """Initialize with Policy as the managed model."""
        super().__init__(Policy)


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
group_repository = GroupRepository()
policy_repository = PolicyRepository()
contact_repository = ContactRepository()
identity_repository = IdentityRepository()
