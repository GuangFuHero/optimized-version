"""GraphQL integration tests for map areas (危險區, 責任區, 標示區) and team zone assignment.

Covers the gov gate on drawing, the hazard-always-public and team-zone-needs-a-team rules,
the public visibility switch and viewport, mark -> hazard promotion, and assign/remove.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team, TeamZone, TeamZoneAssign
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header, test_db

CREATE_AREA = """
mutation($input: CreateAreaInput!) {
    createArea(input: $input) { uuid type name note isPublic }
}
"""

UPDATE_AREA = """
mutation($uuid: UUID!, $input: UpdateAreaInput!) {
    updateArea(uuid: $uuid, input: $input) { uuid name isPublic }
}
"""

TEAM_ZONES = """
query { teamZones { items { uuid } pageInfo { totalCount } } }
"""

TEAM_ZONES_IN = """
query($bounds: BoundsInput) { teamZones(bounds: $bounds) { items { uuid } } }
"""

AREAS = """
query($bounds: BoundsInput, $includePrivate: Boolean! = false) {
    areas(bounds: $bounds, includePrivate: $includePrivate) { items { uuid type isPublic } }
}
"""

PROMOTE = """
mutation($uuid: UUID!, $input: PromoteMarkZoneInput!) {
    promoteMarkZone(uuid: $uuid, input: $input) { uuid propertyName name note status }
}
"""

HAZARD_STATUS = "query($uuid: UUID!) { hazardousZone(uuid: $uuid) { status } }"

ASSIGN_ZONE = """
mutation($input: ZoneTeamAssignmentInput!) { assignZoneToTeam(input: $input) { zoneUuid } }
"""

REMOVE_ZONE = """
mutation($input: ZoneTeamAssignmentInput!) { removeZoneFromTeam(input: $input) }
"""

DELETE_AREA = "mutation($uuid: UUID!) { deleteArea(uuid: $uuid) }"

ASSIGN_ZONE_FULL = """
mutation($input: ZoneTeamAssignmentInput!) {
    assignZoneToTeam(input: $input) { zoneUuid teamUuid assignedAt assignedBy }
}
"""

ZONE_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[121.0, 24.0], [121.0, 25.0], [122.0, 25.0], [122.0, 24.0], [121.0, 24.0]]],
}

ZONES_BY_TEAM = """
query($teamUuid: UUID!) {
    zonesByTeam(teamUuid: $teamUuid) { items { uuid name } pageInfo { totalCount } }
}
"""

ZONE_WITH_TEAMS = """
query($uuid: UUID!) {
    teamZone(uuid: $uuid) { uuid assignedTeams { uuid name type } }
}
"""


def _square(lng: float, lat: float, size: float = 0.01) -> dict:
    """A small GeoJSON square with its south-west corner at (lng, lat)."""
    ring = [[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]
    return {"type": "Polygon", "coordinates": [ring]}


def _box(lng: float, lat: float, size: float = 0.05) -> dict:
    """A BoundsInput around (lng, lat); tests use their own far-apart corners of the map."""
    return {"minLng": lng - size, "minLat": lat - size, "maxLng": lng + size, "maxLat": lat + size}


def _zone_input(name: str, team_uuid: str, geometry: dict = ZONE_POLYGON) -> dict:
    """Build createArea variables for a team zone with its first team."""
    return {"input": {"type": "team_zone", "name": name, "geometry": geometry, "teamUuid": team_uuid}}


async def _create(client, token: str, variables: dict) -> dict:
    """Run createArea and return the response body."""
    resp = await client.post(
        "/graphql", json={"query": CREATE_AREA, "variables": variables}, headers=auth_header(token)
    )
    return resp.json()


async def _new_team(status: str = "active") -> str:
    """Create a bare ngo Team row and return its uuid."""
    async with test_db() as db:
        team = Team(name=f"Team {uuid_mod.uuid4().hex[:8]}", type="ngo", status=status)
        db.add(team)
        await db.flush()
        return str(team.uuid)


async def _grant(db, role: Role, perm_cache: dict, perm: Perm, scope: str) -> None:
    """Create (or reuse) a Permission row and grant `role` `perm` at `scope`.

    Looks up an existing Permission row first: the shared test_db() schema in this file
    persists across tests (test_graphql/conftest.py only creates it once), so a second
    test granting the same Perm would otherwise collide with Permission.key's unique
    constraint.
    """
    permission = perm_cache.get(perm.value)
    if permission is None:
        result = await db.execute(select(Permission).where(Permission.key == perm.value))
        permission = result.scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    perm_cache[perm.value] = permission
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))


async def _make_gov_user(redis) -> str:
    """Create a user holding a role granting the full work_zone.* set at 'all'."""
    async with test_db() as db:
        role = Role(name=f"gov-{uuid_mod.uuid4().hex[:8]}", kind="platform")
        db.add(role)
        await db.flush()
        perm_cache: dict = {}
        await _grant(db, role, perm_cache, Perm.ZONE_VIEW, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_ADD, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_EDIT, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_ASSIGN, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_DELETE, "all")

        user = User(name=f"gov_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))

        return await token_for(redis, user.uuid)


async def _make_plain_user(redis) -> str:
    """Create a user with no permissions at all."""
    async with test_db() as db:
        user = User(name=f"plain_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        return await token_for(redis, user.uuid)


async def _make_team_user(redis, team_type: str) -> str:
    """Create a user holding the full work_zone.* set, acting as a role in a `team_type` team.

    Mirrors `_make_gov_user()`, but the token acts as a TEAM identity instead of a platform
    one, so it exercises the team-type check in `_require_gov_zone_authority` rather than
    short-circuiting on its early "platform-level holder" return. The team now lives on the
    grant and on the token's `act` claim, not on the user row (ADR-073).
    """
    async with test_db() as db:
        team = Team(name=f"Team {uuid_mod.uuid4().hex[:8]}", type=team_type)
        db.add(team)
        await db.flush()

        role = Role(name=f"{team_type}-{uuid_mod.uuid4().hex[:8]}", kind="team")
        db.add(role)
        await db.flush()
        perm_cache: dict = {}
        await _grant(db, role, perm_cache, Perm.ZONE_VIEW, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_ADD, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_EDIT, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_ASSIGN, "all")
        await _grant(db, role, perm_cache, Perm.ZONE_DELETE, "all")

        user = User(name=f"{team_type}_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid))

        return await token_for(redis, user.uuid, role, team)


@pytest_asyncio.fixture
async def team_uuid() -> str:
    """A bare active Team row, used as a team zone's first team."""
    return await _new_team()


