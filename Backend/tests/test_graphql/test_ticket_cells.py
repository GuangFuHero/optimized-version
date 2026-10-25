"""Ticket counts per H3 cell, and one cell's tickets, for a caller shown cells (ADR-387).

The guest map draws tickets as the cells they fall in (ADR-281/283). It used to count each cell from the
first page of `tickets` it fetched, so past one page a cell came up short. `ticketCells` counts in Postgres
instead, over the same rows `tickets` would page through, matched the same way (ADR-282); and
`tickets(locationCell:)` lists one cell's tickets, so its list agrees with its count.
"""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select, text

from app.models.auth import User
from app.models.geo import HazardousZone
from app.models.request import Tickets
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as db_ctx
from tests.test_graphql.test_ticket_detail_boundary import _box, _cell, _centre, _query, _signed_in

pytestmark = pytest.mark.asyncio

TITLE = "每格筆數"
# Away from every other test's points, so counts here are this module's own. Each sits near the centre
# of its resolution-8 cell, so the cells it is meant to share hold whichever way h3-pg rounds.
HERE = Point(120.5970123, 22.4746321)
# Same resolution-8 cell as HERE, about 35 m away.
BESIDE = Point(120.5973, 22.4748)
# A resolution-8 cell about 3.5 km east, in the same resolution-4 cell.
EAST = Point(120.6307, 22.4729)

CELLS = """
query ($bounds: BoundsInput!, $zoom: Float, $statuses: [String!]) {
  ticketCells(bounds: $bounds, zoom: $zoom, statuses: $statuses) { cell ticketCount urgentCount }
}
"""
TICKETS = """
query ($bounds: BoundsInput, $zoom: Float, $locationCell: String, $skip: Int) {
  tickets(bounds: $bounds, zoom: $zoom, locationCell: $locationCell, skip: $skip, limit: 200) {
    items { uuid locationCell }
    pageInfo { totalCount hasNextPage }
  }
}
"""
# Round HERE and EAST, with room to spare for the centres of their cells from resolution 6 up.
AREA = {"minLng": 120.55, "maxLng": 120.68, "minLat": 22.43, "maxLat": 22.52}
REFUSED = "locationCell must be an H3 cell of resolution 8 or coarser"


@pytest_asyncio.fixture(autouse=True)
async def _only_this_tests_tickets():
    """Soft-delete earlier tickets from this module so every count here is this test's own."""
    async with db_ctx() as db:
        for ticket in (
            await db.execute(select(Tickets).where(Tickets.delete_at.is_(None), Tickets.title == TITLE))
        ).scalars():
            ticket.delete_at = ticket.created_at


