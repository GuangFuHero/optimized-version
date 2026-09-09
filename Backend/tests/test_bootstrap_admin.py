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


@pytest.mark.asyncio
async def test_bootstrap_replaces_the_existing_platform_role(db):
    """The account must end up with one platform identity, not two.

    Registration grants `user`, and this script used to add `super_admin` alongside it. A
    user holding two platform grants has no well-defined default identity — `default_for_user`
    picks whichever role_uuid the partial unique index returns first, so a bootstrapped
    super_admin could log in as a plain `user`. Every other platform grant in the codebase
    replaces (`admin_service.assign_role`); this one now does too (ADR-184).
    """
    sa_role_uuid = await _make_super_admin_role(db)
    plain = Role(name="user", kind="platform")
    db.add(plain)
    await db.flush()
    plain_uuid = str(plain.uuid)
    user_uuid = await _make_verified_user(db, email="replace@example.com")
    db.add(UserRoleAssign(user_uuid=user_uuid, role_uuid=plain_uuid, role_kind="platform"))
    await db.commit()

    await bootstrap("email", "replace@example.com", force=False)

    held = (
        await db.execute(
            select(UserRoleAssign.role_uuid).where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.team_uuid.is_(None),
            )
        )
    ).scalars().all()
    assert [str(r) for r in held] == [sa_role_uuid]


@pytest.mark.asyncio
async def test_bootstrap_leaves_team_identities_alone(db):
    """Only the platform grant is replaced — team membership is a different axis."""
    from app.models.team import Team

    sa_role_uuid = await _make_super_admin_role(db)
    team_role = Role(name="member", kind="team")
    team = Team(name="Bootstrap Team", type="ngo", status="active")
    db.add_all([team_role, team])
    await db.flush()
    team_role_uuid, team_uuid = str(team_role.uuid), str(team.uuid)
    user_uuid = await _make_verified_user(db, email="teamed@example.com")
    db.add(
        UserRoleAssign(
            user_uuid=user_uuid, role_uuid=team_role_uuid,
            team_uuid=team_uuid, role_kind="team",
        )
    )
    await db.commit()

    await bootstrap("email", "teamed@example.com", force=False)

    rows = (
        await db.execute(
            select(UserRoleAssign).where(UserRoleAssign.user_uuid == user_uuid)
        )
    ).scalars().all()
    by_team = {str(r.team_uuid) if r.team_uuid else None: str(r.role_uuid) for r in rows}
    assert by_team == {None: sa_role_uuid, team_uuid: team_role_uuid}
