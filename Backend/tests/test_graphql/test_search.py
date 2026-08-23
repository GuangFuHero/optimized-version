"""End-to-end keyword search tests (feature 011).

Covers the main tables (`stations.name/description`, `tickets.title/description`) and the
related tables reached via EXISTS subqueries: station properties, a station's address,
ticket tasks and task properties (ADR-080).

A ticket's address is the one related table deliberately left unsearchable — see
test_ticket_search_cannot_find_by_address and ADR-146.
"""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.geo import Station
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from app.models.station_property import StationProperty
from app.models.ticket_task import TaskProperty, TicketTask
from tests.test_graphql.conftest import test_db

# The GraphQL suite builds its schema once per session (`_ensure_db`), so rows from every
# other test accumulate in these tables, and the resolver default is limit=50. Left alone,
# a growing suite would eventually cap these pages — turning "totalCount equals the rows
# returned" into a failure about page size rather than about the predicate under test, and
# quietly dropping seeded rows out of the membership assertions (ADR-154). Every query
# document below therefore takes an explicit $limit, which _stations()/_tickets() fill in.
PAGE_LIMIT = 500


def _assert_total_count_matches_items(page: dict) -> None:
    """count_active and list_active must agree — the assertion these tests actually make.

    The page-size check comes first so that if the suite ever does grow past PAGE_LIMIT
    matching rows, the failure says exactly that instead of looking like a broken predicate.
    """
    items = page["items"]
    assert len(items) < PAGE_LIMIT, (
        f"page hit PAGE_LIMIT ({PAGE_LIMIT}); totalCount can no longer equal len(items) — "
        "raise PAGE_LIMIT rather than relaxing this assertion"
    )
    assert page["pageInfo"]["totalCount"] == len(items)


STATIONS_Q = """
query($q: String, $limit: Int!) {
  stations(q: $q, limit: $limit) {
    items { uuid name }
    pageInfo { totalCount }
  }
}
"""

STATIONS_Q_WITH_TYPE = """
query($q: String, $stationType: String, $limit: Int!) {
  stations(q: $q, stationType: $stationType, limit: $limit) {
    items { uuid name }
    pageInfo { totalCount }
  }
}
"""

TICKETS_Q = """
query($q: String, $limit: Int!) {
  tickets(q: $q, limit: $limit) {
    items { uuid title }
    pageInfo { totalCount }
  }
}
"""

TICKETS_Q_WITH_STATUS = """
query($q: String, $status: String, $limit: Int!) {
  tickets(q: $q, status: $status, limit: $limit) {
    items { uuid title }
    pageInfo { totalCount }
  }
}
"""


@pytest_asyncio.fixture
async def seeded_stations(coordinator_auth):
    """Three stations: two match "光復", one does not. Returns {name: uuid}.

    The GraphQL suite creates its schema once per session (`_ensure_db`), so rows from
    other tests accumulate in the same tables. Assertions therefore check membership by
    uuid rather than exact result counts.
    """
    user_uuid, _ = coordinator_auth
    seeded: dict[str, str] = {}
    async with test_db() as db:
        for name, description, type_ in [
            ("光復國小", "收容所兼物資集散", "shelter"),
            ("光復鄉公所", "行政中心", "office"),
            ("瑞穗鄉公所", "備援收容點", "shelter"),
        ]:
            station = Station(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=user_uuid,
                name=name,
                description=description,
                type=type_,
                level=1,
                visibility="public",
            )
            db.add(station)
            await db.flush()
            seeded[name] = str(station.uuid)
    return seeded


@pytest_asyncio.fixture
async def seeded_tickets(coordinator_auth):
    """Two tickets; contact details exist precisely so we can prove they are unsearchable."""
    user_uuid, _ = coordinator_auth
    seeded: dict[str, str] = {}
    async with test_db() as db:
        for title, description, contact, status, priority in [
            ("需要飲用水", "三樓住戶行動不便", "王小姐", "pending", "high"),
            ("需要志工清淤", "一樓積泥", "李先生", "resolved", "low"),
        ]:
            ticket = Tickets(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=user_uuid,
                title=title,
                description=description,
                contact_name=contact,
                contact_email="wang@example.com" if contact == "王小姐" else None,
                contact_phone="0912345678" if contact == "王小姐" else None,
                status=status,
                priority=priority,
                visibility="public",
            )
            db.add(ticket)
            await db.flush()
            seeded[title] = str(ticket.uuid)
    return seeded


