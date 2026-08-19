"""Integration tests for adding a verified contact to a logged-in account."""
import pytest

from app.core.security import generate_salt, get_password_hash
from app.repositories.verification_repository import VerificationRepository
from app.services.auth_account import create_account
from tests.conftest import auth_headers_for


async def _logged_in_email_user(db_session, redis):
    """Create an email account and return (user, bearer_headers)."""
    user = await create_account(
        db_session, contact_type="email", value="owner@x.com",
        password_hash=get_password_hash("secret", generate_salt()), name="Tester",
    )
    headers = await auth_headers_for(redis, user.uuid)
    return user, headers


@pytest.mark.asyncio
async def test_add_phone_then_verify_then_login(client, db_session, redis, capture_sms):
    """Email user adds a phone, verifies via SMS code, then logs in by phone."""
    _, headers = await _logged_in_email_user(db_session, redis)
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
async def test_add_contact_collision_409(client, db_session, redis):
    """Adding a value already verified by another account → 409."""
    # someone else already owns this phone
    await create_account(db_session, contact_type="phone", value="+886912345678", password_hash="h",
                         name="Tester")
    _, headers = await _logged_in_email_user(db_session, redis)
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0912345678"})  # normalizes to +886912345678
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_verify_wrong_code_400(client, db_session, redis, capture_sms):
    """Wrong code on verify → 400."""
    _, headers = await _logged_in_email_user(db_session, redis)
    await client.post("/api/v1/auth/contacts", headers=headers, json={"type": "phone", "value": "0912345678"})
    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "phone", "value": "0912345678", "code": "000000"})
    assert v.status_code == 400


@pytest.mark.asyncio
async def test_resend_then_old_code_dead(client, db_session, redis, capture_sms):
    """Resend issues a new code; the old one no longer verifies."""
    _, headers = await _logged_in_email_user(db_session, redis)
    await client.post("/api/v1/auth/contacts", headers=headers, json={"type": "phone", "value": "0912345678"})
    old = capture_sms.last_code
    r = await client.post("/api/v1/auth/contacts/resend", headers=headers,
                          json={"type": "phone", "value": "0912345678"})
    assert r.status_code == 202 and capture_sms.last_code != old
    bad = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                            json={"type": "phone", "value": "0912345678", "code": old})
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_resend_no_pending_404(client, db_session, redis):
    """Resend with no pending contact → 404."""
    _, headers = await _logged_in_email_user(db_session, redis)
    r = await client.post("/api/v1/auth/contacts/resend", headers=headers,
                          json={"type": "phone", "value": "0911222333"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_add_second_email_requires_step_up(client, db_session, redis, capture_email):
    """Feature 012 turned "second email → 409" into a REPLACEMENT gated by step-up (ADR-086).

    The account still cannot end up with two emails, but the refusal is now 422-asking-for-
    proof rather than a flat 409 — and crucially no code reaches the new address.
    """
    _, headers = await _logged_in_email_user(db_session, redis)  # already owns owner@x.com
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "email", "value": "second@x.com"})
    assert res.status_code == 422
    assert capture_email.last_code is None


@pytest.mark.asyncio
async def test_add_second_phone_requires_step_up(client, db_session, redis, capture_sms):
    """Same replacement gate on the phone side (ADR-086)."""
    user = await create_account(
        db_session, contact_type="phone", value="0912345678",
        password_hash=get_password_hash("secret", generate_salt()), name="Tester",
    )
    headers = await auth_headers_for(redis, user.uuid)
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0911222333"})
    assert res.status_code == 422
    assert capture_sms.last_code is None


@pytest.mark.asyncio
async def test_email_user_can_add_phone(client, db_session, redis, capture_sms):
    """Cross-type is allowed: an email user can add AND verify a phone (200)."""
    _, headers = await _logged_in_email_user(db_session, redis)  # owns an email, no phone
    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "phone", "value": "0912345678"})
    assert res.status_code == 202
    code = capture_sms.last_code
    assert code
    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "phone", "value": "0912345678", "code": code})
    assert v.status_code == 200


@pytest.mark.asyncio
async def test_a_code_is_never_issued_to_a_new_address_without_step_up(
    client, db_session, redis, capture_email
):
    """Where the replacement gate actually lives (ADR-086).

    Feature 012 puts step-up at issue-time, not at verify, so this is the invariant that
    protects the account: an attacker holding only a session never gets a code delivered to
    an address they control, and verify is unreachable without one. (The previous version of
    this test seeded a code straight into redis to prove verify re-checked — that bypass
    cannot occur in practice, because issuing the code is itself the gated step.)
    """
    _, headers = await _logged_in_email_user(db_session, redis)  # already owns owner@x.com

    res = await client.post("/api/v1/auth/contacts", headers=headers,
                            json={"type": "email", "value": "attacker@evil.com"})

    assert res.status_code == 422
    assert capture_email.messages == []


@pytest.mark.asyncio
async def test_verify_409_does_not_consume_code(client, db_session, redis):
    """A 409 on verify must NOT burn the pending code.

    The conflict check runs BEFORE consume_contact_verification, so the redis pending key
    survives and the user can retry once the conflict clears. Feature 012 made same-type
    adds a legal replacement, so the surviving 409 path is the cross-account one: the value
    is already verified by somebody else.
    """
    user, headers = await _logged_in_email_user(db_session, redis)  # already owns owner@x.com
    # captured before the next commit: db_session is expire_on_commit=True, so creating the
    # second account below would expire user.uuid and re-reading it raises MissingGreenlet
    user_uuid = str(user.uuid)
    await create_account(
        db_session, contact_type="email", value="taken@x.com",
        password_hash=get_password_hash("secret", generate_salt()), name="Other",
    )
    repo = VerificationRepository(redis)
    code = await repo.issue_contact_verification(
        user_uuid=user_uuid, type_="email", value="taken@x.com")
    key = f"pending_contact:{user_uuid}:email:taken@x.com"
    assert await redis.exists(key)

    v = await client.post("/api/v1/auth/contacts/verify", headers=headers,
                          json={"type": "email", "value": "taken@x.com", "code": code})
    assert v.status_code == 409
    # the pending code was NOT consumed by the 409 path
    assert await redis.exists(key)


@pytest.mark.asyncio
async def test_resend_for_a_value_owned_by_someone_else_is_409(client, db_session, redis):
    """Resend still refuses a value another account has verified.

    It no longer refuses merely because the caller owns that contact type — under feature
    012 that is a replacement in progress, and resend has to work for it.
    """
    _, headers = await _logged_in_email_user(db_session, redis)
    await create_account(
        db_session, contact_type="email", value="taken@x.com",
        password_hash=get_password_hash("secret", generate_salt()), name="Other",
    )
    res = await client.post("/api/v1/auth/contacts/resend", headers=headers,
                            json={"type": "email", "value": "taken@x.com"})
    assert res.status_code == 409
