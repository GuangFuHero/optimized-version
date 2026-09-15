"""The scope engine resolves team and zone from the ACTIVE identity (feature 010, ADR-074).

The distinction these tests exist to pin: a user's grants are no longer the union of every
role they hold. Acting as one identity means holding that identity's grants and no others,
so switching to a narrower one is a real downgrade rather than a label change.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope, scope_filter
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.services.authz import require_scope
from tests.conftest import acting_as

pytestmark = pytest.mark.asyncio

_ZONE_POLY = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])


async def _permission(db, perm: Perm) -> Permission:
    """Fetch or create the Permission row for `perm`."""
    existing = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    permission = Permission(key=perm.value)
    db.add(permission)
    await db.flush()
    return permission


async def _identity(db, user: User, role_name: str, grants: dict, team=None) -> Role:
    """Grant `user` a role with `grants` ({Perm: scope}), in `team` when given.

    Returns the role so the caller can decide which identity to act as — deliberately NOT
    activating it, because these tests are about which identity is in effect.
    """
    role = Role(name=role_name, kind="team" if team is not None else "platform")
    db.add(role)
    await db.flush()
    for perm, scope in grants.items():
        permission = await _permission(db, perm)
        db.add(
            RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
            )
        )
    db.add(
        UserRoleAssign(
            user_uuid=user.uuid,
            role_uuid=role.uuid,
            team_uuid=team.uuid if team is not None else None,
        )
    )
    await db.flush()
    return role


async def _team_with_zone(db, name: str, polygon: Polygon, assigner: User) -> Team:
    """A team holding a WorkZone covering `polygon`."""
    team = Team(name=name, type="ngo")
    zone = WorkZone(name=f"{name} zone", geometry=from_shape(polygon, srid=4326))
    db.add_all([team, zone])
    await db.flush()
    db.add(
        TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid))
    )
    await db.flush()
    return team


async def test_super_admin_acting_as_a_member_holds_none_of_its_own_grants(db):
    """The core invariant: switching down is a real downgrade, not a label (ADR-068).

    Same user, same request machinery — only the active identity differs, and with it every
    grant that applies.
    """
    actor = User(name="Both Hats")
    db.add(actor)
    await db.flush()
    team = Team(name="慈濟", type="ngo")
    db.add(team)
    await db.flush()

    super_admin = await _identity(db, actor, "super_admin", {Perm.TICKET_EDIT: "all"})
    member = await _identity(db, actor, "member", {Perm.TICKET_VIEW: "team"}, team=team)

    acting_as(actor, super_admin)
    assert await require_scope(actor, Perm.TICKET_EDIT, db) == Scope.ALL

    acting_as(actor, member, team)
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.TICKET_EDIT, db)
    assert exc.value.status_code == 403


async def test_a_role_held_in_two_teams_scopes_to_the_team_being_acted_as(db):
    """`admin` in team A and `member` in team B are two identities with two boundaries."""
    from types import SimpleNamespace

    actor = User(name="Two Teams")
    db.add(actor)
    await db.flush()
    team_a = Team(name="A", type="gov")
    team_b = Team(name="B", type="ngo")
    db.add_all([team_a, team_b])
    await db.flush()

    admin_a = await _identity(
        db, actor, "admin", {Perm.TEAM_MEMBER_MANAGE: "team"}, team=team_a
    )
    await _identity(db, actor, "member", {Perm.TEAM_MEMBER_MANAGE: "team"}, team=team_b)

    acting_as(actor, admin_a, team_a)
    # Managing team A's members passes checkpoint 2; team B's does not, even though the user
    # is in team B too — they are not acting as their team B identity.
    a_resource = SimpleNamespace(created_by=None, team_uuid=team_a.uuid, geometry=None)
    b_resource = SimpleNamespace(created_by=None, team_uuid=team_b.uuid, geometry=None)
    assert await require_scope(actor, Perm.TEAM_MEMBER_MANAGE, db, resource=a_resource) == Scope.TEAM
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.TEAM_MEMBER_MANAGE, db, resource=b_resource)
    assert exc.value.status_code == 404


async def test_zone_scope_covers_only_the_active_identitys_zones(db):
    """Zone scope is the active team's zones — never the union across every team (ADR-074)."""
    actor = User(name="Zoned")
    db.add(actor)
    await db.flush()
    near = await _team_with_zone(db, "Near", _ZONE_POLY, actor)
    far_poly = Polygon([(130.0, 30.0), (130.0, 31.0), (131.0, 31.0), (131.0, 30.0), (130.0, 30.0)])
    far = await _team_with_zone(db, "Far", far_poly, actor)

    near_role = await _identity(db, actor, "near-editor", {Perm.STATION_EDIT: "zone"}, team=near)
    await _identity(db, actor, "far-editor", {Perm.STATION_EDIT: "zone"}, team=far)

    inside_near = Station(
        geometry=from_shape(Point(121.5, 24.5), srid=4326), created_by=str(actor.uuid)
    )
    inside_far = Station(
        geometry=from_shape(Point(130.5, 30.5), srid=4326), created_by=str(actor.uuid)
    )
    db.add_all([inside_near, inside_far])
    await db.flush()

    acting_as(actor, near_role, near)
    assert await require_scope(actor, Perm.STATION_EDIT, db, resource=inside_near) == Scope.ZONE
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.STATION_EDIT, db, resource=inside_far)
    assert exc.value.status_code == 404

    rows = (
        await db.execute(
            select(Station.uuid).where(*scope_filter(Scope.ZONE, actor=actor, model=Station))
        )
    ).scalars().all()
    assert {str(u) for u in rows} == {str(inside_near.uuid)}


async def test_a_platform_identity_has_no_team_so_team_and_zone_scope_are_empty(db):
    """A platform identity belongs to no team, so anything team-bound resolves to nothing."""
    from types import SimpleNamespace

    actor = User(name="Platform Only")
    db.add(actor)
    await db.flush()
    team = Team(name="慈濟", type="ngo")
    db.add(team)
    await db.flush()
    role = await _identity(db, actor, "data_auditor", {Perm.TEAM_MEMBER_MANAGE: "team"})
    acting_as(actor, role)

    resource = SimpleNamespace(created_by=None, team_uuid=team.uuid, geometry=None)
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.TEAM_MEMBER_MANAGE, db, resource=resource)
    assert exc.value.status_code == 404


async def test_a_direct_grant_only_applies_to_the_identity_it_is_bound_to(db):
    """A per-user grant with a team belongs to that team's identity alone (ADR-073)."""
    from app.models.rbac import UserPermissionAssign

    actor = User(name="Granted")
    db.add(actor)
    await db.flush()
    team = Team(name="慈濟", type="ngo")
    db.add(team)
    await db.flush()

    platform_role = await _identity(db, actor, "user", {})
    member = await _identity(db, actor, "member", {}, team=team)
    permission = await _permission(db, Perm.TICKET_EXPORT)
    db.add(
        UserPermissionAssign(
            user_uuid=actor.uuid,
            permission_uuid=permission.uuid,
            team_uuid=team.uuid,
            scope="all",
        )
    )
    await db.flush()

    acting_as(actor, member, team)
    assert await require_scope(actor, Perm.TICKET_EXPORT, db) == Scope.ALL

    acting_as(actor, platform_role)
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.TICKET_EXPORT, db)
    assert exc.value.status_code == 403
