"""Tests for ContactRepository / IdentityRepository query helpers."""

import os

os.environ["ENV"] = "testing"

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import Base, Group, User, UserContact, UserIdentity
from app.repositories.auth_repository import contact_repository, identity_repository
from app.services.auth_account import create_account
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
async def test_create_verified_contact(db):
    """create_verified attaches a verified contact to an existing user."""
    from app.models.auth import User
    from app.repositories.auth_repository import contact_repository
    u = User(name="A")
    db.add(u)
    await db.flush()
    c = await contact_repository.create_verified(db, user_uuid=u.uuid, type_="phone", value="+886912345678")
    assert c.verified is True and c.type == "phone" and c.value == "+886912345678"
    assert await contact_repository.get_user_by_contact(db, type_="phone", value="+886912345678") is not None


@pytest.mark.asyncio
async def test_get_password_identity(db):
    """The password identity for a user is returned when present."""
    u = User(name="A")
    db.add(u)
    await db.flush()
    u_uuid = u.uuid  # capture before commit (commit expires the instance)
    db.add(UserIdentity(user_uuid=u_uuid, provider="password", password_hash="h"))
    await db.commit()
    ident = await identity_repository.get_password_identity(db, str(u_uuid))
    assert ident.password_hash == "h"


@pytest.mark.asyncio
async def test_get_by_provider_subject(db):
    """The identity for a (provider, provider_subject) pair resolves; an unknown subject is None."""
    db.add(Group(name="Login User"))
    await db.commit()
    user = await create_account(
        db, name="G", provider="google", provider_subject="sub-xyz",
        contact_type="email", value="g@x.com")
    found = await identity_repository.get_by_provider_subject(db, provider="google", subject="sub-xyz")
    assert found is not None and found.user_uuid == user.uuid
    assert await identity_repository.get_by_provider_subject(db, provider="google", subject="nope") is None
