"""The guest boundary on tickets: a region to the anonymous caller, the exact place once signed in.

ADR-281/282/283, after the team's rule (Discord 2026-06-30〜07-03, 訪客看區域、登入看精確) and
the prototype's TM-FEAT-003 AC-02..04. Everything that places the reporter or tells their story
— the point, the address, the free text, the photos, the review notes, who filed it — sits
behind `ticket.view_detail`. Without it the point is the centre of an H3 cell, the rest is
withheld, and neither `bounds` nor `q` can be used to get back what the fields no longer say.

Contact details stay behind `ticket.view_pii`; those are covered in test_pii_masking-era tests
and are deliberately not re-asserted here.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point, Polygon
from sqlalchemy import select, text

from app.core.permissions import PUBLIC_PERMS, Perm
from app.db import h3
from app.models.auth import User
from app.models.geo import ClosureArea
from app.models.photo import Photo
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.team import Team, TeamZoneAssign, WorkZone
from app.models.ticket_task import TaskProperty, TicketTask
from tests.conftest import token_for
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as db_ctx

TITLE = "詳情邊界"
ZONE_POLYGON = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])
INSIDE = Point(121.4312345, 24.6654321)
# Same resolution-8 cell as INSIDE, about 30 m away.
NEIGHBOUR = Point(121.4315, 24.6656)
OUTSIDE = Point(122.4312345, 24.6654321)

TICKET = """
query($uuid: UUID!, $zoom: Float) {
  ticket(uuid: $uuid, zoom: $zoom) {
    uuid geometry description reviewNote createdBy
    photos { url }
    secondaryLocation { county city lane no }
    tasks {
      taskName taskDescription progressNote reviewNote createdBy
      properties { propertyValue comment }
    }
  }
}
"""
TICKETS = """
query($bounds: BoundsInput, $q: String, $zoom: Float) {
  tickets(bounds: $bounds, q: $q, zoom: $zoom, limit: 50) {
    items { uuid geometry description }
    pageInfo { totalCount }
  }
}
"""
TASKS = """
query($ticketUuid: String!, $q: String) {
  ticketTasks(ticketUuid: $ticketUuid, q: $q) {
    uuid taskName taskDescription progressNote reviewNote createdBy
  }
}
"""


async def _actor(redis, grants, team_uuid=None) -> tuple[str, str]:
    """A user whose active identity holds exactly `grants`, and a token acting as it."""
    async with db_ctx() as db:
        user = User(name=f"detail_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        team = await db.get(Team, team_uuid) if team_uuid else None
        role = Role(name=f"detail-{uuid_mod.uuid4().hex[:8]}", kind="team" if team else "platform")
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
    async with db_ctx() as db:
        team = Team(name=f"Detail Zone {uuid_mod.uuid4().hex[:8]}", type="ngo")
        assigner = User(name="assigner")
        zone = WorkZone(name="Detail Zone", geometry=from_shape(ZONE_POLYGON, srid=4326))
        db.add_all([team, assigner, zone])
        await db.flush()
        db.add(TeamZoneAssign(
            team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)
        ))
        return str(team.uuid)


@pytest_asyncio.fixture(autouse=True)
async def _only_this_tests_tickets():
    """Soft-delete earlier tickets from this module so every count here is this test's own."""
    async with db_ctx() as db:
        for ticket in (
            await db.execute(select(Tickets).where(Tickets.delete_at.is_(None), Tickets.title == TITLE))
        ).scalars():
            ticket.delete_at = ticket.created_at


