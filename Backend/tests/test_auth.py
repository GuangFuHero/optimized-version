import pytest
import pytest_asyncio
import hashlib
import uuid
import os
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# 強制設定為測試環境，避開全域 Rate Limit
os.environ["ENV"] = "testing"

from app.main import app
from app.core import security
from app.models.auth import Base

# 測試用資料庫
TEST_SQLALCHEMY_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

@pytest_asyncio.fixture(scope="function")
async def db_session():
    engine = create_async_engine(TEST_SQLALCHEMY_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    TestingSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with TestingSessionLocal() as session:
        yield session
    await engine.dispose()

@pytest_asyncio.fixture(scope="function")
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[security.get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_auth_full_flow(client: AsyncClient):
    """
    測試完整的註冊與登入流程 (Happy Path)
    """
    username = f"user_{uuid.uuid4().hex[:6]}"
    password = "password123"

    # 1. 獲取 Salt
    salt_res = await client.get(f"/api/v1/auth/salt/{username}")
    assert salt_res.status_code == 200
    salt_frontend = salt_res.json()["salt_frontend"]

    # 2. 模擬前端 PBKDF2 雜湊 (10萬次) 並註冊
    # 這裡為了簡單測試使用一次雜湊模擬，邏輯與 security.py 一致即可
    hash_p1 = hashlib.pbkdf2_hmac('sha256', password.encode(), salt_frontend.encode(), 100000).hex()
    
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"name": username, "password": hash_p1, "salt_frontend": salt_frontend}
    )
    assert reg_res.status_code == 200

    # 3. 再次獲取 Salt (應拿到資料庫中存儲的同一個 Salt)
    salt_res_2 = await client.get(f"/api/v1/auth/salt/{username}")
    assert salt_res_2.json()["salt_frontend"] == salt_frontend

    # 4. 登入
    login_res = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": hash_p1}
    )
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()

@pytest.mark.asyncio
async def test_registration_conflict_409(client: AsyncClient):
    """
    測試重複註冊應回傳 409
    """
    username = f"conflict_{uuid.uuid4().hex[:6]}"
    payload = {"name": username, "password": "secure_password", "salt_frontend": "salt"}
    
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409

@pytest.mark.asyncio
async def test_login_failures(client: AsyncClient):
    """
    測試各種登入失敗情況
    """
    # 案例 1: 密碼錯誤
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "any_user", "password": "wrong_password"}
    )
    assert response.status_code == 401
    assert "帳號或密碼錯誤" in response.json()["detail"]

@pytest.mark.asyncio
async def test_malformed_password_logic():
    """
    測試 security 核心對損毀密碼字串的處理
    """
    # 缺少分割符號
    assert security.verify_password("p", "invalid_string") is False
    # 分割部分不足
    assert security.verify_password("p", "pbkdf2_sha256$600000$salt") is False
