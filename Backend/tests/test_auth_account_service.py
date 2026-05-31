"""Tests for the create_password_account service (atomic user + identity + contact + group)."""

import os

os.environ["ENV"] = "testing"

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.auth import Base, Group, UserContact, UserGroupAssign, UserIdentity
from app.services.auth_account import create_password_account

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
async def test_create_password_account_wires_everything(db):
    """Account creation persists the identity, verified contact, and Login User group link."""
    db.add(Group(name="Login User"))
    await db.commit()
    user = await create_password_account(
        db, email="alice@x.com", password_hash="pbkdf2_sha256$x", name="Alice"
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
    assert contacts[0].value == "alice@x.com" and contacts[0].verified is True
    assert len(groups) == 1
