"""Endpoint tests for linking a LINE identity to the current (logged-in) account."""
import json

import pytest

from app.core.security import create_access_token, generate_salt, get_password_hash
from app.services.auth_account import create_account


def _tok(sub="Ulink1", name="L"):
    return json.dumps({"sub": sub, "name": name})


async def _password_user(db_session, email="owner@x.com"):
    user = await create_account(
        db_session, name="Owner", contact_type="email", value=email,
        password_hash=get_password_hash("secret", generate_salt()))
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': str(user.uuid)})}"}
    return user, headers


@pytest.mark.asyncio
async def test_link_requires_auth(client):
    """Linking a LINE identity without a bearer token returns 401."""
    res = await client.post("/api/v1/auth/link/line", json={"id_token": _tok()})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_link_attaches_line_identity_no_contact(client, db_session):
    """Linking attaches a LINE identity and adds no new contact."""
    user, headers = await _password_user(db_session)
    user_uuid = user.uuid  # capture before the request commits db_session and expires `user`
    res = await client.post("/api/v1/auth/link/line", headers=headers, json={"id_token": _tok()})
    assert res.status_code == 200
    from sqlalchemy import func, select

    from app.models.auth import UserContact, UserIdentity
    line = (await db_session.execute(select(UserIdentity).where(
        UserIdentity.user_uuid == user_uuid, UserIdentity.provider == "line"))).scalar_one_or_none()
    assert line is not None and line.provider_subject is not None
    n = (await db_session.execute(select(func.count()).select_from(UserContact)
         .where(UserContact.user_uuid == user_uuid))).scalar_one()
    assert n == 1  # only the original email contact; link adds none


@pytest.mark.asyncio
async def test_link_invalid_token_401(client, db_session):
    """An invalid (non-JSON) id_token on link/line returns 401."""
    _, headers = await _password_user(db_session)
    res = await client.post("/api/v1/auth/link/line", headers=headers, json={"id_token": "not-json"})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_link_sub_bound_elsewhere_409(client, db_session):
    """Linking a LINE sub already bound to another account returns 409."""
    await create_account(db_session, name="Other", provider="line", provider_subject="Ulink1")
    _, headers = await _password_user(db_session)
    res = await client.post("/api/v1/auth/link/line", headers=headers, json={"id_token": _tok()})
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_link_twice_409(client, db_session):
    """Linking a second LINE identity to an already-linked account returns 409."""
    _, headers = await _password_user(db_session)
    await client.post("/api/v1/auth/link/line", headers=headers, json={"id_token": _tok()})
    res = await client.post("/api/v1/auth/link/line", headers=headers,
                            json={"id_token": _tok(sub="Ulink2")})
    assert res.status_code == 409
