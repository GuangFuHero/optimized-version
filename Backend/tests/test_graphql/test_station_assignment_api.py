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


async def _team_member(redis, team_type: str, perm: Perm, scope: str) -> tuple[str, str]:
    """A token acting as a fresh `team_type` team's identity holding `perm` at `scope`.

    Returns (token, team_uuid).
    """
    async with test_db() as db:
        team = Team(name=f"{team_type} {uuid_mod.uuid4().hex[:8]}", type=team_type)
        role = Role(name=f"member-{uuid_mod.uuid4().hex[:8]}", kind="team")
        user = User(name=f"{team_type}_{uuid_mod.uuid4().hex[:8]}")
        db.add_all([team, role, user])
        await db.flush()
        permission = await _permission(db, perm)
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid))
        await db.flush()
        return await token_for(redis, user.uuid, role, team), str(team.uuid)


async def _gov_assigner(redis) -> str:
    """A token acting as a gov team identity that holds `station.assign`."""
    token, _ = await _team_member(redis, "gov", Perm.STATION_ASSIGN, "all")
    return token


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


ASSIGNABLE_TEAMS = "{ assignableStationTeams { uuid name type } }"


@pytest.mark.asyncio
async def test_a_gov_assigner_can_pick_a_team_that_is_not_its_own(client, redis):
    """The picker offers other teams, which team.view=team would never list for a gov member."""
    token = await _gov_assigner(redis)
    _, ngo_uuid = await _station_and_team()

    resp = await client.post("/graphql", json={"query": ASSIGNABLE_TEAMS}, headers=auth_header(token))

    body = resp.json()
    assert "errors" not in body, body
    assert ngo_uuid in {team["uuid"] for team in body["data"]["assignableStationTeams"]}


@pytest.mark.asyncio
async def test_an_ngo_holding_station_assign_gets_no_team_list(client, redis):
    """Refused where the assignment itself would be."""
    token, _ = await _team_member(redis, "ngo", Perm.STATION_ASSIGN, "all")

    resp = await client.post("/graphql", json={"query": ASSIGNABLE_TEAMS}, headers=auth_header(token))

    assert "Only gov teams" in resp.json()["errors"][0]["message"]


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


# --- contact details follow the assignment (ADR-285, `station.view_pii=team`) ---

PHONE = "0912345678"
MASKED_PHONE = "09*****678"

STATION_CONTACTS = """
query($q: String!) { stations(q: $q) { items { name contactPhone } } }
"""


async def _contact_stations(own_team_uuid: str) -> str:
    """Three stations with a contact phone: on `own_team_uuid`, on another team, unassigned."""
    tag = f"聯絡{uuid_mod.uuid4().hex[:8]}"
    async with test_db() as db:
        author = User(name=f"author_{uuid_mod.uuid4().hex[:8]}")
        other = Team(name=f"Other {tag}", type="ngo")
        db.add_all([author, other])
        await db.flush()
        for key, team_uuid in (("own", own_team_uuid), ("other", str(other.uuid)), ("unassigned", None)):
            db.add(Station(
                geometry=from_shape(Point(121.5, 24.5), srid=4326), created_by=str(author.uuid),
                name=f"{tag} {key}", team_uuid=team_uuid, contact_phone=PHONE,
            ))
        await db.flush()
    return tag


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("team_type", "expected"),
    [
        ("ngo", {"own": PHONE, "other": MASKED_PHONE, "unassigned": MASKED_PHONE}),
        ("gov", {"own": PHONE, "other": PHONE, "unassigned": PHONE}),
    ],
    ids=["ngo-sees-its-own", "gov-sees-all"],
)
async def test_station_contacts_follow_the_assignment(client, redis, team_type, expected):
    """An ngo sees the contacts of the stations it runs; gov sees every station's (decision 5).

    A listing, not one station at a time, so the per-row checks run side by side the way a
    real map page runs them.
    """
    token, team_uuid = await _team_member(redis, team_type, Perm.STATION_VIEW_PII, "team")
    tag = await _contact_stations(team_uuid)

    resp = await client.post(
        "/graphql", json={"query": STATION_CONTACTS, "variables": {"q": tag}}, headers=auth_header(token)
    )

    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["stations"]["items"]
    phones = {item["name"].removeprefix(f"{tag} "): item["contactPhone"] for item in items}
    assert phones == expected


