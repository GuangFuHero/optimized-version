"""Unit tests for the scope engine (app/core/rbac_scopes.py).

Covers widest() merge and every in_scope() branch, including the team/gov/ngo/zone
scopes that had zero coverage before (RBAC_V1_DECISIONS.md Phase 1 gap — no existing
fixture ever set team_uuid or built a Team). Also covers scope_filter() (ADR-028, added
in Phase 2) — its list-level own/team/gov/ngo/zone conditions involve subqueries that
in_scope()'s single-object checks don't exercise, so they get their own DB-executing tests.
"""

import os
from types import SimpleNamespace
from uuid import uuid4

os.environ["ENV"] = "testing"

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import false, select

from app.core.rbac_scopes import Scope, in_scope, scope_filter, widest
from app.models.auth import User
from app.models.geo import Station
from app.models.team import Team, TeamZoneAssign, WorkZone

# --- widest() ---


def test_widest_of_empty_is_none():
    """No grants at all resolves to Scope.NONE."""
    assert widest([]) == Scope.NONE


def test_widest_picks_the_widest_of_several():
    """Given a mix of scopes, the widest one wins."""
    assert widest([Scope.OWN, Scope.TEAM, Scope.NONE]) == Scope.TEAM


def test_widest_all_beats_every_other_scope():
    """`all` outranks every other scope regardless of what else is present."""
    assert widest([Scope.ZONE, Scope.TEAM, Scope.OWN, Scope.ALL]) == Scope.ALL


def test_widest_zone_beats_team_beats_own():
    """Ordering holds for the narrower scopes too: zone > team > own."""
    assert widest([Scope.ZONE, Scope.TEAM]) == Scope.ZONE
    assert widest([Scope.TEAM, Scope.OWN]) == Scope.TEAM


# --- in_scope(): ALL ---


@pytest.mark.asyncio
async def test_in_scope_all_never_inspects_the_resource(db):
    """ALL short-circuits before touching `resource` at all."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    assert await in_scope(Scope.ALL, actor=actor, resource=None, db=db) is True


# --- in_scope(): OWN ---


@pytest.mark.asyncio
async def test_in_scope_own_matches_creator(db):
    """Own scope passes when the resource's created_by matches the actor."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    assert await in_scope(Scope.OWN, actor=actor, resource=resource, db=db) is True


@pytest.mark.asyncio
async def test_in_scope_own_rejects_non_creator(db):
    """Own scope fails when the resource belongs to someone else."""
    actor = User(name="A")
    other = User(name="B")
    db.add_all([actor, other])
    await db.flush()
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(other.uuid))
    assert await in_scope(Scope.OWN, actor=actor, resource=resource, db=db) is False


@pytest.mark.asyncio
async def test_in_scope_own_false_when_resource_has_no_creator(db):
    """Own scope fails cleanly when created_by is missing (e.g. TicketTask-derived shims)."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    resource = SimpleNamespace(created_by=None, team_uuid=None, geometry=None)
    assert await in_scope(Scope.OWN, actor=actor, resource=resource, db=db) is False


# --- in_scope(): TEAM (ADR-049: geo resources no longer carry team_uuid, so TEAM only ever
# matches the team-management adaptor shape — a SimpleNamespace exposing team_uuid) ---


@pytest.mark.asyncio
async def test_in_scope_team_matches_same_team(db):
    """Team scope passes when actor and the (adaptor) resource share the same team_uuid."""
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="A", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()
    resource = SimpleNamespace(created_by=None, team_uuid=team.uuid, geometry=None)
    assert await in_scope(Scope.TEAM, actor=actor, resource=resource, db=db) is True


@pytest.mark.asyncio
async def test_in_scope_team_rejects_different_team(db):
    """Team scope fails when the resource belongs to a different team."""
    team_a = Team(name="A", type="gov")
    team_b = Team(name="B", type="gov")
    db.add_all([team_a, team_b])
    await db.flush()
    actor = User(name="Actor", team_uuid=team_a.uuid)
    db.add(actor)
    await db.flush()
    resource = SimpleNamespace(created_by=None, team_uuid=team_b.uuid, geometry=None)
    assert await in_scope(Scope.TEAM, actor=actor, resource=resource, db=db) is False


@pytest.mark.asyncio
async def test_in_scope_team_false_when_actor_has_no_team(db):
    """Team scope fails when the actor isn't on any team."""
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="A")  # no team_uuid
    db.add(actor)
    await db.flush()
    resource = SimpleNamespace(created_by=None, team_uuid=team.uuid, geometry=None)
    assert await in_scope(Scope.TEAM, actor=actor, resource=resource, db=db) is False


