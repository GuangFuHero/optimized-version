"""Endpoint tests for linking a Google identity to the current (logged-in) account."""
import json

import pytest

from app.core.security import generate_salt, get_password_hash
from app.services.auth_account import create_account
from tests.conftest import auth_headers_for


def _tok(sub="g-link-1", email="x@x.com", name="X"):
    return json.dumps({"sub": sub, "email": email, "email_verified": True, "name": name})


PASSWORD = "secret"
STEP_UP = {"step_up": {"password": PASSWORD}}  # ADR-217: linking needs proof of the account


async def _password_user(db_session, redis, email="owner@x.com"):
    user = await create_account(
        db_session, name="Owner", contact_type="email", value=email,
        password_hash=get_password_hash(PASSWORD, generate_salt()))
    headers = await auth_headers_for(redis, user.uuid)
    return user, headers


@pytest.mark.asyncio
async def test_link_requires_auth(client):
    """Linking Google without a Bearer token is rejected with 401."""
    res = await client.post("/api/v1/auth/link/google", json={"id_token": _tok()})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_link_attaches_google_identity(client, db_session, redis):
    """A logged-in user can link a fresh Google identity."""
    _, headers = await _password_user(db_session, redis)
    res = await client.post("/api/v1/auth/link/google", headers=headers, json={"id_token": _tok(), **STEP_UP})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_link_adds_identity_but_no_contact(client, db_session, redis):
    """Linking Google attaches a google identity to the current user without creating any contact."""
    from sqlalchemy import func, select

    from app.models.auth import UserContact, UserIdentity
    user, headers = await _password_user(db_session, redis)
    user_uuid = user.uuid  # capture before the request commits db_session and expires `user`
    res = await client.post("/api/v1/auth/link/google", headers=headers, json={"id_token": _tok(), **STEP_UP})
    assert res.status_code == 200
    google = (await db_session.execute(
        select(UserIdentity).where(UserIdentity.user_uuid == user_uuid,
                                   UserIdentity.provider == "google"))).scalar_one_or_none()
    assert google is not None and google.provider_subject is not None
    # the password user started with exactly one contact (the email); linking adds none
    contact_count = (await db_session.execute(
        select(func.count()).select_from(UserContact).where(
            UserContact.user_uuid == user_uuid))).scalar_one()
    assert contact_count == 1


@pytest.mark.asyncio
async def test_link_sub_already_bound_elsewhere_409(client, db_session, redis):
    """Linking a Google sub already bound to another account is rejected with 409."""
    # sub already belongs to another (google) account
    await create_account(db_session, name="Other", provider="google", provider_subject="g-link-1",
                         contact_type="email", value="other@x.com")
    _, headers = await _password_user(db_session, redis)
    res = await client.post("/api/v1/auth/link/google", headers=headers, json={"id_token": _tok(), **STEP_UP})
    assert res.status_code == 409


@pytest.mark.asyncio
async def test_link_twice_409(client, db_session, redis):
    """A user who already has a Google identity cannot link a second one."""
    _, headers = await _password_user(db_session, redis)
    await client.post("/api/v1/auth/link/google", headers=headers, json={"id_token": _tok(), **STEP_UP})
    res = await client.post("/api/v1/auth/link/google", headers=headers,
                            json={"id_token": _tok(sub="g-link-2"), **STEP_UP})
    assert res.status_code == 409  # current user already has a google identity