async def _ticket(point: Point = INSIDE, created_by: str | None = None, **fields) -> str:
    async with db_ctx() as db:
        if created_by is None:
            creator = User(name="creator")
            db.add(creator)
            await db.flush()
            created_by = str(creator.uuid)
        ticket = Tickets(
            geometry=from_shape(point, srid=4326), created_by=created_by,
            title=TITLE, contact_name="王小明", status="pending",
            priority="low", visibility="public", **fields,
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


async def _full_ticket() -> tuple[str, str]:
    """A ticket carrying every withheld field at least once, and its task's uuid."""
    uuid = await _ticket(description="中正路十二號三樓", review_note="已電話確認")
    async with db_ctx() as db:
        creator = (await db.get(Tickets, uuid)).created_by
        db.add(SecondaryLocation(
            geometry_uuid=uuid, location_type="address", county="花蓮縣", city="光復鄉",
            lane="中正路", no="12號",
        ))
        db.add(Photo(ref_uuid=uuid, ref_type="geometry", url="https://x/door.jpg", created_by=creator))
        task = TicketTask(
            ticket_uuid=uuid, task_type="hr", task_name="清淤人力",
            task_description="從後門進去", progress_note="鄰居說人在二樓",
            review_note="重複單已合併", source="user", visibility="public", created_by=creator,
        )
        db.add(task)
        await db.flush()
        db.add(TaskProperty(
            task_uuid=task.uuid, property_name="skill", property_value="shovel",
            comment="找巷口的陳先生拿鑰匙",
        ))
        return uuid, str(task.uuid)


async def _centre(point: Point, resolution: int = 8) -> list[float]:
    """The H3 cell centre h3-pg computes for `point` — what a coarse caller should get."""
    async with db_ctx() as db:
        row = (await db.execute(
            text(
                "SELECT ST_X(c), ST_Y(c) FROM (SELECT h3_cell_to_geometry(h3_lat_lng_to_cell("
                "ST_SetSRID(ST_MakePoint(:x, :y), 4326), :r)) AS c) s"
            ),
            {"x": point.x, "y": point.y, "r": resolution},
        )).one()
        return [row[0], row[1]]


async def _cell(point: Point, resolution: int = 8) -> str:
    """The H3 index h3-pg computes for `point`, as the hex string clients receive."""
    async with db_ctx() as db:
        return await db.scalar(
            text("SELECT h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(:x, :y), 4326), :r)::text"),
            {"x": point.x, "y": point.y, "r": resolution},
        )


def _box(centre: list[float], half: float) -> dict:
    return {
        "minLng": centre[0] - half, "maxLng": centre[0] + half,
        "minLat": centre[1] - half, "maxLat": centre[1] + half,
    }


async def _query(client, query, variables, token=None) -> dict:
    headers = auth_header(token) if token else {}
    body = (await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=headers
    )).json()
    assert "errors" not in body, body
    return body["data"]


def _point(geometry) -> list[float]:
    return geometry["coordinates"]


async def _signed_in(redis, detail_scope="all", team_uuid=None) -> tuple[str, str]:
    """A plain account: view is public, contact details own-scoped, detail at `detail_scope`."""
    return await _actor(
        redis,
        [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_VIEW_PII, "own"),
         (Perm.TICKET_VIEW_DETAIL, detail_scope)],
        team_uuid,
    )


# --- the capability ------------------------------------------------------------------------


def test_view_detail_is_never_public():
    """Withholding it from the anonymous caller is the capability's whole point."""
    assert Perm.TICKET_VIEW_DETAIL.value == "ticket.view_detail"
    assert Perm.TICKET_VIEW_DETAIL not in PUBLIC_PERMS


def test_every_seeded_role_holds_view_detail_at_all():
    """Signed in means the exact place, whichever identity is active (ADR-097)."""
    from scripts.seed_rbac import ROLES_DATA

    for role in ROLES_DATA:
        assert role["permissions"].get(Perm.TICKET_VIEW_DETAIL) == "all", role["name"]


# --- the point (AC-02) ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_anonymous_caller_gets_the_cell_centre_not_the_point(client):
    """AC-02: a region, not null — the public map still needs the ticket somewhere."""
    uuid = await _ticket(INSIDE)

    geometry = (await _query(client, TICKET, {"uuid": uuid}))["ticket"]["geometry"]

    assert _point(geometry) == pytest.approx(await _centre(INSIDE))
    assert _point(geometry) != pytest.approx([INSIDE.x, INSIDE.y])


