"""Tests for PII masking of ticket contact fields for guest (non-login) users."""

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.graphql.masking import mask_email, mask_name, mask_phone
from app.models.request import Tickets
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


# --- Integration tests: GraphQL over HTTP ------------------------------------------

_PII_NAME = "王小明"
_PII_EMAIL = "johnsmith@gmail.com"
_PII_PHONE = "0912345678"


@pytest_asyncio.fixture
async def pii_ticket(coordinator_auth):
    """Seed a ticket with deterministic PII and return its UUID string."""
    user_uuid, _ = coordinator_auth
    async with db_ctx() as db:
        ticket = Tickets(
            geometry=from_shape(Point(121.5, 25.0), srid=4326),
            created_by=user_uuid,
            title="Need volunteers", description="Cleanup needed",
            contact_name=_PII_NAME, contact_email=_PII_EMAIL, contact_phone=_PII_PHONE,
            status="pending", priority="high",
            task_type="hr", visibility="public",
        )
        db.add(ticket)
        await db.flush()
        return str(ticket.uuid)


_DETAIL_QUERY = """
    query($uuid: UUID!) {
        ticket(uuid: $uuid) { contactName contactEmail contactPhone title geometry }
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
    """Non-PII fields (title, geometry) are returned unchanged for guests."""
    resp = await client.post(
        "/graphql", json={"query": _DETAIL_QUERY, "variables": {"uuid": pii_ticket}}
    )
    ticket = resp.json()["data"]["ticket"]
    assert ticket["title"] == "Need volunteers"
    assert ticket["geometry"] is not None
