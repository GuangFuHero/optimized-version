"""Integration tests for adding a verified contact to a logged-in account."""
import pytest

from app.core.security import create_access_token, generate_salt, get_password_hash
from app.repositories.verification_repository import VerificationRepository
from app.services.auth_account import create_account


async def _logged_in_email_user(db_session):
    """Create an email account and return (user, bearer_headers)."""
    user = await create_account(
        db_session, contact_type="email", value="owner@x.com",
        password_hash=get_password_hash("secret", generate_salt()), name="Tester",
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
    await create_account(db_session, contact_type="phone", value="+886912345678", password_hash="h",
                         name="Tester")
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


@pytest.mark.asyncio
async def test_add_second_email_blocked_409(client, db_session):
    """A user who already has an email cannot add a SECOND, different email → 409."""
    _, headers = await _logged_in_email_user(db_session)  # already owns owner@x.com
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "email", "value": "second@x.com"})
    assert res.status_code == 409
    # pin the 409 to the per-type limit (not the cross-account is_value_taken path)
    assert "already has" in res.json()["detail"]


@pytest.mark.asyncio
async def test_add_second_phone_blocked_409(client, db_session, capture_sms):
    """A user who already has a phone cannot add a SECOND, different phone → 409."""
    user = await create_account(
        db_session, contact_type="phone", value="0912345678",
        password_hash=get_password_hash("secret", generate_salt()), name="Tester",
    )
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.uuid)})}"}
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0911222333"})
    assert res.status_code == 409
    assert "already has" in res.json()["detail"]


@pytest.mark.asyncio
async def test_email_user_can_add_phone(client, db_session, capture_sms):
    """Cross-type is allowed: an email user can add AND verify a phone (200)."""
    _, headers = await _logged_in_email_user(db_session)  # owns an email, no phone
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0912345678"})
    assert res.status_code == 202
    code = capture_sms.last_code
    assert code
    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "phone", "value": "0912345678", "code": code})
    assert v.status_code == 200


@pytest.mark.asyncio
async def test_verify_second_email_blocked_even_if_add_bypassed(client, db_session, redis):
    """The authoritative check is at verify: a pending second email still 409s on verify.

    We seed the pending code straight into redis (bypassing add_contact) to prove verify_contact
    itself rejects a second contact of an already-owned type.
    """
    user, headers = await _logged_in_email_user(db_session)  # already owns owner@x.com
    code = await VerificationRepository(redis).issue_contact_verification(
        user_uuid=str(user.uuid), type_="email", value="second@x.com")
    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "email", "value": "second@x.com", "code": code})
    assert v.status_code == 409
    assert "already has" in v.json()["detail"]


@pytest.mark.asyncio
async def test_verify_second_email_409_does_not_consume_code(client, db_session, redis):
    """A 409 on verify_contact (already-owned type) must NOT burn the pending code.

    The conflict checks run BEFORE consume_contact_verification, so the redis pending key survives the
    409 and the user can retry once the conflict clears.
    """
    user, headers = await _logged_in_email_user(db_session)  # already owns owner@x.com
    repo = VerificationRepository(redis)
    code = await repo.issue_contact_verification(
        user_uuid=str(user.uuid), type_="email", value="second@x.com")
    key = f"pending_contact:{user.uuid}:email:second@x.com"
    assert await redis.exists(key)

    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "email", "value": "second@x.com", "code": code})
    assert v.status_code == 409
    assert "already has" in v.json()["detail"]
    # the pending code was NOT consumed by the 409 path
    assert await redis.exists(key)


@pytest.mark.asyncio
async def test_resend_second_type_blocked_409(client, db_session):
    """Resend for an already-owned type is also blocked → 409 (symmetric with add/verify)."""
    _, headers = await _logged_in_email_user(db_session)  # already owns owner@x.com
    res = await client.post("/api/v1/auth/contacts/resend", headers=headers,
                            json={"type": "email", "value": "second@x.com"})
    assert res.status_code == 409
    assert "already has" in res.json()["detail"]
