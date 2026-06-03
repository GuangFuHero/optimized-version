"""Endpoint tests for Google SSO (verify-then-login/create) using the fake verifier."""
import json

import pytest

from app.services.auth_account import create_account


def _tok(sub="g-1", email="g@x.com", email_verified=True, name="GUser"):
    return json.dumps({"sub": sub, "email": email, "email_verified": email_verified, "name": name})


@pytest.mark.asyncio
async def test_first_login_creates_account_and_returns_tokens(client, db_session):
    """First Google login creates the account and returns a token pair."""
    res = await client.post("/api/v1/auth/sso/google", json={"id_token": _tok()})
    assert res.status_code == 200
    body = res.json()
    assert "access_token" in body and "refresh_token" in body


@pytest.mark.asyncio
async def test_second_login_same_sub_logs_in(client, db_session):
    """Second login with the same sub logs in without creating a duplicate user."""
    await client.post("/api/v1/auth/sso/google", json={"id_token": _tok()})
    res = await client.post("/api/v1/auth/sso/google", json={"id_token": _tok()})
    assert res.status_code == 200
    # only one user exists
    from sqlalchemy import select

    from app.models.auth import User
    users = (await db_session.execute(select(User))).scalars().all()
    assert len(users) == 1


@pytest.mark.asyncio
async def test_unverified_google_email_400(client, db_session):
    """An unverified Google email is rejected with 400 on first login."""
    res = await client.post("/api/v1/auth/sso/google",
                            json={"id_token": _tok(email_verified=False)})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_email_collision_blocks_409(client, db_session):
    """A Google email already owned by a password account is blocked with 409."""
    # an existing password account already owns this email
    await create_account(db_session, name="Owner", contact_type="email", value="g@x.com",
                         password_hash="h")
    res = await client.post("/api/v1/auth/sso/google", json={"id_token": _tok(email="g@x.com")})
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_invalid_token_401(client, db_session):
    """A malformed id_token is rejected with 401."""
    res = await client.post("/api/v1/auth/sso/google", json={"id_token": "not-json"})
    assert res.status_code == 401
