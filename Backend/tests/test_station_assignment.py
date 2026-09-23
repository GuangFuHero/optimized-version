"""Stations are assigned to one team by hand and governed by that assignment (ADR-285).

Service-level (root conftest), like tests/test_suggestion_review_scope.py: authorization lives
in the service layer, so that is where the behaviour is observed.
"""

import os
import uuid as uuidlib
from datetime import UTC, datetime

os.environ["ENV"] = "testing"

import pytest
from fastapi import HTTPException
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.geo import Station
from app.models.notification import Notification
from app.models.photo import Photo
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.station_property import StationProperty, StationUpdateSuggestion
from app.models.team import Team
from app.repositories.geo_repository import station_repository
from app.repositories.photo_repository import photo_repository
from app.services.history import STATION, load_timeline
from app.services.photo import detach_station_photo
from app.services.station import (
    assign_station,
    create_station,
    delete_station,
    update_station,
    update_station_property,
)
from app.services.suggestion import review_station_suggestion
from tests.conftest import acting_as

_POINT = Point(121.5, 24.5)


async def _grant(db, user: User, perm: Perm, scope: str, role_name: str, team=None) -> None:
    """Create a role granting `perm` at `scope`, assign it to `user`, and act as it."""
    await _grant_all(db, user, {perm: scope}, role_name, team=team)


async def _grant_all(db, user: User, grants: dict[Perm, str], role_name: str, team=None) -> None:
    """Create one role holding every `grants` entry, assign it to `user`, and act as it.

    One role, not one per capability: grants only count for the identity being acted as
    (ADR-068/074), so a second role would leave whichever is active holding half of them.
    """
    role = Role(name=role_name, kind="team" if team is not None else "platform")
    db.add(role)
    await db.flush()
    for perm, scope in grants.items():
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
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


async def _team(db, name: str, type_: str) -> Team:
    team = Team(name=name, type=type_)
    db.add(team)
    await db.flush()
    return team


async def _user(db, name: str) -> User:
    user = User(name=name)
    db.add(user)
    await db.flush()
    return user


async def _station(db, *, created_by: User, team: Team | None, name: str = "old name") -> Station:
    station = Station(
        geometry=from_shape(_POINT, srid=4326),
        created_by=str(created_by.uuid),
        team_uuid=team.uuid if team is not None else None,
        name=name,
    )
    db.add(station)
    await db.flush()
    return station


@pytest.mark.asyncio
async def test_team_member_can_edit_a_station_assigned_to_their_team(db):
    """`team` scope on a station compares its `team_uuid` with the actor's active team."""
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    member = await _user(db, "Member")
    station = await _station(db, created_by=author, team=ngo)
    await _grant(db, member, Perm.STATION_EDIT, "team", "role-edit", team=ngo)

    updated = await update_station(db, actor=member, uuid=str(station.uuid), changes={"name": "new name"})

    assert updated.name == "new name"


@pytest.mark.asyncio
@pytest.mark.parametrize("assigned_elsewhere", [True, False], ids=["other-team", "unassigned"])
async def test_ngo_member_is_404_for_a_station_not_assigned_to_their_team(db, assigned_elsewhere):
    """An ngo's `team` scope reaches neither another team's station nor an unassigned one."""
    ngo = await _team(db, "NGO", "ngo")
    other = await _team(db, "Other NGO", "ngo")
    author = await _user(db, "Author")
    member = await _user(db, "Member")
    station = await _station(db, created_by=author, team=other if assigned_elsewhere else None)
    await _grant(db, member, Perm.STATION_EDIT, "team", "role-edit", team=ngo)

    with pytest.raises(HTTPException) as exc:
        await update_station(db, actor=member, uuid=str(station.uuid), changes={"name": "new name"})

    assert exc.value.status_code == 404


async def _create(db, actor: User) -> Station:
    station = await create_station(
        db,
        actor=actor,
        geometry={"type": "Point", "coordinates": [121.5, 24.5]},
        type="supply",
        name="New station",
        description=None,
        op_hour=None,
        level=0,
        comment=None,
        source="manual",
        visibility="public",
    )
    # The service commits and the test session expires on commit (tests/conftest.py).
    await db.refresh(station)
    return station


@pytest.mark.asyncio
async def test_a_station_created_as_a_team_is_assigned_to_that_team(db):
    """Creating as a team identity assigns the new station to that team (ADR-285 decision 6)."""
    ngo = await _team(db, "NGO", "ngo")
    member = await _user(db, "Member")
    await _grant(db, member, Perm.STATION_ADD, "all", "role-add", team=ngo)
    ngo_uuid = str(ngo.uuid)  # read before the service's commit expires `ngo`

    station = await _create(db, member)

    assert str(station.team_uuid) == ngo_uuid


