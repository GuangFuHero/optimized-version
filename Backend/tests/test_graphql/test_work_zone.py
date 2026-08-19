"""GraphQL integration tests for Work Zone CRUD and team assignment (Phase 4/T119).

Covers: gov-role create/update, work_zone.view default-deny for anonymous/unprivileged
callers (ADR-036), and idempotent assign/remove of a zone<->team link.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team, TeamZoneAssign
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header, test_db

CREATE_ZONE = """
mutation($input: CreateWorkZoneInput!) {
    createWorkZone(input: $input) { uuid name }
}
"""

UPDATE_ZONE = """
mutation($uuid: UUID!, $input: UpdateWorkZoneInput!) {
    updateWorkZone(uuid: $uuid, input: $input) { uuid name }
}
"""

WORK_ZONES = """
query { workZones { items { uuid } pageInfo { totalCount } } }
"""

ASSIGN_ZONE = """
mutation($input: ZoneTeamAssignmentInput!) { assignZoneToTeam(input: $input) { zoneUuid } }
"""

REMOVE_ZONE = """
mutation($input: ZoneTeamAssignmentInput!) { removeZoneFromTeam(input: $input) }
"""

DELETE_ZONE = "mutation($uuid: UUID!) { deleteWorkZone(uuid: $uuid) }"

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
    workZone(uuid: $uuid) { uuid assignedTeams { uuid name type } }
}
"""


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


async def _make_gov_user() -> str:
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

        return create_access_token(data={"sub": str(user.uuid)})


