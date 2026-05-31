"""Repositories for User, Group, and Policy models with RBAC query helpers."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repository.base import GenericRepository
from app.models.auth import Group, Policy, PolicyGroupAssign, PolicyUserAssign, User, UserGroupAssign


class UserRepository(GenericRepository[User]):
    """Repository for User model CRUD and permission queries."""

    def __init__(self):
        """Initialize with User as the managed model."""
        super().__init__(User)

    async def get_by_name(self, db: AsyncSession, name: str) -> User | None:
        """透過使用者名稱搜尋。"""
        query = select(User).where(User.name == name)
        result = await db.execute(query)
        return result.scalar_one_or_none()

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


user_repository = UserRepository()
group_repository = GroupRepository()
policy_repository = PolicyRepository()
