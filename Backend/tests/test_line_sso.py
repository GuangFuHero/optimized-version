"""Endpoint tests for LINE SSO (verify-then-login/create) using the fake verifier."""
import json

import pytest

from app.services.auth_account import create_account


def _tok(sub="U1", name="Mei", email=None):
    payload = {"sub": sub, "name": name}
    if email is not None:
        payload["email"] = email
    return json.dumps(payload)


@pytest.mark.asyncio
async def test_first_login_no_email_creates_account_no_contact(client, db_session):
    """First LINE login without an email creates a usable account and no contact."""
    res = await client.post("/api/v1/auth/sso/line", json={"id_token": _tok()})
    assert res.status_code == 200
    assert res.json().get("access_token")
    from sqlalchemy import select

    from app.models.auth import UserContact
    contacts = (await db_session.execute(select(UserContact))).scalars().all()
    assert contacts == []  # no email from LINE -> no contact, still usable


@pytest.mark.asyncio
async def test_first_login_with_email_creates_verified_contact(client, db_session):
    """First LINE login with an email creates one verified email contact."""
    res = await client.post("/api/v1/auth/sso/line",
                            json={"id_token": _tok(email="mei@x.com")})
    assert res.status_code == 200
    from sqlalchemy import select

    from app.models.auth import UserContact
    c = (await db_session.execute(select(UserContact))).scalars().all()
    assert len(c) == 1 and c[0].type == "email" and c[0].value == "mei@x.com" and c[0].verified


@pytest.mark.asyncio
async def test_second_login_same_sub_logs_in(client, db_session):
    """A second LINE login with the same sub logs in instead of creating a new user."""
    await client.post("/api/v1/auth/sso/line", json={"id_token": _tok()})
    await client.post("/api/v1/auth/sso/line", json={"id_token": _tok()})
    from sqlalchemy import select

    from app.models.auth import User
    assert len((await db_session.execute(select(User))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_email_collision_creates_account_without_that_contact(client, db_session):
    """A colliding LINE email is skipped; the account is still created (not blocked)."""
    # someone already owns this email
    await create_account(db_session, name="Owner", contact_type="email", value="taken@x.com",
                         password_hash="h")
    res = await client.post("/api/v1/auth/sso/line",
                            json={"id_token": _tok(sub="U9", email="taken@x.com")})
    assert res.status_code == 200  # NOT blocked
    from sqlalchemy import func, select

    from app.models.auth import UserContact
    # still only the original owner's one contact; LINE account created without the colliding email
    n = (await db_session.execute(select(func.count()).select_from(UserContact)
         .where(UserContact.value == "taken@x.com"))).scalar_one()
    assert n == 1


@pytest.mark.asyncio
async def test_first_login_malformed_email_skips_contact(client, db_session):
    """A malformed LINE email is ignored (no 500); the account is still created with no contact."""
    res = await client.post("/api/v1/auth/sso/line",
                            json={"id_token": _tok(sub="Ubad", email="not-an-email")})
    assert res.status_code == 200
    from sqlalchemy import select

    from app.models.auth import UserContact
    assert (await db_session.execute(select(UserContact))).scalars().all() == []


@pytest.mark.asyncio
async def test_first_login_name_fallback(client, db_session):
    """When LINE returns no display name, the account name falls back to LINE-<sub prefix>."""
    res = await client.post("/api/v1/auth/sso/line", json={"id_token": _tok(sub="Uabcdefgh", name=None)})
    assert res.status_code == 200
    from sqlalchemy import select

    from app.models.auth import User
    user = (await db_session.execute(select(User))).scalars().one()
    assert user.name == "LINE-Uabcdefg"  # f"LINE-{sub[:8]}" of "Uabcdefgh"


@pytest.mark.asyncio
async def test_invalid_token_401(client, db_session):
    """A non-verifiable LINE token returns 401."""
    res = await client.post("/api/v1/auth/sso/line", json={"id_token": "not-json"})
    assert res.status_code == 401
