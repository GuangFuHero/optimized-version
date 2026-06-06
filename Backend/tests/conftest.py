"""Shared pytest fixtures for the auth test suite (db, seeded db, HTTP client, email capture)."""

import os

os.environ["ENV"] = "testing"

# Dedicated Postgres test DB (env-driven). Resolved BEFORE any `app.*` import so the application
# engine (app.db.session) binds to the test DB, not the dev `postgres` maintenance DB. Session
# tests use the real app engine (no get_db override), so this is what keeps them off dev `postgres`.
TEST_DB_URL = os.getenv(
    "TEST_DB_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/disaster_rescue_test",
)
# Maintenance DB used to bootstrap the dedicated test DB (CREATE DATABASE can't run in a txn).
_ADMIN_DB_URL = os.getenv(
    "TEST_ADMIN_DB_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
)
_TEST_DB_NAME = TEST_DB_URL.rsplit("/", 1)[-1]
assert _TEST_DB_NAME not in (
    "",
    "postgres",
), "TEST_DB_URL must point at a dedicated test DB, never the 'postgres' maintenance DB (it gets wiped)"
# Point the application engine at the test DB before app.core.config / app.db.session import.
os.environ["SQLALCHEMY_DATABASE_URL"] = TEST_DB_URL

import re  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
import redis.asyncio as aioredis  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core import security  # noqa: E402
from app.core.redis import get_redis  # noqa: E402
from app.main import app  # noqa: E402
from app.messaging.email import get_email_sender  # noqa: E402
from app.messaging.sms import get_sms_sender  # noqa: E402
from app.models.auth import Base, Group  # noqa: E402
from app.sso.google import get_google_verifier  # noqa: E402
from app.sso.line import get_line_verifier  # noqa: E402
from tests.fakes import FakeGoogleVerifier, FakeLineVerifier  # noqa: E402

TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15")  # dedicated logical DB
assert TEST_REDIS_URL.rsplit("/", 1)[-1] not in (
    "",
    "0",
), "TEST_REDIS_URL must use a non-0 db index (flushdb wipes it)"

_CODE_RE = re.compile(r"\b(\d{6})\b")


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _ensure_test_database():
    """Create the dedicated test DB (+ PostGIS) before any test, so tests never touch dev `postgres`.

    Two gotchas handled here:
    - asyncpg can't run ``CREATE DATABASE`` inside a transaction / prepared statement, so we use an
      AUTOCOMMIT engine and ``exec_driver_sql`` (which sends the statement unprepared).
    - the fixture is session-scoped with a session-scoped loop so pytest-asyncio doesn't raise a
      "fixture scoped to a different loop" error against the function-scoped test loops.
    """
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": _TEST_DB_NAME}
        )
        if not exists:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_TEST_DB_NAME}"')
    await admin.dispose()

    eng = create_async_engine(TEST_DB_URL, isolation_level="AUTOCOMMIT")
    async with eng.connect() as conn:
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
    await eng.dispose()


@pytest_asyncio.fixture
async def db():
    """Fresh schema per test, UNSEEDED (for model/repo/service/gate unit tests). Wipes the test DB."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session():
    """Fresh schema + seeded 'Login User' group per test (self-contained; wipes the test DB)."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)
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
    """One real redis (db 15, flushed per test) shared by the client fixture and by tests directly."""
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await r.flushdb()
    yield r
    await r.flushdb()
    await r.aclose()


@pytest_asyncio.fixture
async def client(db_session, redis):
    """HTTP client with db + redis + email-sender overrides bound to ONE fake redis."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[security.get_db] = override_get_db
    app.dependency_overrides[get_redis] = lambda: redis
    app.dependency_overrides[get_google_verifier] = lambda: FakeGoogleVerifier()
    app.dependency_overrides[get_line_verifier] = lambda: FakeLineVerifier()
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
