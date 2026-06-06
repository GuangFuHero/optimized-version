"""Integration tests for logged-out forgot/reset password."""
import re

import pytest

from app.core.security import generate_salt, get_password_hash
from app.messaging.email import build_password_reset_email, build_sso_notice_email
from app.messaging.sms import build_password_reset_sms, build_sso_notice_sms
from app.repositories.verification_repository import VerificationRepository
from app.services.auth_account import create_account


async def _email_pw_user(db_session, email="owner@x.com", pw="secret"):
    """Create an email + password account."""
    return await create_account(
        db_session, contact_type="email", value=email,
        password_hash=get_password_hash(pw, generate_salt()), name="Tester")


# --- Task 2: VerificationRepository ---
@pytest.mark.asyncio
async def test_pwreset_issue_then_consume_roundtrip(redis):
    """A reset code can be issued and consumed once; wrong/replayed code returns None."""
    repo = VerificationRepository(redis)
    code = await repo.issue_password_reset(user_uuid="u-1", type_="email", value="a@x.com")
    assert code and len(code) == 6
    assert await repo.consume_password_reset(type_="email", value="a@x.com", code="000000") is None
    payload = await repo.consume_password_reset(type_="email", value="a@x.com", code=code)
    assert payload["user_uuid"] == "u-1"
    # consumed -> gone
    assert await repo.consume_password_reset(type_="email", value="a@x.com", code=code) is None


# --- Task 3: message builders ---
def test_reset_builders_carry_code_and_notice_has_none():
    """Reset builders carry the code; SSO-notice builders carry NO 6-digit code."""
    _, body = build_password_reset_email("123456")
    assert "123456" in body
    assert "123456" in build_password_reset_sms("123456")
    _, notice = build_sso_notice_email()
    assert not re.search(r"\d{6}", notice)
    assert not re.search(r"\d{6}", build_sso_notice_sms())


# --- Task 4: /auth/forgot-password ---
@pytest.mark.asyncio
async def test_forgot_unknown_account_silent_202(client, db_session, capture_email):
    """Unknown identifier -> 202 and nothing sent (anti-enumeration)."""
    r = await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "nobody@x.com"})
    assert r.status_code == 202
    assert capture_email.messages == []


@pytest.mark.asyncio
async def test_forgot_email_password_account_sends_code(client, db_session, capture_email):
    """Password account (email) -> 202 + a 6-digit reset code delivered."""
    await _email_pw_user(db_session)
    r = await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "owner@x.com"})
    assert r.status_code == 202
    assert capture_email.last_code is not None


@pytest.mark.asyncio
async def test_forgot_phone_password_account_sends_code(client, db_session, capture_sms):
    """Password account (phone) -> 202 + SMS reset code. Endpoint normalizes the local number."""
    # create_account does NOT normalize -> store the E.164 form the endpoint will look up
    await create_account(db_session, contact_type="phone", value="+886912345678",
                         password_hash=get_password_hash("secret", generate_salt()), name="T")
    r = await client.post("/api/v1/auth/forgot-password", json={"type": "phone", "value": "0912345678"})
    assert r.status_code == 202
    assert capture_sms.last_code is not None


@pytest.mark.asyncio
async def test_forgot_sso_only_sends_notice_no_code(client, db_session, capture_email):
    """SSO-only account (Google email, no password) -> 202 + a notice WITHOUT a code."""
    await create_account(db_session, name="G", provider="google", provider_subject="g-1",
                         contact_type="email", value="ssouser@x.com")
    r = await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "ssouser@x.com"})
    assert r.status_code == 202
    assert len(capture_email.messages) == 1     # a message WAS sent...
    assert capture_email.last_code is None      # ...but it carries NO code


