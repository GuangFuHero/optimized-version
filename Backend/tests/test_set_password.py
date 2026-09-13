"""Endpoint tests for SSO-only users setting a first password.

Every set is a two-call flow since ADR-215: the first call delivers a step-up code to the
account's own contact and answers 422, the second spends it. A session alone cannot mint a
credential that would outlive it.
"""
import pytest

from app.services.auth_account import create_account
from tests.conftest import auth_headers_for

SALT = "abc"
SET_PASSWORD_URL = "/api/v1/auth/set-password"


async def _google_user(db_session, redis):
    user = await create_account(
        db_session, name="G", provider="google", provider_subject="g-sp-1",
        contact_type="email", value="g@x.com")
    headers = await auth_headers_for(redis, user.uuid)
    return user, headers


async def _set_password(client, headers, capture_email, password="hashedpw", salt=SALT):
    """Run the full ADR-215 flow: ask, read the code off the account's contact, set."""
    body = {"password": password, "salt_frontend": salt}
    asked = await client.post(SET_PASSWORD_URL, headers=headers, json=body)
    assert asked.status_code == 422, asked.text
    return await client.post(
        SET_PASSWORD_URL, headers=headers,
        json={**body, "step_up": {"old_channel_code": capture_email.last_code}},
    )


@pytest.mark.asyncio
async def test_set_password_then_login_works(client, db_session, redis, capture_email):
    """An SSO-only user can set a first password and then log in with it."""
    _, headers = await _google_user(db_session, redis)
    res = await _set_password(client, headers, capture_email)
    assert res.status_code == 204, res.text
    # email + password login now works
    login = await client.post("/api/v1/auth/login",
                              data={"username": "g@x.com", "password": "hashedpw"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_salt_switches_fake_to_real(client, db_session, redis, capture_email):
    """Setting a password switches the salt endpoint from the deterministic fake to the real salt."""
    _, headers = await _google_user(db_session, redis)
    before = (await client.get("/api/v1/auth/salt/g@x.com")).json()["salt_frontend"]
    await _set_password(client, headers, capture_email)
    after = (await client.get("/api/v1/auth/salt/g@x.com")).json()["salt_frontend"]
    assert after == SALT and after != before  # real stored salt, not the deterministic fake


@pytest.mark.asyncio
async def test_set_password_twice_409(client, db_session, redis, capture_email):
    """Setting a password a second time is rejected with 409, before any step-up is asked for."""
    user, headers = await _google_user(db_session, redis)
    user_uuid = str(user.uuid)  # capture before set-password commits and expires the instance
    await _set_password(client, headers, capture_email)
    # set-password revokes every session (ADR-160), so the second call needs a fresh one
    headers = await auth_headers_for(redis, user_uuid)
    res = await client.post(SET_PASSWORD_URL, headers=headers,
                            json={"password": "otherpw", "salt_frontend": SALT})  # >=6 chars (min_length)
    assert res.status_code == 409, res.text


@pytest.mark.asyncio
async def test_set_password_requires_auth(client):
    """Setting a password without a Bearer token is rejected with 401."""
    res = await client.post("/api/v1/auth/set-password",
                            json={"password": "hashedpw", "salt_frontend": SALT})
    assert res.status_code == 401
