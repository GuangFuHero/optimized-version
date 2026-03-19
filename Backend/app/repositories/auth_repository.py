from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.repository.base import GenericRepository
from app.models.auth import User, Group, Policy, UserGroupAssign, PolicyUserAssign, PolicyGroupAssign


class UserRepository(GenericRepository[User]):
    def __init__(self):
        super().__init__(User)

    async def get_by_name(self, db: AsyncSession, name: str) -> Optional[User]:
        """
        透過使用者名稱搜尋。
        """
        query = select(User).where(User.name == name)
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def get_user_permissions(self, db: AsyncSession, user_uuid: str) -> List[Policy]:
        """
        獲取用戶的所有權限（包含從群組繼承的）。
        """
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
        """
        將使用者加入特定群組。方便管理員頁面與註冊流程使用。
        """
        # 檢查是否已經在群組中
        exists_query = select(UserGroupAssign).where(
            UserGroupAssign.user_uuid == user_uuid,
            UserGroupAssign.group_uuid == group_uuid
        )
        exists = (await db.execute(exists_query)).scalar_one_or_none()
        
        if not exists:
            assignment = UserGroupAssign(user_uuid=user_uuid, group_uuid=group_uuid)
            db.add(assignment)
            await db.commit()
            return True
        return False


class GroupRepository(GenericRepository[Group]):
    def __init__(self):
        super().__init__(Group)

    async def get_by_name(self, db: AsyncSession, name: str) -> Optional[Group]:
        """
        透過名稱搜尋角色。
        """
        query = select(Group).where(Group.name == name)
        result = await db.execute(query)
        return result.scalar_one_or_none()


class PolicyRepository(GenericRepository[Policy]):
    def __init__(self):
        super().__init__(Policy)


user_repository = UserRepository()
group_repository = GroupRepository()
policy_repository = PolicyRepository()
