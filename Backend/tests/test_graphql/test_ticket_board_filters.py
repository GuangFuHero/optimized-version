"""The ticket board's 行政區域, 組織分配 and 時間 filters, and the facets its chips list.

組織分配 is the 責任區 a ticket lies in, as `responsibleTeams` names it (ADR-422): tickets carry no
team of their own. Like `responsibleTeams` and the address, the area and team filters read the exact
point and the address, so a row the caller sees only as a cell never matches them (ADR-281). 時間 reads
`updatedAt`, as the prototype's 更新時間 does.
"""

import uuid as uuid_mod
from datetime import UTC, datetime, timedelta

import pytest
from shapely.geometry import Point

from app.core.permissions import Perm
from app.models.geo import BaseGeometry
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as open_db
from tests.test_graphql.test_ticket_detail_boundary import _actor
from tests.test_graphql.test_ticket_responsible_teams import _gql, _place, _team, _ticket_at, _zone

pytestmark = pytest.mark.asyncio

LIST = """
query($q: String!, $team: UUID, $none: Boolean! = false, $county: String, $town: String,
      $after: DateTime, $before: DateTime) {
    tickets(q: $q, responsibleTeamUuid: $team, unassignedOnly: $none, county: $county, town: $town,
            updatedAfter: $after, updatedBefore: $before, limit: 200) {
        items { uuid }
        pageInfo { totalCount }
    }
    ticketsExtent(q: $q, responsibleTeamUuid: $team, unassignedOnly: $none, county: $county,
                  town: $town, updatedAfter: $after, updatedBefore: $before) { count }
}
"""

FACETS = """
query {
    ticketFacets {
        areas { county town }
        teams { uuid name }
    }
}
"""

DETAIL = [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_VIEW_DETAIL, "all")]


async def _tagged(
    point: Point, tag: str, *, county=None, town=None, location_type="address", updated_at=None, by=None
) -> str:
    """A ticket at `point` titled with `tag`, so `q` finds this test's tickets alone; filed by `by`."""
    uuid = await _ticket_at(point, by=by)
    async with open_db() as db:
        ticket = await db.get(Tickets, uuid)
        ticket.title = f"{tag} 民宅清淤"
        if county or town:
            db.add(
                SecondaryLocation(geometry_uuid=uuid, location_type=location_type, county=county, town=town)
            )
    if updated_at is not None:
        # On the table, past the ORM hook that stamps every edit with now.
        async with open_db() as db:
            await db.execute(
                BaseGeometry.__table__.update().where(BaseGeometry.uuid == uuid).values(updated_at=updated_at)
            )
    return uuid


async def _errors(client, token, **variables) -> list[str]:
    response = await client.post(
        "/graphql", json={"query": LIST, "variables": variables}, headers=auth_header(token)
    )
    return [error["message"] for error in response.json().get("errors", [])]


async def _listed(client, token, **variables) -> set[str]:
    data = await _gql(client, LIST, variables, token)
    uuids = {item["uuid"] for item in data["tickets"]["items"]}
    assert data["tickets"]["pageInfo"]["totalCount"] == data["ticketsExtent"]["count"] == len(uuids)
    return uuids


def _tag() -> str:
    return uuid_mod.uuid4().hex[:10]


async def test_responsible_team_lists_the_tickets_in_its_zones(client, redis):
    """A team's tickets are those in its 責任區; unassigned are those in nobody's."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    alpha, bravo = await _team("A 救援隊"), await _team("B 志工隊")
    await _zone(place.township, alpha)
    await _zone(place.village, bravo)
    both = await _tagged(place.here, tag)
    outside = await _tagged(place.elsewhere, tag)

    assert await _listed(client, token, q=tag, team=alpha) == {both}
    assert await _listed(client, token, q=tag, team=bravo) == {both}
    assert await _listed(client, token, q=tag, none=True) == {outside}
    assert await _listed(client, token, q=tag) == {both, outside}


async def test_a_deleted_zone_or_team_leaves_its_tickets_unassigned(client, redis):
    """As `responsibleTeams` reads it: a deleted zone covers nothing, a deleted team answers for nothing."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    gone = await _team("A 已刪的區")
    await _zone(place.township, gone, deleted=True)
    await _zone(place.village, await _team("B 已刪的隊", deleted=True))
    ticket = await _tagged(place.here, tag)

    assert await _listed(client, token, q=tag, team=gone) == set()
    assert await _listed(client, token, q=tag, none=True) == {ticket}