@pytest.mark.asyncio
async def test_in_scope_team_false_for_geo_resource_with_no_team_uuid(db):
    """A geo resource (no team_uuid column) cleanly fails TEAM scope, never raises (ADR-045/049)."""
    actor = User(name="A", team_uuid=None)
    db.add(actor)
    await db.flush()
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    assert await in_scope(Scope.TEAM, actor=actor, resource=resource, db=db) is False


# --- in_scope(): ZONE ---


@pytest.mark.asyncio
async def test_in_scope_zone_matches_point_inside_assigned_zone(db):
    """Zone scope passes when the resource's point falls inside a zone assigned to the team."""
    team = Team(name="T1", type="ngo")
    db.add(team)
    await db.flush()
    actor = User(name="A", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()

    zone_polygon = Polygon([(121.0, 24.5), (122.0, 24.5), (122.0, 25.5), (121.0, 25.5), (121.0, 24.5)])
    zone = WorkZone(name="Zone1", geometry=from_shape(zone_polygon, srid=4326))
    db.add(zone)
    await db.flush()
    db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid))
    await db.flush()

    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    assert await in_scope(Scope.ZONE, actor=actor, resource=resource, db=db) is True


@pytest.mark.asyncio
async def test_in_scope_zone_rejects_point_outside_assigned_zone(db):
    """Zone scope fails when the resource's point falls outside every assigned zone."""
    team = Team(name="T1", type="ngo")
    db.add(team)
    await db.flush()
    actor = User(name="A", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()

    zone_polygon = Polygon([(121.0, 24.5), (122.0, 24.5), (122.0, 25.5), (121.0, 25.5), (121.0, 24.5)])
    zone = WorkZone(name="Zone1", geometry=from_shape(zone_polygon, srid=4326))
    db.add(zone)
    await db.flush()
    db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid))
    await db.flush()

    resource = Station(geometry=from_shape(Point(130.0, 30.0), srid=4326), created_by=str(actor.uuid))
    assert await in_scope(Scope.ZONE, actor=actor, resource=resource, db=db) is False


@pytest.mark.asyncio
async def test_in_scope_zone_false_when_actor_has_no_team(db):
    """Zone scope fails when the actor isn't on any team (no zones to check against)."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    assert await in_scope(Scope.ZONE, actor=actor, resource=resource, db=db) is False


@pytest.mark.asyncio
async def test_in_scope_zone_false_when_resource_has_no_geometry(db):
    """Zone scope fails cleanly for resources with no geometry column."""
    team = Team(name="T1", type="ngo")
    db.add(team)
    await db.flush()
    actor = User(name="A", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()
    resource = SimpleNamespace(created_by=str(actor.uuid), team_uuid=None, geometry=None)
    assert await in_scope(Scope.ZONE, actor=actor, resource=resource, db=db) is False


# --- in_scope(): NONE ---


@pytest.mark.asyncio
async def test_in_scope_none_is_always_false(db):
    """None scope never passes, regardless of the resource."""
    actor = User(name="A")
    db.add(actor)
    await db.flush()
    resource = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    assert await in_scope(Scope.NONE, actor=actor, resource=resource, db=db) is False


# --- scope_filter() ---
# List-query counterpart to in_scope() (ADR-028). These execute real queries against real
# rows — own/team pass trivially as a plain WHERE, but gov/ngo/zone build subqueries that
# in_scope()'s single-object checks above never exercise, so they get dedicated coverage.


async def _station_uuids(db, *conditions) -> set[str]:
    """Run a Station query with the given WHERE conditions, return matching UUIDs as strings."""
    result = await db.execute(select(Station.uuid).where(*conditions))
    return {str(u) for u in result.scalars().all()}


def test_scope_filter_all_returns_no_conditions():
    """ALL scope returns an empty filter list — no row is excluded."""
    actor = User(name="A")
    assert scope_filter(Scope.ALL, actor=actor, model=Station) == []


def test_scope_filter_own_false_when_actor_has_no_uuid():
    """A not-yet-flushed actor (no uuid) can't match anything under own scope."""
    actor = User(name="A")
    conditions = scope_filter(Scope.OWN, actor=actor, model=Station)
    assert len(conditions) == 1  # a false() sentinel — excludes every row


