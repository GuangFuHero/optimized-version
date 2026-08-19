"""Tests for account profile: replacing/deleting contacts and reading one's own profile.

Feature 012 (Spec/012-account-profile/decisions.md ADR-085~089, 098).

The security core is step-up: holding a session must not be enough to swap the account's
recovery channel, or a stolen session becomes permanent account takeover via "forgot
password".

Helpers hand back the uuid as a plain `str`, captured at creation: `db_session` is
`expire_on_commit=True` (tests/conftest.py), so any later commit — including one made
inside a request under test — expires every loaded attribute, and re-reading `user.uuid`
then attempts a lazy reload that is invalid under AsyncSession (MissingGreenlet).
"""

import pytest
from sqlalchemy import select

from app.core.security import generate_salt, get_password_hash
from app.models.auth import UserContact
from app.services.auth_account import create_account
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio

_PASSWORD = "secret"
CONTACTS_URL = "/api/v1/auth/contacts"


async def _headers(redis, user_uuid) -> dict:
    """Bearer headers backed by a live session, the way production mints them (ADR-099)."""
    return await auth_headers_for(redis, user_uuid)


async def _password_user(db, redis, email: str = "owner@x.com"):
    """An account with an email contact and a password identity."""
    user = await create_account(
        db, contact_type="email", value=email,
        password_hash=get_password_hash(_PASSWORD, generate_salt()), name="Tester",
    )
    return str(user.uuid), await _headers(redis, user.uuid)


async def _sso_only_user(db, redis, email: str = "sso@x.com"):
    """An account with an email contact and ONLY a Google identity (no password)."""
    user = await create_account(
        db, contact_type="email", value=email, name="SSO",
        provider="google", provider_subject="g-123",
    )
    return str(user.uuid), await _headers(redis, user.uuid)


async def _contacts_of(db, user_uuid, type_: str = "email") -> list[str]:
    rows = await db.scalars(
        select(UserContact.value).where(
            UserContact.user_uuid == user_uuid, UserContact.type == type_
        )
    )
    return list(rows)


# ──────────────────────────────────────────────
# Step-up: the core protection (ADR-086)
# ──────────────────────────────────────────────

async def test_replacing_a_contact_without_step_up_is_refused(client, db_session, redis, capture_email):
    """A stolen session alone must not be able to swap the recovery channel."""
    user_uuid, headers = await _password_user(db_session, redis)

    res = await client.post(CONTACTS_URL, headers=headers,
                            json={"type": "email", "value": "attacker@evil.com"})

    assert res.status_code == 422, res.text
    assert await _contacts_of(db_session, user_uuid) == ["owner@x.com"]


async def test_replacing_with_a_wrong_password_is_refused_and_burns_no_code(
    client, db_session, redis, capture_email
):
    """A wrong step-up password must 401 without issuing a code to the new address."""
    _, headers = await _password_user(db_session, redis)

    res = await client.post(CONTACTS_URL, headers=headers, json={
        "type": "email", "value": "new@x.com", "step_up": {"password": "wrong"},
    })

    assert res.status_code == 401, res.text
    assert capture_email.last_code is None


async def test_first_contact_of_a_type_needs_no_step_up(client, db_session, redis, capture_sms):
    """Adding a phone to an email-only account is not a replacement — no extra gate."""
    _, headers = await _password_user(db_session, redis)

    res = await client.post(CONTACTS_URL, headers=headers,
                            json={"type": "phone", "value": "0912345678"})

    assert res.status_code == 202, res.text
    assert capture_sms.last_code