async def test_county_and_town_match_the_ticket_address(client, redis):
    """縣市 alone, or with its 鄉鎮市區; a ticket with no address matches neither."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    fenglin = await _tagged(place.here, tag, county="花蓮縣", town="鳳林鎮")
    guangfu = await _tagged(place.here, tag, county="花蓮縣", town="光復鄉")
    await _tagged(place.here, tag, county="臺東縣", town="池上鄉")
    await _tagged(place.here, tag)

    assert await _listed(client, token, q=tag, county="花蓮縣") == {fenglin, guangfu}
    assert await _listed(client, token, q=tag, county="花蓮縣", town="光復鄉") == {guangfu}


async def test_updated_after_and_before_split_the_tickets(client, redis):
    """24 小時內 and 更早: the two halves of one moment, every ticket in exactly one."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    now = datetime.now(UTC)
    fresh = await _tagged(place.here, tag, updated_at=now - timedelta(hours=2))
    stale = await _tagged(place.here, tag, updated_at=now - timedelta(days=3))
    cut = (now - timedelta(hours=24)).isoformat()

    assert await _listed(client, token, q=tag, after=cut) == {fresh}
    assert await _listed(client, token, q=tag, before=cut) == {stale}


async def test_a_town_needs_its_county(client, redis):
    """鄉鎮 names repeat across counties (中正區, 東區), so a town alone names no one place."""
    _, token = await _actor(redis, DETAIL)

    assert await _errors(client, token, q=_tag(), town="東區") == ["town needs county"]


async def test_a_team_and_unassigned_cannot_be_combined(client, redis):
    """No ticket is both in a team's 責任區 and in none; asking for both is a mistake, said as one."""
    _, token = await _actor(redis, DETAIL)
    team = await _team("A 救援隊")

    assert await _errors(client, token, q=_tag(), team=team, none=True) == [
        "responsibleTeamUuid and unassignedOnly cannot be combined"
    ]


async def test_only_an_address_counts_for_the_area(client, redis):
    """A pole's location is not where the ticket is filed, so its county and town match nothing."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    county = f"測試縣{tag}"
    await _tagged(place.here, tag, county=county, town="光復鄉", location_type="pole")

    assert await _listed(client, token, q=tag, county=county) == set()
    facets = (await _gql(client, FACETS, {}, token))["ticketFacets"]
    assert [a for a in facets["areas"] if a["county"] == county] == []


async def test_without_the_detail_area_and_team_match_nothing(client, redis):
    """Matching them would tell the town or the side of a zone's edge the cell is there to hide."""
    _, token = await _actor(redis, [(Perm.TICKET_VIEW, "all")])
    place, tag = _place(), _tag()
    alpha = await _team("A 救援隊")
    await _zone(place.township, alpha)
    await _tagged(place.here, tag, county="花蓮縣", town="光復鄉")

    assert await _listed(client, token, q=tag, team=alpha) == set()
    assert await _listed(client, token, q=tag, none=True) == set()
    assert await _listed(client, token, q=tag, county="花蓮縣") == set()