async def _stations(client, query=STATIONS_Q, **variables):
    # PAGE_LIMIT unless a test asks for a specific page — see the note above the query
    # documents. Harmless for documents that do not declare $limit: GraphQL ignores extra
    # values, it only rejects declared-but-unused variables.
    variables.setdefault("limit", PAGE_LIMIT)
    resp = await client.post("/graphql", json={"query": query, "variables": variables})
    return resp.json()


async def _tickets(client, query=TICKETS_Q, **variables):
    variables.setdefault("limit", PAGE_LIMIT)
    resp = await client.post("/graphql", json={"query": query, "variables": variables})
    return resp.json()


def _uuids(body, field: str) -> set[str]:
    return {item["uuid"] for item in body["data"][field]["items"]}


# ──────────────────────────────────────────────
# stations
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_matches_station_name(client, seeded_stations):
    """A keyword in the name matches; unrelated stations are excluded."""
    found = _uuids(await _stations(client, q="光復"), "stations")
    assert seeded_stations["光復國小"] in found
    assert seeded_stations["光復鄉公所"] in found
    assert seeded_stations["瑞穗鄉公所"] not in found


@pytest.mark.asyncio
async def test_search_matches_station_description(client, seeded_stations):
    """Description is searchable too, not just the name."""
    found = _uuids(await _stations(client, q="物資集散"), "stations")
    assert seeded_stations["光復國小"] in found
    assert seeded_stations["光復鄉公所"] not in found


@pytest.mark.asyncio
async def test_no_query_returns_everything(client, seeded_stations):
    """Omitting q must leave the existing behaviour untouched."""
    found = _uuids(await _stations(client, q=None), "stations")
    assert set(seeded_stations.values()) <= found


@pytest.mark.asyncio
async def test_single_character_query_is_rejected(client, seeded_stations):
    """ADR-082: a 1-character query is refused rather than silently run."""
    body = await _stations(client, q="水")
    assert body["data"] is None or body["data"]["stations"] is None
    assert "搜尋關鍵字至少" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_total_count_reflects_the_filter(client, seeded_stations):
    """count_active must apply the same predicate as list_active, or paging breaks."""
    _assert_total_count_matches_items((await _stations(client, q="光復"))["data"]["stations"])


@pytest.mark.asyncio
async def test_search_composes_with_station_type_filter(client, seeded_stations):
    """Keyword must AND with the existing filters, not replace them."""
    found = _uuids(
        await _stations(client, query=STATIONS_Q_WITH_TYPE, q="光復", stationType="shelter"),
        "stations",
    )
    assert seeded_stations["光復國小"] in found
    assert seeded_stations["光復鄉公所"] not in found  # matches q but wrong type


@pytest.mark.asyncio
async def test_search_is_case_insensitive_for_latin_text(client, coordinator_auth):
    """ILIKE, not LIKE — "hq" should find "HQ"."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, name="Hualien HQ", type="office", level=1,
        )
        db.add(station)
        await db.flush()
        station_uuid = str(station.uuid)

    assert station_uuid in _uuids(await _stations(client, q="hq"), "stations")


@pytest.mark.asyncio
async def test_wildcard_in_query_is_matched_literally(client, seeded_stations):
    """A user typing % must not match everything (ADR-082 escaping).

    Unescaped, "%復%" would expand to "anything containing 復" and match two of the
    seeded stations.
    """
    found = _uuids(await _stations(client, q="%復%"), "stations")
    assert not (set(seeded_stations.values()) & found)


# ──────────────────────────────────────────────
# tickets
# ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ticket_search_matches_title(client, seeded_tickets):
    """Ticket titles are searchable."""
    found = _uuids(await _tickets(client, q="飲用水"), "tickets")
    assert seeded_tickets["需要飲用水"] in found
    assert seeded_tickets["需要志工清淤"] not in found


@pytest.mark.asyncio
async def test_ticket_search_cannot_find_by_phone(client, seeded_tickets):
    """ADR-079: searching a contact phone must return nothing.

    The caller here holds `all` scope. If this ever passes, the per-field PII masking on
    Ticket.contact_* is decorative — anyone could locate a ticket by typing its
    reporter's phone number.
    """
    assert seeded_tickets["需要飲用水"] not in _uuids(
        await _tickets(client, q="0912345678"), "tickets"
    )


@pytest.mark.asyncio
async def test_ticket_search_cannot_find_by_contact_name(client, seeded_tickets):
    """ADR-079: same guarantee for the reporter's name."""
    assert seeded_tickets["需要飲用水"] not in _uuids(
        await _tickets(client, q="王小姐"), "tickets"
    )