@pytest.mark.asyncio
async def test_scope_filter_own_matches_only_actors_rows(db):
    """Own scope's WHERE clause matches only rows the actor created."""
    actor = User(name="A")
    other = User(name="B")
    db.add_all([actor, other])
    await db.flush()
    mine = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    theirs = Station(geometry=from_shape(Point(121.6, 25.0), srid=4326), created_by=str(other.uuid))
    db.add_all([mine, theirs])
    await db.flush()

    uuids = await _station_uuids(db, *scope_filter(Scope.OWN, actor=actor, model=Station))
    assert uuids == {str(mine.uuid)}


@pytest.mark.asyncio
async def test_scope_filter_team_on_geo_model_excludes_everything(db):
    """A geo model has no team_uuid (ADR-049), so TEAM scope_filter yields false() → no rows."""
    team = Team(name="A", type="gov")
    db.add(team)
    await db.flush()
    actor = User(name="Actor", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()
    s = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    db.add(s)
    await db.flush()

    uuids = await _station_uuids(db, *scope_filter(Scope.TEAM, actor=actor, model=Station))
    assert uuids == set()


@pytest.mark.asyncio
async def test_scope_filter_zone_matches_rows_inside_assigned_zone_only(db):
    """Zone scope's WHERE clause matches only rows whose point falls inside an assigned zone."""
    team = Team(name="T1", type="ngo")
    db.add(team)
    await db.flush()
    actor = User(name="A", team_uuid=team.uuid)
    db.add(actor)
    await db.flush()

    zone_polygon = Polygon([(121.0, 24.5), (122.0, 24.5), (122.0, 25.5), (121.0, 25.5), (121.0, 24.5)])
    zone = WorkZone(name="Zone1", geometry=from_shape(zone_polygon, srid=4326))
    db.add(zone)
    await db.flush()
    db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid))
    await db.flush()

    inside = Station(geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=str(actor.uuid))
    outside = Station(geometry=from_shape(Point(130.0, 30.0), srid=4326), created_by=str(actor.uuid))
    db.add_all([inside, outside])
    await db.flush()

    uuids = await _station_uuids(db, *scope_filter(Scope.ZONE, actor=actor, model=Station))
    assert uuids == {str(inside.uuid)}


def test_scope_filter_none_excludes_everything():
    """Defensive branch — checkpoint 1 should already have 403'd before this is reached."""
    actor = User(name="A")
    conditions = scope_filter(Scope.NONE, actor=actor, model=Station)
    assert len(conditions) == 1  # a false() sentinel — excludes every row


def test_scope_filter_team_uses_declared_boundary_for_team_model():
    """Team declares its own uuid as the team boundary, so team-scope filters on teams.uuid."""
    actor = SimpleNamespace(uuid=uuid4(), team_uuid=uuid4())
    conds = scope_filter(Scope.TEAM, actor=actor, model=Team)
    assert len(conds) == 1
    assert "teams.uuid" in str(conds[0])


def test_scope_filter_team_defaults_to_team_uuid_column():
    """A model without a declared boundary keeps using its team_uuid column (regression)."""
    actor = SimpleNamespace(uuid=uuid4(), team_uuid=uuid4())
    conds = scope_filter(Scope.TEAM, actor=actor, model=User)
    assert len(conds) == 1
    assert "users.team_uuid" in str(conds[0])


def test_scope_filter_own_and_zone_degrade_to_false_for_columnless_model():
    """OWN/ZONE degrade to false() (not AttributeError) when the model lacks the column."""
    actor = SimpleNamespace(uuid=uuid4(), team_uuid=uuid4())
    own = scope_filter(Scope.OWN, actor=actor, model=Team)
    zone = scope_filter(Scope.ZONE, actor=actor, model=Team)
    assert str(own[0]) == str(false())
    assert str(zone[0]) == str(false())