@pytest.mark.asyncio
async def test_a_station_created_as_a_platform_identity_is_unassigned(db):
    """A citizen (platform identity) has no team, so the station starts unassigned."""
    citizen = await _user(db, "Citizen")
    await _grant(db, citizen, Perm.STATION_ADD, "all", "role-add")

    station = await _create(db, citizen)

    assert station.team_uuid is None


@pytest.mark.asyncio
@pytest.mark.parametrize("assigned_to_ngo", [True, False], ids=["ngo-station", "unassigned"])
async def test_gov_member_can_edit_any_station(db, assigned_to_ngo):
    """For a gov team `team` scope widens to `all`, reaching ngo and unassigned stations alike."""
    gov = await _team(db, "Gov", "gov")
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    member = await _user(db, "Gov member")
    station = await _station(db, created_by=author, team=ngo if assigned_to_ngo else None)
    await _grant(db, member, Perm.STATION_EDIT, "team", "role-edit", team=gov)

    updated = await update_station(db, actor=member, uuid=str(station.uuid), changes={"name": "new name"})

    assert updated.name == "new name"


@pytest.mark.asyncio
async def test_gov_admin_can_delete_a_station_assigned_to_an_ngo(db):
    """The gov widening covers delete too (ADR-285 decision 5)."""
    gov = await _team(db, "Gov", "gov")
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    admin = await _user(db, "Gov admin")
    station = await _station(db, created_by=author, team=ngo)
    station_uuid = str(station.uuid)
    await _grant(db, admin, Perm.STATION_DELETE, "team", "role-delete", team=gov)

    await delete_station(db, actor=admin, uuid=station_uuid)

    assert await station_repository.get_by_uuid_active(db, station_uuid) is None


@pytest.mark.asyncio
async def test_gov_widening_leaves_own_scope_alone(db):
    """Only `team` widens for gov: a gov member's `station.delete=own` still means own."""
    gov = await _team(db, "Gov", "gov")
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    member = await _user(db, "Gov member")
    station = await _station(db, created_by=author, team=ngo)
    await _grant(db, member, Perm.STATION_DELETE, "own", "role-delete", team=gov)

    with pytest.raises(HTTPException) as exc:
        await delete_station(db, actor=member, uuid=str(station.uuid))

    assert exc.value.status_code == 403


async def _property(db, station: Station, author: User) -> StationProperty:
    prop = StationProperty(
        station_uuid=station.uuid,
        property_type="supply",
        property_name="water",
        quantity=1,
        created_by=str(author.uuid),
    )
    db.add(prop)
    await db.flush()
    return prop


@pytest.mark.asyncio
async def test_a_property_follows_its_stations_team(db):
    """A property has no team of its own; it borrows its parent station's (like ADR-052)."""
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    member = await _user(db, "Member")
    station = await _station(db, created_by=author, team=ngo)
    prop = await _property(db, station, author)
    await _grant(db, member, Perm.STATION_EDIT, "team", "role-edit", team=ngo)

    updated = await update_station_property(db, actor=member, uuid=str(prop.uuid), changes={"quantity": 5})

    assert updated.quantity == 5


@pytest.mark.asyncio
async def test_a_property_suggestion_is_reviewed_by_the_stations_team(db):
    """Reviewing a property suggestion scopes through the parent station's team."""
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    reviewer = await _user(db, "Reviewer")
    station = await _station(db, created_by=author, team=ngo)
    prop = await _property(db, station, author)
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
    await _grant(db, reviewer, Perm.STATION_REVIEW, "team", "role-review", team=ngo)

    reviewed = await review_station_suggestion(db, actor=reviewer, uuid=str(suggestion.uuid), approve=True)

    assert reviewed.status == "approved"


@pytest.mark.asyncio
async def test_a_station_photo_is_moderated_by_the_stations_team(db):
    """Removing someone else's photo scopes through the parent station's team."""
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    reviewer = await _user(db, "Reviewer")
    station = await _station(db, created_by=author, team=ngo)
    photo = Photo(ref_uuid=station.uuid, ref_type="geometry", url="https://example.test/a.jpg",
                  created_by=str(author.uuid))
    db.add(photo)
    await db.flush()
    photo_uuid = str(photo.uuid)
    await _grant(db, reviewer, Perm.STATION_REVIEW, "team", "role-review", team=ngo)

    await detach_station_photo(db, actor=reviewer, uuid=photo_uuid)

    assert await photo_repository.get_by_uuid_active(db, photo_uuid) is None


