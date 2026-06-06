"""Fixtures for auth/session integration tests. Scoped to tests/session/ only."""

import os
import uuid as uuid_mod

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

os.environ["ENV"] = "testing"

from app.core.redis import get_redis
from app.core.security import generate_salt, get_password_hash
from app.db.session import Base
from app.main import app
from app.models.auth import Group
from app.services.auth_account import create_account
from tests.conftest import TEST_DB_URL  # dedicated test DB, env-driven (single source of truth)

TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/15")  # dedicated logical DB
assert TEST_REDIS_URL.rsplit("/", 1)[-1] not in (
    "",
    "0",
), "TEST_REDIS_URL must use a non-0 db index (flushdb wipes it)"
_db_ready = False


async def _ensure_db():
    global _db_ready
    if _db_ready:
        return
    _db_ready = True
    eng = create_async_engine(TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=True)
    async with factory() as db:
        db.add(Group(name="Login User"))
        await db.commit()
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Ensure schema + Login User group exist; reset app engine pool per test."""
    await _ensure_db()
    from app.db.session import engine as app_engine
    await app_engine.dispose()


@pytest_asyncio.fixture
async def fake_redis():
    """Real bytes-mode Redis (db 15, flushed per test) matching the app's client; overrides get_redis."""
    r = aioredis.from_url(TEST_REDIS_URL, decode_responses=False)
    await r.flushdb()
    app.dependency_overrides[get_redis] = lambda: r
    yield r
    app.dependency_overrides.pop(get_redis, None)
    await r.flushdb()
    await r.aclose()


@pytest.fixture
def make_user():
    """Return an async factory producing a (user_uuid, password, name) tuple.

    Plain @pytest.fixture (NOT @pytest_asyncio.fixture): the fixture body is synchronous and
    returns an async callable; the test awaits the callable, not the fixture.
    """
    async def _make(name: str | None = None, password: str = "hashed_pw_123"):
        name = name or f"u_{uuid_mod.uuid4().hex[:8]}"
        salt = generate_salt()
        eng = create_async_engine(TEST_DB_URL, echo=False)
        factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=True)
        async with factory() as db:
            user = await create_account(
                db, contact_type="email", value=f"{name}@t.local",
                password_hash=get_password_hash(password, salt), name=name,
            )
            uid = str(user.uuid)
        await eng.dispose()
        return uid, password, f"{name}@t.local"
    return _make
