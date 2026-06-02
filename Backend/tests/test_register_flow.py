"""Endpoint tests for unified code-based registration, verification, and resend (email + phone)."""

import pytest

from app.repositories.verification_repository import MAX_OTP_ATTEMPTS

PHONE = "+886912345678"


@pytest.mark.asyncio
async def test_register_email_returns_202_and_creates_no_user(client, db_session):
    """Register returns 202 and writes no DB user (verify-then-create)."""
    res = await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "New@X.com", "password": "hashedpw", "salt_frontend": "abc",
              "name": "Test User"},
    )
    assert res.status_code == 202
    # no DB user yet (verify-then-create)
    from sqlalchemy import select

    from app.models.auth import User
    assert (await db_session.execute(select(User))).first() is None


@pytest.mark.asyncio
async def test_register_then_verify_email_flow(client, capture_email):
    """Email register → 202 → code → verify → 200 tokens → login by email."""
    reg = await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "v@x.com", "password": "hpw123", "salt_frontend": "abc",
              "name": "Test User"},
    )
    assert reg.status_code == 202

    code = capture_email.last_code  # 6-digit code pulled from the captured verification email
    assert code

    verify = await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "v@x.com", "code": code}
    )
    assert verify.status_code == 200
    assert "access_token" in verify.json() and "refresh_token" in verify.json()

    login = await client.post("/api/v1/auth/login", data={"username": "v@x.com", "password": "hpw123"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_register_then_verify_phone_flow(client, capture_sms):
    """Phone register → 202 → SMS code → verify → 200 tokens → login by phone."""
    reg = await client.post(
        "/api/v1/auth/register",
        json={"type": "phone", "value": PHONE, "password": "hpw123", "salt_frontend": "abc",
              "name": "Test User"},
    )
    assert reg.status_code == 202

    code = capture_sms.last_code  # 6-digit code pulled from the captured verification SMS
    assert code

    verify = await client.post(
        "/api/v1/auth/verify", json={"type": "phone", "value": PHONE, "code": code}
    )
    assert verify.status_code == 200
    assert "access_token" in verify.json() and "refresh_token" in verify.json()

    login = await client.post("/api/v1/auth/login", data={"username": PHONE, "password": "hpw123"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_verify_wrong_code_400(client, capture_email):
    """A wrong code returns 400 (pending survives until the attempt cap)."""
    await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "w@x.com", "password": "hpw123", "salt_frontend": "abc",
              "name": "Test User"},
    )
    res = await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "w@x.com", "code": "000000"}
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_verify_stale_pending_without_name_returns_400(client, redis):
    """A pre-required-name pending with name=None is burned and verify returns 400 (no 500)."""
    from app.repositories.verification_repository import VerificationRepository
    repo = VerificationRepository(redis)
    code = await repo.issue_registration(
        type_="email", value="stale@x.com", password_hash="h", name=None
    )
    res = await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "stale@x.com", "code": code}
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_verify_unknown_identifier_400(client):
    """Verify with no pending registration returns 400."""
    res = await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "ghost@x.com", "code": "123456"}
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_attempt_cap_burns_pending(client, capture_email):
    """After MAX_OTP_ATTEMPTS wrong codes the pending is burned; the real code then 400s."""
    await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "cap@x.com", "password": "hpw123", "salt_frontend": "abc",
              "name": "Test User"},
    )
    real_code = capture_email.last_code
    for _ in range(MAX_OTP_ATTEMPTS):
        bad = await client.post(
            "/api/v1/auth/verify", json={"type": "email", "value": "cap@x.com", "code": "000000"}
        )
        assert bad.status_code == 400
    burned = await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "cap@x.com", "code": real_code}
    )
    assert burned.status_code == 400


@pytest.mark.asyncio
async def test_resend_email_sends_new_code(client, capture_email):
    """Resend mints a fresh code for a still-pending email registration."""
    await client.post(
        "/api/v1/auth/register",
        json={"type": "email", "value": "r@x.com", "password": "hpw123", "salt_frontend": "abc",
              "name": "Test User"},
    )
    first = capture_email.last_code
    res = await client.post(
        "/api/v1/auth/resend-verification", json={"type": "email", "value": "r@x.com"}
    )
    assert res.status_code == 202
    assert capture_email.last_code and capture_email.last_code != first


@pytest.mark.asyncio
async def test_resend_phone_sends_new_code(client, capture_sms):
    """Resend mints a fresh code for a still-pending phone registration."""
    await client.post(
        "/api/v1/auth/register",
        json={"type": "phone", "value": PHONE, "password": "hpw123", "salt_frontend": "abc",
              "name": "Test User"},
    )
    first = capture_sms.last_code
    res = await client.post(
        "/api/v1/auth/resend-verification", json={"type": "phone", "value": PHONE}
    )
    assert res.status_code == 202
    assert capture_sms.last_code and capture_sms.last_code != first


@pytest.mark.asyncio
async def test_resend_no_pending_returns_404(client):
    """Resend returns 404 when no pending registration exists for the identifier."""
    res = await client.post(
        "/api/v1/auth/resend-verification", json={"type": "email", "value": "ghost@x.com"}
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_resend_malformed_identifier_returns_422(client):
    """Resend with a malformed identifier returns 422 instead of raising a 500."""
    res = await client.post(
        "/api/v1/auth/resend-verification", json={"type": "email", "value": "not-an-email"}
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_register_taken_email_returns_409(client, capture_email):
    """Register returns 409 when the email already backs a verified account."""
    payload = {"type": "email", "value": "taken@x.com", "password": "hpw123", "salt_frontend": "abc",
               "name": "Test User"}
    await client.post("/api/v1/auth/register", json=payload)
    code = capture_email.last_code
    await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "taken@x.com", "code": code}
    )
    res = await client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_resend_taken_email_returns_409(client, capture_email):
    """Resend returns 409 when the email already backs a verified account."""
    payload = {"type": "email", "value": "done@x.com", "password": "hpw123", "salt_frontend": "abc",
               "name": "Test User"}
    await client.post("/api/v1/auth/register", json=payload)
    code = capture_email.last_code
    await client.post(
        "/api/v1/auth/verify", json={"type": "email", "value": "done@x.com", "code": code}
    )
    res = await client.post(
        "/api/v1/auth/resend-verification", json={"type": "email", "value": "done@x.com"}
    )
    assert res.status_code == 409
