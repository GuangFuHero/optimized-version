"""Tests for PII masking of ticket contact fields for guest (non-login) users."""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.db.h3 import zoom_to_h3_resolution
from app.graphql.geo.types import SecondaryLocationType
from app.graphql.masking import mask_address, mask_email, mask_name, mask_phone
from app.models.request import Tickets
from app.models.secondary_location import SecondaryLocation
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as db_ctx

# --- Unit tests: masking functions -------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("王小明", "王◯◯"),
        ("陳怡", "陳◯◯"),
        ("怡", "怡◯◯"),
        ("歐陽娜", "歐◯◯"),          # compound surname not special-cased
        ("★小明", "小◯◯"),          # leading symbol skipped
        ("☆★◇", "◯◯"),             # all symbols
        ("Andy 陳", "A◯◯"),         # mixed -> CJK rule
        ("John Smith", "John S."),
        ("Mary Jane Watson", "Mary J. W."),
        ("Cher", "C***"),           # single token
        ("", ""),
        (None, None),
    ],
)
def test_mask_name(value, expected):
    """mask_name handles CJK, Latin, mixed, symbol, and empty inputs."""
    assert mask_name(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("johnsmith@gmail.com", "j***@***.com"),
        ("abc@example.com.tw", "a***@***.tw"),
        ("a@example.com.tw", "***@***.tw"),   # single-char local
        ("notanemail", "***"),
        ("", ""),
        (None, None),
    ],
)
def test_mask_email(value, expected):
    """mask_email hides local part and provider, keeping only the TLD."""
    assert mask_email(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("0912345678", "09*****678"),
        ("0223456789", "02*****789"),
        ("0912-345-678", "09**-***-678"),
        ("+886 912-345-678", "09**-***-678"),
        ("12345", "*****"),                    # < 6 digits -> mask all
        ("", ""),
        (None, None),
    ],
)
def test_mask_phone(value, expected):
    """mask_phone normalizes the TW country code and keeps first 2 + last 3 digits."""
    assert mask_phone(value) == expected


@pytest.mark.parametrize(
    ("zoom", "expected_resolution"),
    [
        (13, 8),      # anchor: frontend default zoom maps exactly to the guest cap
        (14.5, 9),    # fractional zoom rounds to the nearest resolution
        (7, 4),       # frontend min zoom
        (18, 12),     # frontend max zoom
        (-50, 0),     # clamps at the low end
        (50, 15),     # clamps at the high end (max valid H3 resolution)
    ],
)
def test_zoom_to_h3_resolution(zoom, expected_resolution):
    """zoom_to_h3_resolution follows the calibrated linear equation, clamped to [0, 15]."""
    assert zoom_to_h3_resolution(zoom) == expected_resolution


def _secondary_location(**overrides) -> SecondaryLocationType:
    fields = {
        "uuid": "00000000-0000-0000-0000-000000000000",
        "geometry_uuid": "ticket-uuid",
        "location_type": "address",
        "county": "台北市", "city": "大安區",
        "lane": "忠孝東路四段", "alley": "5", "no": "12", "floor": "3", "room": "A",
        "pole_id": None, "pole_type": None, "pole_note": None,
    }
    fields.update(overrides)
    return SecondaryLocationType(**fields)


def test_mask_address_all_fields_populated():
    """Street-level fields become '***'; county/city are left visible."""
    masked = mask_address(_secondary_location())
    assert masked.county == "台北市"
    assert masked.city == "大安區"
    assert masked.lane == "***"
    assert masked.alley == "***"
    assert masked.no == "***"
    assert masked.floor == "***"
    assert masked.room == "***"


def test_mask_address_partially_populated_still_masked():
    """Fields that were never set also become '***', not None — presence must not leak."""
    masked = mask_address(_secondary_location(alley=None, room=None))
    assert masked.alley == "***"
    assert masked.room == "***"
    assert masked.lane == "***"


