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
from app.core.sms import get_sms_sender
from app.main import app
from app.models.auth import Base, Group

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

_CODE_RE = re.compile(r"\b(\d{6})\b")


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


class _Capturer:
    """Base capturer exposing the 6-digit code from the most recent message body."""

    def __init__(self):
        """Start with an empty message log."""
        self.messages = []

    @property
    def last_code(self):
        """Return the 6-digit code parsed from the most recent message body, or None."""
        if not self.messages:
            return None
        m = _CODE_RE.search(self.messages[-1][-1])  # body is the last tuple element
        return m.group(1) if m else None


class CaptureEmailSender(_Capturer):
    """Test EmailSender that records messages so tests can extract the verification code."""

    async def send(self, to, subject, body):
        """Record one outbound email instead of delivering it."""
        self.messages.append((to, subject, body))


class CaptureSmsSender(_Capturer):
    """Test SmsSender that records messages so tests can extract the verification code."""

    async def send(self, to, body):
        """Record one outbound SMS instead of delivering it."""
        self.messages.append((to, body))


@pytest_asyncio.fixture
async def redis():
    """One fake redis shared by the client fixture and by tests that need to seed pendings directly."""
    fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=False)
    yield fake_redis
    await fake_redis.aclose()


@pytest_asyncio.fixture
async def client(db_session, redis):
    """HTTP client with db + redis + email-sender overrides bound to ONE fake redis."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[security.get_db] = override_get_db
    app.dependency_overrides[get_redis] = lambda: redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def capture_email():
    """Override get_email_sender with a capturing double; exposes `.last_code`."""
    sender = CaptureEmailSender()
    app.dependency_overrides[get_email_sender] = lambda: sender
    yield sender
    app.dependency_overrides.pop(get_email_sender, None)


@pytest.fixture
def capture_sms():
    """Override get_sms_sender with a capturing double; exposes `.last_code`."""
    sender = CaptureSmsSender()
    app.dependency_overrides[get_sms_sender] = lambda: sender
    yield sender
    app.dependency_overrides.pop(get_sms_sender, None)