@pytest.mark.asyncio
async def test_forgot_anti_enumeration_identical_response(client, db_session, capture_email):
    """Known and unknown identifiers return the identical status + body."""
    await _email_pw_user(db_session, email="real@x.com")
    known = await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "real@x.com"})
    unknown = await client.post("/api/v1/auth/forgot-password",
                                json={"type": "email", "value": "ghost@x.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


# --- Task 5: /auth/reset-password ---
@pytest.mark.asyncio
async def test_reset_happy_path_email(client, db_session, capture_email):
    """Forgot -> code -> reset -> 204; old password fails, new password logs in."""
    await _email_pw_user(db_session)
    await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "owner@x.com"})
    code = capture_email.last_code
    assert code
    r = await client.post("/api/v1/auth/reset-password", json={
        "type": "email", "value": "owner@x.com", "code": code,
        "new_password": "newsecret", "salt_frontend": "webtest"})
    assert r.status_code == 204
    old = await client.post("/api/v1/auth/login", data={"username": "owner@x.com", "password": "secret"})
    assert old.status_code == 401
    new = await client.post("/api/v1/auth/login", data={"username": "owner@x.com", "password": "newsecret"})
    assert new.status_code == 200


@pytest.mark.asyncio
async def test_reset_happy_path_phone(client, db_session, capture_sms):
    """Phone round-trip: forgot (local form) -> SMS code -> reset -> login by phone with the new password."""
    await create_account(db_session, contact_type="phone", value="+886912345678",
                         password_hash=get_password_hash("secret", generate_salt()), name="P")
    await client.post("/api/v1/auth/forgot-password", json={"type": "phone", "value": "0912345678"})
    code = capture_sms.last_code
    assert code
    r = await client.post("/api/v1/auth/reset-password", json={
        "type": "phone", "value": "0912345678", "code": code,
        "new_password": "newsecret", "salt_frontend": "webtest"})
    assert r.status_code == 204
    new = await client.post("/api/v1/auth/login", data={"username": "0912345678", "password": "newsecret"})
    assert new.status_code == 200


@pytest.mark.asyncio
async def test_forgot_sso_only_and_unknown_identical(client, db_session, capture_email):
    """The subtlest branch: SSO-only and unknown return identical status + body (no existence leak)."""
    await create_account(db_session, name="G", provider="google", provider_subject="g-3",
                         contact_type="email", value="ssouser@x.com")
    sso = await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "ssouser@x.com"})
    unknown = await client.post("/api/v1/auth/forgot-password",
                                json={"type": "email", "value": "ghost@x.com"})
    assert sso.status_code == unknown.status_code == 202
    assert sso.json() == unknown.json()


@pytest.mark.asyncio
async def test_reset_wrong_code_400(client, db_session, capture_email):
    """A wrong code -> 400."""
    await _email_pw_user(db_session)
    await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "owner@x.com"})
    r = await client.post("/api/v1/auth/reset-password", json={
        "type": "email", "value": "owner@x.com", "code": "000000",
        "new_password": "newsecret", "salt_frontend": "webtest"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_reset_no_pending_400(client, db_session):
    """Reset with no pending request -> 400."""
    await _email_pw_user(db_session)
    r = await client.post("/api/v1/auth/reset-password", json={
        "type": "email", "value": "owner@x.com", "code": "123456",
        "new_password": "newsecret", "salt_frontend": "webtest"})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_reset_revokes_sessions(client, db_session, capture_email):
    """A refresh token issued before the reset is dead afterwards."""
    await _email_pw_user(db_session)
    login = await client.post("/api/v1/auth/login", data={"username": "owner@x.com", "password": "secret"})
    old_refresh = login.json()["refresh_token"]
    await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "owner@x.com"})
    code = capture_email.last_code
    await client.post("/api/v1/auth/reset-password", json={
        "type": "email", "value": "owner@x.com", "code": code,
        "new_password": "newsecret", "salt_frontend": "webtest"})
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_sso_only_cannot_reset(client, db_session, capture_email):
    """An SSO-only account never receives a code, so any reset attempt -> 400."""
    await create_account(db_session, name="G", provider="google", provider_subject="g-2",
                         contact_type="email", value="ssouser@x.com")
    await client.post("/api/v1/auth/forgot-password", json={"type": "email", "value": "ssouser@x.com"})
    r = await client.post("/api/v1/auth/reset-password", json={
        "type": "email", "value": "ssouser@x.com", "code": "123456",
        "new_password": "newsecret", "salt_frontend": "webtest"})
    assert r.status_code == 400