@pytest.mark.asyncio
async def test_ticket_search_cannot_find_by_contact_email(client, seeded_tickets):
    """ADR-079: same guarantee for the reporter's email."""
    assert seeded_tickets["需要飲用水"] not in _uuids(
        await _tickets(client, q="wang@example.com"), "tickets"
    )


@pytest_asyncio.fixture
async def ticket_with_address(coordinator_auth):
    """A ticket carrying a secondary_locations row.

    Nothing in app/ writes one today — CreateTicketInput has no address field and
    services/station.py is the only writer — so this is built by hand. That is the point:
    the guard has to hold for the day someone adds ticket addresses, not just today.
    """
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, title="住址不可搜工單", description="無關描述",
            contact_name="陳先生", status="pending", priority="high", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        db.add(
            SecondaryLocation(
                geometry_uuid=ticket.uuid, location_type="address",
                county="花蓮縣", city="光復鄉", lane="中正路", alley="12巷", no="3號",
                floor="4樓", room="A室",
            )
        )
        await db.flush()
        return str(ticket.uuid)


@pytest.mark.asyncio
async def test_ticket_search_cannot_find_by_address(client, ticket_with_address):
    """ADR-146: a ticket's address must not be searchable, unlike a station's.

    _tickets() sends no Authorization header, so this caller is an anonymous Guest —
    which ticket.view grants Scope.ALL (PUBLIC_PERMS, ADR-025/027). TicketType exposes no
    address field, so a hit here would be an oracle: the caller confirms a street address,
    floor and room the API itself never returns, and can binary-search towards it. Same
    threat model as test_ticket_search_cannot_find_by_phone.
    """
    for term in ["中正路", "12巷", "光復鄉中正路"]:
        assert ticket_with_address not in _uuids(
            await _tickets(client, q=term), "tickets"
        ), f"ticket became findable by its address via {term!r}"


@pytest.mark.asyncio
async def test_ticket_search_composes_with_status_filter(client, seeded_tickets):
    """Keyword ANDs with status rather than replacing it."""
    found = _uuids(
        await _tickets(client, query=TICKETS_Q_WITH_STATUS, q="需要", status="resolved"),
        "tickets",
    )
    assert seeded_tickets["需要志工清淤"] in found
    assert seeded_tickets["需要飲用水"] not in found  # matches q but wrong status


@pytest.mark.asyncio
async def test_ticket_total_count_reflects_the_filter(client, seeded_tickets):
    """count_active must apply the same predicate as list_active."""
    _assert_total_count_matches_items((await _tickets(client, q="需要"))["data"]["tickets"])


# ──────────────────────────────────────────────
# related-table search (ADR-080): dynamic fields and addresses
# ──────────────────────────────────────────────

STATIONS_Q_ORDERED = """
query($q: String, $limit: Int!) {
  stations(q: $q, limit: $limit) { items { uuid name } }
}
"""


@pytest_asyncio.fixture
async def station_with_generator(coordinator_auth):
    """A station whose NAME does not match, but which HAS a 發電機 property.

    This is the highest-value search target in the system: "which stations have a
    generator?" cannot be answered by searching station names alone.
    """
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, name="鳳林國中", description="避難收容",
            type="shelter", level=1,
        )
        db.add(station)
        await db.flush()
        db.add(
            StationProperty(
                station_uuid=station.uuid, property_type="facility",
                property_name="發電機", quantity=2, created_by=user_uuid,
            )
        )
        await db.flush()
        return str(station.uuid)


@pytest_asyncio.fixture
async def station_with_address(coordinator_auth):
    """A station whose name does not match, but whose address contains 中正路."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, name="大進活動中心", type="shelter", level=1,
        )
        db.add(station)
        await db.flush()
        db.add(
            SecondaryLocation(
                geometry_uuid=station.uuid, location_type="address",
                county="花蓮縣", city="鳳林鎮", lane="中正路", alley="12巷", no="3號",
            )
        )
        await db.flush()
        return str(station.uuid)


@pytest_asyncio.fixture
async def ticket_with_task_property(coordinator_auth):
    """A ticket whose title does not match, reachable only through its task's property."""
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, title="現場支援需求", description="人力調度",
            contact_name="陳先生", status="pending", priority="medium",
        )
        db.add(ticket)
        await db.flush()
        task = TicketTask(
            ticket_uuid=ticket.uuid, task_type="supply", task_name="物資配送",
            status="pending", created_by=user_uuid,
        )
        db.add(task)
        await db.flush()
        db.add(
            TaskProperty(
                task_uuid=task.uuid, property_name="需求品項", property_value="嬰兒奶粉",
            )
        )
        await db.flush()
        return str(ticket.uuid)