@pytest.mark.asyncio
async def test_the_timeline_names_the_team_a_station_was_assigned_to(db):
    """ADR-285 decision 9: a reassignment reads as team names, not bare uuids.

    The audit row is written by hand, shaped the way `audit_trigger_func()` writes it: the
    `db` fixture builds the schema without the triggers (see tests/test_history_service.py).
    """
    ngo = await _team(db, "花蓮慈濟搜救隊", "ngo")
    author = await _user(db, "Author")
    viewer = await _user(db, "Viewer")
    station = await _station(db, created_by=author, team=ngo)
    db.add(
        AuditLog(
            uuid=uuidlib.uuid4(), table_name="stations", action="UPDATE", row_id=station.uuid,
            old_values={"team_uuid": None}, new_values={"team_uuid": str(ngo.uuid)},
            user_uuid=author.uuid, client_ip="10.0.0.1", created_at=datetime.now(UTC),
        )
    )
    await db.flush()
    await _grant(db, viewer, Perm.STATION_VIEW_HISTORY, "all", "role-history")

    timeline = await load_timeline(db, actor=viewer, entity=STATION, uuid=station.uuid, limit=50, offset=0)

    changes = [c for event in timeline.events for c in event["changes"] if c["field"] == "team_uuid"]
    assert changes == [{"field": "team_uuid", "before": None, "after": "花蓮慈濟搜救隊"}]


@pytest.mark.asyncio
async def test_a_teams_history_scope_stops_at_its_own_stations(db):
    """`station.view_history=team` reaches the team's stations only, like edit does."""
    ngo = await _team(db, "NGO", "ngo")
    other = await _team(db, "Other NGO", "ngo")
    author = await _user(db, "Author")
    viewer = await _user(db, "Viewer")
    station = await _station(db, created_by=author, team=other)
    await _grant(db, viewer, Perm.STATION_VIEW_HISTORY, "team", "role-history", team=ngo)

    with pytest.raises(HTTPException) as exc:
        await load_timeline(db, actor=viewer, entity=STATION, uuid=station.uuid, limit=50, offset=0)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("whose", "expected"), [("own", "0912345678"), ("other", "09*****678")], ids=["own-team", "other-team"]
)
async def test_a_teams_timeline_contacts_follow_the_assignment(db, whose, expected):
    """The timeline's PII tier gates on `station.view_pii` like the single-row query does.

    `view_history=all` opens both timelines; `view_pii=team` then decides raw or masked.
    """
    ngo = await _team(db, "NGO", "ngo")
    other = await _team(db, "Other NGO", "ngo")
    author = await _user(db, "Author")
    viewer = await _user(db, "Viewer")
    station = await _station(db, created_by=author, team=ngo if whose == "own" else other)
    db.add(
        AuditLog(
            uuid=uuidlib.uuid4(), table_name="stations", action="UPDATE", row_id=station.uuid,
            old_values={"contact_phone": None}, new_values={"contact_phone": "0912345678"},
            user_uuid=author.uuid, client_ip="10.0.0.1", created_at=datetime.now(UTC),
        )
    )
    await db.flush()
    await _grant_all(
        db, viewer, {Perm.STATION_VIEW_HISTORY: "all", Perm.STATION_VIEW_PII: "team"}, "role-read", team=ngo
    )

    timeline = await load_timeline(db, actor=viewer, entity=STATION, uuid=station.uuid, limit=50, offset=0)

    [change] = [c for e in timeline.events for c in e["changes"] if c["field"] == "contact_phone"]
    assert change["after"] == expected


# --- assigning (ADR-285 decision 4) ---


@pytest.mark.asyncio
async def test_a_gov_admin_assigns_a_station_to_a_team(db):
    """Gov assigns; the station then belongs to that team."""
    gov = await _team(db, "Gov", "gov")
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    admin = await _user(db, "Gov admin")
    station = await _station(db, created_by=author, team=None)
    station_uuid, ngo_uuid = str(station.uuid), str(ngo.uuid)
    await _grant(db, admin, Perm.STATION_ASSIGN, "all", "role-assign", team=gov)

    assigned = await assign_station(db, actor=admin, station_uuid=station_uuid, team_uuid=ngo_uuid)

    assert str(assigned.team_uuid) == ngo_uuid


@pytest.mark.asyncio
async def test_an_ngo_admin_holding_station_assign_is_refused(db):
    """Gov-only like work_zone.assign: the seed gives it to every team admin, the type check fences ngo."""
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    admin = await _user(db, "NGO admin")
    station = await _station(db, created_by=author, team=None)
    await _grant(db, admin, Perm.STATION_ASSIGN, "all", "role-assign", team=ngo)

    with pytest.raises(HTTPException) as exc:
        await assign_station(db, actor=admin, station_uuid=str(station.uuid), team_uuid=str(ngo.uuid))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_a_super_admin_platform_identity_can_assign(db):
    """The gov fence is aimed at team identities; a platform holder passes it."""
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    root = await _user(db, "Super admin")
    station = await _station(db, created_by=author, team=None)
    station_uuid, ngo_uuid = str(station.uuid), str(ngo.uuid)
    await _grant(db, root, Perm.STATION_ASSIGN, "all", "role-assign")

    assigned = await assign_station(db, actor=root, station_uuid=station_uuid, team_uuid=ngo_uuid)

    assert str(assigned.team_uuid) == ngo_uuid


