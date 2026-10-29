"""A ticket names the teams of the 責任區 it lies in, to callers who see its detail (ADR-422)."""

import random
import uuid as uuid_mod
from datetime import UTC, datetime
from typing import NamedTuple

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon, box

from app.models.auth import User
from app.models.request import Tickets
from app.models.team import Team, TeamZone, TeamZoneAssign
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as open_db
from tests.test_graphql.test_loaders import _SelectCounter

pytestmark = pytest.mark.asyncio

TICKET_TEAMS = "query ($uuid: UUID!) { ticket(uuid: $uuid) { responsibleTeams { uuid name type } } }"
TICKETS_TEAMS = "query { tickets(limit: 200) { items { uuid responsibleTeams { name } } } }"


class Place(NamedTuple):
    """A spot, a point away from it, and three zones: over the spot, inside that one, and far off."""

    here: Point
    elsewhere: Point
    township: Polygon
    village: Polygon
    far: Polygon


def _place() -> Place:
    """A place of the test's own, picked at random.

    This suite keeps its database across tests, and across runs, so the zones drawn before stay. A few
    hundred metres somewhere over the Americas, away from Taiwan where the other tests draw theirs, is
    all but sure to be clear of them.
    """
    x, y = random.uniform(-170.0, -40.0), random.uniform(-50.0, 50.0)
    return Place(
        here=Point(x, y),
        elsewhere=Point(x + 0.01, y),
        township=box(x - 0.005, y - 0.005, x + 0.005, y + 0.005),
        village=box(x - 0.001, y - 0.001, x + 0.001, y + 0.001),
        far=box(x + 0.02, y - 0.005, x + 0.03, y + 0.005),
    )


async def _gql(client, query, variables, token=None):
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]


async def _team(name: str, *, deleted: bool = False) -> str:
    async with open_db() as db:
        team = Team(name=name, type="ngo", delete_at=datetime.now(UTC) if deleted else None)
        db.add(team)
        await db.flush()
        return str(team.uuid)


async def _zone(shape: Polygon, *team_uuids: str, deleted: bool = False) -> str:
    async with open_db() as db:
        assigner = User(name=f"assigner_{uuid_mod.uuid4().hex[:8]}")
        zone = TeamZone(
            name="責任區",
            geometry=from_shape(shape, srid=4326),
            delete_at=datetime.now(UTC) if deleted else None,
        )
        db.add_all([assigner, zone])
        await db.flush()
        db.add_all(
            TeamZoneAssign(team_uuid=team, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid))
            for team in team_uuids
        )
        return str(zone.uuid)


async def _ticket_at(point: Point) -> str:
    async with open_db() as db:
        creator = User(name=f"creator_{uuid_mod.uuid4().hex[:8]}")
        db.add(creator)
        await db.flush()
        ticket = Tickets(
            geometry=from_shape(point, srid=4326),
            created_by=str(creator.uuid),
            title="民宅清淤",
            contact_name="王小姐",
            status="pending",
            priority="low",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _names(client, ticket_uuid: str, token=None) -> list[str]:
    data = await _gql(client, TICKET_TEAMS, {"uuid": ticket_uuid}, token)
    return [team["name"] for team in data["ticket"]["responsibleTeams"]]


async def test_a_ticket_names_the_teams_of_the_zone_it_lies_in(client, login_user_auth):
    """Every team the zone is assigned to, by name; a zone elsewhere adds nobody."""
    _, token = login_user_auth
    place = _place()
    bravo, alpha = await _team("B 志工隊"), await _team("A 救援隊")
    await _zone(place.township, bravo, alpha)
    await _zone(place.far, await _team("C 遠方隊"))
    ticket = await _ticket_at(place.here)

    data = await _gql(client, TICKET_TEAMS, {"uuid": ticket}, token)

    assert data["ticket"]["responsibleTeams"] == [
        {"uuid": alpha, "name": "A 救援隊", "type": "ngo"},
        {"uuid": bravo, "name": "B 志工隊", "type": "ngo"},
    ]


async def test_a_team_over_the_point_through_two_zones_comes_once(client, login_user_auth):
    """Overlapping zones add their teams together, each team once."""
    _, token = login_user_auth
    place = _place()
    alpha, bravo = await _team("A 救援隊"), await _team("B 志工隊")
    await _zone(place.township, alpha)
    await _zone(place.village, alpha, bravo)
    ticket = await _ticket_at(place.here)

    assert await _names(client, ticket, token) == ["A 救援隊", "B 志工隊"]


async def test_a_ticket_in_no_zone_names_no_team(client, login_user_auth):
    """Outside every 責任區, the list is empty and the site writes nothing."""
    _, token = login_user_auth
    place = _place()
    await _zone(place.township, await _team("A 救援隊"))
    ticket = await _ticket_at(place.elsewhere)

    assert await _names(client, ticket, token) == []


async def test_a_deleted_zone_or_team_answers_for_nothing(client, login_user_auth):
    """As in zone scope and on the map: a deleted zone covers nothing, a deleted team is not named."""
    _, token = login_user_auth
    place = _place()
    await _zone(place.township, await _team("A 已刪的區"), deleted=True)
    await _zone(place.village, await _team("B 已刪的隊", deleted=True), await _team("C 救援隊"))
    ticket = await _ticket_at(place.here)

    assert await _names(client, ticket, token) == ["C 救援隊"]


async def test_a_guest_is_told_no_team(client, login_user_auth):
    """Worked out from the exact point, the teams would say more than the cell a guest sees (ADR-281)."""
    _, token = login_user_auth
    place = _place()
    await _zone(place.village, await _team("A 救援隊"))
    ticket = await _ticket_at(place.here)

    assert await _names(client, ticket) == []
    assert await _names(client, ticket, token) == ["A 救援隊"]


async def test_a_page_of_tickets_looks_their_teams_up_once(client, login_user_auth):
    """One batched lookup for the whole page, and none at all for a guest."""
    _, token = login_user_auth
    place = _place()
    await _zone(place.township, await _team("A 救援隊"))
    inside = {await _ticket_at(place.here) for _ in range(3)}
    outside = await _ticket_at(place.elsewhere)

    with _SelectCounter("team_zone_assign") as signed_in:
        data = await _gql(client, TICKETS_TEAMS, {}, token)
    with _SelectCounter("team_zone_assign") as guest:
        await _gql(client, TICKETS_TEAMS, {})

    teams = {item["uuid"]: item["responsibleTeams"] for item in data["tickets"]["items"]}
    assert all(teams[uuid] == [{"name": "A 救援隊"}] for uuid in inside)
    assert teams[outside] == []
    assert (signed_in.count, guest.count) == (1, 0)
