"""The database-level shape of an identity (feature 010, ADR-073).

Every rule here is enforced by the schema rather than by application code, which is the
point: `user_role_assign` is the only place an identity exists, so the invariants that make
one well-formed have to hold even for a write that bypasses the service layer.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models.auth import User
from app.models.rbac import Permission, Role, UserPermissionAssign, UserRoleAssign
from app.models.team import Team

pytestmark = pytest.mark.asyncio


async def _user(db, name: str = "Holder") -> User:
    user = User(name=name)
    db.add(user)
    await db.flush()
    return user


async def _team(db, name: str) -> Team:
    team = Team(name=name, type="ngo")
    db.add(team)
    await db.flush()
    return team


async def _role(db, name: str, kind: str) -> Role:
    role = Role(name=name, kind=kind)
    db.add(role)
    await db.flush()
    return role


async def test_the_same_team_role_can_be_held_in_two_teams(db):
    """The whole point of the feature: member@A and member@B are two separate identities.

    The old unique key was (user_uuid, role_uuid), which rejected the second grant outright.
    """
    user = await _user(db)
    role = await _role(db, "member", "team")
    team_a, team_b = await _team(db, "A"), await _team(db, "B")

    db.add_all([
        UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_a.uuid),
        UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_b.uuid),
    ])
    user_uuid = str(user.uuid)  # the commit below expires it, and reloading needs a greenlet
    await db.commit()

    teams = (
        await db.execute(
            select(UserRoleAssign.team_uuid).where(UserRoleAssign.user_uuid == user_uuid)
        )
    ).scalars().all()
    assert len({str(t) for t in teams}) == 2


async def test_the_same_identity_cannot_be_granted_twice(db):
    """(user, role, team) is still unique — granting one identity twice is not two identities."""
    user = await _user(db)
    role = await _role(db, "member", "team")
    team = await _team(db, "A")

    db.add_all([
        UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid),
        UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid),
    ])
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_a_platform_role_cannot_be_granted_twice_either(db):
    """Postgres does not compare NULLs in a UNIQUE, so the plain key would let this through.

    The partial index over `team_uuid IS NULL` is what actually enforces one platform grant
    per (user, role) — without it a user could silently collect duplicates.
    """
    user = await _user(db)
    role = await _role(db, "super_admin", "platform")

    db.add_all([
        UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid),
        UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid),
    ])
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_a_platform_role_bound_to_a_team_is_rejected(db):
    """A platform role in a team is the shape ADR-068's invariant forbids: it has no team."""
    user = await _user(db)
    role = await _role(db, "super_admin", "platform")
    team = await _team(db, "A")

    db.add(
        UserRoleAssign(
            user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid, role_kind="platform"
        )
    )
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_a_team_role_with_no_team_is_rejected(db):
    """A team role with no team names no identity — there is nothing for it to be scoped to."""
    user = await _user(db)
    role = await _role(db, "member", "team")

    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, role_kind="team"))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_role_kind_cannot_disagree_with_the_role_it_names(db):
    """The redundant copy is kept honest by the composite FK, not by trust.

    `role_kind` exists so a CHECK can see the role's kind without crossing tables; the FK to
    roles(uuid, kind) is what stops it drifting away from the row it mirrors.
    """
    user = await _user(db)
    role = await _role(db, "member", "team")
    team = await _team(db, "A")

    db.add(
        UserRoleAssign(
            user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid, role_kind="platform"
        )
    )
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_role_kind_is_filled_in_from_the_role_when_omitted(db):
    """Callers say which role and which team; the mirrored kind is bookkeeping, not their job."""
    user = await _user(db)
    role = await _role(db, "member", "team")
    team = await _team(db, "A")

    grant = UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid)
    db.add(grant)
    await db.flush()
    assert grant.role_kind == "team"


async def test_a_direct_grant_is_unique_per_identity_not_per_user(db):
    """The same capability can be granted at different scopes in different teams (ADR-073)."""
    user = await _user(db)
    team_a, team_b = await _team(db, "A"), await _team(db, "B")
    permission = Permission(key="ticket.export")
    db.add(permission)
    await db.flush()

    db.add_all([
        UserPermissionAssign(
            user_uuid=user.uuid, permission_uuid=permission.uuid,
            team_uuid=team_a.uuid, scope="all",
        ),
        UserPermissionAssign(
            user_uuid=user.uuid, permission_uuid=permission.uuid,
            team_uuid=team_b.uuid, scope="own",
        ),
    ])
    user_uuid = str(user.uuid)  # captured before the commit expires it
    await db.commit()

    count = (
        await db.execute(
            select(func.count())
            .select_from(UserPermissionAssign)
            .where(UserPermissionAssign.user_uuid == user_uuid)
        )
    ).scalar_one()
    assert count == 2


async def test_a_platform_direct_grant_cannot_be_duplicated(db):
    """Same NULL-comparison hole as the role grants, closed by the same kind of partial index."""
    user = await _user(db)
    permission = Permission(key="ticket.export")
    db.add(permission)
    await db.flush()

    db.add_all([
        UserPermissionAssign(user_uuid=user.uuid, permission_uuid=permission.uuid, scope="all"),
        UserPermissionAssign(user_uuid=user.uuid, permission_uuid=permission.uuid, scope="own"),
    ])
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_the_default_identity_is_stable_across_reads(db):
    """`default_for_user` must not depend on index order (ADR-184).

    An account should only ever hold one platform grant, but the partial unique index is on
    *(user, role)* rather than *user*, so the schema permits several. Without an ORDER BY,
    "the platform identity" was whichever role_uuid the index happened to return — an
    arbitrary UUID draw that could differ between reads.
    """
    from app.repositories.active_identity_repository import active_identity_repository

    user = User(name="Two Hats")
    alpha = Role(name="aaa_role", kind="platform")
    omega = Role(name="zzz_role", kind="platform")
    db.add_all([user, alpha, omega])
    await db.flush()
    db.add_all([
        UserRoleAssign(user_uuid=user.uuid, role_uuid=omega.uuid),
        UserRoleAssign(user_uuid=user.uuid, role_uuid=alpha.uuid),
    ])
    user_uuid = str(user.uuid)
    await db.commit()

    seen = {
        (await active_identity_repository.default_for_user(db, user_uuid)).role_name
        for _ in range(5)
    }
    assert seen == {"aaa_role"}, f"unstable or unordered default: {seen}"