@pytest.mark.asyncio
async def test_unassigning_clears_the_team(db):
    """`team_uuid=None` takes the station back; it is then unassigned."""
    gov = await _team(db, "Gov", "gov")
    ngo = await _team(db, "NGO", "ngo")
    author = await _user(db, "Author")
    admin = await _user(db, "Gov admin")
    station = await _station(db, created_by=author, team=ngo)
    station_uuid = str(station.uuid)
    await _grant(db, admin, Perm.STATION_ASSIGN, "all", "role-assign", team=gov)

    unassigned = await assign_station(db, actor=admin, station_uuid=station_uuid, team_uuid=None)

    assert unassigned.team_uuid is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("target", "message"), [("missing", "Team not found"), ("inactive", "Team is not active")]
)
async def test_a_station_cannot_go_to_a_missing_or_inactive_team(db, target, message):
    """Same create-time check as assign_zone_to_team: the target team must exist and be active."""
    gov = await _team(db, "Gov", "gov")
    author = await _user(db, "Author")
    admin = await _user(db, "Gov admin")
    station = await _station(db, created_by=author, team=None)
    if target == "inactive":
        dormant = Team(name="Dormant", type="ngo", status="inactive")
        db.add(dormant)
        await db.flush()
        team_uuid = str(dormant.uuid)
    else:
        team_uuid = str(uuidlib.uuid4())
    await _grant(db, admin, Perm.STATION_ASSIGN, "all", "role-assign", team=gov)

    with pytest.raises(ValueError, match=message):
        await assign_station(db, actor=admin, station_uuid=str(station.uuid), team_uuid=team_uuid)


async def _admin_of(db, team: Team, admin_role: Role) -> str:
    """A user holding the team's `admin` role — who `resolve_team_admin` notifies."""
    user = await _user(db, f"{team.name} admin")
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=admin_role.uuid, team_uuid=team.uuid))
    await db.flush()
    return str(user.uuid)


async def _notification_types(db, recipient: str) -> list[str]:
    rows = await db.execute(select(Notification.type).where(Notification.recipient_uuid == recipient))
    return sorted(rows.scalars().all())


@pytest.mark.asyncio
async def test_reassigning_tells_both_teams(db):
    """ADR-285 decision 4: the new team hears it got the station, the old one that it lost it."""
    gov = await _team(db, "Gov", "gov")
    old = await _team(db, "Old NGO", "ngo")
    new = await _team(db, "New NGO", "ngo")
    admin_role = Role(name="admin", kind="team")
    db.add(admin_role)
    await db.flush()
    old_admin = await _admin_of(db, old, admin_role)
    new_admin = await _admin_of(db, new, admin_role)
    author = await _user(db, "Author")
    assigner = await _user(db, "Gov admin")
    station = await _station(db, created_by=author, team=old)
    station_uuid, new_uuid = str(station.uuid), str(new.uuid)
    await _grant(db, assigner, Perm.STATION_ASSIGN, "all", "role-assign", team=gov)

    await assign_station(db, actor=assigner, station_uuid=station_uuid, team_uuid=new_uuid)

    assert await _notification_types(db, old_admin) == ["station_unassigned"]
    assert await _notification_types(db, new_admin) == ["station_assigned"]


@pytest.mark.asyncio
async def test_assigning_to_the_team_it_already_has_changes_nothing(db):
    """Idempotent like assign_zone_to_team: nothing moved, so nobody is told anything."""
    gov = await _team(db, "Gov", "gov")
    ngo = await _team(db, "NGO", "ngo")
    admin_role = Role(name="admin", kind="team")
    db.add(admin_role)
    await db.flush()
    ngo_admin = await _admin_of(db, ngo, admin_role)
    author = await _user(db, "Author")
    assigner = await _user(db, "Gov admin")
    station = await _station(db, created_by=author, team=ngo)
    station_uuid, ngo_uuid = str(station.uuid), str(ngo.uuid)
    await _grant(db, assigner, Perm.STATION_ASSIGN, "all", "role-assign", team=gov)

    await assign_station(db, actor=assigner, station_uuid=station_uuid, team_uuid=ngo_uuid)

    assert await _notification_types(db, ngo_admin) == []
