import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.models.auth import Group, Policy, PolicyGroupAssign

# 資料庫連線配置
engine = create_async_engine(settings.SQLALCHEMY_DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# 權限數據 (對應設計文件)
# read/create/edit/delete 欄位值可以為: 'all', 'own', 'none'
ROLES_DATA = [
    {
        "name": "Guest",
        "permissions": [
            {"name": "map", "read": "all", "create": "none", "edit": "none", "delete": "none"},
            {"name": "content", "read": "all", "create": "none", "edit": "none", "delete": "none"},
            {"name": "request", "read": "all", "create": "none", "edit": "none", "delete": "none"},
        ],
    },
    {
        "name": "Login User",
        "permissions": [
            {"name": "system", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "map", "read": "all", "create": "none", "edit": "none", "delete": "none"},
            {"name": "request", "read": "own", "create": "all", "edit": "own", "delete": "own"},
            {"name": "content", "read": "all", "create": "none", "edit": "none", "delete": "none"},
        ],
    },
    {
        "name": "Registered Volunteer",
        "permissions": [
            {"name": "volunteer", "read": "own", "create": "none", "edit": "own", "delete": "none"},
            {"name": "request", "read": "all", "create": "all", "edit": "own", "delete": "own"},
        ],
    },
    {
        "name": "Field Coordinator",
        "permissions": [
            {"name": "request", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "volunteer", "read": "all", "create": "none", "edit": "none", "delete": "none"},
            {"name": "map", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "supply", "read": "all", "create": "none", "edit": "none", "delete": "none"},
        ],
    },
    {
        "name": "System Administrator",
        "permissions": [
            {"name": "admin", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "request", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "volunteer", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "supply", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "map", "read": "all", "create": "all", "edit": "all", "delete": "all"},
        ],
    },
    {
        "name": "Super Admin",
        "permissions": [
            {"name": "admin", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "request", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "volunteer", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "supply", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "map", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "content", "read": "all", "create": "all", "edit": "all", "delete": "all"},
            {"name": "system", "read": "all", "create": "all", "edit": "all", "delete": "all"},
        ],
    },
]

async def seed():
    async with AsyncSessionLocal() as db:
        print("開始資料初始化 (Seeding RBAC)...")

        for role_info in ROLES_DATA:
            # 1. 建立或獲取角色
            result = await db.execute(select(Group).where(Group.name == role_info["name"]))
            group = result.scalars().first()
            if not group:
                group = Group(name=role_info["name"])
                db.add(group)
                await db.flush()
                print(f"建立角色: {group.name}")
            
            # 2. 為該角色建立專屬權限策略 (Policy)
            for perm in role_info["permissions"]:
                # 我們假設每個角色的每個資源都有一個 Policy
                policy_name = f"{role_info['name']}_{perm['name']}"
                
                # 檢查 Policy 是否已存在
                p_result = await db.execute(select(Policy).where(Policy.name == policy_name))
                policy = p_result.scalars().first()
                
                if not policy:
                    policy = Policy(
                        name=policy_name,
                        read=perm["read"],
                        create=perm["create"],
                        edit=perm["edit"],
                        delete=perm["delete"]
                    )
                    db.add(policy)
                    await db.flush()
                    
                    # 3. 建立角色與權限關聯
                    assign = PolicyGroupAssign(
                        group_uuid=group.uuid,
                        policy_uuid=policy.uuid
                    )
                    db.add(assign)
                    print(f"為角色 {group.name} 建立策略: {perm['name']} ({perm['read']}/{perm['create']}/{perm['edit']}/{perm['delete']})")
                else:
                    print(f"策略 {policy_name} 已存在，跳過。")
        
        await db.commit()
        print("RBAC 資料初始化完成！")

if __name__ == "__main__":
    asyncio.run(seed())