@pytest.mark.asyncio
async def test_location_cell_names_the_cell_the_centre_stands_in_for(client):
    """A client cannot tell a centre from a point by looking; `locationCell` tells it."""
    uuid = await _ticket(INSIDE)
    query = "query($uuid: UUID!, $zoom: Float) { ticket(uuid: $uuid, zoom: $zoom) { locationCell } }"

    at_cap = (await _query(client, query, {"uuid": uuid}))["ticket"]
    zoomed_out = (await _query(client, query, {"uuid": uuid, "zoom": 7}))["ticket"]

    assert at_cap["locationCell"] == await _cell(INSIDE, 8)
    assert zoomed_out["locationCell"] == await _cell(INSIDE, 4)


@pytest.mark.asyncio
async def test_location_cell_is_null_when_the_point_is_exact(client, redis):
    """Null means "this geometry is the real point" — the only signal a mixed list needs."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    mine, theirs = await _ticket(INSIDE, created_by=user_uuid), await _ticket(INSIDE)
    query = "query { tickets(limit: 50) { items { uuid locationCell } } }"

    items = {i["uuid"]: i for i in (await _query(client, query, {}, token))["tickets"]["items"]}

    assert items[mine]["locationCell"] is None
    assert items[theirs]["locationCell"] == await _cell(INSIDE, 8)


@pytest.mark.asyncio
async def test_two_points_in_one_cell_come_back_as_the_same_centre(client):
    """A fixed grid, not an offset: nothing to average away over repeated queries."""
    a, b = await _ticket(INSIDE), await _ticket(NEIGHBOUR)

    geometry_a = (await _query(client, TICKET, {"uuid": a}))["ticket"]["geometry"]
    geometry_b = (await _query(client, TICKET, {"uuid": b}))["ticket"]["geometry"]

    assert _point(geometry_a) == pytest.approx(_point(geometry_b))


@pytest.mark.asyncio
async def test_zoom_can_coarsen_the_cell_but_never_refine_it(client):
    """Zoom 18 would map to resolution 12; the server cap holds it at 8. Zoom 7 is 4."""
    uuid = await _ticket(INSIDE)

    zoomed_in = (await _query(client, TICKET, {"uuid": uuid, "zoom": 18}))["ticket"]
    zoomed_out = (await _query(client, TICKET, {"uuid": uuid, "zoom": 7}))["ticket"]

    assert _point(zoomed_in["geometry"]) == pytest.approx(await _centre(INSIDE, 8))
    assert _point(zoomed_out["geometry"]) == pytest.approx(await _centre(INSIDE, 4))


@pytest.mark.asyncio
async def test_the_list_carries_the_cell_centre_too(client):
    """AC-04: the list path, not only the detail path."""
    uuid = await _ticket(INSIDE)

    items = {i["uuid"]: i for i in (await _query(client, TICKETS, {}))["tickets"]["items"]}

    assert _point(items[uuid]["geometry"]) == pytest.approx(await _centre(INSIDE))


@pytest.mark.asyncio
async def test_a_signed_in_caller_gets_the_exact_point(client, redis):
    """The seed's default: every account holds view_detail at `all`."""
    _, token = await _signed_in(redis)
    uuid = await _ticket(INSIDE)

    geometry = (await _query(client, TICKET, {"uuid": uuid}, token))["ticket"]["geometry"]

    assert _point(geometry) == pytest.approx([INSIDE.x, INSIDE.y])


