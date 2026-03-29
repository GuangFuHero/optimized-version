import pytest
import pytest_asyncio
import hashlib
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core import security
from app.db.session import SessionLocal
from app.models.auth import Base, Group

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
        await db.commit()
    yield

@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.mark.asyncio
async def test_auth_full_flow(client: AsyncClient):
    """
    合併測試以減少連線衝突，並測試完整流程。
    """
    # 1. 測試獲取不存在使用者的 Salt (應該拿到假 Salt)
    username = "test_user_new"
    salt_res = await client.get(f"/api/v1/auth/salt/{username}")
    assert salt_res.status_code == 200
    fake_salt = salt_res.json()["salt_frontend"]
    assert len(fake_salt) == 32

    # 2. 註冊
    password = "password123"
    salt_frontend = "my_salt_123"
    hash_p1 = hashlib.sha256((password + salt_frontend).encode()).hexdigest()
    
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"name": username, "hash_password": hash_p1, "salt_frontend": salt_frontend}
    )
    assert reg_res.status_code == 200
    
    # 3. 再次獲取 Salt (應該拿到真 Salt)
    salt_res_2 = await client.get(f"/api/v1/auth/salt/{username}")
    assert salt_res_2.status_code == 200
    assert salt_res_2.json()["salt_frontend"] == salt_frontend

    # 4. 登入成功
    login_res = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": hash_p1}
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

    # 5. 登入失敗 (密碼錯誤)
    login_fail_res = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": "wrong_hash"}
    )
    assert login_fail_res.status_code == 401