def _errors(body: dict) -> str:
    """All error messages of a GraphQL response, joined for substring checks."""
    return " | ".join(e["message"] for e in body.get("errors", []))


@pytest.mark.asyncio
async def test_gov_can_create_and_update_a_team_zone(client, redis, team_uuid):
    """A gov-role user can draw a team zone with its team, then rename it."""
    gov_token = await _make_gov_user(redis)

    body = await _create(client, gov_token, _zone_input("Zone A", team_uuid))
    assert "errors" not in body, body
    zone_uuid = body["data"]["createArea"]["uuid"]
    assert body["data"]["createArea"]["name"] == "Zone A"
    assert body["data"]["createArea"]["type"] == "team_zone"

    update_resp = await client.post(
        "/graphql",
        json={"query": UPDATE_AREA, "variables": {"uuid": zone_uuid, "input": {"name": "Zone A Renamed"}}},
        headers=auth_header(gov_token),
    )
    body = update_resp.json()
    assert "errors" not in body, body
    assert body["data"]["updateArea"]["name"] == "Zone A Renamed"


@pytest.mark.asyncio
async def test_create_area_rejects_a_point_geometry(client, redis, team_uuid):
    """A Point geometry is rejected: every area is a Polygon or MultiPolygon."""
    gov_token = await _make_gov_user(redis)
    point = {"type": "Point", "coordinates": [121.5, 24.5]}

    body = await _create(client, gov_token, _zone_input("Bad Zone", team_uuid, point))
    assert "Area geometry must be Polygon or MultiPolygon" in _errors(body), body


