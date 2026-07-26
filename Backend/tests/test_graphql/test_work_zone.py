"""GraphQL integration tests for Work Zone CRUD and team assignment (Phase 4/T119).

Covers: gov-role create/update, work_zone.view default-deny for anonymous/unprivileged
callers (ADR-036), and idempotent assign/remove of a zone<->team link.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team, TeamZoneAssign
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
mutation($input: ZoneTeamAssignmentInput!) { assignZoneToTeam(input: $input) }
"""

REMOVE_ZONE = """
mutation($input: ZoneTeamAssignmentInput!) { removeZoneFromTeam(input: $input) }
"""

ZONE_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[121.0, 24.0], [121.0, 25.0], [122.0, 25.0], [122.0, 24.0], [121.0, 24.0]]],
}


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
        assert body["data"]["assignZoneToTeam"] is True

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
