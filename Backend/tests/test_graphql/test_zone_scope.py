"""End-to-end coverage for `zone` scope through a real GraphQL mutation call (Phase 4/T120).

Mirrors test_team_scope.py's pattern for `team` scope. own/team/gov/ngo all got a GraphQL
e2e test somewhere in Phase 1-3; `zone` only ever had DB-level unit coverage
(test_rbac_scopes.py/test_authz.py) — this closes that gap using a real WorkZone +
TeamZoneAssign instead of a hand-rolled resource in a unit test.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.team import Team, TeamZoneAssign, WorkZone
from tests.test_graphql.conftest import auth_header, test_db

UPDATE_TICKET = """
mutation($uuid: UUID!, $input: UpdateTicketInput!) {
    updateTicket(uuid: $uuid, input: $input) { uuid status }
}
"""

ZONE_POLYGON = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])
INSIDE_ZONE_POINT = Point(121.5, 24.5)
OUTSIDE_ZONE_POINT = Point(123.5, 24.5)


async def _make_zone_scoped_editor(team_uuid: str) -> tuple[str, str]:
    """Create a user in `team_uuid` holding a role granting ticket.edit at 'zone' scope."""
    async with test_db() as db:
        name = f"editor_{uuid_mod.uuid4().hex[:8]}"
        user = User(name=name, team_uuid=team_uuid)
        db.add(user)
        await db.flush()

        role = Role(name=f"zone-editor-{uuid_mod.uuid4().hex[:8]}", kind="platform")
        perm_result = await db.execute(
            select(Permission).where(Permission.key == Perm.TICKET_EDIT.value)
        )
        permission = perm_result.scalar_one_or_none()
        if not permission:
            permission = Permission(key=Perm.TICKET_EDIT.value)
            db.add(permission)
            await db.flush()
        db.add(role)
        await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="zone"))
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))

        token = create_access_token(data={"sub": str(user.uuid)})
        return str(user.uuid), token


@pytest_asyncio.fixture
async def team_assigned_to_zone() -> str:
    """A Team assigned to a WorkZone covering ~121-122E/24-25N, returned as team_uuid."""
    async with test_db() as db:
        team = Team(name=f"Zone Team {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add(team)
        zone = WorkZone(name="Test Zone", geometry=from_shape(ZONE_POLYGON, srid=4326))
        db.add(zone)
        await db.flush()
        db.add(TeamZoneAssign(team_uuid=team.uuid, zone_uuid=zone.uuid))
        await db.flush()
        return str(team.uuid)


@pytest_asyncio.fixture
async def unassigned_team() -> str:
    """A Team with no zone assignment at all."""
    async with test_db() as db:
        team = Team(name=f"No Zone Team {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add(team)
        await db.flush()
        return str(team.uuid)


async def _make_ticket_at(point: Point) -> str:
    async with test_db() as db:
        creator = User(name=f"creator_{uuid_mod.uuid4().hex[:8]}")
        db.add(creator)
        await db.flush()
        ticket = Tickets(
            geometry=from_shape(point, srid=4326),
            created_by=str(creator.uuid),
            title="Zone-scoped ticket",
            contact_name="Someone",
            status="pending",
            priority="low",
            visibility="public",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


@pytest.mark.asyncio
async def test_zone_scope_grants_edit_on_a_ticket_inside_the_assigned_zone(client, team_assigned_to_zone):
    """A `ticket.edit=zone` grant lets the team's member edit a ticket inside its assigned zone."""
    _, editor_token = await _make_zone_scoped_editor(team_assigned_to_zone)
    ticket_uuid = await _make_ticket_at(INSIDE_ZONE_POINT)

    resp = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET,
            "variables": {"uuid": ticket_uuid, "input": {"status": "in_progress"}},
        },
        headers=auth_header(editor_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["updateTicket"]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_zone_scope_404s_for_a_ticket_outside_the_assigned_zone(client, team_assigned_to_zone):
    """The same grant 404s (not 403) for a ticket outside the team's assigned zone (ADR-023)."""
    _, editor_token = await _make_zone_scoped_editor(team_assigned_to_zone)
    ticket_uuid = await _make_ticket_at(OUTSIDE_ZONE_POINT)

    resp = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET,
            "variables": {"uuid": ticket_uuid, "input": {"status": "in_progress"}},
        },
        headers=auth_header(editor_token),
    )
    body = resp.json()
    errors = body.get("errors", [])
    assert any("Not Found." in e["message"] for e in errors), body


@pytest.mark.asyncio
async def test_zone_scope_denies_a_team_with_no_zone_assignment_at_all(client, unassigned_team):
    """A `zone`-scoped grant with no assigned zone at all denies everything (in_scope -> False)."""
    _, editor_token = await _make_zone_scoped_editor(unassigned_team)
    ticket_uuid = await _make_ticket_at(INSIDE_ZONE_POINT)

    resp = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET,
            "variables": {"uuid": ticket_uuid, "input": {"status": "in_progress"}},
        },
        headers=auth_header(editor_token),
    )
    body = resp.json()
    errors = body.get("errors", [])
    assert any("Not Found." in e["message"] for e in errors), body
