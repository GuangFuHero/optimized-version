"""Scope checks for reviewing station_property suggestions (PR #24 [3], ADR-052).

`review_station_suggestion` scopes a station_property target through the parent station's
geometry (like `update_station_property`), so a `station.review=zone` reviewer reaches
property suggestions inside its WorkZone. Regression guard for the half-applied fix where
the review path still passed the geometry-less StationProperty and always 404'd zone
reviewers. Service-level (not GraphQL) so it uses the root conftest, not the test_graphql one.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.station_property import StationProperty, StationUpdateSuggestion
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.services.suggestion import review_station_suggestion

_ZONE_POLY = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])
_INSIDE = Point(121.5, 24.5)  # inside _ZONE_POLY
_OUTSIDE = Point(123.5, 24.5)  # outside _ZONE_POLY


async def _grant(db, user: User, perm: Perm, scope: str, role_name: str) -> None:
    """Create a role granting `perm` at `scope` and assign it to `user`."""
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
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


async def _zone_reviewer_with_property_suggestion(db, station_point: Point):
    """Set up a gov team with a WorkZone and a reviewer.

    Sets up a station.review=zone reviewer, and a pending property suggestion whose
    parent station sits at `station_point`. Returns the suggestion.
    """
    team = Team(name="T1", type="gov")
    db.add(team)
    await db.flush()
    reviewer = User(name="Reviewer", team_uuid=team.uuid)
    author = User(name="Author")
    db.add_all([reviewer, author])
    await db.flush()

    zone = WorkZone(name="Z", geometry=from_shape(_ZONE_POLY, srid=4326))
    db.add(zone)
    await db.flush()
    db.add(
        TeamZoneAssign(
            team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(reviewer.uuid)
        )
    )
    await _grant(db, reviewer, Perm.STATION_REVIEW, "zone", "role-review")

    station = Station(geometry=from_shape(station_point, srid=4326), created_by=str(author.uuid))
    db.add(station)
    await db.flush()
    prop = StationProperty(
        station_uuid=station.uuid,
        property_type="supply",
        property_name="water",
        created_by=str(author.uuid),
    )
    db.add(prop)
    await db.flush()
    suggestion = StationUpdateSuggestion(
        target_type="station_property",
        target_uuid=str(prop.uuid),
        field_name="property_name",
        new_value="bottled water",
        comment=None,
        status="pending",
        created_by=str(author.uuid),
    )
    db.add(suggestion)
    await db.flush()
    return reviewer, prop, suggestion


@pytest.mark.asyncio
async def test_zone_reviewer_can_review_property_suggestion_inside_zone(db):
    """Review property suggestion inside zone.

    The parent station sits inside the reviewer's WorkZone, so the borrowed-geometry
    checkpoint 2 passes and the change applies (PR #24 [3]).
    """
    reviewer, prop, suggestion = await _zone_reviewer_with_property_suggestion(db, _INSIDE)

    reviewed = await review_station_suggestion(
        db, actor=reviewer, uuid=str(suggestion.uuid), approve=True
    )

    assert reviewed.status == "approved"
    # commit expired `prop`; reload in the async context before reading the applied value.
    await db.refresh(prop)
    assert prop.property_name == "bottled water"


@pytest.mark.asyncio
async def test_zone_reviewer_is_404_for_property_suggestion_outside_zone(db):
    """Verify 404 for suggestion outside zone.

    Zone is still enforced: a property whose parent station is outside the WorkZone
    still 404s — the fix borrows geometry, it does not blanket-open property reviews.
    """
    reviewer, _prop, suggestion = await _zone_reviewer_with_property_suggestion(db, _OUTSIDE)

    with pytest.raises(HTTPException) as exc:
        await review_station_suggestion(
            db, actor=reviewer, uuid=str(suggestion.uuid), approve=True
        )

    assert exc.value.status_code == 404