@pytest.mark.asyncio
async def test_narrowing_view_detail_to_own_falls_back_to_the_cell_for_others(client, redis):
    """The point of a capability over a hard-coded "logged in": narrowable without code."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    mine, theirs = await _ticket(INSIDE, created_by=user_uuid), await _ticket(INSIDE)

    mine_geometry = (await _query(client, TICKET, {"uuid": mine}, token))["ticket"]["geometry"]
    their_geometry = (await _query(client, TICKET, {"uuid": theirs}, token))["ticket"]["geometry"]

    assert _point(mine_geometry) == pytest.approx([INSIDE.x, INSIDE.y])
    assert _point(their_geometry) == pytest.approx(await _centre(INSIDE))


@pytest.mark.asyncio
async def test_a_zone_scoped_team_gets_the_exact_point_inside_its_zone_only(client, redis, zone_team):
    """Decided row by row within one list: exact inside the zone, the cell outside it."""
    _, token = await _signed_in(redis, detail_scope="zone", team_uuid=zone_team)
    inside, outside = await _ticket(INSIDE), await _ticket(OUTSIDE)

    items = {i["uuid"]: i for i in (await _query(client, TICKETS, {}, token))["tickets"]["items"]}

    assert _point(items[inside]["geometry"]) == pytest.approx([INSIDE.x, INSIDE.y])
    assert _point(items[outside]["geometry"]) == pytest.approx(await _centre(OUTSIDE))


# --- bounds (ADR-282) ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_anonymous_bbox_matches_the_cell_centre_not_the_point(client):
    """Shrinking a box around a ticket must stop at the cell, which the caller already has."""
    uuid = await _ticket(INSIDE)
    centre = await _centre(INSIDE)
    gap = max(abs(centre[0] - INSIDE.x), abs(centre[1] - INSIDE.y))

    around_centre = (await _query(client, TICKETS, {"bounds": _box(centre, gap / 2)}))["tickets"]
    around_point = (
        await _query(client, TICKETS, {"bounds": _box([INSIDE.x, INSIDE.y], gap / 2)})
    )["tickets"]

    assert [i["uuid"] for i in around_centre["items"]] == [uuid]
    assert around_centre["pageInfo"]["totalCount"] == 1
    assert around_point["items"] == []
    assert around_point["pageInfo"]["totalCount"] == 0


@pytest.mark.asyncio
async def test_a_bbox_matches_each_row_by_the_point_its_caller_can_see(client, redis):
    """Own-scoped detail: the caller's ticket by its point, everyone else's by the centre."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    mine, theirs = await _ticket(INSIDE, created_by=user_uuid), await _ticket(INSIDE)
    centre = await _centre(INSIDE)
    gap = max(abs(centre[0] - INSIDE.x), abs(centre[1] - INSIDE.y))

    around_point = (
        await _query(client, TICKETS, {"bounds": _box([INSIDE.x, INSIDE.y], gap / 2)}, token)
    )["tickets"]
    around_centre = (
        await _query(client, TICKETS, {"bounds": _box(centre, gap / 2)}, token)
    )["tickets"]

    assert [i["uuid"] for i in around_point["items"]] == [mine]
    assert [i["uuid"] for i in around_centre["items"]] == [theirs]
    assert around_centre["pageInfo"]["totalCount"] == 1


@pytest.mark.asyncio
async def test_an_anonymous_bbox_survives_a_closure_area_in_the_same_box(client):
    """`base_geometries` holds closure-area polygons beside ticket points.

    The planner is free to apply the bbox condition while scanning `base_geometries`, before
    the join narrows it to tickets — so the cell expression meets polygons too. h3's
    `h3_lat_lng_to_cell` rejects anything but a point ("geometry_to_point only accepts
    Points"), which turned the anonymous map into an error wherever a road was closed.
    """
    uuid = await _ticket(INSIDE)
    async with db_ctx() as db:
        closer = User(name="closer")
        db.add(closer)
        await db.flush()
        db.add(ClosureArea(
            geometry=from_shape(INSIDE.buffer(0.01), srid=4326), created_by=str(closer.uuid),
            status="blocked", information_source="test", comment=TITLE,
        ))
    centre = await _centre(INSIDE)

    page = (await _query(client, TICKETS, {"bounds": _box(centre, 0.02)}))["tickets"]

    assert uuid in {i["uuid"] for i in page["items"]}


@pytest.mark.asyncio
async def test_a_signed_in_bbox_matches_the_exact_point(client, redis):
    """`all` keeps the bbox filter exactly as it was before ADR-282."""
    _, token = await _signed_in(redis)
    uuid = await _ticket(INSIDE)
    centre = await _centre(INSIDE)
    gap = max(abs(centre[0] - INSIDE.x), abs(centre[1] - INSIDE.y))

    page = (
        await _query(client, TICKETS, {"bounds": _box([INSIDE.x, INSIDE.y], gap / 2)}, token)
    )["tickets"]

    assert [i["uuid"] for i in page["items"]] == [uuid]


@pytest.mark.asyncio
async def test_the_edge_table_matches_h3_pg():
    """The pre-filter margin is derived from these; a wrong one silently drops rows."""
    async with db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT r, h3_get_hexagon_edge_length_avg(r, 'm') "
            "FROM generate_series(0, :top) r ORDER BY r"
        ), {"top": h3.COARSE_MAX_H3_RESOLUTION})).all()

    assert list(h3._AVG_EDGE_M) == pytest.approx([edge for _, edge in rows], rel=1e-6)


