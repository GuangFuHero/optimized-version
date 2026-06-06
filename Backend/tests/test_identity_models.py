"""Tests for the User / UserIdentity / UserContact ORM models and their constraints."""

import os

os.environ["ENV"] = "testing"

import pytest
import pytest_asyncio
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import Base, User, UserContact, UserIdentity
from tests.conftest import TEST_DB_URL  # dedicated test DB, env-driven (single source of truth)


@pytest_asyncio.fixture
async def db():
    """Provide a session against a freshly (re)created schema in the dedicated test DB."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=True)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_identity_and_contact_link_to_user(db: AsyncSession):
    """An identity and a contact can be attached to a user and committed together."""
    user = User(name="Alice")
    db.add(user)
    await db.flush()
    user_uuid = user.uuid  # capture before commit (commit expires the instance)
    db.add(UserIdentity(user_uuid=user_uuid, provider="password", password_hash="pbkdf2_sha256$x"))
    db.add(UserContact(user_uuid=user_uuid, type="email", value="alice@x.com", verified=True))
    await db.commit()
    assert user_uuid is not None


@pytest.mark.asyncio
async def test_contact_value_is_globally_unique(db: AsyncSession):
    """A (type, value) contact pair is unique across all users."""
    u1, u2 = User(name="A"), User(name="B")
    db.add_all([u1, u2])
    await db.flush()
    u1_uuid, u2_uuid = u1.uuid, u2.uuid  # capture before commit (commit expires the instances)
    db.add(UserContact(user_uuid=u1_uuid, type="email", value="dup@x.com", verified=True))
    await db.commit()
    db.add(UserContact(user_uuid=u2_uuid, type="email", value="dup@x.com", verified=True))
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_one_provider_per_user(db: AsyncSession):
    """A user cannot hold two identities for the same provider."""
    u = User(name="A")
    db.add(u)
    await db.flush()
    u_uuid = u.uuid  # capture before commit (commit expires the instance)
    db.add(UserIdentity(user_uuid=u_uuid, provider="password", password_hash="h1"))
    await db.commit()
    db.add(UserIdentity(user_uuid=u_uuid, provider="password", password_hash="h2"))
    with pytest.raises(IntegrityError):
        await db.commit()
