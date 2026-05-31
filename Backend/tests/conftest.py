"""Shared pytest fixtures for the auth test suite (db, seeded db, HTTP client, email capture)."""

import os

os.environ["ENV"] = "testing"

import re

import fakeredis.aioredis
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core import security
from app.core.email import get_email_sender
from app.core.redis import get_redis
from app.main import app
from app.models.auth import Base, Group

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"


@pytest_asyncio.fixture
async def db():
    """Fresh schema per test, UNSEEDED (for model/repo/service/gate unit tests). Wipes the dev DB."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    """Fresh schema + seeded 'Login User' group per test (self-contained; wipes the dev DB)."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add(Group(name="Login User"))
        await session.commit()
        yield session
    await engine.dispose()


class CaptureEmailSender:
    """Test EmailSender that records messages so tests can extract the verify token."""

    def __init__(self):
        """Start with an empty message log."""
        self.messages = []

    async def send(self, to, subject, body):
        """Record one outbound email instead of delivering it."""
        self.messages.append((to, subject, body))

    @property
    def last_token(self):
        """Return the verify token parsed from the most recent email body, or None."""
        if not self.messages:
            return None
        m = re.search(r"token=([\w-]+)", self.messages[-1][2])
        return m.group(1) if m else None


@pytest_asyncio.fixture
async def client(db_session):
    """HTTP client with db + redis + email-sender overrides bound to ONE fake redis."""
    async def override_get_db():
        yield db_session

    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=False)
    app.dependency_overrides[security.get_db] = override_get_db
    app.dependency_overrides[get_redis] = lambda: fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
    await fake_redis.aclose()


@pytest.fixture
def capture_email():
    """Override get_email_sender with a capturing double; exposes `.last_token`."""
    sender = CaptureEmailSender()
    app.dependency_overrides[get_email_sender] = lambda: sender
    yield sender
    app.dependency_overrides.pop(get_email_sender, None)
