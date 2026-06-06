"""Tests for the require_onboarded gate dependency (verified-contact requirement)."""

import pytest
from fastapi import HTTPException

from app.core.security import require_onboarded
from app.models.auth import Group, User, UserContact
from app.services.auth_account import create_account


@pytest.mark.asyncio
async def test_require_onboarded_passes_with_verified_contact(db):
    """A user with a verified contact passes the gate without raising."""
    db.add(Group(name="Login User"))
    await db.commit()
    user = await create_account(db, contact_type="email", value="a@x.com", password_hash="h",
                                name="Tester")
    # should not raise
    await require_onboarded(current_user=user, db=db)


@pytest.mark.asyncio
async def test_require_onboarded_blocks_without_verified_contact(db):
    """A user with only an unverified contact is blocked with HTTP 403."""
    u = User(name="line-only")
    db.add(u)
    await db.flush()
    db.add(UserContact(user_uuid=u.uuid, type="email", value="x@x.com", verified=False))
    await db.commit()
    await db.refresh(u)  # commit expired `u`; reload it like get_current_user would (prod-faithful)
    with pytest.raises(HTTPException) as exc:
        await require_onboarded(current_user=u, db=db)
    assert exc.value.status_code == 403