async def _ticket(point: Point = HERE, created_by: str | None = None, **fields) -> str:
    async with db_ctx() as db:
        if created_by is None:
            creator = User(name="creator")
            db.add(creator)
            await db.flush()
            created_by = str(creator.uuid)
        ticket = Tickets(
            geometry=from_shape(point, srid=4326),
            created_by=created_by,
            title=TITLE,
            contact_name="王小明",
            status=fields.pop("status", "pending"),
            priority=fields.pop("priority", "low"),
            **fields,
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _near_a_vertex(point: Point) -> Point:
    """A point 99% of the way from its resolution-8 cell's centre to a vertex, as far as a point gets."""
    async with db_ctx() as db:
        row = (
            await db.execute(
                text(
                    "WITH c AS (SELECT h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(:x, :y), 4326), 8) "
                    "AS cell), "
                    "g AS (SELECT h3_cell_to_geometry(cell) AS centre, "
                    "ST_PointN(ST_ExteriorRing(h3_cell_to_boundary_geometry(cell)), 1) AS vertex FROM c) "
                    "SELECT ST_X(centre), ST_Y(centre), ST_X(vertex), ST_Y(vertex) FROM g"
                ),
                {"x": point.x, "y": point.y},
            )
        ).one()
    cx, cy, vx, vy = row
    return Point(cx + 0.99 * (vx - cx), cy + 0.99 * (vy - cy))


async def _cells(client, variables, token=None) -> dict[str, tuple[int, int]]:
    rows = (await _query(client, CELLS, {"bounds": AREA, **variables}, token))["ticketCells"]
    return {row["cell"]: (row["ticketCount"], row["urgentCount"]) for row in rows}


async def _post(client, query, variables, token=None) -> dict:
    headers = auth_header(token) if token else {}
    return (
        await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    ).json()


# --- ticketCells ---------------------------------------------------------------------------


async def test_a_guest_gets_each_cells_count(client):
    """Two tickets sharing a cell count as one row of two, beside the other cell's one."""
    here, east = await _cell(HERE), await _cell(EAST)
    assert await _cell(BESIDE) == here
    for point in (HERE, BESIDE, EAST):
        await _ticket(point)

    assert await _cells(client, {}) == {here: (2, 0), east: (1, 0)}


async def test_the_counts_agree_with_paging_through_tickets(client):
    """Built from the conditions `tickets` uses, so counting its rows by cell gives the same numbers."""
    for point in (HERE, BESIDE, EAST, EAST):
        await _ticket(point)
    await _ticket(HERE, status="completed")

    variables = {"bounds": AREA, "zoom": 12.0}
    counted: dict[str, int] = {}
    for item in (await _query(client, TICKETS, variables))["tickets"]["items"]:
        counted[item["locationCell"]] = counted.get(item["locationCell"], 0) + 1

    assert {cell: n for cell, (n, _) in (await _cells(client, {"zoom": 12.0})).items()} == counted


async def test_a_cell_is_matched_by_its_centre_not_the_points_in_it(client):
    """A box shrunk round a ticket's point finds nothing; one round its cell's centre finds it (ADR-282)."""
    await _ticket(HERE)
    centre = await _centre(HERE)
    gap = max(abs(centre[0] - HERE.x), abs(centre[1] - HERE.y))

    around_point = await _query(client, CELLS, {"bounds": _box([HERE.x, HERE.y], gap / 2)})
    around_centre = await _query(client, CELLS, {"bounds": _box(centre, gap / 2)})

    assert around_point["ticketCells"] == []
    assert around_centre["ticketCells"] == [{"cell": await _cell(HERE), "ticketCount": 1, "urgentCount": 0}]


async def test_zoom_coarsens_the_cells_but_never_refines_them(client):
    """Zoomed out, both points fall in one coarser cell; zoomed past the anchor, still resolution 8."""
    await _ticket(HERE)
    await _ticket(EAST)
    coarse = await _cell(HERE, 4)
    assert await _cell(EAST, 4) == coarse
    # Zoom 7 is resolution 4, whose centre can lie well outside AREA.
    around_coarse = _box(await _centre(HERE, 4), 0.5)

    zoomed_out = await _query(client, CELLS, {"bounds": around_coarse, "zoom": 7.0})
    assert zoomed_out["ticketCells"] == [{"cell": coarse, "ticketCount": 2, "urgentCount": 0}]
    assert set(await _cells(client, {"zoom": 18.0})) == {await _cell(HERE), await _cell(EAST)}


async def test_statuses_narrow_the_count_to_those_given(client):
    """Several statuses at once, as the map's filter can tick them; none given counts every status."""
    for status in ("pending", "in_progress", "completed"):
        await _ticket(HERE, status=status)
    here = await _cell(HERE)

    assert await _cells(client, {"statuses": ["pending", "completed"]}) == {here: (2, 0)}
    assert await _cells(client, {}) == {here: (3, 0)}


async def test_urgent_is_high_or_critical_and_not_in_progress(client):
    """The site's own rule for the red cell (markers.ts), counted so the cell can say how many."""
    await _ticket(HERE, priority="critical")
    await _ticket(HERE, priority="high", status="completed")
    await _ticket(HERE, priority="high", status="in_progress")
    await _ticket(HERE, priority="medium")

    assert await _cells(client, {}) == {await _cell(HERE): (4, 2)}


async def test_a_caller_who_sees_every_point_gets_no_cells(client, redis):
    """Their tickets are pins, not cells, so there is nothing to count."""
    _, token = await _signed_in(redis)
    await _ticket(HERE)

    assert await _cells(client, {}, token) == {}


async def test_narrowed_to_own_only_the_others_tickets_are_cells(client, redis):
    """The caller's own ticket is a pin to them, so only the other one is counted."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    await _ticket(HERE, created_by=user_uuid)
    await _ticket(HERE)

    assert await _cells(client, {}, token) == {await _cell(HERE): (1, 0)}


async def test_an_area_in_the_box_does_not_break_the_count(client):
    """h3 rejects a polygon, and `base_geometries` holds areas beside ticket points (ADR-283)."""
    await _ticket(HERE)
    async with db_ctx() as db:
        closer = User(name="closer")
        db.add(closer)
        await db.flush()
        db.add(
            HazardousZone(
                geometry=from_shape(HERE.buffer(0.01), srid=4326),
                created_by=str(closer.uuid),
                status="blocked",
                information_source="test",
                note=TITLE,
            )
        )

    assert await _cells(client, {}) == {await _cell(HERE): (1, 0)}


async def test_a_deleted_ticket_is_not_counted(client):
    """Only what `tickets` would list."""
    await _ticket(HERE)
    await _ticket(HERE)
    deleted = await _ticket(HERE)
    async with db_ctx() as db:
        ticket = await db.get(Tickets, deleted)
        ticket.delete_at = ticket.created_at

    assert await _cells(client, {}) == {await _cell(HERE): (2, 0)}


# --- tickets(locationCell:) ----------------------------------------------------------------


async def test_a_cell_lists_its_own_tickets_and_their_count(client):
    """The cell's list and the cell's count are the same rows, at the cell's own resolution."""
    here = await _cell(HERE)
    mine = {await _ticket(HERE), await _ticket(BESIDE)}
    await _ticket(EAST)

    page = (await _query(client, TICKETS, {"locationCell": here, "zoom": 7.0}))["tickets"]

    assert {item["uuid"] for item in page["items"]} == mine
    assert {item["locationCell"] for item in page["items"]} == {here}
    assert page["pageInfo"]["totalCount"] == (await _cells(client, {}))[here][0]


async def test_a_coarser_cell_lists_every_ticket_inside_it(client):
    """A resolution-4 cell, as the map draws zoomed out, holds both points."""
    coarse = await _cell(HERE, 4)
    assert await _cell(EAST, 4) == coarse
    expected = {await _ticket(HERE), await _ticket(EAST)}

    page = (await _query(client, TICKETS, {"locationCell": coarse}))["tickets"]

    assert expected <= {item["uuid"] for item in page["items"]}
    assert {item["locationCell"] for item in page["items"]} == {coarse}


async def test_a_cell_finds_a_ticket_at_its_far_corner(client):
    """The index pre-filter must not cut off a point as far from the centre as its cell allows."""
    point = await _near_a_vertex(HERE)
    uuid = await _ticket(point)

    page = (await _query(client, TICKETS, {"locationCell": await _cell(point)}))["tickets"]

    assert [item["uuid"] for item in page["items"]] == [uuid]


async def test_a_cell_finer_than_the_cap_is_refused(client):
    """Without this a guest could ask for a 10 m cell and learn the point it withholds."""
    body = await _post(client, TICKETS, {"locationCell": await _cell(HERE, 9)})

    assert any(REFUSED in e["message"] for e in body["errors"]), body


@pytest.mark.parametrize("cell", ["not-a-cell", "", "zzzzzzzzzzzzzzz"])
async def test_a_malformed_cell_is_refused(client, cell):
    """Refused rather than matching nothing, so a typo is not mistaken for an empty cell."""
    body = await _post(client, TICKETS, {"locationCell": cell})

    assert any(REFUSED in e["message"] for e in body["errors"]), body


@pytest.mark.parametrize(
    "cell",
    [
        "88f4000001fffff",  # base cell 122; there are 0-121, and h3-pg raises on its centre
        "8828070001fffff",  # digit 7 within the resolution
        "882800000000000",  # unused digits not 7
        "88828000001fffff",  # the reserved top bit set
    ],
)
async def test_a_cell_of_the_right_shape_naming_none_is_refused(client, cell):
    """h3-pg is asked whether it names a real cell, rather than the query failing on one that doesn't."""
    body = await _post(client, TICKETS, {"locationCell": cell})

    assert any(REFUSED in e["message"] for e in body["errors"]), body


async def test_a_cell_lists_nothing_its_caller_sees_as_a_pin(client, redis):
    """A cell holds the tickets shown as that cell; the caller's own, shown exactly, is not among them."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    await _ticket(HERE, created_by=user_uuid)
    theirs = await _ticket(HERE)

    page = (await _query(client, TICKETS, {"locationCell": await _cell(HERE)}, token))["tickets"]

    assert [item["uuid"] for item in page["items"]] == [theirs]