def test_mask_address_none():
    """No address at all (no SecondaryLocation row) stays None — nothing to mask."""
    assert mask_address(None) is None


# --- Integration tests: GraphQL over HTTP ------------------------------------------

_PII_NAME = "王小明"
_PII_EMAIL = "johnsmith@gmail.com"
_PII_PHONE = "0912345678"

# (121.5, 25.0) and (121.5001, 25.0001) fall in the same H3 resolution-8 cell
# (884ba0a511fffff), whose centroid is (121.50230015889976, 25.001360164066135) —
# verified directly against the installed h3-pg extension.
_RAW_POINT = (121.5, 25.0)
_NEARBY_POINT_SAME_CELL = (121.5001, 25.0001)
_RES_8_CENTROID = (121.50230015889976, 25.001360164066135)


async def _seed_ticket(coordinator_auth, *, lon: float, lat: float, with_address: bool = False):
    """Seed a ticket with deterministic PII (and optionally an address) at (lon, lat)."""
    user_uuid, _ = coordinator_auth
    async with db_ctx() as db:
        ticket = Tickets(
            geometry=from_shape(Point(lon, lat), srid=4326),
            created_by=user_uuid,
            title="Need volunteers", description="Cleanup needed",
            contact_name=_PII_NAME, contact_email=_PII_EMAIL, contact_phone=_PII_PHONE,
            status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        if with_address:
            db.add(SecondaryLocation(
                geometry_uuid=str(ticket.uuid), location_type="address",
                county="台北市", city="大安區",
                lane="忠孝東路四段", alley="5", no="12", floor="3", room=None,
            ))
        return str(ticket.uuid)


@pytest_asyncio.fixture
async def pii_ticket(coordinator_auth):
    """Seed a ticket with deterministic PII and a linked address; return its UUID string."""
    return await _seed_ticket(coordinator_auth, lon=_RAW_POINT[0], lat=_RAW_POINT[1], with_address=True)


@pytest_asyncio.fixture
async def pii_ticket_nearby(coordinator_auth):
    """Seed a second ticket in the same H3 resolution-8 cell as `pii_ticket`."""
    return await _seed_ticket(
        coordinator_auth, lon=_NEARBY_POINT_SAME_CELL[0], lat=_NEARBY_POINT_SAME_CELL[1]
    )


_DETAIL_QUERY = """
    query($uuid: UUID!, $zoom: Float) {
        ticket(uuid: $uuid, zoom: $zoom) {
            contactName contactEmail contactPhone title geometry
            secondaryLocation { county city lane alley no floor room }
        }
    }
"""


@pytest.mark.asyncio
async def test_guest_sees_masked_contact(client, pii_ticket):
    """An anonymous request gets masked contact fields."""
    resp = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}}
    )
    ticket = resp.json()["data"]["ticket"]
    assert ticket["contactName"] == "王◯◯"
    assert ticket["contactEmail"] == "j***@***.com"
    assert ticket["contactPhone"] == "09*****678"


@pytest.mark.asyncio
async def test_authenticated_sees_raw_contact(client, login_user_auth, pii_ticket):
    """Any logged-in user gets the unmasked contact fields."""
    _, token = login_user_auth
    resp = await client.post(
        "/graphql",
        json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}},
        headers=auth_header(token),
    )
    ticket = resp.json()["data"]["ticket"]
    assert ticket["contactName"] == _PII_NAME
    assert ticket["contactEmail"] == _PII_EMAIL
    assert ticket["contactPhone"] == _PII_PHONE


@pytest.mark.asyncio
async def test_guest_masking_applies_in_list(client, pii_ticket):
    """Masking applies in the tickets list, not only the detail query."""
    resp = await client.post(
        "/graphql",
        json={"query": "query { tickets { items { uuid contactName contactPhone } } }"},
    )
    items = resp.json()["data"]["tickets"]["items"]
    target = next(t for t in items if t["uuid"] == pii_ticket)
    assert target["contactName"] == "王◯◯"
    assert target["contactPhone"] == "09*****678"


