"""Tests for scripts/bootstrap_admin.py (T116).

Exercises the real DB-backed contact/role lookups, not mocks — the "refuse a second
super_admin without --force" guard is the whole point of this script.

Every uuid used after a later `db.commit()` is captured into a plain `str` the moment the
row is created (see tests/test_admin_api.py's module docstring for why: `expire_on_commit`
makes re-reading an ORM attribute after a later commit try an invalid implicit reload).
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.models.auth import User, UserContact
from app.models.rbac import Role, UserRoleAssign
from scripts.bootstrap_admin import bootstrap


async def _make_verified_user(db, *, email: str, name: str = "Admin Candidate") -> str:
    """Create a verified-contact user and return their uuid as a plain str."""
    user = User(name=name)
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


async def _make_super_admin_role(db) -> str:
    """Create the super_admin role and return its uuid as a plain str."""
    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    role_uuid = str(role.uuid)
    await db.commit()
    return role_uuid


@pytest.mark.asyncio
async def test_bootstrap_grants_super_admin_to_first_user(db):
    """The first bootstrap run against an empty role grants super_admin outright."""
    role_uuid = await _make_super_admin_role(db)
    user_uuid = await _make_verified_user(db, email="first@example.com")

    await bootstrap("email", "first@example.com", force=False)

    rows = (
        await db.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == user_uuid))
    ).scalars().all()
    assert len(rows) == 1
    assert str(rows[0].role_uuid) == role_uuid


@pytest.mark.asyncio
async def test_bootstrap_refuses_a_second_super_admin_without_force(db):
    """A second bootstrap run against a different account is refused without --force."""
    role_uuid = await _make_super_admin_role(db)
    first_uuid = await _make_verified_user(db, email="first@example.com", name="First Admin")
    db.add(UserRoleAssign(user_uuid=first_uuid, role_uuid=role_uuid))
    await db.commit()
    await _make_verified_user(db, email="second@example.com", name="Second Admin")

    with pytest.raises(SystemExit):
        await bootstrap("email", "second@example.com", force=False)


@pytest.mark.asyncio
async def test_bootstrap_allows_a_second_super_admin_with_force(db):
    """--force explicitly allows adding a second super_admin."""
    role_uuid = await _make_super_admin_role(db)
    first_uuid = await _make_verified_user(db, email="first@example.com", name="First Admin")
    db.add(UserRoleAssign(user_uuid=first_uuid, role_uuid=role_uuid))
    await db.commit()
    second_uuid = await _make_verified_user(db, email="second@example.com", name="Second Admin")

    await bootstrap("email", "second@example.com", force=True)

    rows = (
        await db.execute(select(UserRoleAssign).where(UserRoleAssign.user_uuid == second_uuid))
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_bootstrap_exits_when_contact_not_found(db):
    """An unknown contact fails loudly instead of silently doing nothing."""
    await _make_super_admin_role(db)

    with pytest.raises(SystemExit):
        await bootstrap("email", "nobody@example.com", force=False)
