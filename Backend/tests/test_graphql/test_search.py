"""End-to-end keyword search tests (feature 011, Phase 1).

Phase 1 covers the main tables only — `stations.name/description` and
`tickets.title/description`. Reaching into station properties, task properties and
addresses via EXISTS subqueries is Phase 2.
"""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.models.geo import Station
from app.models.request import Tickets
from tests.test_graphql.conftest import test_db

STATIONS_Q = """
query($q: String) {
  stations(q: $q) {
    items { uuid name }
    pageInfo { totalCount }
  }
}
"""

STATIONS_Q_WITH_TYPE = """
query($q: String, $stationType: String) {
  stations(q: $q, stationType: $stationType) {
    items { uuid name }
    pageInfo { totalCount }
  }
}
"""

TICKETS_Q = """
query($q: String) {
  tickets(q: $q) {
    items { uuid title }
    pageInfo { totalCount }
  }
}
"""

TICKETS_Q_WITH_STATUS = """
query($q: String, $status: String) {
  tickets(q: $q, status: $status) {
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
    resp = await client.post("/graphql", json={"query": query, "variables": variables})
    return resp.json()


async def _tickets(client, query=TICKETS_Q, **variables):
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
    data = (await _stations(client, q="光復"))["data"]["stations"]
    assert data["pageInfo"]["totalCount"] == len(data["items"])


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
    data = (await _tickets(client, q="需要"))["data"]["tickets"]
    assert data["pageInfo"]["totalCount"] == len(data["items"])
