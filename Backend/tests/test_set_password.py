"""Endpoint tests for SSO-only users setting a first password."""
import pytest

from app.core.security import create_access_token
from app.services.auth_account import create_account

SALT = "abc"


async def _google_user(db_session):
    user = await create_account(
        db_session, name="G", provider="google", provider_subject="g-sp-1",
        contact_type="email", value="g@x.com")
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.uuid)})}"}
    return user, headers


@pytest.mark.asyncio
async def test_set_password_then_login_works(client, db_session):
    """An SSO-only user can set a first password and then log in with it."""
    _, headers = await _google_user(db_session)
    res = await client.post("/api/v1/auth/set-password", headers=headers,
                            json={"password": "hashedpw", "salt_frontend": SALT})
    assert res.status_code == 204
    # email + password login now works
    login = await client.post("/api/v1/auth/login",
                              data={"username": "g@x.com", "password": "hashedpw"})
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_salt_switches_fake_to_real(client, db_session):
    """Setting a password switches the salt endpoint from the deterministic fake to the real salt."""
    _, headers = await _google_user(db_session)
    before = (await client.get("/api/v1/auth/salt/g@x.com")).json()["salt_frontend"]
    await client.post("/api/v1/auth/set-password", headers=headers,
                      json={"password": "hashedpw", "salt_frontend": SALT})
    after = (await client.get("/api/v1/auth/salt/g@x.com")).json()["salt_frontend"]
    assert after == SALT and after != before  # real stored salt, not the deterministic fake


@pytest.mark.asyncio
async def test_set_password_twice_409(client, db_session):
    """Setting a password a second time is rejected with 409."""
    _, headers = await _google_user(db_session)
    await client.post("/api/v1/auth/set-password", headers=headers,
                      json={"password": "hashedpw", "salt_frontend": SALT})
    res = await client.post("/api/v1/auth/set-password", headers=headers,
                            json={"password": "otherpw", "salt_frontend": SALT})  # >=6 chars (min_length)
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_set_password_requires_auth(client):
    """Setting a password without a Bearer token is rejected with 401."""
    res = await client.post("/api/v1/auth/set-password",
                            json={"password": "hashedpw", "salt_frontend": SALT})
    assert res.status_code == 401
