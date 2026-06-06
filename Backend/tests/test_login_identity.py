"""Endpoint tests for email/phone login on the identity model."""

import pytest
from sqlalchemy import select

from app.core.security import generate_salt, get_password_hash
from app.models.auth import User, UserContact, UserIdentity
from app.services.auth_account import create_account

PHONE = "+886912345678"


@pytest.mark.asyncio
async def test_login_by_email(client, db_session):
    """Login by email succeeds and stamps last_login_at."""
    # 'Login User' group is already seeded by the db_session fixture (Task 9b) — do NOT re-add it
    # (a duplicate group makes group_repository.get_by_name raise MultipleResultsFound).
    salt = generate_salt()
    await create_account(
        db_session, contact_type="email", value="a@x.com",
        password_hash=get_password_hash("secret", salt), name="Tester",
    )
    res = await client.post("/api/v1/auth/login", data={"username": "A@X.com", "password": "secret"})
    assert res.status_code == 200
    assert "access_token" in res.json()
    user = (await db_session.execute(select(User))).scalar_one()
    await db_session.refresh(user)
    assert user.last_login_at is not None


@pytest.mark.asyncio
async def test_login_by_phone(client, db_session):
    """Login by phone succeeds against a verified phone contact."""
    salt = generate_salt()
    await create_account(
        db_session, contact_type="phone", value=PHONE,
        password_hash=get_password_hash("secret", salt), name="Tester",
    )
    res = await client.post("/api/v1/auth/login", data={"username": "0912345678", "password": "secret"})
    assert res.status_code == 200
    assert "access_token" in res.json()


@pytest.mark.asyncio
async def test_login_wrong_password_401(client, db_session):
    """Login with a wrong password returns 401."""
    await create_account(
        db_session, contact_type="email", value="a@x.com",
        password_hash=get_password_hash("secret", generate_salt()), name="Tester",
    )
    res = await client.post("/api/v1/auth/login", data={"username": "a@x.com", "password": "nope"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_unverified_contact_401(client, db_session):
    """Login against an UNVERIFIED email contact returns 401 (contact lookup requires verified)."""
    # Build the account by hand: create_account makes a VERIFIED contact, so we cannot use it.
    user = User(name="Unverified")
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserIdentity(
        user_uuid=user.uuid, provider="password",
        password_hash=get_password_hash("secret", generate_salt()),
    ))
    db_session.add(UserContact(user_uuid=user.uuid, type="email", value="u@x.com", verified=False))
    await db_session.commit()
    res = await client.post("/api/v1/auth/login", data={"username": "u@x.com", "password": "secret"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_401(client):
    """Login with a completely unknown email returns 401."""
    res = await client.post("/api/v1/auth/login", data={"username": "nobody@x.com", "password": "secret"})
    assert res.status_code == 401