@pytest.mark.asyncio
async def test_station_search_reaches_into_its_properties(client, station_with_generator):
    """Searching 發電機 finds stations that have one, not just ones named after it."""
    found = _uuids(await _stations(client, q="發電機"), "stations")
    assert station_with_generator in found


@pytest.mark.asyncio
async def test_station_search_reaches_into_its_address(client, station_with_address):
    """Address parts are searchable through the related secondary_locations row."""
    found = _uuids(await _stations(client, q="中正路"), "stations")
    assert station_with_address in found


@pytest.mark.asyncio
async def test_station_matched_through_a_property_appears_once(client, coordinator_auth):
    """A station with several matching properties must not be duplicated (ADR-080).

    This is why the related tables are reached via EXISTS rather than JOIN: a JOIN would
    return the station once per matching property, inflating totalCount and skipping rows
    when paging.
    """
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        station = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, name="重複測試站", type="shelter", level=1,
        )
        db.add(station)
        await db.flush()
        for name in ("柴油發電機", "汽油發電機", "備用發電機"):
            db.add(
                StationProperty(
                    station_uuid=station.uuid, property_type="facility",
                    property_name=name, created_by=user_uuid,
                )
            )
        await db.flush()
        station_uuid = str(station.uuid)

    page = (await _stations(client, q="發電機"))["data"]["stations"]
    assert [i["uuid"] for i in page["items"]].count(station_uuid) == 1
    _assert_total_count_matches_items(page)


@pytest.mark.asyncio
async def test_ticket_search_reaches_into_task_properties(client, ticket_with_task_property):
    """A ticket is findable through its task's properties (nested EXISTS)."""
    found = _uuids(await _tickets(client, q="嬰兒奶粉"), "tickets")
    assert ticket_with_task_property in found


@pytest.mark.asyncio
async def test_ticket_search_reaches_into_its_tasks(client, ticket_with_task_property):
    """A ticket is findable through its task's own name."""
    found = _uuids(await _tickets(client, q="物資配送"), "tickets")
    assert ticket_with_task_property in found


@pytest.mark.asyncio
async def test_related_table_search_still_excludes_pii(client, seeded_tickets):
    """Reaching into related tables must not open a back door to contact details."""
    assert seeded_tickets["需要飲用水"] not in _uuids(
        await _tickets(client, q="0912345678"), "tickets"
    )


@pytest.mark.asyncio
async def test_name_match_outranks_property_only_match(client, coordinator_auth):
    """Relevance ordering: a station named 發電機站 ranks above one that merely has one.

    The easy case — the query IS the station's whole name, so similarity() returns 1.0
    against 0.18 for the other row. Note the loser scores 0.18, not 0: similarity() grades
    trigram overlap, it does not indicate "matched". test_mid_string_name_match_outranks_
    property_only_match covers the case similarity() genuinely cannot express (ADR-147).
    """
    user_uuid, _ = coordinator_auth
    async with test_db() as db:
        named = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, name="排序發電機站", type="shelter", level=1,
        )
        other = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid, name="排序無關站", type="shelter", level=1,
        )
        db.add_all([named, other])
        await db.flush()
        db.add(
            StationProperty(
                station_uuid=other.uuid, property_type="facility",
                property_name="排序發電機站", created_by=user_uuid,
            )
        )
        await db.flush()
        named_uuid, other_uuid = str(named.uuid), str(other.uuid)

    body = await _stations(client, query=STATIONS_Q_ORDERED, q="排序發電機站")
    order = [i["uuid"] for i in body["data"]["stations"]["items"]]
    assert order.index(named_uuid) < order.index(other_uuid)


@pytest.mark.asyncio
async def test_mid_string_name_match_outranks_property_only_match(client, coordinator_auth):
    """ADR-147: ranking must survive similarity() returning 0 for a real name match.

    pg_trgm pads a query to build trigrams, so a CJK keyword that is not at the *start*
    of the text scores exactly 0 — `similarity('花蓮縣光復鄉救災站', '光復')` is 0, the
    same as a station reached only through a property. Ordering on similarity() alone
    therefore falls through to created_at here, and the fixtures are committed in that
    order deliberately so that fallback puts the WRONG station first.
    """
    user_uuid, _ = coordinator_auth
    # Separate transactions: now() is transaction-scoped, so one block would give both
    # rows an identical created_at and the tiebreaker would be arbitrary.
    async with test_db() as db:
        named = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=user_uuid,
            name="花蓮縣光復鄉救災站", type="shelter", level=1,
        )
        db.add(named)
        await db.flush()
        named_uuid = str(named.uuid)

    async with test_db() as db:
        other = Station(
            geometry=from_shape(Point(121.5, 25.0), srid=4326), created_by=user_uuid,
            name="中正路臨時站", type="shelter", level=1,
        )
        db.add(other)
        await db.flush()
        db.add(
            StationProperty(
                station_uuid=other.uuid, property_type="facility",
                property_name="光復物資調度", created_by=user_uuid,
            )
        )
        await db.flush()
        other_uuid = str(other.uuid)

    body = await _stations(client, query=STATIONS_Q_ORDERED, q="光復")
    order = [i["uuid"] for i in body["data"]["stations"]["items"]]
    assert named_uuid in order and other_uuid in order
    assert order.index(named_uuid) < order.index(other_uuid), (
        "a station whose own name contains the keyword must outrank one matched only "
        "through a property, even when similarity() scores both 0"
    )


