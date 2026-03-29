import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from pyrate_limiter import Duration, Rate

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
    # v0.2.0 需要 app lifespan 來初始化 app.state.limiter
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_salt_rate_limit(client: AsyncClient):
    """
    測試 Salt 接口 (10 次/每分鐘)
    """
    username = f"limit_test_{uuid.uuid4().hex[:6]}"
    
    # 執行 10 次成功
    for i in range(10):
        response = await client.get(f"/api/v1/auth/salt/{username}")
        assert response.status_code == 200

    # 第 11 次被擋
    response = await client.get(f"/api/v1/auth/salt/{username}")
    assert response.status_code == 429

@pytest.mark.asyncio
async def test_login_rate_limit(client: AsyncClient):
    """
    測試 Login 接口 (5 次/每分鐘)
    """
    username = f"user_{uuid.uuid4().hex[:6]}"
    
    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login",
            data={"username": username, "password": "wrong_password"}
        )
        assert response.status_code == 401

    response = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": "wrong_password"}
    )
    assert response.status_code == 429
