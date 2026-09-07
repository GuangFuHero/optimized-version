"""Tests for app/services/authz.py:require_scope.

This is the checkpoint-1/checkpoint-2 gate every use-case calls directly
(Spec/008-rbac-authorization/decisions.md ADR-022/023). Exercises the real DB-backed grant resolution
(Role/Permission/RolePermissionAssign/UserRoleAssign), not mocks, since the 403-vs-404
branching and the union/widest merge across multiple roles both depend on it.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.rbac_scopes import Scope
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import (
    Permission,
    Role,
    RolePermissionAssign,
    UserPermissionAssign,
    UserRoleAssign,
)
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.services.authz import require_scope
from tests.conftest import acting_as


async def _permission(db, perm: Perm) -> Permission:
    """Fetch or create the Permission row for `perm` (Permission.key is unique)."""
    result = await db.execute(select(Permission).where(Permission.key == perm.value))
    permission = result.scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    return permission


async def _grant(db, user: User, perm: Perm, scope: str, role_name: str, team=None) -> Role:
    """Create a one-off role granting `perm` at `scope`, assign it, and act as that identity.

    Grants resolve through the active identity now (ADR-068/074), so a role that is assigned
    but not being acted as contributes nothing. Every caller here wants the actor to actually
    hold the capability, so assigning and activating are one step; the tests that care about
    the difference set `active_identity` themselves.
    """
    permission = await _permission(db, perm)
    role = Role(name=role_name, kind="team" if team is not None else "platform")
    db.add(role)
    await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(
        UserRoleAssign(
            user_uuid=user.uuid,
            role_uuid=role.uuid,
            team_uuid=team.uuid if team is not None else None,
        )
    )
    await db.flush()
    acting_as(user, role, team)
    return role


async def _grant_directly(db, user: User, perm: Perm, scope: str, team=None) -> None:
    """Grant `perm` straight to the user, bound to `team` (NULL binds it to platform)."""
    permission = await _permission(db, perm)
    db.add(
        UserPermissionAssign(
            user_uuid=user.uuid,
            permission_uuid=permission.uuid,
            team_uuid=team.uuid if team is not None else None,
            scope=scope,
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_require_scope_403_when_no_grant_at_all(db):
    """No grant for the capability at all raises 403 (checkpoint 1)."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.STATION_EDIT, db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_scope_checkpoint_1_only_without_a_resource(db):
    """No `resource` given (e.g. a create action) — checkpoint 2 never runs."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, Perm.STATION_ADD, "own", "role-make")
    scope = await require_scope(actor, Perm.STATION_ADD, db)
    assert scope == Scope.OWN


@pytest.mark.asyncio
async def test_require_scope_own_scope_passes_for_the_owner(db):
    """Own scope passes checkpoint 2 when the actor created the resource."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, Perm.STATION_EDIT, "own", "role-edit")
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    scope = await require_scope(actor, Perm.STATION_EDIT, db, resource=resource)
    assert scope == Scope.OWN


@pytest.mark.asyncio
async def test_require_scope_own_mismatch_is_403_not_404(db):
    """Ownership denial is not a team-boundary leak — 403, same as always (ADR-023)."""
    actor = User(name="A")
    other = User(name="B")
    db.add_all([actor, other])
    await db.flush()
    await _grant(db, actor, Perm.STATION_EDIT, "own", "role-edit")
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(other.uuid))
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.STATION_EDIT, db, resource=resource)
    assert exc.value.status_code == 403


async def _assign_zone(db, team, polygon: Polygon) -> None:
    """Give `team` a WorkZone covering `polygon` (ADR-049 zone scope backing)."""
    assigner = User(name="zone-assigner")
    db.add(assigner)
    zone = WorkZone(name="Z", geometry=from_shape(polygon, srid=4326))
    db.add(zone)
    await db.flush()
    db.add(
        TeamZoneAssign(
            team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)
        )
    )
    await db.flush()


_ZONE_POLY = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])


@pytest.mark.asyncio
async def test_require_scope_zone_mismatch_is_404_not_403(db):
    """A zone-boundary denial 404s so a cross-zone resource's existence isn't confirmed (ADR-023/049)."""
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="Actor")
    other = User(name="Other")
    db.add_all([actor, other])
    await db.flush()
    await _assign_zone(db, team, _ZONE_POLY)
    await _grant(db, actor, Perm.STATION_EDIT, "zone", "role-edit", team=team)
    # Station at (123.5, 24.5) is OUTSIDE the team's zone polygon.
    resource = Station(geometry=from_shape(Point(123.5, 24.5), srid=4326), created_by=str(other.uuid))
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.STATION_EDIT, db, resource=resource)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_require_scope_zone_match_passes(db):
    """Zone scope passes checkpoint 2 for a resource inside the team's zone the actor didn't create."""
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="Actor")
    other = User(name="Other")
    db.add_all([actor, other])
    await db.flush()
    await _assign_zone(db, team, _ZONE_POLY)
    await _grant(db, actor, Perm.STATION_EDIT, "zone", "role-edit", team=team)
    # Station at (121.5, 24.5) is INSIDE the team's zone polygon.
    resource = Station(geometry=from_shape(Point(121.5, 24.5), srid=4326), created_by=str(other.uuid))
    scope = await require_scope(actor, Perm.STATION_EDIT, db, resource=resource)
    assert scope == Scope.ZONE