# --- per-station edit/delete rights follow the assignment (WG-168, `station.edit=team`) ---

STATION_RIGHTS = """
query($q: String!) {
    stations(q: $q) {
        items { name viewerCanEdit viewerCanDelete viewerCanViewHistory viewerCanViewPii viewerCanExport }
    }
}
"""


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("team_type", "expected"),
    [
        ("ngo", {"own": True, "other": False, "unassigned": False}),
        ("gov", {"own": True, "other": True, "unassigned": True}),
    ],
    ids=["ngo-edits-its-own", "gov-edits-all"],
)
@pytest.mark.parametrize(
    ("perm", "field"),
    [
        (Perm.STATION_EDIT, "viewerCanEdit"),
        (Perm.STATION_DELETE, "viewerCanDelete"),
        (Perm.STATION_VIEW_HISTORY, "viewerCanViewHistory"),
        (Perm.STATION_VIEW_PII, "viewerCanViewPii"),
        (Perm.STATION_EXPORT, "viewerCanExport"),
    ],
    ids=["edit", "delete", "view-history", "view-pii", "export"],
)
async def test_station_rights_follow_the_assignment(client, redis, team_type, expected, perm, field):
    """A row the caller cannot act on says so, so the page offers no control that would 404."""
    token, team_uuid = await _team_member(redis, team_type, perm, "team")
    tag = await _contact_stations(team_uuid)

    resp = await client.post(
        "/graphql", json={"query": STATION_RIGHTS, "variables": {"q": tag}}, headers=auth_header(token)
    )

    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["stations"]["items"]
    assert {item["name"].removeprefix(f"{tag} "): item[field] for item in items} == expected


@pytest.mark.asyncio
async def test_an_anonymous_caller_can_change_no_station(client):
    """No user means no rights, and no field-level error either."""
    tag = await _contact_stations(str((await _station_and_team())[1]))

    resp = await client.post("/graphql", json={"query": STATION_RIGHTS, "variables": {"q": tag}})

    body = resp.json()
    assert "errors" not in body, body
    items = body["data"]["stations"]["items"]
    assert all(not any(value for key, value in item.items() if key != "name") for item in items)


# --- the review queue holds only what the caller can review (WG-168, `station.review=team`) ---

REVIEWABLE = "query($q: String!) { stations(q: $q, reviewableOnly: true) { items { name } } }"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("team_type", "expected"),
    [("ngo", {"own"}), ("gov", {"own", "other", "unassigned"})],
    ids=["ngo-reviews-its-own", "gov-reviews-all"],
)
async def test_reviewable_only_keeps_the_stations_the_caller_can_review(client, redis, team_type, expected):
    """Another team's suggestions are not this team's to decide, so they stay out of its queue."""
    token, team_uuid = await _team_member(redis, team_type, Perm.STATION_REVIEW, "team")
    tag = await _contact_stations(team_uuid)

    resp = await client.post(
        "/graphql", json={"query": REVIEWABLE, "variables": {"q": tag}}, headers=auth_header(token)
    )

    body = resp.json()
    assert "errors" not in body, body
    assert {item["name"].removeprefix(f"{tag} ") for item in body["data"]["stations"]["items"]} == expected


@pytest.mark.asyncio
async def test_reviewable_only_is_empty_without_station_review(client, redis):
    """Holding view but not review leaves nothing to review, rather than everything."""
    token, team_uuid = await _team_member(redis, "gov", Perm.STATION_EDIT, "team")
    tag = await _contact_stations(team_uuid)

    for headers in (auth_header(token), {}):
        resp = await client.post(
            "/graphql", json={"query": REVIEWABLE, "variables": {"q": tag}}, headers=headers
        )
        body = resp.json()
        assert "errors" not in body, body
        assert body["data"]["stations"]["items"] == []
