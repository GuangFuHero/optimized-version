"""Tests for the create_account service (atomic user + identity + contact + group)."""

import os

os.environ["ENV"] = "testing"

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import Base, Group, UserContact, UserGroupAssign, UserIdentity
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
@pytest.mark.parametrize("ctype,value", [("email", "a@x.com"), ("phone", "+886912345678")])
async def test_create_account_wires_everything(db, ctype, value):
    """Account creation persists the identity, verified contact(type), and Login User group link."""
    db.add(Group(name="Login User"))
    await db.commit()
    user = await create_account(
        db, contact_type=ctype, value=value, password_hash="pbkdf2$x", name="A"
    )
    idents = (
        await db.execute(select(UserIdentity).where(UserIdentity.user_uuid == user.uuid))
    ).scalars().all()
    contacts = (
        await db.execute(select(UserContact).where(UserContact.user_uuid == user.uuid))
    ).scalars().all()
    groups = (
        await db.execute(select(UserGroupAssign).where(UserGroupAssign.user_uuid == user.uuid))
    ).scalars().all()
    assert idents[0].provider == "password"
    assert contacts[0].type == ctype
    assert contacts[0].value == value and contacts[0].verified is True
    assert len(groups) == 1


@pytest.mark.asyncio
async def test_create_account_google_identity_no_password(db):
    """A google account: google identity (no password_hash) + verified email contact."""
    db.add(Group(name="Login User"))
    await db.commit()
    user = await create_account(
        db, name="GUser", provider="google", provider_subject="g-sub-1",
        contact_type="email", value="g@x.com",
    )
    idents = (await db.execute(
        select(UserIdentity).where(UserIdentity.user_uuid == user.uuid))).scalars().all()
    assert idents[0].provider == "google"
    assert idents[0].provider_subject == "g-sub-1"
    assert idents[0].password_hash is None
