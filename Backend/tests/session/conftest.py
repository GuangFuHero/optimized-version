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
from app.main import app
from app.services.auth_account import create_account
from tests import db_reset
from tests.conftest import TEST_DB_URL, TEST_REDIS_URL, ensure_role  # per-worker under xdist


async def _reset_db():
    """Reset the DB and seed the default 'user' role, so no earlier test's rows leak in."""
    eng = create_async_engine(TEST_DB_URL, echo=False)
    await db_reset.reset(eng)
    factory = sessionmaker(eng, class_=AsyncSession, expire_on_commit=True)
    async with factory() as db:
        await ensure_role(db, "user")
        await db.commit()
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    """Start each test on a reset DB holding the default 'user' role; reset the app engine pool."""
    await _reset_db()
    from app.db.session import engine as app_engine

    await app_engine.dispose()


@pytest_asyncio.fixture
async def fake_redis():
    """Real bytes-mode Redis (TEST_REDIS_URL, flushed per test) like the app's; overrides get_redis."""
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
                db,
                contact_type="email",
                value=f"{name}@t.local",
                password_hash=get_password_hash(password, salt),
                name=name,
            )
            uid = str(user.uuid)
        await eng.dispose()
        return uid, password, f"{name}@t.local"

    return _make