async def _near_a_vertex() -> tuple[Point, list[float]]:
    """A point 99% of the way from its cell centre to a vertex — as far as a point gets."""
    async with db_ctx() as db:
        row = (await db.execute(text(
            "WITH c AS (SELECT h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(:x, :y), 4326), 8) AS cell), "
            "g AS (SELECT h3_cell_to_geometry(cell) AS centre, "
            "ST_PointN(ST_ExteriorRing(h3_cell_to_boundary_geometry(cell)), 1) AS vertex FROM c) "
            "SELECT ST_X(centre), ST_Y(centre), ST_X(vertex), ST_Y(vertex) FROM g"
        ), {"x": INSIDE.x, "y": INSIDE.y})).one()
    cx, cy, vx, vy = row
    return Point(cx + 0.99 * (vx - cx), cy + 0.99 * (vy - cy)), [cx, cy]


@pytest.mark.asyncio
async def test_the_index_pre_filter_keeps_a_ticket_at_the_edge_of_its_cell(client):
    """A box that only just holds the centre still finds a ticket at the far corner."""
    point, centre = await _near_a_vertex()
    uuid = await _ticket(point)

    page = (await _query(client, TICKETS, {"bounds": _box(centre, 1e-5)}))["tickets"]

    assert [i["uuid"] for i in page["items"]] == [uuid]


@pytest.mark.asyncio
async def test_the_index_pre_filter_is_part_of_the_query(client, monkeypatch):
    """Shrink the margin to nothing and the same corner ticket drops out.

    Proves the pre-filter is really in the WHERE clause, and that the margin is what keeps
    the row in it.
    """
    point, centre = await _near_a_vertex()
    await _ticket(point)
    monkeypatch.setattr(h3, "_MARGIN_FACTOR", 0.01)

    page = (await _query(client, TICKETS, {"bounds": _box(centre, 1e-5)}))["tickets"]

    assert page["items"] == []


# --- mutation responses (AC-04) --------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_mutation_response_withholds_detail_like_a_read(client, redis):
    """`updateTicket` returns a TicketType too; out of detail scope, the same boundary applies.

    No `zoom` on a mutation, so the cell is the cap — the resolver falls back to it rather
    than to the exact point.
    """
    _, token = await _actor(
        redis,
        [(Perm.TICKET_VIEW, "all"), (Perm.TICKET_EDIT, "all"), (Perm.TICKET_VIEW_DETAIL, "own")],
    )
    uuid = await _ticket(INSIDE, description="中正路十二號三樓")

    body = (await client.post("/graphql", headers=auth_header(token), json={
        "query": """
            mutation($uuid: UUID!) {
              updateTicket(uuid: $uuid, input: {priority: "high"}) {
                priority geometry description
              }
            }
        """,
        "variables": {"uuid": uuid},
    })).json()
    assert "errors" not in body, body
    ticket = body["data"]["updateTicket"]

    assert ticket["priority"] == "high"
    assert _point(ticket["geometry"]) == pytest.approx(await _centre(INSIDE))
    assert ticket["description"] is None


# --- the address, the free text, the photos, the notes, the author (AC-03) -----------------


@pytest.mark.asyncio
async def test_an_anonymous_caller_gets_none_of_the_detail(client):
    """AC-03, nested included: the ticket, its tasks, and their properties."""
    uuid, _ = await _full_ticket()

    ticket = (await _query(client, TICKET, {"uuid": uuid}))["ticket"]

    assert ticket["description"] is None
    assert ticket["reviewNote"] is None
    assert ticket["createdBy"] is None
    assert ticket["photos"] == []
    assert ticket["secondaryLocation"] is None
    [task] = ticket["tasks"]
    assert task["taskName"] == "清淤人力"  # structured: what help is needed stays public
    assert task["taskDescription"] is None
    assert task["progressNote"] is None
    assert task["reviewNote"] is None
    assert task["createdBy"] is None
    [prop] = task["properties"]
    assert prop["propertyValue"] == "shovel"
    assert prop["comment"] is None


