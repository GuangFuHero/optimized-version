"""Tests for ContactRepository / IdentityRepository query helpers."""

import os

os.environ["ENV"] = "testing"

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import Base, User, UserContact, UserIdentity
from app.repositories.auth_repository import contact_repository, identity_repository

TEST_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"


@pytest_asyncio.fixture
async def db():
    """Provide a session against a freshly (re)created schema; drops the dev DB tables."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_get_user_by_verified_email(db):
    """A verified email contact resolves to its owning user."""
    u = User(name="A")
    db.add(u)
    await db.flush()
    db.add(UserContact(user_uuid=u.uuid, type="email", value="a@x.com", verified=True))
    await db.commit()
    found = await contact_repository.get_user_by_contact(db, type_="email", value="a@x.com")
    assert str(found.uuid) == str(u.uuid)


@pytest.mark.asyncio
async def test_unverified_contact_not_returned(db):
    """An unverified contact is never returned by get_user_by_contact."""
    u = User(name="A")
    db.add(u)
    await db.flush()
    db.add(UserContact(user_uuid=u.uuid, type="email", value="a@x.com", verified=False))
    await db.commit()
    assert await contact_repository.get_user_by_contact(db, type_="email", value="a@x.com") is None


@pytest.mark.asyncio
async def test_contact_taken_checks_any_verification_state(db):
    """is_value_taken reports True for any existing (type, value) regardless of verification."""
    u = User(name="A")
    db.add(u)
    await db.flush()
    db.add(UserContact(user_uuid=u.uuid, type="email", value="a@x.com", verified=True))
    await db.commit()
    assert await contact_repository.is_value_taken(db, type_="email", value="a@x.com") is True
    assert await contact_repository.is_value_taken(db, type_="email", value="free@x.com") is False


@pytest.mark.asyncio
async def test_get_password_identity(db):
    """The password identity for a user is returned when present."""
    u = User(name="A")
    db.add(u)
    await db.flush()
    db.add(UserIdentity(user_uuid=u.uuid, provider="password", password_hash="h"))
    await db.commit()
    ident = await identity_repository.get_password_identity(db, str(u.uuid))
    assert ident.password_hash == "h"
