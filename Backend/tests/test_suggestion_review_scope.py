"""Scope checks for merging station_property suggestions (ADR-285).

A merge is scope-checked against the station, so a `station.review=team` reviewer reaches
property suggestions on stations assigned to its team and gets a 404 on any other team's.
Service-level (not GraphQL) so it uses the root conftest, not the test_graphql one.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.station_property import StationProperty, StationUpdateSuggestion
from app.models.team import Team
from app.services.suggestion import SuggestionDecision, merge_station_suggestions
from tests.conftest import acting_as

_POINT = Point(121.5, 24.5)


async def _grant(db, user: User, perm: Perm, scope: str, role_name: str, team=None) -> None:
    """Create a role granting `perm` at `scope`, assign it to `user`, and act as it.

    Grants only count for the identity being acted as (ADR-068/074), so assigning without
    activating would leave the reviewer with nothing.
    """
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
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


async def _team_reviewer_with_property_suggestion(db, *, on_own_station: bool):
    """Build an ngo team, a station.review=team reviewer, and a pending property suggestion.

    The suggestion's parent station is assigned to the reviewer's team when `on_own_station`,
    otherwise to another team. An ngo team on purpose: a gov team's `team` widens to `all`.
    Returns the reviewer, the property and the suggestion.
    """
    team = Team(name="T1", type="ngo")
    other = Team(name="T2", type="ngo")
    db.add_all([team, other])
    await db.flush()
    reviewer = User(name="Reviewer")
    author = User(name="Author")
    db.add_all([reviewer, author])
    await db.flush()
    await _grant(db, reviewer, Perm.STATION_REVIEW, "team", "role-review", team=team)

    station = Station(
        geometry=from_shape(_POINT, srid=4326), created_by=str(author.uuid),
        team_uuid=team.uuid if on_own_station else other.uuid,
    )
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


def _decide(prop) -> list[SuggestionDecision]:
    return [SuggestionDecision(str(prop.uuid), "property_name", True, "bottled water")]


@pytest.mark.asyncio
async def test_team_reviewer_can_merge_property_suggestion_on_its_own_station(db):
    """A property on a station assigned to the reviewer's team can be merged."""
    reviewer, prop, suggestion = await _team_reviewer_with_property_suggestion(db, on_own_station=True)

    await merge_station_suggestions(
        db, actor=reviewer, station_uuid=str(prop.station_uuid), decisions=_decide(prop)
    )

    await db.refresh(suggestion)
    assert suggestion.status == "approved"
    # commit expired `prop`; reload in the async context before reading the applied value.
    await db.refresh(prop)
    assert prop.property_name == "bottled water"


@pytest.mark.asyncio
async def test_team_reviewer_is_404_for_property_suggestion_on_another_teams_station(db):
    """A property whose parent station another team runs 404s."""
    reviewer, prop, _suggestion = await _team_reviewer_with_property_suggestion(db, on_own_station=False)

    with pytest.raises(HTTPException) as exc:
        await merge_station_suggestions(
            db, actor=reviewer, station_uuid=str(prop.station_uuid), decisions=_decide(prop)
        )

    assert exc.value.status_code == 404
