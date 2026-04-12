"""Unit tests for the security module: password hashing, JWT, and salt utilities."""

import os
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# 強制設定為測試環境，避開全域 Rate Limit
os.environ["ENV"] = "testing"

from app.core import security  # noqa: E402
from app.models.auth import Base  # noqa: E402

# 測試用資料庫
TEST_SQLALCHEMY_DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

@pytest_asyncio.fixture(scope="function")
async def db_session():
    """Create an isolated test database session with fresh schema."""
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
    """Configure test client with DB override and production rate-limit environment."""
    from app.main import app

    async def override_get_db():
        yield db_session
    app.dependency_overrides[security.get_db] = override_get_db

    # 預設為 production 環境以便測試限制邏輯
    old_env = os.environ.get("ENV")
    os.environ["ENV"] = "production"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    if old_env:
        os.environ["ENV"] = old_env


@pytest.mark.asyncio
async def test_rate_limiting(client: AsyncClient):
    """測試頻率限制防禦."""
    username = f"limit_{uuid.uuid4().hex[:4]}"
    
    # 1. 測試 Salt 限制 (10/min)
    for _ in range(10):
        await client.get(f"/api/v1/auth/salt/{username}")
    res = await client.get(f"/api/v1/auth/salt/{username}")
    assert res.status_code == 429

@pytest.mark.asyncio
async def test_jwt_integrity(client: AsyncClient):
    """測試 Token 完整性與有效性."""
    # 案例 1: 損壞的 Token
    headers = {"Authorization": "Bearer invalid.token.payload"}
    response = await client.get("/api/v1/users/me", headers=headers)
    assert response.status_code == 401
    assert "無法驗證憑證" in response.json()["detail"]

    # 案例 2: 缺少 Token
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401
