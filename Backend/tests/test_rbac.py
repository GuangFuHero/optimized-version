import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.main import app
from app.core import security
from app.db.session import SessionLocal
from app.models.auth import Base, Group, User, Policy, UserGroupAssign, PolicyGroupAssign

# 測試用資料庫
TEST_SQLALCHEMY_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

engine = create_async_engine(TEST_SQLALCHEMY_DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    """
    確保測試開始前有預設角色與權限。
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        login_group = Group(name="Login User")
        db.add(login_group)
        await db.flush()
        
        map_policy = Policy(
            name="LoginUser_Map",
            read="all",
            create="none",
            edit="none",
            delete="none"
        )
        db.add(map_policy)
        await db.flush()
        
        assign = PolicyGroupAssign(group_uuid=login_group.uuid, policy_uuid=map_policy.uuid)
        db.add(assign)
        await db.commit()
    yield

@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_full_rbac_flow(client: AsyncClient):
    """
    驗證完整的 RBAC 流程：註冊 -> 登入 -> 權限檢查。
    """
    import uuid
    test_user_name = f"user_{uuid.uuid4().hex[:8]}"
    test_password = "password123"

    # 1. 測試註冊
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={"name": test_user_name, "password": test_password}
    )
    assert reg_response.status_code == 200

    # 2. 測試登入
    login_response = await client.post(
        "/api/v1/auth/login",
        data={"username": test_user_name, "password": test_password}
    )
    assert login_response.status_code == 200
    token_data = login_response.json()
    access_token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 3. 測試地圖權限 API (應通過，因為註冊時會自動指派 Login User 角色，具備 map:read=all)
    map_response = await client.get("/api/v1/rbac-test/map-view", headers=headers)
    assert map_response.status_code == 200
    assert "具有檢視地圖的權限" in map_response.json()["message"]

    # 4. 測試地圖建立 API (應失敗，因為 Login User 預設 map:create=none)
    create_response = await client.get("/api/v1/rbac-test/map-create", headers=headers)
    assert create_response.status_code == 403

    # 5. 測試公開 API
    public_response = await client.get("/api/v1/rbac-test/public")
    assert public_response.status_code == 200