@pytest.mark.asyncio
async def test_require_scope_all_scope_skips_checkpoint_2_entirely(db):
    """`all` never inspects the resource — a foreign/mismatched resource still passes."""
    actor = User(name="A")
    stranger = User(name="Stranger")
    db.add_all([actor, stranger])
    await db.flush()
    await _grant(db, actor, Perm.STATION_EDIT, "all", "role-edit")
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(stranger.uuid))
    scope = await require_scope(actor, Perm.STATION_EDIT, db, resource=resource)
    assert scope == Scope.ALL


@pytest.mark.asyncio
async def test_require_scope_unions_a_role_grant_with_a_direct_grant(db):
    """Union survives, but within one identity: role grant `own` + direct grant `team` → `team`.

    ADR-018's union is unchanged; ADR-074 narrows what it ranges over. A user's two roles no
    longer merge (see the test below) because only one of them is ever being acted as, so the
    remaining way to hold two scopes on one capability is a role grant plus a direct grant on
    the same identity.
    """
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, Perm.TICKET_VIEW, "own", "team-role", team=team)
    await _grant_directly(db, actor, Perm.TICKET_VIEW, "team", team=team)

    scope = await require_scope(actor, Perm.TICKET_VIEW, db)
    assert scope == Scope.TEAM


@pytest.mark.asyncio
async def test_require_scope_ignores_the_roles_the_actor_is_not_acting_as(db):
    """Only the active identity's grants count — the other role's are not merged in (ADR-068).

    This is the invariant the whole switching model rests on: acting as the narrower identity
    has to be a real downgrade, otherwise a super_admin "switching" to a team member would keep
    every platform capability and the switch would be cosmetic.
    """
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, Perm.TICKET_VIEW, "all", "platform-role")
    # Granted second, so this is the identity the actor ends up acting as.
    await _grant(db, actor, Perm.TICKET_VIEW, "own", "team-role", team=team)

    assert await require_scope(actor, Perm.TICKET_VIEW, db) == Scope.OWN


@pytest.mark.asyncio
async def test_require_scope_403s_for_an_actor_with_no_active_identity(db):
    """No identity resolves to no grants at all — fail closed, never a 500 (ADR-074).

    A `User` loaded outside a request never went through `get_current_user`, so it carries no
    identity. Denying is the safe reading of that.
    """
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    await _grant(db, actor, Perm.STATION_EDIT, "all", "role-edit")
    actor.active_identity = None

    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.STATION_EDIT, db)
    assert exc.value.status_code == 403

@pytest.mark.asyncio
async def test_a_team_identity_does_not_inherit_the_platform_role_grant(db):
    """Replaces main's `test_team_role_inherits_platform_grant_for_station_contribute`.

    That test asserted the opposite — that a capability granted by the platform `user` role
    stays in force while acting as a team role, because permissions from all of a user's roles
    were added together. Identity switching removes exactly that (ADR-074): only the active
    identity's grants resolve, so a team identity that says nothing about a capability does
    not have it, no matter what the platform role grants.

    The behaviour it protected — a field worker acting as their team can still contribute —
    is preserved, but by granting `station.contribute` directly to the team roles in
    `scripts/seed_rbac.py` rather than by leaking the platform grant across identities. This
    test pins the mechanism; `test_every_actionable_role_covers_the_citizen_baseline`
    (tests/test_seed_rbac.py) pins the seed side, and more broadly than this one capability.
    """
    team = Team(name="Gov Team", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="team admin")
    db.add(actor)
    await db.flush()

    # Platform role "user" grants station.contribute, exactly as the seed does.
    await _grant(db, actor, Perm.STATION_CONTRIBUTE, "all", "user")
    # Team role "admin" narrows station.edit and says nothing about station.contribute.
    await _grant(db, actor, Perm.STATION_EDIT, "zone", "admin", team=team)

    # Acting as the team identity (granted last): the team role's own grant applies...
    assert await require_scope(actor, Perm.STATION_EDIT, db) == Scope.ZONE
    # ...and the platform role's does not come with it.
    with pytest.raises(HTTPException) as exc:
        await require_scope(actor, Perm.STATION_CONTRIBUTE, db)
    assert exc.value.status_code == 403