@pytest.mark.asyncio
async def test_anonymous_cannot_view_team_zones(client):
    """work_zone.view is not public (ADR-036) — an anonymous query is denied."""
    resp = await client.post("/graphql", json={"query": TEAM_ZONES})
    assert "Permission Denied." in _errors(resp.json())


@pytest.mark.asyncio
async def test_plain_login_user_cannot_create_an_area(client, redis, team_uuid):
    """A logged-in user with no work_zone.add grant is denied (default-deny, ADR-025)."""
    plain_token = await _make_plain_user(redis)
    body = await _create(client, plain_token, _zone_input("Zone B", team_uuid))
    assert "Permission Denied." in _errors(body), body


@pytest.mark.asyncio
async def test_create_team_zone_assigns_its_team(client, redis, team_uuid):
    """Creating a team zone saves its first assignment in the same step."""
    gov_token = await _make_gov_user(redis)
    body = await _create(client, gov_token, _zone_input("Zone C", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    async with test_db() as db:
        rows = (
            (
                await db.execute(
                    select(TeamZoneAssign).where(
                        TeamZoneAssign.team_uuid == team_uuid, TeamZoneAssign.zone_uuid == zone_uuid
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].assigned_by is not None


@pytest.mark.asyncio
async def test_team_zone_needs_a_team_and_only_it_takes_one(client, redis, team_uuid):
    """A team zone without a team is refused, and so is a mark zone with one."""
    gov_token = await _make_gov_user(redis)

    no_team = await _create(client, gov_token, {"input": {"type": "team_zone", "geometry": ZONE_POLYGON}})
    assert "A team zone needs a team" in _errors(no_team), no_team

    mark_with_team = await _create(
        client, gov_token, {"input": {"type": "mark_zone", "geometry": ZONE_POLYGON, "teamUuid": team_uuid}}
    )
    assert "only a team zone takes one" in _errors(mark_with_team), mark_with_team


@pytest.mark.asyncio
async def test_a_refused_team_leaves_no_zone_behind(client, redis):
    """Creating a team zone for an inactive team fails and saves nothing."""
    gov_token = await _make_gov_user(redis)
    inactive_team_uuid = await _new_team(status="suspended")
    name = f"Orphan {uuid_mod.uuid4().hex[:8]}"

    body = await _create(client, gov_token, _zone_input(name, inactive_team_uuid))
    assert "Team is not active" in _errors(body), body

    async with test_db() as db:
        assert await db.scalar(select(TeamZone).where(TeamZone.name == name)) is None


@pytest.mark.asyncio
async def test_assign_zone_to_team_is_idempotent(client, redis, team_uuid):
    """Assigning the same zone to the same team twice doesn't create a duplicate row."""
    gov_token = await _make_gov_user(redis)
    body = await _create(client, gov_token, _zone_input("Zone D", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    for _ in range(2):
        resp = await client.post(
            "/graphql",
            json={
                "query": ASSIGN_ZONE,
                "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}},
            },
            headers=auth_header(gov_token),
        )
        body = resp.json()
        assert "errors" not in body, body
        assert body["data"]["assignZoneToTeam"]["zoneUuid"] == zone_uuid

    async with test_db() as db:
        rows = (
            (
                await db.execute(
                    select(TeamZoneAssign).where(
                        TeamZoneAssign.team_uuid == team_uuid, TeamZoneAssign.zone_uuid == zone_uuid
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_remove_zone_from_team_keeps_the_last_team(client, redis, team_uuid):
    """A second team can be removed again, but the zone's last team cannot."""
    gov_token = await _make_gov_user(redis)
    second_team_uuid = await _new_team()
    body = await _create(client, gov_token, _zone_input("Zone E", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    def _link(tid: str) -> dict:
        return {"input": {"zoneUuid": zone_uuid, "teamUuid": tid}}

    assign = await client.post(
        "/graphql",
        json={"query": ASSIGN_ZONE, "variables": _link(second_team_uuid)},
        headers=auth_header(gov_token),
    )
    assert "errors" not in assign.json(), assign.json()

    remove = await client.post(
        "/graphql",
        json={"query": REMOVE_ZONE, "variables": _link(second_team_uuid)},
        headers=auth_header(gov_token),
    )
    assert remove.json()["data"]["removeZoneFromTeam"] is True

    again = await client.post(
        "/graphql",
        json={"query": REMOVE_ZONE, "variables": _link(second_team_uuid)},
        headers=auth_header(gov_token),
    )
    assert "not assigned" in _errors(again.json())

    last = await client.post(
        "/graphql", json={"query": REMOVE_ZONE, "variables": _link(team_uuid)}, headers=auth_header(gov_token)
    )
    assert "A team zone needs at least one team" in _errors(last.json())

    async with test_db() as db:
        remaining = (
            (await db.execute(select(TeamZoneAssign.team_uuid).where(TeamZoneAssign.zone_uuid == zone_uuid)))
            .scalars()
            .all()
        )
        assert [str(t) for t in remaining] == [team_uuid]


@pytest.mark.asyncio
async def test_assign_rejects_an_inactive_team(client, redis, team_uuid):
    """A zone cannot be delegated to a team whose status is not active."""
    gov_token = await _make_gov_user(redis)
    inactive_team_uuid = await _new_team(status="suspended")
    body = await _create(client, gov_token, _zone_input("Zone F", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={
            "query": ASSIGN_ZONE,
            "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": inactive_team_uuid}},
        },
        headers=auth_header(gov_token),
    )
    assert "Team is not active" in _errors(resp.json())


@pytest.mark.asyncio
async def test_a_mark_zone_cannot_be_assigned_a_team(client, redis, team_uuid):
    """Only a team zone carries teams, so a mark zone never widens a team's zone scope."""
    gov_token = await _make_gov_user(redis)
    body = await _create(client, gov_token, {"input": {"type": "mark_zone", "geometry": ZONE_POLYGON}})
    mark_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": ASSIGN_ZONE, "variables": {"input": {"zoneUuid": mark_uuid, "teamUuid": team_uuid}}},
        headers=auth_header(gov_token),
    )
    assert "Team zone not found" in _errors(resp.json())


@pytest.mark.asyncio
async def test_gov_can_soft_delete_a_zone_and_it_leaves_the_listing(client, redis, team_uuid):
    """A deleted zone disappears from teamZones and can no longer be updated or re-deleted."""
    gov_token = await _make_gov_user(redis)
    body = await _create(client, gov_token, _zone_input("Zone G", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    before_resp = await client.post("/graphql", json={"query": TEAM_ZONES}, headers=auth_header(gov_token))
    total_before = before_resp.json()["data"]["teamZones"]["pageInfo"]["totalCount"]

    del_resp = await client.post(
        "/graphql",
        json={"query": DELETE_AREA, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = del_resp.json()
    assert "errors" not in body, body
    assert body["data"]["deleteArea"] is True

    list_resp = await client.post("/graphql", json={"query": TEAM_ZONES}, headers=auth_header(gov_token))
    list_body = list_resp.json()["data"]["teamZones"]
    assert all(item["uuid"] != zone_uuid for item in list_body["items"])
    # Relative, since the test DB is shared and other tests' zones are in the totals.
    assert list_body["pageInfo"]["totalCount"] == total_before - 1

    update_resp = await client.post(
        "/graphql",
        json={"query": UPDATE_AREA, "variables": {"uuid": zone_uuid, "input": {"name": "Nope"}}},
        headers=auth_header(gov_token),
    )
    assert "not found" in _errors(update_resp.json())

    second_del_resp = await client.post(
        "/graphql",
        json={"query": DELETE_AREA, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    assert "not found" in _errors(second_del_resp.json())


@pytest.mark.asyncio
async def test_plain_login_user_cannot_delete_an_area(client, redis, team_uuid):
    """Deleting requires work_zone.delete — a user without it is denied (default-deny)."""
    gov_token = await _make_gov_user(redis)
    plain_token = await _make_plain_user(redis)
    body = await _create(client, gov_token, _zone_input("Zone H", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_AREA, "variables": {"uuid": zone_uuid}},
        headers=auth_header(plain_token),
    )
    assert "Permission Denied." in _errors(resp.json())


@pytest.mark.asyncio
async def test_ngo_team_admin_cannot_create_any_kind_of_area(client, redis, team_uuid):
    """An NGO team's admin holds the full work_zone.* grant but is fenced out by team type.

    This blocks an NGO admin from drawing a zone anywhere and self-assigning it to reach PII.
    """
    ngo_token = await _make_team_user(redis, "ngo")
    for variables in (
        _zone_input("Zone M", team_uuid),
        {"input": {"type": "hazardous_zone", "geometry": ZONE_POLYGON, "status": "blocked"}},
        {"input": {"type": "mark_zone", "geometry": ZONE_POLYGON}},
    ):
        body = await _create(client, ngo_token, variables)
        assert "Only gov teams may draw or assign map areas." in _errors(body), body


@pytest.mark.asyncio
async def test_gov_team_admin_can_create_a_team_zone(client, redis, team_uuid):
    """The positive counterpart: a gov-type team's admin is allowed through the same gate."""
    gov_token = await _make_team_user(redis, "gov")
    body = await _create(client, gov_token, _zone_input("Zone N", team_uuid))
    assert "errors" not in body, body
    assert body["data"]["createArea"]["name"] == "Zone N"


@pytest.mark.asyncio
async def test_ngo_team_admin_cannot_delete_an_area(client, redis, team_uuid):
    """An NGO team's admin holding work_zone.delete is still fenced out by team type."""
    gov_token = await _make_gov_user(redis)
    ngo_token = await _make_team_user(redis, "ngo")
    body = await _create(client, gov_token, _zone_input("Zone O", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_AREA, "variables": {"uuid": zone_uuid}},
        headers=auth_header(ngo_token),
    )
    assert "Only gov teams may draw or assign map areas." in _errors(resp.json())


@pytest.mark.asyncio
async def test_gov_team_admin_can_delete_an_area(client, redis, team_uuid):
    """The positive counterpart: a gov-type team's admin can delete through the same gate."""
    gov_token = await _make_team_user(redis, "gov")
    body = await _create(client, gov_token, _zone_input("Zone P", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_AREA, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["deleteArea"] is True


@pytest.mark.asyncio
async def test_assign_returns_the_assignment_record(client, redis, team_uuid):
    """AssignZoneToTeam returns the assignment, including who assigned it and when."""
    gov_token = await _make_gov_user(redis)
    second_team_uuid = await _new_team()
    body = await _create(client, gov_token, _zone_input("Zone I", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={
            "query": ASSIGN_ZONE_FULL,
            "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": second_team_uuid}},
        },
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    record = body["data"]["assignZoneToTeam"]
    assert record["zoneUuid"] == zone_uuid
    assert record["teamUuid"] == second_team_uuid
    assert record["assignedBy"] is not None
    assert record["assignedAt"] is not None


@pytest.mark.asyncio
async def test_zones_by_team_lists_only_that_teams_live_zones(client, redis, team_uuid):
    """Verify that zonesByTeam returns the team's assignments and drops soft-deleted zones."""
    gov_token = await _make_gov_user(redis)
    zone_uuids = []
    for name in ("Zone J", "Zone K"):
        body = await _create(client, gov_token, _zone_input(name, team_uuid))
        zone_uuids.append(body["data"]["createArea"]["uuid"])

    resp = await client.post(
        "/graphql",
        json={"query": ZONES_BY_TEAM, "variables": {"teamUuid": team_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert {item["uuid"] for item in body["data"]["zonesByTeam"]["items"]} == set(zone_uuids)
    total_before = body["data"]["zonesByTeam"]["pageInfo"]["totalCount"]

    await client.post(
        "/graphql",
        json={"query": DELETE_AREA, "variables": {"uuid": zone_uuids[0]}},
        headers=auth_header(gov_token),
    )

    after = await client.post(
        "/graphql",
        json={"query": ZONES_BY_TEAM, "variables": {"teamUuid": team_uuid}},
        headers=auth_header(gov_token),
    )
    after_body = after.json()["data"]["zonesByTeam"]
    remaining = {item["uuid"] for item in after_body["items"]}
    assert zone_uuids[0] not in remaining
    assert zone_uuids[1] in remaining
    assert after_body["pageInfo"]["totalCount"] == total_before - 1


@pytest.mark.asyncio
async def test_team_zone_exposes_its_assigned_teams(client, redis, team_uuid):
    """A zone reports the teams it has been delegated to."""
    gov_token = await _make_gov_user(redis)
    body = await _create(client, gov_token, _zone_input("Zone L", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": ZONE_WITH_TEAMS, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    teams = body["data"]["teamZone"]["assignedTeams"]
    assert [t["uuid"] for t in teams] == [team_uuid]
    assert teams[0]["type"] == "ngo"


@pytest.mark.asyncio
async def test_soft_deleted_team_drops_out_of_assigned_teams(client, redis, team_uuid):
    """A soft-deleted team disappears from a zone's assignedTeams; a live one still appears."""
    gov_token = await _make_gov_user(redis)
    doomed_team_uuid = await _new_team()
    body = await _create(client, gov_token, _zone_input(f"Zone {uuid_mod.uuid4().hex[:8]}", team_uuid))
    zone_uuid = body["data"]["createArea"]["uuid"]

    assign_resp = await client.post(
        "/graphql",
        json={
            "query": ASSIGN_ZONE,
            "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": doomed_team_uuid}},
        },
        headers=auth_header(gov_token),
    )
    assert "errors" not in assign_resp.json(), assign_resp.json()

    async with test_db() as db:
        doomed = (await db.execute(select(Team).where(Team.uuid == doomed_team_uuid))).scalars().first()
        doomed.delete_at = datetime.now(UTC)

    resp = await client.post(
        "/graphql",
        json={"query": ZONE_WITH_TEAMS, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    listed = {t["uuid"] for t in body["data"]["teamZone"]["assignedTeams"]}
    assert team_uuid in listed
    assert doomed_team_uuid not in listed


@pytest.mark.asyncio
async def test_a_hazardous_zone_is_always_public(client, redis):
    """A hazard is public on creation, cannot be switched off, and shows on the guest map."""
    gov_token = await _make_gov_user(redis)
    hazard = {"type": "hazardous_zone", "geometry": _square(130.0, 30.0), "status": "blocked"}

    refused = await _create(client, gov_token, {"input": {**hazard, "isPublic": False}})
    assert "A hazardous zone is always public" in _errors(refused), refused

    body = await _create(client, gov_token, {"input": hazard})
    assert body["data"]["createArea"]["isPublic"] is True
    hazard_uuid = body["data"]["createArea"]["uuid"]

    switch_off = await client.post(
        "/graphql",
        json={"query": UPDATE_AREA, "variables": {"uuid": hazard_uuid, "input": {"isPublic": False}}},
        headers=auth_header(gov_token),
    )
    assert "A hazardous zone is always public" in _errors(switch_off.json())

    guest = await client.post("/graphql", json={"query": AREAS, "variables": {"bounds": _box(130.0, 30.0)}})
    assert hazard_uuid in {i["uuid"] for i in guest.json()["data"]["areas"]["items"]}


@pytest.mark.asyncio
async def test_only_a_hazardous_zone_takes_a_status(client, redis):
    """A hazard needs a status, and a mark zone refuses one."""
    gov_token = await _make_gov_user(redis)

    no_status = await _create(
        client, gov_token, {"input": {"type": "hazardous_zone", "geometry": ZONE_POLYGON}}
    )
    assert "A hazardous zone needs a status" in _errors(no_status), no_status

    mark = await _create(
        client, gov_token, {"input": {"type": "mark_zone", "geometry": ZONE_POLYGON, "status": "blocked"}}
    )
    assert "Only a hazardous zone has a status" in _errors(mark), mark


@pytest.mark.asyncio
async def test_a_hazardous_zone_status_cannot_be_blank(client, redis):
    """Create, update and promote all refuse a blank status, and the stored status stays."""
    gov_token = await _make_gov_user(redis)

    hazard = {"type": "hazardous_zone", "geometry": ZONE_POLYGON}

    blank = await _create(client, gov_token, {"input": {**hazard, "status": "  "}})
    assert "A hazardous zone needs a status" in _errors(blank), blank

    body = await _create(client, gov_token, {"input": {**hazard, "status": "blocked"}})
    hazard_uuid = body["data"]["createArea"]["uuid"]
    cleared = await client.post(
        "/graphql",
        json={"query": UPDATE_AREA, "variables": {"uuid": hazard_uuid, "input": {"status": ""}}},
        headers=auth_header(gov_token),
    )
    assert "A hazardous zone needs a status" in _errors(cleared.json()), cleared.json()
    stored = await client.post("/graphql", json={"query": HAZARD_STATUS, "variables": {"uuid": hazard_uuid}})
    assert stored.json()["data"]["hazardousZone"]["status"] == "blocked"

    mark = await _create(
        client, gov_token, {"input": {"type": "mark_zone", "geometry": _square(135.0, 35.0)}}
    )
    mark_uuid = mark["data"]["createArea"]["uuid"]
    promoted = await client.post(
        "/graphql",
        json={"query": PROMOTE, "variables": {"uuid": mark_uuid, "input": {"status": ""}}},
        headers=auth_header(gov_token),
    )
    assert "A hazardous zone needs a status" in _errors(promoted.json()), promoted.json()
    admin_map = await client.post(
        "/graphql",
        json={"query": AREAS, "variables": {"bounds": _box(135.0, 35.0), "includePrivate": True}},
        headers=auth_header(gov_token),
    )
    items = {i["uuid"]: i for i in admin_map.json()["data"]["areas"]["items"]}
    assert items[mark_uuid]["type"] == "mark_zone"


@pytest.mark.asyncio
async def test_the_visibility_switch_controls_the_public_map(client, redis, team_uuid):
    """Mark and team zones start hidden and appear on the guest map once switched on."""
    gov_token = await _make_gov_user(redis)
    mark = await _create(
        client, gov_token, {"input": {"type": "mark_zone", "geometry": _square(131.0, 31.0)}}
    )
    zone = await _create(client, gov_token, _zone_input("Public zone", team_uuid, _square(131.01, 31.01)))
    uuids = {mark["data"]["createArea"]["uuid"], zone["data"]["createArea"]["uuid"]}
    variables = {"bounds": _box(131.0, 31.0)}

    async def _guest_sees() -> set:
        resp = await client.post("/graphql", json={"query": AREAS, "variables": variables})
        return {i["uuid"] for i in resp.json()["data"]["areas"]["items"]}

    assert not uuids & await _guest_sees()

    admin = await client.post(
        "/graphql",
        json={"query": AREAS, "variables": {**variables, "includePrivate": True}},
        headers=auth_header(gov_token),
    )
    assert uuids <= {i["uuid"] for i in admin.json()["data"]["areas"]["items"]}

    for area_uuid in uuids:
        resp = await client.post(
            "/graphql",
            json={"query": UPDATE_AREA, "variables": {"uuid": area_uuid, "input": {"isPublic": True}}},
            headers=auth_header(gov_token),
        )
        assert resp.json()["data"]["updateArea"]["isPublic"] is True

    assert uuids <= await _guest_sees()


@pytest.mark.asyncio
async def test_a_guest_cannot_ask_for_private_areas(client):
    """Asking for private areas needs work_zone.view, which a guest never has."""
    resp = await client.post("/graphql", json={"query": AREAS, "variables": {"includePrivate": True}})
    assert "Permission Denied." in _errors(resp.json())


@pytest.mark.asyncio
async def test_areas_and_team_zones_follow_the_viewport(client, redis, team_uuid):
    """A bounding box leaves out areas and team zones that lie outside it."""
    gov_token = await _make_gov_user(redis)
    inside = await _create(client, gov_token, _zone_input("Inside", team_uuid, _square(132.0, 32.0)))
    outside = await _create(client, gov_token, _zone_input("Outside", team_uuid, _square(133.0, 33.0)))
    inside_uuid, outside_uuid = inside["data"]["createArea"]["uuid"], outside["data"]["createArea"]["uuid"]
    variables = {"bounds": _box(132.0, 32.0)}

    areas = await client.post(
        "/graphql",
        json={"query": AREAS, "variables": {**variables, "includePrivate": True}},
        headers=auth_header(gov_token),
    )
    zones = await client.post(
        "/graphql", json={"query": TEAM_ZONES_IN, "variables": variables}, headers=auth_header(gov_token)
    )
    for listed in (
        {i["uuid"] for i in areas.json()["data"]["areas"]["items"]},
        {i["uuid"] for i in zones.json()["data"]["teamZones"]["items"]},
    ):
        assert inside_uuid in listed
        assert outside_uuid not in listed


@pytest.mark.asyncio
async def test_a_mark_zone_can_be_promoted_to_a_hazardous_zone(client, redis):
    """Promotion keeps the uuid, name and note, and makes the zone public."""
    gov_token = await _make_gov_user(redis)
    body = await _create(
        client,
        gov_token,
        {
            "input": {
                "type": "mark_zone",
                "geometry": _square(134.0, 34.0),
                "name": "Rest area",
                "note": "water",
            }
        },
    )
    mark_uuid = body["data"]["createArea"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": PROMOTE, "variables": {"uuid": mark_uuid, "input": {"status": "dangerous"}}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    promoted = body["data"]["promoteMarkZone"]
    assert promoted == {
        "uuid": mark_uuid,
        "propertyName": "hazardous_zone",
        "name": "Rest area",
        "note": "water",
        "status": "dangerous",
    }

    guest = await client.post("/graphql", json={"query": AREAS, "variables": {"bounds": _box(134.0, 34.0)}})
    items = {i["uuid"]: i for i in guest.json()["data"]["areas"]["items"]}
    assert items[mark_uuid]["type"] == "hazardous_zone"
    assert items[mark_uuid]["isPublic"] is True


@pytest.mark.asyncio
async def test_only_a_mark_zone_can_be_promoted(client, redis, team_uuid):
    """A hazard cannot be turned back or promoted again, and a team zone cannot be promoted."""
    gov_token = await _make_gov_user(redis)
    hazard = await _create(
        client,
        gov_token,
        {"input": {"type": "hazardous_zone", "geometry": ZONE_POLYGON, "status": "blocked"}},
    )
    zone = await _create(client, gov_token, _zone_input("Zone Q", team_uuid))

    for body in (hazard, zone):
        resp = await client.post(
            "/graphql",
            json={
                "query": PROMOTE,
                "variables": {"uuid": body["data"]["createArea"]["uuid"], "input": {"status": "x"}},
            },
            headers=auth_header(gov_token),
        )
        assert "Only a mark zone can be promoted" in _errors(resp.json())