STATIONS_Q_PAGED = """
query($q: String, $skip: Int!, $limit: Int!) {
  stations(q: $q, skip: $skip, limit: $limit) { items { uuid } }
}
"""


@pytest.mark.asyncio
async def test_paging_a_run_of_tied_rows_loses_no_row(client, coordinator_auth):
    """ADR-153: two pages over a run of fully-tied rows must cover each row exactly once.

    Every row here ties on every key the sort had before the tiebreaker was added: none of
    the names contain the keyword (so the ILIKE boolean is false and similarity() is 0 —
    ADR-147), priority_score is NULL for all six, and created_at comes from
    `server_default=func.now()`, which is transaction-scoped, so one INSERT block gives
    them an identical timestamp.

    Honest about its own limits: this passes with OR without the uuid tiebreaker, because
    PostgreSQL happens to sort six rows deterministically under one plan — the freedom to
    reorder is real but only shows up at volume or across plan changes. The actual guard
    for the fix is the structural one in tests/test_search_ordering.py; this test is the
    end-to-end smoke check that paging over ties is not obviously broken.
    """
    user_uuid, _ = coordinator_auth
    term = "分頁綁定測試物資"
    expected = set()
    async with test_db() as db:
        for i in range(6):
            station = Station(
                geometry=from_shape(Point(121.5, 25.0), srid=4326),
                created_by=user_uuid, name=f"分頁站{i}", type="shelter", level=1,
            )
            db.add(station)
            await db.flush()
            db.add(
                StationProperty(
                    station_uuid=station.uuid, property_type="supply",
                    property_name=term, created_by=user_uuid,
                )
            )
            expected.add(str(station.uuid))
        await db.flush()

    pages = []
    for skip in (0, 3):
        body = await _stations(client, query=STATIONS_Q_PAGED, q=term, skip=skip, limit=3)
        pages.append([i["uuid"] for i in body["data"]["stations"]["items"]])

    first, second = pages
    assert not set(first) & set(second), (
        f"a row appeared on both pages: {sorted(set(first) & set(second))}"
    )
    assert set(first) | set(second) == expected, (
        "paging did not cover every matching row exactly once"
    )


TICKET_TASKS_Q = """
query($ticketUuid: String!, $q: String) {
  ticketTasks(ticketUuid: $ticketUuid, q: $q) { uuid taskName }
}
"""


@pytest.mark.asyncio
async def test_ticket_tasks_keyword_filter(client, ticket_with_task_property):
    """The ticketTasks query narrows by keyword on the task's own name."""
    resp = await client.post("/graphql", json={
        "query": TICKET_TASKS_Q,
        "variables": {"ticketUuid": ticket_with_task_property, "q": "物資"},
    })
    names = [t["taskName"] for t in resp.json()["data"]["ticketTasks"]]
    assert names == ["物資配送"]


@pytest.mark.asyncio
async def test_ticket_tasks_keyword_reaches_into_properties(client, ticket_with_task_property):
    """A task is findable through its own properties, mirroring the ticket behaviour."""
    resp = await client.post("/graphql", json={
        "query": TICKET_TASKS_Q,
        "variables": {"ticketUuid": ticket_with_task_property, "q": "嬰兒奶粉"},
    })
    names = [t["taskName"] for t in resp.json()["data"]["ticketTasks"]]
    assert names == ["物資配送"]


@pytest.mark.asyncio
async def test_ticket_tasks_non_matching_keyword_returns_nothing(client, ticket_with_task_property):
    """The keyword filter actually narrows rather than being ignored."""
    resp = await client.post("/graphql", json={
        "query": TICKET_TASKS_Q,
        "variables": {"ticketUuid": ticket_with_task_property, "q": "完全無關的字"},
    })
    assert resp.json()["data"]["ticketTasks"] == []
