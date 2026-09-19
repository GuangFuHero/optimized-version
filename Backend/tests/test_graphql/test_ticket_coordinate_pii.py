"""A ticket's coordinate is PII, gated exactly like its address (ADR-281/282).

The address was withheld without `ticket.view_pii` (ADR-268) while the coordinate beside it
went out to anyone at centimetre precision — which points at the same house. Both are now
behind the same check, and so is the `bounds` filter, which would otherwise let a caller
shrink a box around a ticket until it pins the point the field no longer shows.
"""

import uuid as uuid_mod

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
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header, test_db

ZONE_POLYGON = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])
INSIDE = Point(121.4312345, 24.6654321)
OUTSIDE = Point(122.4312345, 24.6654321)
# Covers both points above and nothing any other test in this package creates.
BOTH = {"minLng": 121.43, "minLat": 24.66, "maxLng": 122.44, "maxLat": 24.67}

TICKET = "query($uuid: UUID!) { ticket(uuid: $uuid) { uuid geometry } }"
TICKETS = """
query($bounds: BoundsInput) {
  tickets(bounds: $bounds, limit: 50) { items { uuid geometry } pageInfo { totalCount } }
}
"""


async def _actor(redis, grants, team_uuid=None) -> tuple[str, str]:
    """A user whose active identity holds exactly `grants`, and a token acting as it."""
    async with test_db() as db:
        user = User(name=f"coord_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        team = await db.get(Team, team_uuid) if team_uuid else None
        role = Role(name=f"coord-{uuid_mod.uuid4().hex[:8]}", kind="team" if team else "platform")
        db.add(role)
        await db.flush()
        for perm, scope in grants:
            permission = (
                await db.execute(select(Permission).where(Permission.key == perm.value))
            ).scalar_one_or_none()
            if permission is None:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
            db.add(RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
            ))
        db.add(UserRoleAssign(
            user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid if team else None
        ))
        return str(user.uuid), await token_for(redis, user.uuid, role, team)


@pytest_asyncio.fixture
async def zone_team() -> str:
    """A team assigned to a work zone covering INSIDE but not OUTSIDE."""
    async with test_db() as db:
        team = Team(name=f"Coord Zone {uuid_mod.uuid4().hex[:8]}", type="ngo")
        assigner = User(name="assigner")
        zone = WorkZone(name="Coord Zone", geometry=from_shape(ZONE_POLYGON, srid=4326))
        db.add_all([team, assigner, zone])
        await db.flush()
        db.add(TeamZoneAssign(
            team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)
        ))
        return str(team.uuid)


@pytest_asyncio.fixture(autouse=True)
async def _clear_the_box():
    """Soft-delete earlier tickets inside BOTH so each test counts only its own."""
    async with test_db() as db:
        for ticket in (await db.execute(select(Tickets).where(Tickets.delete_at.is_(None)))).scalars():
            if ticket.title == "coordinate pii":
                ticket.delete_at = ticket.created_at


async def _ticket(point: Point, created_by: str | None = None) -> str:
    async with test_db() as db:
        if created_by is None:
            creator = User(name="creator")
            db.add(creator)
            await db.flush()
            created_by = str(creator.uuid)
        ticket = Tickets(
            geometry=from_shape(point, srid=4326), created_by=created_by,
            title="coordinate pii", contact_name="王小明", status="pending",
            priority="low", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _query(client, query, variables, token=None) -> dict:
    headers = auth_header(token) if token else {}
    body = (await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=headers
    )).json()
    assert "errors" not in body, body
    return body["data"]


def _coordinates(geometry) -> list[float]:
    return geometry["coordinates"]


@pytest.mark.asyncio
async def test_an_anonymous_caller_gets_no_coordinate(client):
    """Denial is a null field, never an error — the same contract as the address."""
    uuid = await _ticket(INSIDE)

    ticket = (await _query(client, TICKET, {"uuid": uuid}))["ticket"]

    assert ticket["uuid"] == uuid
    assert ticket["geometry"] is None


@pytest.mark.asyncio
async def test_the_public_list_still_lists_every_ticket_without_its_coordinate(client):
    """The help-request board stays public (ADR-027); only the pin is withheld."""
    uuid = await _ticket(INSIDE)

    items = {i["uuid"]: i for i in (await _query(client, TICKETS, {}))["tickets"]["items"]}

    assert uuid in items
    assert items[uuid]["geometry"] is None


@pytest.mark.asyncio
async def test_bounds_cannot_locate_a_ticket_the_caller_may_not_see(client):
    """Shrinking a box until a ticket drops out would recover the withheld point."""
    await _ticket(INSIDE)

    page = (await _query(client, TICKETS, {"bounds": BOTH}))["tickets"]

    assert page["items"] == []
    assert page["pageInfo"]["totalCount"] == 0


@pytest.mark.asyncio
async def test_the_requester_sees_the_coordinate_of_their_own_ticket(client, redis):
    """`own` reaches the reporter's own tickets only, on the field and in a bbox."""
    user_uuid, token = await _actor(
        redis, [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_VIEW_PII, "own")]
    )
    mine, theirs = await _ticket(INSIDE, created_by=user_uuid), await _ticket(INSIDE)

    assert _coordinates(
        (await _query(client, TICKET, {"uuid": mine}, token))["ticket"]["geometry"]
    ) == [121.4312345, 24.6654321]
    assert (await _query(client, TICKET, {"uuid": theirs}, token))["ticket"]["geometry"] is None

    page = (await _query(client, TICKETS, {"bounds": BOTH}, token))["tickets"]
    assert [i["uuid"] for i in page["items"]] == [mine]
    assert page["pageInfo"]["totalCount"] == 1


@pytest.mark.asyncio
async def test_a_zone_team_sees_coordinates_inside_its_zone_only(client, redis, zone_team):
    """A rescue team sees the points inside its assigned zone, decided row by row."""
    _, token = await _actor(
        redis, [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_VIEW_PII, "zone")], zone_team
    )
    inside, outside = await _ticket(INSIDE), await _ticket(OUTSIDE)

    assert (await _query(client, TICKET, {"uuid": inside}, token))["ticket"]["geometry"] is not None
    assert (await _query(client, TICKET, {"uuid": outside}, token))["ticket"]["geometry"] is None

    unbounded = {i["uuid"]: i for i in (await _query(client, TICKETS, {}, token))["tickets"]["items"]}
    assert unbounded[inside]["geometry"] is not None
    assert unbounded[outside]["geometry"] is None

    page = (await _query(client, TICKETS, {"bounds": BOTH}, token))["tickets"]
    assert [i["uuid"] for i in page["items"]] == [inside]
    assert page["pageInfo"]["totalCount"] == 1


@pytest.mark.asyncio
async def test_an_all_scope_holder_sees_every_coordinate_and_filters_by_bounds(client, redis):
    """`all` is unaffected: every point, and the bbox filter works as before."""
    _, token = await _actor(redis, [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_VIEW_PII, "all")])
    inside, outside = await _ticket(INSIDE), await _ticket(OUTSIDE)

    page = (await _query(client, TICKETS, {"bounds": BOTH}, token))["tickets"]

    assert {i["uuid"] for i in page["items"]} == {inside, outside}
    assert all(i["geometry"] is not None for i in page["items"])
    assert page["pageInfo"]["totalCount"] == 2