async def test_with_the_detail_at_own_area_and_team_match_only_own_tickets(client, redis):
    """Between `all` and none, the detail gate decides row by row.

    Another's ticket in the same zone and county matches no filter, and its town and team are not offered.
    """
    user, token = await _actor(redis, [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_VIEW_DETAIL, "own")])
    place, tag = _place(), _tag()
    county = f"測試縣{tag}"
    alpha = await _team(f"A {tag}")
    await _zone(place.township, alpha)
    mine = await _tagged(place.here, tag, county=county, town="光復鄉", by=user)
    await _tagged(place.here, tag, county=county, town="光復鄉")
    hidden = await _team(f"B {tag}")
    await _zone(place.far, hidden)
    await _tagged(Point(place.here.x + 0.025, place.here.y), tag, county=county, town="玉里鎮")
    mine_unassigned = await _tagged(place.elsewhere, tag, county=county, town="鳳林鎮", by=user)
    await _tagged(place.elsewhere, tag, county=county, town="瑞穗鄉")

    assert await _listed(client, token, q=tag, team=alpha) == {mine}
    assert await _listed(client, token, q=tag, team=hidden) == set()
    assert await _listed(client, token, q=tag, none=True) == {mine_unassigned}
    assert await _listed(client, token, q=tag, county=county) == {mine, mine_unassigned}
    assert await _listed(client, token, q=tag, county=county, town="光復鄉") == {mine}

    facets = (await _gql(client, FACETS, {}, token))["ticketFacets"]
    assert [a for a in facets["areas"] if a["county"] == county] == [
        {"county": county, "town": "光復鄉"},
        {"county": county, "town": "鳳林鎮"},
    ]
    teams = {team["uuid"] for team in facets["teams"]}
    assert alpha in teams
    assert hidden not in teams


async def test_facets_list_the_areas_and_the_zone_teams(client, redis):
    """Every county and town a listed ticket's address names, once; every team holding a live zone."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    alpha = await _team(f"A {tag}")
    await _zone(place.township, alpha)
    idle = await _team(f"B {tag}")
    await _tagged(place.here, tag, county="花蓮縣", town=f"光復鄉{tag}")
    await _tagged(place.here, tag, county="花蓮縣", town=f"光復鄉{tag}")

    facets = (await _gql(client, FACETS, {}, token))["ticketFacets"]

    assert [a for a in facets["areas"] if a["town"] == f"光復鄉{tag}"] == [
        {"county": "花蓮縣", "town": f"光復鄉{tag}"}
    ]
    uuids = {team["uuid"] for team in facets["teams"]}
    assert alpha in uuids
    assert idle not in uuids


async def test_facets_leave_out_an_address_naming_only_its_county(client, redis):
    """Picking that county would match all its towns, not the addresses without one."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    county = f"測試縣{tag}"
    await _tagged(place.here, tag, county=county)
    await _tagged(place.here, tag, county=county, town="光復鄉")

    facets = (await _gql(client, FACETS, {}, token))["ticketFacets"]

    assert [a for a in facets["areas"] if a["county"] == county] == [{"county": county, "town": "光復鄉"}]


async def test_facets_leave_out_a_team_whose_zone_holds_no_ticket(client, redis):
    """A team the 組織分配 filter would find nothing for is not offered."""
    _, token = await _actor(redis, DETAIL)
    place, tag = _place(), _tag()
    empty = await _team(f"A {tag}")
    await _zone(place.far, empty)
    holding = await _team(f"B {tag}")
    await _zone(place.township, holding)
    await _tagged(place.here, tag)

    uuids = {team["uuid"] for team in (await _gql(client, FACETS, {}, token))["ticketFacets"]["teams"]}

    assert holding in uuids
    assert empty not in uuids


async def test_facets_say_nothing_without_the_detail(client, redis):
    """Without ticket.view_detail the filters match nothing, so there is nothing to offer."""
    _, token = await _actor(redis, [(Perm.TICKET_VIEW, "all")])
    place, tag = _place(), _tag()
    await _zone(place.township, await _team(f"A {tag}"))
    await _tagged(place.here, tag, county="花蓮縣", town="光復鄉")

    assert (await _gql(client, FACETS, {}, token))["ticketFacets"] == {"areas": [], "teams": []}