async def _make_plain_user() -> str:
    """Create a user with no permissions at all."""
    async with test_db() as db:
        user = User(name=f"plain_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        return create_access_token(data={"sub": str(user.uuid)})


async def _make_team_user(team_type: str) -> str:
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

        return token_for(user.uuid, role, team)


@pytest_asyncio.fixture
async def team_uuid() -> str:
    """A bare Team row with no zone assignment, for the assign/remove tests."""
    async with test_db() as db:
        team = Team(name=f"Team {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add(team)
        await db.flush()
        return str(team.uuid)


@pytest.mark.asyncio
async def test_gov_can_create_and_update_a_work_zone(client):
    """A gov-role user can draw a zone, then rename it via updateWorkZone."""
    gov_token = await _make_gov_user()

    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone A", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    body = create_resp.json()
    assert "errors" not in body, body
    zone_uuid = body["data"]["createWorkZone"]["uuid"]
    assert body["data"]["createWorkZone"]["name"] == "Zone A"

    update_resp = await client.post(
        "/graphql",
        json={"query": UPDATE_ZONE, "variables": {"uuid": zone_uuid, "input": {"name": "Zone A Renamed"}}},
        headers=auth_header(gov_token),
    )
    body = update_resp.json()
    assert "errors" not in body, body
    assert body["data"]["updateWorkZone"]["name"] == "Zone A Renamed"


@pytest.mark.asyncio
async def test_create_work_zone_rejects_a_point_geometry(client):
    """A Point geometry is rejected with a work-zone-specific message, not the closure_area one."""
    gov_token = await _make_gov_user()
    point = {"type": "Point", "coordinates": [121.5, 24.5]}

    resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Bad Zone", "geometry": point}}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    errors = body.get("errors", [])
    assert any("Work zone geometry must be Polygon or MultiPolygon" in e["message"] for e in errors), body


@pytest.mark.asyncio
async def test_anonymous_cannot_view_work_zones(client):
    """work_zone.view is not public (ADR-036) — an anonymous query is denied."""
    resp = await client.post("/graphql", json={"query": WORK_ZONES})
    body = resp.json()
    assert any("Permission Denied." in e["message"] for e in body.get("errors", [])), body


@pytest.mark.asyncio
async def test_plain_login_user_cannot_create_a_work_zone(client):
    """A logged-in user with no work_zone.add grant is denied (default-deny, ADR-025)."""
    plain_token = await _make_plain_user()

    resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone B", "geometry": ZONE_POLYGON}}},
        headers=auth_header(plain_token),
    )
    body = resp.json()
    assert any("Permission Denied." in e["message"] for e in body.get("errors", [])), body


@pytest.mark.asyncio
async def test_assign_zone_to_team_is_idempotent(client, team_uuid):
    """Assigning the same zone to the same team twice doesn't create a duplicate row."""
    gov_token = await _make_gov_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone C", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

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
            await db.execute(
                select(TeamZoneAssign).where(
                    TeamZoneAssign.team_uuid == team_uuid, TeamZoneAssign.zone_uuid == zone_uuid
                )
            )
        ).scalars().all()
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_remove_zone_from_team_clears_the_assignment(client, team_uuid):
    """Removing a zone<->team link deletes the row; removing again surfaces a clean error."""
    gov_token = await _make_gov_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone D", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    assign_resp = await client.post(
        "/graphql",
        json={"query": ASSIGN_ZONE, "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}}},
        headers=auth_header(gov_token),
    )
    assert "errors" not in assign_resp.json(), assign_resp.json()

    remove_resp = await client.post(
        "/graphql",
        json={"query": REMOVE_ZONE, "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}}},
        headers=auth_header(gov_token),
    )
    body = remove_resp.json()
    assert "errors" not in body, body
    assert body["data"]["removeZoneFromTeam"] is True

    async with test_db() as db:
        rows = (
            await db.execute(
                select(TeamZoneAssign).where(
                    TeamZoneAssign.team_uuid == team_uuid, TeamZoneAssign.zone_uuid == zone_uuid
                )
            )
        ).scalars().all()
        assert rows == []

    second_remove_resp = await client.post(
        "/graphql",
        json={"query": REMOVE_ZONE, "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}}},
        headers=auth_header(gov_token),
    )
    body = second_remove_resp.json()
    assert any("not assigned" in e["message"] for e in body.get("errors", [])), body


@pytest.mark.asyncio
async def test_assign_rejects_an_inactive_team(client):
    """A zone cannot be delegated to a team whose status is not active."""
    gov_token = await _make_gov_user()
    async with test_db() as db:
        team = Team(name=f"Inactive {uuid_mod.uuid4().hex[:8]}", type="ngo", status="suspended")
        db.add(team)
        await db.flush()
        inactive_team_uuid = str(team.uuid)

    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone E", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={
            "query": ASSIGN_ZONE,
            "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": inactive_team_uuid}},
        },
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert any("Team is not active" in e["message"] for e in body.get("errors", [])), body


@pytest.mark.asyncio
async def test_assign_records_the_assigning_user(client, team_uuid):
    """The assignment row records which user performed the delegation."""
    gov_token = await _make_gov_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone F", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": ASSIGN_ZONE, "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}}},
        headers=auth_header(gov_token),
    )
    assert "errors" not in resp.json(), resp.json()

    async with test_db() as db:
        row = (
            await db.execute(
                select(TeamZoneAssign).where(
                    TeamZoneAssign.team_uuid == team_uuid, TeamZoneAssign.zone_uuid == zone_uuid
                )
            )
        ).scalar_one()
        assert row.assigned_by is not None
        assert row.created_at is not None


