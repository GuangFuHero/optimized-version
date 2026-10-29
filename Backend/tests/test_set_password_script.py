"""Tests for scripts/set_password.py: a password set on the command line signs in from the login page.

The back-office test accounts in the mock seed carry no password in the repo (their mock password
would sign anyone in to the public back office), so one is set on the VM with this script. What
matters is that the browser's login form accepts it, so the tests sign in the way the form does:
ask the API for the account's frontend salt, derive the PBKDF2 hex from it, and post that.
"""

import hashlib
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app.models.auth import User, UserContact, UserIdentity
from scripts.set_password import frontend_hash, set_password

EMAIL = "asuper01@mock.test"


def _browser_hash(password: str, salt_frontend: str) -> str:
    """What Frontend/libs/modules/src/auth/login/credentials.ts sends: PBKDF2 over the trimmed password."""
    return hashlib.pbkdf2_hmac("sha256", password.strip().encode(), salt_frontend.encode(), 100_000).hex()


async def _account(db, email: str = EMAIL) -> str:
    user = User(name="測試-超級管理員")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(
        UserContact(
            user_uuid=user.uuid, type="email", value=email, verified=True, verified_at=datetime.now(UTC)
        )
    )
    await db.commit()
    return user_uuid


async def _sign_in(client, password: str, email: str = EMAIL):
    salt = (await client.get(f"/api/v1/auth/salt/{email}")).json()["salt_frontend"]
    return await client.post(
        "/api/v1/auth/login", data={"username": email, "password": _browser_hash(password, salt)}
    )


def test_the_frontend_hash_is_the_one_the_login_form_sends():
    """The seed header's worked example, checked in a browser when the mock password was fixed (f28d64e)."""
    assert frontend_hash("Mock1234!", "mockdata12345678") == (
        "8c0aefb55114ef12e444543df20424fd9adff2bccfc861a6456386411f6a274c"
    )


@pytest.mark.asyncio
async def test_a_password_set_by_the_script_signs_in(client, db_session, redis):
    """The account had none; afterwards the login form's request with the new password succeeds."""
    await _account(db_session)

    await set_password(db_session, redis, email=EMAIL, password="  staging-only-pw  ")

    resp = await _sign_in(client, "staging-only-pw")
    assert resp.status_code == 200, resp.text


@pytest.mark.asyncio
async def test_setting_it_again_replaces_the_old_password(client, db_session, redis):
    """One password identity per account: the old password stops working, the new one works."""
    user_uuid = await _account(db_session)
    await set_password(db_session, redis, email=EMAIL, password="first-password")

    await set_password(db_session, redis, email=EMAIL, password="second-password")

    assert (await _sign_in(client, "first-password")).status_code == 401
    assert (await _sign_in(client, "second-password")).status_code == 200
    identities = await db_session.scalar(
        select(func.count()).select_from(UserIdentity).where(UserIdentity.user_uuid == user_uuid)
    )
    assert identities == 1


@pytest.mark.asyncio
async def test_a_new_password_signs_out_every_session(client, db_session, redis):
    """Like /auth/change-password: whoever signed in with the old password is signed out."""
    await _account(db_session)
    await set_password(db_session, redis, email=EMAIL, password="first-password")
    refresh_token = (await _sign_in(client, "first-password")).json()["refresh_token"]

    await set_password(db_session, redis, email=EMAIL, password="second-password")

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 401, resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("email", "password"),
    [("nobody@mock.test", "long-enough-pw"), (EMAIL, "  short  ")],
    ids=["no such account", "under 8 characters once trimmed"],
)
async def test_it_refuses_and_writes_nothing(db_session, redis, email, password):
    """No account, or a password the login page would not let anyone set (NEW_PASSWORD_MIN_LENGTH)."""
    await _account(db_session)

    with pytest.raises(ValueError):
        await set_password(db_session, redis, email=email, password=password)

    assert await db_session.scalar(select(func.count()).select_from(UserIdentity)) == 0
