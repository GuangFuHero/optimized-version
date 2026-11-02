"""The database-level shape of an identity (feature 010, ADR-073).

Every rule here is enforced by the schema rather than by application code, which is the
point: `user_role_assign` is the only place an identity exists, so the invariants that make
one well-formed have to hold even for a write that bypasses the service layer.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from sqlalchemy import func, insert, select, update
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

    db.add_all(
        [
            UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_a.uuid),
            UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_b.uuid),
        ]
    )
    user_uuid = str(user.uuid)  # the commit below expires it, and reloading needs a greenlet
    await db.commit()

    teams = (
        (await db.execute(select(UserRoleAssign.team_uuid).where(UserRoleAssign.user_uuid == user_uuid)))
        .scalars()
        .all()
    )
    assert len({str(t) for t in teams}) == 2


async def test_the_same_identity_cannot_be_granted_twice(db):
    """(user, role, team) is still unique — granting one identity twice is not two identities."""
    user = await _user(db)
    role = await _role(db, "member", "team")
    team = await _team(db, "A")

    db.add_all(
        [
            UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid),
            UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid),
        ]
    )
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_a_platform_role_cannot_be_granted_twice_either(db):
    """Postgres does not compare NULLs in a UNIQUE, so the plain key would let this through.

    The partial index over `team_uuid IS NULL` is what actually enforces one platform grant
    per (user, role) — without it a user could silently collect duplicates.
    """
    user = await _user(db)
    role = await _role(db, "super_admin", "platform")

    db.add_all(
        [
            UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid),
            UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid),
        ]
    )
    with pytest.raises(IntegrityError):
        await db.commit()


async def _kinds(db):
    """A platform role, a team role and a team, committed; returns their uuids as plain strings.

    The commit matters: a refused write rolls the session back, and uuids read off an expired
    instance afterwards would need a lazy reload.
    """
    platform = await _role(db, "super_admin", "platform")
    member = await _role(db, "member", "team")
    team, other_team = await _team(db, "A"), await _team(db, "B")
    user = await _user(db)
    ids = tuple(str(x.uuid) for x in (platform, member, team, other_team, user))
    await db.commit()
    return ids


async def _refused(db, statement) -> IntegrityError | None:
    """The IntegrityError a statement raises, or None; the session is rolled back either way."""
    try:
        await db.execute(statement)
        await db.commit()
    except IntegrityError as err:
        await db.rollback()
        return err
    await db.rollback()
    return None


def _grant(user, role, team=None):
    return insert(UserRoleAssign).values(user_uuid=user, role_uuid=role, team_uuid=team)


async def test_a_platform_role_bound_to_a_team_is_rejected(db):
    """A platform role in a team is the shape ADR-068's invariant forbids: it has no team."""
    platform, _, team, _, user = await _kinds(db)

    err = await _refused(db, _grant(user, platform, team))
    assert err is not None and err.orig.__cause__.constraint_name == "ck_ura_role_team_kind"


async def test_a_team_role_with_no_team_is_rejected(db):
    """A team role with no team names no identity — there is nothing for it to be scoped to."""
    _, member, _, _, user = await _kinds(db)

    err = await _refused(db, _grant(user, member))
    assert err is not None and err.orig.__cause__.constraint_name == "ck_ura_role_team_kind"


async def test_a_platform_role_without_a_team_and_a_team_role_with_one_are_accepted(db):
    """The two well-formed shapes go in."""
    platform, member, team, _, user = await _kinds(db)

    assert await _refused(db, _grant(user, platform)) is None
    assert await _refused(db, _grant(user, member, team)) is None


async def test_an_update_cannot_make_a_grant_ill_formed(db):
    """The rule holds on update too.

    Refused: a team onto a platform grant, a team off a team grant, a role swapped for one of the other
    kind. Moving a team grant to another team is fine.
    """
    platform, member, team, other_team, user = await _kinds(db)
    await db.execute(_grant(user, platform))
    await db.execute(_grant(user, member, team))
    await db.commit()
    platform_grant = select(UserRoleAssign.uuid).where(UserRoleAssign.role_uuid == platform).scalar_subquery()
    team_grant = select(UserRoleAssign.uuid).where(UserRoleAssign.role_uuid == member).scalar_subquery()

    def change(grant, **values):
        return update(UserRoleAssign).where(UserRoleAssign.uuid == grant).values(**values)

    for statement in (
        change(platform_grant, team_uuid=team),
        change(team_grant, team_uuid=None),
        change(team_grant, role_uuid=platform),
        change(platform_grant, role_uuid=member),
    ):
        err = await _refused(db, statement)
        assert err is not None and err.orig.__cause__.constraint_name == "ck_ura_role_team_kind"
    assert await _refused(db, change(team_grant, team_uuid=other_team)) is None


async def test_a_role_that_has_been_granted_keeps_its_kind(db):
    """Changing a granted role's kind would leave grants the rule forbids.

    An ungranted role's kind, and any other column of a granted role, can change.
    """
    platform, member, team, _, user = await _kinds(db)
    await db.execute(_grant(user, member, team))
    await db.commit()

    err = await _refused(db, update(Role).where(Role.uuid == member).values(kind="platform"))
    assert err is not None and err.orig.__cause__.constraint_name == "ck_roles_kind_in_use"
    assert await _refused(db, update(Role).where(Role.uuid == member).values(name="teammate")) is None
    assert await _refused(db, update(Role).where(Role.uuid == platform).values(kind="team")) is None


async def test_a_direct_grant_is_unique_per_identity_not_per_user(db):
    """The same capability can be granted at different scopes in different teams (ADR-073)."""
    user = await _user(db)
    team_a, team_b = await _team(db, "A"), await _team(db, "B")
    permission = Permission(key="ticket.export")
    db.add(permission)
    await db.flush()

    db.add_all(
        [
            UserPermissionAssign(
                user_uuid=user.uuid,
                permission_uuid=permission.uuid,
                team_uuid=team_a.uuid,
                scope="all",
            ),
            UserPermissionAssign(
                user_uuid=user.uuid,
                permission_uuid=permission.uuid,
                team_uuid=team_b.uuid,
                scope="own",
            ),
        ]
    )
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

    db.add_all(
        [
            UserPermissionAssign(user_uuid=user.uuid, permission_uuid=permission.uuid, scope="all"),
            UserPermissionAssign(user_uuid=user.uuid, permission_uuid=permission.uuid, scope="own"),
        ]
    )
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
    db.add_all(
        [
            UserRoleAssign(user_uuid=user.uuid, role_uuid=omega.uuid),
            UserRoleAssign(user_uuid=user.uuid, role_uuid=alpha.uuid),
        ]
    )
    user_uuid = str(user.uuid)
    await db.commit()

    seen = {(await active_identity_repository.default_for_user(db, user_uuid)).role_name for _ in range(5)}
    assert seen == {"aaa_role"}, f"unstable or unordered default: {seen}"
