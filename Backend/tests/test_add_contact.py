"""Integration tests for adding a verified contact to a logged-in account."""
import pytest

from app.core.security import create_access_token, generate_salt, get_password_hash
from app.services.auth_account import create_account


async def _logged_in_email_user(db_session):
    """Create an email account and return (user, bearer_headers)."""
    user = await create_account(
        db_session, contact_type="email", value="owner@x.com",
        password_hash=get_password_hash("secret", generate_salt()),
    )
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.uuid)})}"}
    return user, headers


@pytest.mark.asyncio
async def test_add_phone_then_verify_then_login(client, db_session, capture_sms):
    """Email user adds a phone, verifies via SMS code, then logs in by phone."""
    _, headers = await _logged_in_email_user(db_session)
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0912345678"})
    assert res.status_code == 202
    code = capture_sms.last_code
    assert code
    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "phone", "value": "0912345678", "code": code})
    assert v.status_code == 200
    # phone now logs into the SAME account
    login = await client.post("/api/v1/auth/login", data={"username": "0912345678", "password": "secret"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_add_contact_requires_auth(client):
    """Unauthenticated add-contact → 401."""
    res = await client.post("/api/v1/auth/contacts", json={"type": "phone", "value": "0912345678"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_add_contact_collision_409(client, db_session):
    """Adding a value already verified by another account → 409."""
    # someone else already owns this phone
    await create_account(db_session, contact_type="phone", value="+886912345678", password_hash="h")
    _, headers = await _logged_in_email_user(db_session)
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0912345678"})  # normalizes to +886912345678
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_verify_wrong_code_400(client, db_session, capture_sms):
    """Wrong code on verify → 400."""
    _, headers = await _logged_in_email_user(db_session)
    await client.post("/api/v1/auth/contacts", headers=headers, json={"type": "phone", "value": "0912345678"})
    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "phone", "value": "0912345678", "code": "000000"})
    assert v.status_code == 400


@pytest.mark.asyncio
async def test_resend_then_old_code_dead(client, db_session, capture_sms):
    """Resend issues a new code; the old one no longer verifies."""
    _, headers = await _logged_in_email_user(db_session)
    await client.post("/api/v1/auth/contacts", headers=headers, json={"type": "phone", "value": "0912345678"})
    old = capture_sms.last_code
    r = await client.post("/api/v1/auth/contacts/resend", headers=headers,
                          json={"type": "phone", "value": "0912345678"})
    assert r.status_code == 202 and capture_sms.last_code != old
    bad = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                            json={"type": "phone", "value": "0912345678", "code": old})
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_resend_no_pending_404(client, db_session):
    """Resend with no pending contact → 404."""
    _, headers = await _logged_in_email_user(db_session)
    r = await client.post("/api/v1/auth/contacts/resend", headers=headers,
                          json={"type": "phone", "value": "0911222333"})
    assert r.status_code == 404
