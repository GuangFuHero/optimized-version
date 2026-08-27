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
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.services.authz import require_scope


async def _grant(db, user: User, perm: Perm, scope: str, role_name: str) -> None:
    """Create a one-off role granting `perm` at `scope` and assign it to `user`.

    Reuses an existing Permission row for `perm` if one was already created earlier in
    the same test (Permission.key is unique) — e.g. two roles granting the same
    capability at different scopes, to exercise the union/widest merge.
    """
    result = await db.execute(select(Permission).where(Permission.key == perm.value))
    permission = result.scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()

    role = Role(name=role_name, kind="platform")
    db.add(role)
    await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
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
    actor = User(name="Actor", team_uuid=team.uuid)
    other = User(name="Other")
    db.add_all([actor, other])
    await db.flush()
    await _assign_zone(db, team, _ZONE_POLY)
    await _grant(db, actor, Perm.STATION_EDIT, "zone", "role-edit")
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
    actor = User(name="Actor", team_uuid=team.uuid)
    other = User(name="Other")
    db.add_all([actor, other])
    await db.flush()
    await _assign_zone(db, team, _ZONE_POLY)
    await _grant(db, actor, Perm.STATION_EDIT, "zone", "role-edit")
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
async def test_require_scope_unions_grants_from_multiple_roles(db):
    """Two roles granting the same capability at different scopes resolve to the widest.

    ADR-018: a platform role granting `own` plus a team role granting `team` on the same
    capability resolves to `team`, not either alone.
    """
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="A", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()
    await _grant(db, actor, Perm.TICKET_VIEW, "own", "platform-role")
    await _grant(db, actor, Perm.TICKET_VIEW, "team", "team-role")

    scope = await require_scope(actor, Perm.TICKET_VIEW, db)
    assert scope == Scope.TEAM


@pytest.mark.asyncio
async def test_team_role_inherits_platform_grant_for_station_contribute(db):
    """A team role that omits a capability does not revoke it; the platform role still grants it.

    Every account keeps the default platform role it got at registration, because joining a
    team only replaces a previous *team* role. Permissions from all of a user's roles are
    added together and the widest scope wins, so a capability granted by the platform role
    stays in force even though the team role says nothing about it.

    This is worth a test because the seed file reads role-by-role, which invites the opposite
    conclusion — that a team admin missing `station.contribute` from their own role would be
    refused. They are not: the default role grants it at `all`. The second assertion is the
    control, showing a capability the team role *does* narrow still applies at its own scope.
    """
    team = Team(name="Gov Team", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="team admin", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()

    # Platform role "user": the grant lives here (seed_rbac.py station.contribute = all).
    await _grant(db, actor, Perm.STATION_CONTRIBUTE, "all", "user")

    # Team role "admin": operational grants, but nothing for station.contribute.
    permission = Permission(key=Perm.STATION_EDIT.value)
    db.add(permission)
    await db.flush()
    team_role = Role(name="admin", kind="team")
    db.add(team_role)
    await db.flush()
    db.add(
        RolePermissionAssign(
            role_uuid=team_role.uuid, permission_uuid=permission.uuid, scope="zone"
        )
    )
    db.add(UserRoleAssign(user_uuid=actor.uuid, role_uuid=team_role.uuid))
    await db.flush()

    assert await require_scope(actor, Perm.STATION_CONTRIBUTE, db) == Scope.ALL
    assert await require_scope(actor, Perm.STATION_EDIT, db) == Scope.ZONE