async def test_sso_only_account_gets_a_code_on_the_old_channel(client, db_session, redis, capture_email):
    """No password to check, so the account proves it still holds the old channel."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await client.post(CONTACTS_URL, headers=headers,
                            json={"type": "email", "value": "new@x.com"})

    assert res.status_code == 422, res.text
    # the code went to the OLD address, not the new one
    assert capture_email.messages[-1][0] == "sso@x.com"
    assert capture_email.last_code


async def test_sso_only_account_replaces_with_the_old_channel_code(client, db_session, redis, capture_email):
    """Full SSO-only replacement path."""
    user_uuid, headers = await _sso_only_user(db_session, redis)
    await client.post(CONTACTS_URL, headers=headers, json={"type": "email", "value": "new@x.com"})
    old_code = capture_email.last_code

    res = await client.post(CONTACTS_URL, headers=headers, json={
        "type": "email", "value": "new@x.com", "step_up": {"old_channel_code": old_code},
    })

    assert res.status_code == 202, res.text


# ──────────────────────────────────────────────
# Replacement is atomic and switches the login identifier
# ──────────────────────────────────────────────

async def _start_replacement(client, headers, new_value: str, capture_email):
    res = await client.post(CONTACTS_URL, headers=headers, json={
        "type": "email", "value": new_value, "step_up": {"password": _PASSWORD},
    })
    assert res.status_code == 202, res.text
    return capture_email.last_code


async def test_replacement_swaps_the_row_atomically(client, db_session, redis, capture_email):
    """Verify commits the swap: the old row is gone and the new one is there, never both."""
    user_uuid, headers = await _password_user(db_session, redis)
    code = await _start_replacement(client, headers, "new@x.com", capture_email)

    res = await client.post(f"{CONTACTS_URL}/verify", headers=headers,
                            json={"type": "email", "value": "new@x.com", "code": code})

    assert res.status_code == 200, res.text
    assert await _contacts_of(db_session, user_uuid) == ["new@x.com"]


async def test_after_replacement_the_new_address_logs_in_and_the_old_does_not(
    client, db_session, redis, capture_email
):
    """The contact IS the login identifier — the swap must move it."""
    _, headers = await _password_user(db_session, redis)
    code = await _start_replacement(client, headers, "new@x.com", capture_email)
    await client.post(f"{CONTACTS_URL}/verify", headers=headers,
                      json={"type": "email", "value": "new@x.com", "code": code})

    new_login = await client.post("/api/v1/auth/login",
                                  data={"username": "new@x.com", "password": _PASSWORD})
    old_login = await client.post("/api/v1/auth/login",
                                  data={"username": "owner@x.com", "password": _PASSWORD})

    assert new_login.status_code == 200, new_login.text
    assert old_login.status_code == 401


async def test_replacement_notifies_the_old_channel_with_a_masked_value(
    client, db_session, redis, capture_email
):
    """The only mechanism that lets a victim notice (ADR-087); the new value is masked."""
    _, headers = await _password_user(db_session, redis)
    code = await _start_replacement(client, headers, "new@x.com", capture_email)

    await client.post(f"{CONTACTS_URL}/verify", headers=headers,
                      json={"type": "email", "value": "new@x.com", "code": code})

    to, _subject, _html, text = capture_email.messages[-1]
    assert to == "owner@x.com"          # the OLD address is told
    assert "new@x.com" not in text      # ...but not shown the full new value
    assert "n***@***.com" in text


async def test_replacement_does_not_revoke_other_sessions(client, db_session, redis, capture_email):
    """Changing a phone number is not a credential leak (ADR-085) — sessions survive."""
    _, headers = await _password_user(db_session, redis)
    login = await client.post("/api/v1/auth/login",
                              data={"username": "owner@x.com", "password": _PASSWORD})
    refresh_token = login.json()["refresh_token"]
    code = await _start_replacement(client, headers, "new@x.com", capture_email)
    await client.post(f"{CONTACTS_URL}/verify", headers=headers,
                      json={"type": "email", "value": "new@x.com", "code": code})

    still_valid = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})

    assert still_valid.status_code == 200, still_valid.text


# ──────────────────────────────────────────────
# Delete: the account must keep a way back in (ADR-088)
# ──────────────────────────────────────────────

async def test_deleting_the_last_contact_without_sso_is_refused(client, db_session, redis):
    """Losing the last contact with no SSO identity locks the account out for good."""
    user_uuid, headers = await _password_user(db_session, redis)

    res = await client.delete(f"{CONTACTS_URL}/email", headers=headers)

    assert res.status_code == 409, res.text
    assert await _contacts_of(db_session, user_uuid) == ["owner@x.com"]


async def test_deleting_the_last_contact_is_allowed_with_an_sso_identity(client, db_session, redis):
    """Google login still gets them in, so there is a way back."""
    user_uuid, headers = await _sso_only_user(db_session, redis)

    res = await client.delete(f"{CONTACTS_URL}/email", headers=headers)

    assert res.status_code == 204, res.text
    assert await _contacts_of(db_session, user_uuid) == []


async def test_deleting_one_of_two_contacts_is_allowed(client, db_session, redis, capture_sms):
    """A second channel remains, so the guard does not apply."""
    user_uuid, headers = await _password_user(db_session, redis)
    await client.post(CONTACTS_URL, headers=headers, json={"type": "phone", "value": "0912345678"})
    await client.post(f"{CONTACTS_URL}/verify", headers=headers, json={
        "type": "phone", "value": "0912345678", "code": capture_sms.last_code,
    })

    res = await client.delete(f"{CONTACTS_URL}/phone", headers=headers)

    assert res.status_code == 204, res.text
    assert await _contacts_of(db_session, user_uuid, "email") == ["owner@x.com"]


async def test_deleting_a_contact_type_the_user_does_not_have(client, db_session, redis):
    """Nothing to delete → 404, not a silent success."""
    _, headers = await _password_user(db_session, redis)

    res = await client.delete(f"{CONTACTS_URL}/phone", headers=headers)

    assert res.status_code == 404, res.text


# ──────────────────────────────────────────────
# GET /users/me
# ──────────────────────────────────────────────

async def test_users_me_returns_contacts_and_login_methods(client, db_session, redis):
    """The frontend needs both: to show current values and to pick the step-up path."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await client.get("/api/v1/users/me", headers=headers)

    body = res.json()
    assert res.status_code == 200, res.text
    assert [c["value"] for c in body["contacts"]] == ["sso@x.com"]
    assert [i["provider"] for i in body["login_methods"]] == ["google"]


async def test_users_me_never_exposes_provider_subject(client, db_session, redis):
    """provider_subject is the SSO provider's internal id — the frontend has no use for it."""
    _, headers = await _sso_only_user(db_session, redis)

    res = await client.get("/api/v1/users/me", headers=headers)

    assert "g-123" not in res.text
    assert all("provider_subject" not in i for i in res.json()["login_methods"])


async def test_users_me_does_not_mask_your_own_contacts(client, db_session, redis):
    """Masking protects other people's PII; your own profile shows real values."""
    _, headers = await _password_user(db_session, redis)

    res = await client.get("/api/v1/users/me", headers=headers)

    assert res.json()["contacts"][0]["value"] == "owner@x.com"
