"""Tests for the create_account service (atomic user + identity + contact + group)."""

import os

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import select

from app.models.auth import UserContact, UserIdentity
from app.models.rbac import Role, UserRoleAssign
from app.services.auth_account import create_account


@pytest.mark.asyncio
@pytest.mark.parametrize("ctype,value", [("email", "a@x.com"), ("phone", "+886912345678")])
async def test_create_account_wires_everything(db, ctype, value):
    """Account creation persists the identity, verified contact(type), and default role link."""
    db.add(Role(name="user", kind="platform"))
    await db.commit()
    user = await create_account(db, contact_type=ctype, value=value, password_hash="pbkdf2$x", name="A")
    idents = (
        (await db.execute(select(UserIdentity).where(UserIdentity.user_uuid == user.uuid))).scalars().all()
    )
    contacts = (
        (await db.execute(select(UserContact).where(UserContact.user_uuid == user.uuid))).scalars().all()
    )
    roles = (
        (await db.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == user.uuid)))
        .scalars()
        .all()
    )
    assert idents[0].provider == "password"
    assert contacts[0].type == ctype
    assert contacts[0].value == value and contacts[0].verified is True
    assert len(roles) == 1


@pytest.mark.asyncio
async def test_create_account_google_identity_no_password(db):
    """A google account: google identity (no password_hash) + verified email contact."""
    db.add(Role(name="user", kind="platform"))
    await db.commit()
    user = await create_account(
        db,
        name="GUser",
        provider="google",
        provider_subject="g-sub-1",
        contact_type="email",
        value="g@x.com",
    )
    idents = (
        (await db.execute(select(UserIdentity).where(UserIdentity.user_uuid == user.uuid))).scalars().all()
    )
    assert idents[0].provider == "google"
    assert idents[0].provider_subject == "g-sub-1"
    assert idents[0].password_hash is None