@pytest.mark.asyncio
async def test_guest_non_pii_unaffected(client, pii_ticket):
    """Non-PII fields (title) are returned unchanged for guests."""
    resp = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}}
    )
    ticket = resp.json()["data"]["ticket"]
    assert ticket["title"] == "Need volunteers"


# --- Integration tests: geometry masking (H3 coarsening) ---------------------------


@pytest.mark.asyncio
async def test_guest_sees_masked_geometry(client, pii_ticket):
    """A guest gets the H3 resolution-8 cell centroid, not the exact seeded point."""
    resp = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}}
    )
    coords = resp.json()["data"]["ticket"]["geometry"]["coordinates"]
    assert coords != list(_RAW_POINT)
    assert coords == pytest.approx(_RES_8_CENTROID)


@pytest.mark.asyncio
async def test_authenticated_sees_raw_geometry(client, login_user_auth, pii_ticket):
    """Any logged-in user gets the exact, unmasked coordinates."""
    _, token = login_user_auth
    resp = await client.post(
        "/graphql",
        json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}},
        headers=auth_header(token),
    )
    coords = resp.json()["data"]["ticket"]["geometry"]["coordinates"]
    assert coords == pytest.approx(list(_RAW_POINT))


@pytest.mark.asyncio
async def test_guest_geometry_deterministic_same_cell(client, pii_ticket, pii_ticket_nearby):
    """Two different raw points in the same H3 cell mask to the identical centroid."""
    resp_a = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}}
    )
    resp_b = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket_nearby}}
    )
    coords_a = resp_a.json()["data"]["ticket"]["geometry"]["coordinates"]
    coords_b = resp_b.json()["data"]["ticket"]["geometry"]["coordinates"]
    assert coords_a == coords_b == pytest.approx(_RES_8_CENTROID)


@pytest.mark.asyncio
async def test_guest_zoom_capped_at_max_resolution(client, pii_ticket):
    """A zoom implying a resolution above the guest cap (8) is still clamped to 8."""
    resp = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket, "zoom": 18}}
    )
    coords = resp.json()["data"]["ticket"]["geometry"]["coordinates"]
    assert coords == pytest.approx(_RES_8_CENTROID)


@pytest.mark.asyncio
async def test_guest_geometry_masking_applies_in_list(client, pii_ticket):
    """Geometry masking applies in the tickets list, not only the detail query."""
    resp = await client.post(
        "/graphql",
        json={"query": "query { tickets { items { uuid geometry } } }"},
    )
    items = resp.json()["data"]["tickets"]["items"]
    target = next(t for t in items if t["uuid"] == pii_ticket)
    assert target["geometry"]["coordinates"] == pytest.approx(_RES_8_CENTROID)


# --- Integration tests: address masking ---------------------------------------------


@pytest.mark.asyncio
async def test_guest_sees_masked_address(client, pii_ticket):
    """A guest sees county/city but '***' for every street-level field, even unset ones."""
    resp = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}}
    )
    loc = resp.json()["data"]["ticket"]["secondaryLocation"]
    assert loc["county"] == "台北市"
    assert loc["city"] == "大安區"
    assert loc["lane"] == "***"
    assert loc["alley"] == "***"
    assert loc["no"] == "***"
    assert loc["floor"] == "***"
    assert loc["room"] == "***"  # was never set (None) — still masked, not left null


@pytest.mark.asyncio
async def test_authenticated_sees_raw_address(client, login_user_auth, pii_ticket):
    """Any logged-in user gets the full, unmasked address."""
    _, token = login_user_auth
    resp = await client.post(
        "/graphql",
        json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}},
        headers=auth_header(token),
    )
    loc = resp.json()["data"]["ticket"]["secondaryLocation"]
    assert loc == {
        "county": "台北市", "city": "大安區",
        "lane": "忠孝東路四段", "alley": "5", "no": "12", "floor": "3", "room": None,
    }
