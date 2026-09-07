"""End-to-end coverage for `zone` scope through a real GraphQL mutation call (Phase 4/T120).

Mirrors test_team_scope.py's pattern for `team` scope. own/team/gov/ngo all got a GraphQL
e2e test somewhere in Phase 1-3; `zone` only ever had DB-level unit coverage
(test_rbac_scopes.py/test_authz.py) — this closes that gap using a real WorkZone +
TeamZoneAssign instead of a hand-rolled resource in a unit test.
"""

import uuid as uuid_mod
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.models.ticket_task import TicketTask
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header, test_db

UPDATE_TICKET = """
mutation($uuid: UUID!, $input: UpdateTicketInput!) {
    updateTicket(uuid: $uuid, input: $input) { uuid status }
}
"""

UPDATE_TICKET_TASK = """
mutation($uuid: UUID!, $input: UpdateTicketTaskInput!) {
    updateTicketTask(uuid: $uuid, input: $input) { uuid status }
}
"""

ZONE_POLYGON = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])
INSIDE_ZONE_POINT = Point(121.5, 24.5)
OUTSIDE_ZONE_POINT = Point(123.5, 24.5)


async def _make_zone_scoped_editor(team_uuid: str) -> tuple[str, str]:
    """Create a user acting as a `team_uuid` role that grants ticket.edit at 'zone' scope.

    Zone scope resolves the team off the active identity (ADR-074), so the role has to be
    team-kind, the grant has to name the team, and the token has to act as that identity —
    a platform identity has no team and would fail zone scope outright.
    """
    async with test_db() as db:
        name = f"editor_{uuid_mod.uuid4().hex[:8]}"
        user = User(name=name)
        db.add(user)
        await db.flush()

        team = await db.get(Team, team_uuid)
        role = Role(name=f"zone-editor-{uuid_mod.uuid4().hex[:8]}", kind="team")
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
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid))

        return str(user.uuid), token_for(user.uuid, role, team)


@pytest_asyncio.fixture
async def team_assigned_to_zone() -> str:
    """A Team assigned to a WorkZone covering ~121-122E/24-25N, returned as team_uuid."""
    async with test_db() as db:
        team = Team(name=f"Zone Team {uuid_mod.uuid4().hex[:8]}", type="ngo")
        db.add(team)
        assigner = User(name=f"assigner_{uuid_mod.uuid4().hex[:8]}")
        db.add(assigner)
        zone = WorkZone(name="Test Zone", geometry=from_shape(ZONE_POLYGON, srid=4326))
        db.add(zone)
        await db.flush()
        db.add(
            TeamZoneAssign(
                team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)
            )
        )
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


async def _make_task_under(ticket_uuid: str) -> str:
    """Seed a ticket task under `ticket_uuid` (created by someone else) and return its UUID."""
    async with test_db() as db:
        creator = User(name=f"taskcreator_{uuid_mod.uuid4().hex[:8]}")
        db.add(creator)
        await db.flush()
        task = TicketTask(
            ticket_uuid=ticket_uuid,
            task_type="hr", task_name="Need medics",
            quantity=2, source="user", visibility="public",
            created_by=str(creator.uuid),
        )
        db.add(task)
        await db.flush()
        return str(task.uuid)


@pytest.mark.asyncio
async def test_zone_scope_grants_task_edit_via_parent_ticket_geometry(client, team_assigned_to_zone):
    """ADR-052 (direction B): a task inherits its parent ticket's location for the zone check.

    A TicketTask has no geometry of its own, so a `ticket.edit=zone` grant would never match
    it directly; borrowing the parent ticket's point lets a zone editor moderate tasks under
    tickets inside the team's assigned zone (which they own neither).
    """
    _, editor_token = await _make_zone_scoped_editor(team_assigned_to_zone)
    ticket_uuid = await _make_ticket_at(INSIDE_ZONE_POINT)
    task_uuid = await _make_task_under(ticket_uuid)

    resp = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET_TASK,
            "variables": {"uuid": task_uuid, "input": {"status": "in_progress"}},
        },
        headers=auth_header(editor_token),
    )
    body = resp.json()
    assert "errors" not in body, body
    assert body["data"]["updateTicketTask"]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_zone_scope_404s_task_under_ticket_outside_zone(client, team_assigned_to_zone):
    """Symmetric to the ticket-level case: a task under a ticket OUTSIDE the zone is 404."""
    _, editor_token = await _make_zone_scoped_editor(team_assigned_to_zone)
    ticket_uuid = await _make_ticket_at(OUTSIDE_ZONE_POINT)
    task_uuid = await _make_task_under(ticket_uuid)

    resp = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET_TASK,
            "variables": {"uuid": task_uuid, "input": {"status": "in_progress"}},
        },
        headers=auth_header(editor_token),
    )
    body = resp.json()
    errors = body.get("errors", [])
    assert any("Not Found." in e["message"] for e in errors), body


@pytest.mark.asyncio
async def test_soft_deleting_the_zone_revokes_the_teams_zone_scope(client, team_assigned_to_zone):
    """Soft-deleting a work zone immediately lapses the zone scope it granted.

    rbac_scopes.py filters `WorkZone.delete_at IS NULL` on both the in_scope and scope_filter
    paths, so no cache invalidation or assignment cleanup is needed — but that has to stay
    true, hence this test. A lapsed zone scope surfaces as 404, not 403 (ADR-023).
    """
    _, editor_token = await _make_zone_scoped_editor(team_assigned_to_zone)
    ticket_uuid = await _make_ticket_at(INSIDE_ZONE_POINT)

    # Baseline: while the zone is live, the zone-scoped grant reaches the ticket.
    before = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET,
            "variables": {"uuid": ticket_uuid, "input": {"status": "in_progress"}},
        },
        headers=auth_header(editor_token),
    )
    assert "errors" not in before.json(), before.json()

    async with test_db() as db:
        zone = (
            await db.execute(
                select(WorkZone)
                .join(TeamZoneAssign, TeamZoneAssign.zone_uuid == WorkZone.uuid)
                .where(TeamZoneAssign.team_uuid == team_assigned_to_zone)
            )
        ).scalars().first()
        assert zone is not None
        zone.delete_at = datetime.now(UTC)

    after = await client.post(
        "/graphql",
        json={
            "query": UPDATE_TICKET,
            "variables": {"uuid": ticket_uuid, "input": {"status": "completed"}},
        },
        headers=auth_header(editor_token),
    )
    assert any("Not Found." in e["message"] for e in after.json().get("errors", [])), after.json()


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
