import pytest
import pytest_asyncio
import asyncio
import uuid
import hashlib
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

@pytest_asyncio.fixture(scope="function")
async def db_session():
    """
    建立測試專用的 Engine 與 Session，並覆寫 get_db。
    """
    engine = create_async_engine(TEST_SQLALCHEMY_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    TestingSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # 預填基礎角色與權限
    async with TestingSessionLocal() as db:
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

    async with TestingSessionLocal() as session:
        yield session

    await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    """
    配置測試客戶端並覆寫資料庫依賴。
    """
    async def override_get_db():
        yield db_session

    app.dependency_overrides[security.get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_full_rbac_flow(client: AsyncClient):
    """
    驗證完整的 RBAC 流程：註冊 -> 獲取 Salt -> 登入 -> 權限檢查。
    """
    test_user_name = f"user_{uuid.uuid4().hex[:8]}"
    test_password = "password123"
    test_salt_frontend = "abcd1234efgh5678"
    
    # 模擬前端傳送雜湊後的密碼
    test_hash_password_v1 = hashlib.sha256((test_password + test_salt_frontend).encode()).hexdigest()

    # 1. 註冊使用者
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": test_user_name, 
            "hash_password": test_hash_password_v1,
            "salt_frontend": test_salt_frontend
        }
    )
    assert reg_response.status_code == 200

    # 2. 登入前獲取 Salt (驗證是否能正確從 DB 結構中解析出前端 Salt)
    salt_response = await client.get(f"/api/v1/auth/salt/{test_user_name}")
    assert salt_response.status_code == 200
    assert salt_response.json()["salt_frontend"] == test_salt_frontend

    # 3. 執行登入
    login_response = await client.post(
        "/api/v1/auth/login",
        data={"username": test_user_name, "password": test_hash_password_v1}
    )
    assert login_response.status_code == 200
    token_data = login_response.json()
    access_token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 4. 驗證權限檢查邏輯
    # (a) 應具有讀取權限
    map_response = await client.get("/api/v1/rbac-test/map-view", headers=headers)
    assert map_response.status_code == 200
    assert "具有檢視地圖的權限" in map_response.json()["message"]

    # (b) 不應具有建立權限
    create_response = await client.get("/api/v1/rbac-test/map-create", headers=headers)
    assert create_response.status_code == 403

    # 5. 公開路徑測試
    public_response = await client.get("/api/v1/rbac-test/public")
    assert public_response.status_code == 200