@pytest.mark.asyncio
async def test_gov_can_soft_delete_a_zone_and_it_leaves_the_listing(client):
    """A deleted zone disappears from workZones and can no longer be updated or re-deleted."""
    gov_token = await _make_gov_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone G", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    before_resp = await client.post(
        "/graphql", json={"query": WORK_ZONES}, headers=auth_header(gov_token)
    )
    total_before = before_resp.json()["data"]["workZones"]["pageInfo"]["totalCount"]

    del_resp = await client.post(
        "/graphql",
        json={"query": DELETE_ZONE, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = del_resp.json()
    assert "errors" not in body, body
    assert body["data"]["deleteWorkZone"] is True

    list_resp = await client.post(
        "/graphql", json={"query": WORK_ZONES}, headers=auth_header(gov_token)
    )
    list_body = list_resp.json()["data"]["workZones"]
    items = list_body["items"]
    assert all(item["uuid"] != zone_uuid for item in items)
    # count_all must drop by exactly one: a relative comparison, since the test DB is shared
    # and other tests' zones are present in the totals.
    assert list_body["pageInfo"]["totalCount"] == total_before - 1

    update_resp = await client.post(
        "/graphql",
        json={"query": UPDATE_ZONE, "variables": {"uuid": zone_uuid, "input": {"name": "Nope"}}},
        headers=auth_header(gov_token),
    )
    assert any("not found" in e["message"] for e in update_resp.json().get("errors", []))

    second_del_resp = await client.post(
        "/graphql",
        json={"query": DELETE_ZONE, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    assert any("not found" in e["message"] for e in second_del_resp.json().get("errors", []))


@pytest.mark.asyncio
async def test_plain_login_user_cannot_delete_a_work_zone(client):
    """Deleting requires work_zone.delete — a user without it is denied (default-deny)."""
    gov_token = await _make_gov_user()
    plain_token = await _make_plain_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone H", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_ZONE, "variables": {"uuid": zone_uuid}},
        headers=auth_header(plain_token),
    )
    assert any("Permission Denied." in e["message"] for e in resp.json().get("errors", []))


@pytest.mark.asyncio
async def test_ngo_team_admin_cannot_create_a_work_zone(client):
    """An NGO team's admin holds the full work_zone.* grant but is fenced out by team type.

    Closes the escalation `_require_gov_zone_authority`'s docstring describes: an NGO admin
    drawing a zone anywhere and self-assigning it to reach raw victim PII.
    """
    ngo_token = await _make_team_user("ngo")

    resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone M", "geometry": ZONE_POLYGON}}},
        headers=auth_header(ngo_token),
    )
    body = resp.json()
    errors = body.get("errors", [])
    assert any("Only gov teams may draw or assign work zones." in e["message"] for e in errors), body


@pytest.mark.asyncio
async def test_gov_team_admin_can_create_a_work_zone(client):
    """The positive counterpart: a gov-type team's admin is allowed through the same gate.

    Proves the guard discriminates on team type, not on some unrelated failure.
    """
    gov_token = await _make_team_user("gov")

    resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone N", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["createWorkZone"]["name"] == "Zone N"


@pytest.mark.asyncio
async def test_ngo_team_admin_cannot_delete_a_work_zone(client):
    """An NGO team's admin holding work_zone.delete is still fenced out by team type."""
    gov_token = await _make_gov_user()
    ngo_token = await _make_team_user("ngo")

    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone O", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_ZONE, "variables": {"uuid": zone_uuid}},
        headers=auth_header(ngo_token),
    )
    body = resp.json()
    errors = body.get("errors", [])
    assert any("Only gov teams may draw or assign work zones." in e["message"] for e in errors), body


@pytest.mark.asyncio
async def test_gov_team_admin_can_delete_a_work_zone(client):
    """The positive counterpart: a gov-type team's admin can delete through the same gate."""
    gov_token = await _make_team_user("gov")

    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone P", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={"query": DELETE_ZONE, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["deleteWorkZone"] is True


@pytest.mark.asyncio
async def test_assign_returns_the_assignment_record(client, team_uuid):
    """AssignZoneToTeam returns the assignment, including who assigned it and when."""
    gov_token = await _make_gov_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone I", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    resp = await client.post(
        "/graphql",
        json={
            "query": ASSIGN_ZONE_FULL,
            "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}},
        },
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    record = body["data"]["assignZoneToTeam"]
    assert record["zoneUuid"] == zone_uuid
    assert record["teamUuid"] == team_uuid
    assert record["assignedBy"] is not None
    assert record["assignedAt"] is not None


@pytest.mark.asyncio
async def test_zones_by_team_lists_only_that_teams_live_zones(client, team_uuid):
    """Verify that zonesByTeam returns the team's assignments and drops soft-deleted zones."""
    gov_token = await _make_gov_user()
    zone_uuids = []
    for name in ("Zone J", "Zone K"):
        create_resp = await client.post(
            "/graphql",
            json={"query": CREATE_ZONE, "variables": {"input": {"name": name, "geometry": ZONE_POLYGON}}},
            headers=auth_header(gov_token),
        )
        zone_uuids.append(create_resp.json()["data"]["createWorkZone"]["uuid"])

    for zone_uuid in zone_uuids:
        await client.post(
            "/graphql",
            json={
                "query": ASSIGN_ZONE,
                "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}},
            },
            headers=auth_header(gov_token),
        )

    resp = await client.post(
        "/graphql",
        json={"query": ZONES_BY_TEAM, "variables": {"teamUuid": team_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    listed = {item["uuid"] for item in body["data"]["zonesByTeam"]["items"]}
    assert listed == set(zone_uuids)
    total_before = body["data"]["zonesByTeam"]["pageInfo"]["totalCount"]

    await client.post(
        "/graphql",
        json={"query": DELETE_ZONE, "variables": {"uuid": zone_uuids[0]}},
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
    # count_by_team must drop by exactly one: a relative comparison, since the test DB is
    # shared and other tests' zones for other teams are present in the totals.
    assert after_body["pageInfo"]["totalCount"] == total_before - 1


@pytest.mark.asyncio
async def test_work_zone_exposes_its_assigned_teams(client, team_uuid):
    """A zone reports the teams it has been delegated to."""
    gov_token = await _make_gov_user()
    create_resp = await client.post(
        "/graphql",
        json={"query": CREATE_ZONE, "variables": {"input": {"name": "Zone L", "geometry": ZONE_POLYGON}}},
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    await client.post(
        "/graphql",
        json={"query": ASSIGN_ZONE, "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": team_uuid}}},
        headers=auth_header(gov_token),
    )

    resp = await client.post(
        "/graphql",
        json={"query": ZONE_WITH_TEAMS, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    teams = body["data"]["workZone"]["assignedTeams"]
    assert [t["uuid"] for t in teams] == [team_uuid]
    assert teams[0]["type"] == "ngo"


@pytest.mark.asyncio
async def test_soft_deleted_team_drops_out_of_assigned_teams(client, team_uuid):
    """A soft-deleted team disappears from a zone's assignedTeams; a live one still appears.

    Design §4.1 requires `teams_by_zones` to filter `Team.delete_at.is_(None)` so delegation
    listings don't surface teams that no longer exist as an org.
    """
    gov_token = await _make_gov_user()

    async with test_db() as db:
        doomed_team = Team(name=f"Team {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add(doomed_team)
        await db.flush()
        doomed_team_uuid = str(doomed_team.uuid)

    create_resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_ZONE,
            "variables": {"input": {"name": f"Zone {uuid_mod.uuid4().hex[:8]}", "geometry": ZONE_POLYGON}},
        },
        headers=auth_header(gov_token),
    )
    zone_uuid = create_resp.json()["data"]["createWorkZone"]["uuid"]

    for tid in (team_uuid, doomed_team_uuid):
        assign_resp = await client.post(
            "/graphql",
            json={"query": ASSIGN_ZONE, "variables": {"input": {"zoneUuid": zone_uuid, "teamUuid": tid}}},
            headers=auth_header(gov_token),
        )
        assert "errors" not in assign_resp.json(), assign_resp.json()

    async with test_db() as db:
        doomed = (
            await db.execute(select(Team).where(Team.uuid == doomed_team_uuid))
        ).scalars().first()
        assert doomed is not None
        doomed.delete_at = datetime.now(UTC)

    resp = await client.post(
        "/graphql",
        json={"query": ZONE_WITH_TEAMS, "variables": {"uuid": zone_uuid}},
        headers=auth_header(gov_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    listed = {t["uuid"] for t in body["data"]["workZone"]["assignedTeams"]}
    assert team_uuid in listed
    assert doomed_team_uuid not in listed
