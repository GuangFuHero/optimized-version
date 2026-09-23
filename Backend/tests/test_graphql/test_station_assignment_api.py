"""GraphQL surface of station assignment (ADR-285).

The authorization and notification rules are pinned at the service layer in
tests/test_station_assignment.py; these only prove the API is wired to them.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.geo import Station
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header, test_db

ASSIGN = """
mutation($stationUuid: UUID!, $teamUuid: UUID!) {
    assignStationToTeam(stationUuid: $stationUuid, teamUuid: $teamUuid) { uuid }
}
"""

UNASSIGN = """
mutation($stationUuid: UUID!) { unassignStation(stationUuid: $stationUuid) { uuid } }
"""


async def _permission(db, perm: Perm) -> Permission:
    """Reuse the Permission row: the test_graphql schema persists across tests."""
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    return permission


async def _gov_assigner(redis) -> str:
    """A token acting as a gov team identity that holds `station.assign`."""
    async with test_db() as db:
        team = Team(name=f"Gov {uuid_mod.uuid4().hex[:8]}", type="gov")
        role = Role(name=f"assigner-{uuid_mod.uuid4().hex[:8]}", kind="team")
        user = User(name=f"gov_{uuid_mod.uuid4().hex[:8]}")
        db.add_all([team, role, user])
        await db.flush()
        permission = await _permission(db, Perm.STATION_ASSIGN)
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid))
        await db.flush()
        return await token_for(redis, user.uuid, role, team)


async def _station_and_team() -> tuple[str, str]:
    """An unassigned station and an ngo team to hand it to."""
    async with test_db() as db:
        author = User(name=f"author_{uuid_mod.uuid4().hex[:8]}")
        team = Team(name=f"NGO {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add_all([author, team])
        await db.flush()
        station = Station(geometry=from_shape(Point(121.5, 24.5), srid=4326), created_by=str(author.uuid))
        db.add(station)
        await db.flush()
        return str(station.uuid), str(team.uuid)


async def _team_of(station_uuid: str) -> str | None:
    async with test_db() as db:
        team_uuid = await db.scalar(select(Station.team_uuid).where(Station.uuid == station_uuid))
        return str(team_uuid) if team_uuid else None


@pytest.mark.asyncio
async def test_a_station_is_assigned_and_unassigned_through_graphql(client, redis):
    """The assign mutation hands the station over; the unassign mutation takes it back."""
    token = await _gov_assigner(redis)
    station_uuid, team_uuid = await _station_and_team()

    assigned = await client.post(
        "/graphql",
        json={"query": ASSIGN, "variables": {"stationUuid": station_uuid, "teamUuid": team_uuid}},
        headers=auth_header(token),
    )
    assert "errors" not in assigned.json(), assigned.json()
    assert await _team_of(station_uuid) == team_uuid

    unassigned = await client.post(
        "/graphql",
        json={"query": UNASSIGN, "variables": {"stationUuid": station_uuid}},
        headers=auth_header(token),
    )
    assert "errors" not in unassigned.json(), unassigned.json()
    assert await _team_of(station_uuid) is None


# --- reading the assignment (ADR-285 decision 11) ---

STATION_TEAM = "query($uuid: UUID!) { station(uuid: $uuid) { assignedTeam { uuid name } } }"

STATIONS_BY_ASSIGNMENT = """
query($q: String!, $teamUuid: UUID, $unassignedOnly: Boolean) {
    stations(q: $q, assignedTeamUuid: $teamUuid, unassignedOnly: $unassignedOnly) {
        items { name }
        pageInfo { totalCount }
    }
}
"""


async def _assigned_and_unassigned() -> dict[str, str]:
    """One station assigned to a fresh team and one unassigned, sharing a unique name tag.

    The test_graphql schema persists across tests, so every listing also sees other tests'
    stations; searching by the tag keeps the assertions to these two.
    """
    tag = f"篩選{uuid_mod.uuid4().hex[:8]}"
    async with test_db() as db:
        author = User(name=f"author_{uuid_mod.uuid4().hex[:8]}")
        team = Team(name=f"NGO {tag}", type="ngo")
        db.add_all([author, team])
        await db.flush()
        stations = {}
        for key, team_uuid in (("assigned", team.uuid), ("unassigned", None)):
            station = Station(
                geometry=from_shape(Point(121.5, 24.5), srid=4326), created_by=str(author.uuid),
                name=f"{tag} {key}", team_uuid=team_uuid,
            )
            db.add(station)
            await db.flush()
            stations[key] = str(station.uuid)
        return {"tag": tag, "team_uuid": str(team.uuid), "team_name": team.name, **stations}


@pytest.mark.asyncio
async def test_anyone_can_see_which_team_runs_a_station(client):
    """Public, like the station itself: an anonymous caller gets the team's name, or null."""
    made = await _assigned_and_unassigned()

    assigned = await client.post(
        "/graphql", json={"query": STATION_TEAM, "variables": {"uuid": made["assigned"]}}
    )
    unassigned = await client.post(
        "/graphql", json={"query": STATION_TEAM, "variables": {"uuid": made["unassigned"]}}
    )

    assert "errors" not in assigned.json(), assigned.json()
    assert assigned.json()["data"]["station"]["assignedTeam"] == {
        "uuid": made["team_uuid"], "name": made["team_name"]
    }
    assert unassigned.json()["data"]["station"]["assignedTeam"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize("by", ["assigned", "unassigned"])
async def test_stations_can_be_listed_by_assignment(client, by):
    """By one team's stations, or only the unassigned ones — gov's queue to hand out."""
    made = await _assigned_and_unassigned()
    tag, team_uuid, expected = made["tag"], made["team_uuid"], by
    variables = {"q": tag, "teamUuid": team_uuid} if by == "assigned" else {"q": tag, "unassignedOnly": True}

    resp = await client.post("/graphql", json={"query": STATIONS_BY_ASSIGNMENT, "variables": variables})

    body = resp.json()
    assert "errors" not in body, body
    assert [item["name"] for item in body["data"]["stations"]["items"]] == [f"{tag} {expected}"]
    assert body["data"]["stations"]["pageInfo"]["totalCount"] == 1


@pytest.mark.asyncio
async def test_the_two_assignment_filters_cannot_be_combined(client):
    """One team's stations and "no team at all" contradict each other; say so instead of []."""
    made = await _assigned_and_unassigned()

    resp = await client.post(
        "/graphql",
        json={
            "query": STATIONS_BY_ASSIGNMENT,
            "variables": {"q": made["tag"], "teamUuid": made["team_uuid"], "unassignedOnly": True},
        },
    )

    assert any("cannot be combined" in e["message"] for e in resp.json().get("errors", [])), resp.json()


@pytest.mark.asyncio
async def test_a_station_of_a_deleted_team_reads_as_unassigned(client):
    """ADR-285 decision 8: the station must not claim a team that no longer exists."""
    made = await _assigned_and_unassigned()
    async with test_db() as db:
        team = await db.get(Team, uuid_mod.UUID(made["team_uuid"]))
        team.delete_at = datetime.now(UTC)

    resp = await client.post(
        "/graphql", json={"query": STATION_TEAM, "variables": {"uuid": made["assigned"]}}
    )

    assert "errors" not in resp.json(), resp.json()
    assert resp.json()["data"]["station"]["assignedTeam"] is None


@pytest.mark.asyncio
async def test_a_station_of_a_deleted_team_is_in_the_unassigned_queue(client):
    """It reads as unassigned, so gov must find it where unassigned stations are listed."""
    made = await _assigned_and_unassigned()
    async with test_db() as db:
        team = await db.get(Team, uuid_mod.UUID(made["team_uuid"]))
        team.delete_at = datetime.now(UTC)

    resp = await client.post(
        "/graphql",
        json={"query": STATIONS_BY_ASSIGNMENT, "variables": {"q": made["tag"], "unassignedOnly": True}},
    )

    body = resp.json()
    assert "errors" not in body, body
    assert sorted(item["name"] for item in body["data"]["stations"]["items"]) == [
        f"{made['tag']} assigned", f"{made['tag']} unassigned"
    ]
