"""Endpoint tests for verify-then-create registration, verification, and resend."""

import pytest


@pytest.mark.asyncio
async def test_register_email_returns_202_and_creates_no_user(client, db_session):
    """Register returns 202 and writes no DB user (verify-then-create)."""
    res = await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "New@X.com", "password": "hashedpw", "salt_frontend": "abc"},
    )
    assert res.status_code == 202
    # no DB user yet (verify-then-create)
    from sqlalchemy import select

    from app.models.auth import User
    assert (await db_session.execute(select(User))).first() is None


@pytest.mark.asyncio
async def test_register_phone_not_supported_in_phase1(client):
    """Phone registration is rejected with 422 in Phase 1."""
    res = await client.post(
        "/api/v1/auth/register",
        json={"type": "phone", "value": "+886912345678", "password": "hashedpw", "salt_frontend": "abc"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_conflict_on_taken_email(client, db_session):
    """Register returns 409 when the email already backs an account."""
    from app.services.auth_account import create_password_account
    # 'Login User' group is already seeded by the db_session fixture (Task 9b).
    await create_password_account(db_session, email="taken@x.com", password_hash="h")
    res = await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "Taken@X.com", "password": "hashedpw", "salt_frontend": "abc"},
    )
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_verify_email_creates_account_and_returns_tokens(client, capture_email):
    """Verify-email consumes the token, creates the account, and issues a session."""
    reg = await client.post("/api/v1/auth/register",
        json={"type": "email", "value": "v@x.com", "password": "hpw123", "salt_frontend": "abc"})
    assert reg.status_code == 202

    token = capture_email.last_token        # pulled from the captured verification email body
    assert token

    verify = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert verify.status_code == 200
    assert "access_token" in verify.json() and "refresh_token" in verify.json()

    # account now exists and the email logs in
    login = await client.post("/api/v1/auth/login", data={"username": "v@x.com", "password": "hpw123"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_verify_email_bad_token_400(client):
    """An unknown verification token returns 400."""
    res = await client.post("/api/v1/auth/verify-email", json={"token": "nope"})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_resend_sends_new_token(client, db_session, capture_email):
    """Resend mints a fresh token for a still-pending registration."""
    await client.post("/api/v1/auth/register",
        json={"type": "email", "value": "r@x.com", "password": "hpw123", "salt_frontend": "abc"})
    first = capture_email.last_token
    res = await client.post("/api/v1/auth/resend-verification", json={"type": "email", "value": "r@x.com"})
    assert res.status_code == 202
    assert capture_email.last_token and capture_email.last_token != first


@pytest.mark.asyncio
async def test_resend_no_pending_returns_404(client):
    """Resend returns 404 when no pending registration exists for the email."""
    res = await client.post("/api/v1/auth/resend-verification",
                            json={"type": "email", "value": "ghost@x.com"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_resend_malformed_email_returns_422(client):
    """Resend with a malformed email returns 422 instead of raising a 500 (Fix M1)."""
    res = await client.post("/api/v1/auth/resend-verification",
                            json={"type": "email", "value": "not-an-email"})
    assert res.status_code == 422