@pytest.mark.asyncio
async def test_a_signed_in_caller_gets_all_of_the_detail(client, redis):
    """Including the address of a ticket they did not file — ADR-268's `own` is superseded."""
    _, token = await _signed_in(redis)
    uuid, _ = await _full_ticket()

    ticket = (await _query(client, TICKET, {"uuid": uuid}, token))["ticket"]

    assert ticket["description"] == "中正路十二號三樓"
    assert ticket["reviewNote"] == "已電話確認"
    assert ticket["createdBy"] is not None
    assert ticket["photos"] == [{"url": "https://x/door.jpg"}]
    assert ticket["secondaryLocation"]["no"] == "12號"
    [task] = ticket["tasks"]
    assert task["taskDescription"] == "從後門進去"
    assert task["progressNote"] == "鄰居說人在二樓"
    assert task["reviewNote"] == "重複單已合併"
    assert task["createdBy"] is not None
    assert task["properties"][0]["comment"] == "找巷口的陳先生拿鑰匙"


@pytest.mark.asyncio
async def test_the_task_list_withholds_the_same_detail(client):
    """AC-04: `ticketTasks` reaches the same rows without going through `ticket`."""
    uuid, _ = await _full_ticket()

    [task] = (await _query(client, TASKS, {"ticketUuid": uuid}))["ticketTasks"]

    assert task["taskName"] == "清淤人力"
    assert task["taskDescription"] is None
    assert task["progressNote"] is None
    assert task["reviewNote"] is None
    assert task["createdBy"] is None


@pytest.mark.asyncio
async def test_task_detail_follows_the_parent_tickets_scope(client, redis):
    """A task is judged by the ticket it belongs to — it has no point of its own."""
    user_uuid, token = await _signed_in(redis, detail_scope="own")
    mine = await _ticket(INSIDE, created_by=user_uuid)
    theirs, _ = await _full_ticket()
    async with db_ctx() as db:
        db.add(TicketTask(
            ticket_uuid=mine, task_type="hr", task_name="搬家具", task_description="我家客廳",
            source="user", visibility="public", created_by=user_uuid,
        ))

    [my_task] = (await _query(client, TASKS, {"ticketUuid": mine}, token))["ticketTasks"]
    [their_task] = (await _query(client, TASKS, {"ticketUuid": theirs}, token))["ticketTasks"]

    assert my_task["taskDescription"] == "我家客廳"
    assert their_task["taskDescription"] is None


# --- keyword search -------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_an_anonymous_search_cannot_match_withheld_text(client):
    """Otherwise q="中正路十二號" would confirm the address the field no longer shows."""
    uuid, _ = await _full_ticket()

    async def found(q: str, token=None) -> bool:
        page = (await _query(client, TICKETS, {"q": q}, token))["tickets"]
        return uuid in {i["uuid"] for i in page["items"]}

    assert await found("詳情邊界")        # title
    assert await found("清淤人力")        # task name
    assert await found("shovel")         # task property value
    assert not await found("中正路十二號")  # description
    assert not await found("從後門進去")    # task description


@pytest.mark.asyncio
async def test_a_signed_in_search_still_matches_the_free_text(client, redis):
    """The public match is added for the anonymous caller, not taken from anyone else."""
    _, token = await _signed_in(redis)
    uuid, _ = await _full_ticket()

    for q in ("中正路十二號", "從後門進去"):
        page = (await _query(client, TICKETS, {"q": q}, token))["tickets"]
        assert uuid in {i["uuid"] for i in page["items"]}, q


@pytest.mark.asyncio
async def test_an_anonymous_task_search_cannot_match_the_task_description(client):
    """`ticketTasks(q:)` is the second door to the same text."""
    uuid, task_uuid = await _full_ticket()

    by_name = (await _query(client, TASKS, {"ticketUuid": uuid, "q": "清淤人力"}))["ticketTasks"]
    by_text = (await _query(client, TASKS, {"ticketUuid": uuid, "q": "從後門進去"}))["ticketTasks"]

    assert [t["uuid"] for t in by_name] == [task_uuid]
    assert by_text == []
