"""End-to-end tests for ticket photo links: filing them with a ticket, attaching, detaching.

Photos are links only (the platform keeps no image). Three properties are pinned:

**createTicket stores the links it is given, in order, or writes nothing.** The same ten-link
cap and https rule as a help request apply, and a refused link must leave no ticket row.

**Attaching and detaching are ticket edits.** Both need `ticket.edit` on the ticket, not the
`station.contribute` a station photo needs.

**Detach resolves the owner first.** Stations and tickets share the photos table, so a station
photo's uuid must answer "Ticket photo not found" exactly as an unknown uuid does.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.core.permissions import Perm
from app.models.photo import Photo
from app.models.request import Tickets
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as _test_db  # aliased so pytest does not collect it
from tests.test_graphql.test_station_photo import (
    _attach,
    _create_station,
    _make_user_with_grants,
)

CREATE_TICKET = """
mutation($input: CreateTicketInput!) {
    createTicket(input: $input) { ... on TicketCreated { ticket { uuid } } }
}
"""

TICKET_PHOTOS = """
query($uuid: UUID!) { ticket(uuid: $uuid) { photos { uuid url } } }
"""

ATTACH_TICKET_PHOTO = """
mutation($ticketUuid: UUID!, $url: String!) {
    attachTicketPhoto(ticketUuid: $ticketUuid, url: $url) { uuid url refType }
}
"""

DETACH_TICKET_PHOTO = """
mutation($uuid: UUID!) { detachTicketPhoto(uuid: $uuid) }
"""

_STAFF = {
    Perm.TICKET_ADD: "all",
    Perm.TICKET_VIEW: "all",
    Perm.TICKET_VIEW_DETAIL: "all",
    Perm.TICKET_EDIT: "all",
}


@pytest_asyncio.fixture
async def staff_auth(redis):
    """A user who can file, read the detail of, and edit any ticket."""
    return await _make_user_with_grants(redis, _STAFF)


@pytest_asyncio.fixture
async def filer_auth(redis):
    """A user who can file tickets but not edit them."""
    return await _make_user_with_grants(
        redis, {Perm.TICKET_ADD: "all", Perm.TICKET_VIEW: "all"}
    )


async def _gql(client, token: str, query: str, variables: dict) -> dict:
    resp = await client.post(
        "/graphql",
        json={"query": query, "variables": variables},
        headers=auth_header(token),
    )
    return resp.json()


def _ticket_input(**extra) -> dict:
    return {
        "title": "Ticket with photos",
        "geometry": {"type": "Point", "coordinates": [121.5, 24.5]},
        "contactName": "Ticket Contact",
        **extra,
    }


async def _create_ticket(client, token: str, **extra) -> dict:
    return await _gql(client, token, CREATE_TICKET, {"input": _ticket_input(**extra)})


async def _photo_urls(client, token: str, ticket_uuid: str) -> list[str]:
    body = await _gql(client, token, TICKET_PHOTOS, {"uuid": ticket_uuid})
    assert "errors" not in body, body
    return [p["url"] for p in body["data"]["ticket"]["photos"]]


async def _ticket_count() -> int:
    async with _test_db() as db:
        return (await db.execute(select(func.count()).select_from(Tickets))).scalar_one()


@pytest.mark.asyncio
async def test_create_ticket_stores_photo_links_in_order(client, staff_auth):
    """The links given to createTicket come back as the ticket's photos, same order."""
    _, token = staff_auth
    urls = ["https://a.example/1.jpg", "https://a.example/2.jpg"]

    body = await _create_ticket(client, token, photoUrls=urls)
    assert "errors" not in body, body
    ticket_uuid = body["data"]["createTicket"]["ticket"]["uuid"]

    assert await _photo_urls(client, token, ticket_uuid) == urls


@pytest.mark.asyncio
async def test_create_ticket_refuses_eleven_photo_links(client, staff_auth):
    """More than ten links is refused, and no ticket row is written."""
    _, token = staff_auth
    before = await _ticket_count()

    body = await _create_ticket(
        client, token, photoUrls=[f"https://a.example/{i}.jpg" for i in range(11)]
    )

    assert "errors" in body, body
    assert "At most 10 photos are allowed" in body["errors"][0]["message"]
    assert await _ticket_count() == before


@pytest.mark.asyncio
async def test_create_ticket_refuses_non_https_link(client, staff_auth):
    """A plain-http link is refused with the https rule, and no ticket row is written."""
    _, token = staff_auth
    before = await _ticket_count()

    body = await _create_ticket(client, token, photoUrls=["http://a.example/x.jpg"])

    assert "errors" in body, body
    assert "https://" in body["errors"][0]["message"]
    assert await _ticket_count() == before


@pytest.mark.asyncio
async def test_attach_ticket_photo_requires_ticket_edit(client, staff_auth, filer_auth):
    """Without ticket.edit the attach is refused and nothing is stored; with it, a photo returns."""
    _, staff_token = staff_auth
    _, filer_token = filer_auth
    created = await _create_ticket(client, staff_token)
    ticket_uuid = created["data"]["createTicket"]["ticket"]["uuid"]
    variables = {"ticketUuid": ticket_uuid, "url": "https://a.example/new.jpg"}

    denied = await _gql(client, filer_token, ATTACH_TICKET_PHOTO, variables)
    assert "errors" in denied, denied
    assert await _photo_urls(client, staff_token, ticket_uuid) == []

    allowed = await _gql(client, staff_token, ATTACH_TICKET_PHOTO, variables)
    assert "errors" not in allowed, allowed
    assert allowed["data"]["attachTicketPhoto"]["url"] == "https://a.example/new.jpg"
    assert allowed["data"]["attachTicketPhoto"]["refType"] == "geometry"
    assert await _photo_urls(client, staff_token, ticket_uuid) == ["https://a.example/new.jpg"]


@pytest.mark.asyncio
async def test_attach_ticket_photo_unknown_ticket(client, staff_auth):
    """An unknown ticket uuid errors as 'Ticket not found'."""
    _, token = staff_auth
    body = await _gql(
        client, token, ATTACH_TICKET_PHOTO,
        {"ticketUuid": str(uuid_mod.uuid4()), "url": "https://a.example/x.jpg"},
    )
    assert "Ticket not found" in body["errors"][0]["message"]


@pytest.mark.asyncio
async def test_detach_ticket_photo_removes_it(client, staff_auth):
    """A ticket.edit actor detaches a photo, and the ticket stops listing it."""
    _, token = staff_auth
    created = await _create_ticket(
        client, token, photoUrls=["https://a.example/1.jpg", "https://a.example/2.jpg"]
    )
    ticket_uuid = created["data"]["createTicket"]["ticket"]["uuid"]
    attached = await _gql(
        client, token, ATTACH_TICKET_PHOTO,
        {"ticketUuid": ticket_uuid, "url": "https://a.example/3.jpg"},
    )
    photo_uuid = attached["data"]["attachTicketPhoto"]["uuid"]

    body = await _gql(client, token, DETACH_TICKET_PHOTO, {"uuid": photo_uuid})
    assert "errors" not in body, body
    assert body["data"]["detachTicketPhoto"] is True
    assert await _photo_urls(client, token, ticket_uuid) == [
        "https://a.example/1.jpg", "https://a.example/2.jpg",
    ]


@pytest.mark.asyncio
async def test_detach_ticket_photo_requires_ticket_edit(client, staff_auth, filer_auth):
    """Without ticket.edit the detach is refused and the photo survives."""
    _, staff_token = staff_auth
    _, filer_token = filer_auth
    created = await _create_ticket(client, staff_token, photoUrls=["https://a.example/1.jpg"])
    ticket_uuid = created["data"]["createTicket"]["ticket"]["uuid"]
    async with _test_db() as db:
        photo_uuid = str(
            (await db.execute(select(Photo).where(Photo.ref_uuid == ticket_uuid))).scalar_one().uuid
        )

    denied = await _gql(client, filer_token, DETACH_TICKET_PHOTO, {"uuid": photo_uuid})
    assert "errors" in denied, denied
    assert await _photo_urls(client, staff_token, ticket_uuid) == ["https://a.example/1.jpg"]


@pytest.mark.asyncio
async def test_detach_ticket_photo_refuses_a_station_photo(client, staff_auth, coordinator_auth):
    """A station photo's uuid answers 'Ticket photo not found', like an unknown uuid."""
    _, staff_token = staff_auth
    _, coordinator_token = coordinator_auth
    station_uuid = await _create_station(client, coordinator_token)
    attached = await _attach(client, coordinator_token, station_uuid, "https://a.example/s.jpg")
    station_photo_uuid = attached["data"]["attachStationPhoto"]["uuid"]

    for target in (station_photo_uuid, str(uuid_mod.uuid4())):
        body = await _gql(client, staff_token, DETACH_TICKET_PHOTO, {"uuid": target})
        assert "Ticket photo not found" in body["errors"][0]["message"], body

    # The station photo is untouched.
    resp = await client.post(
        "/graphql",
        json={"query": "query($uuid: UUID!) { station(uuid: $uuid) { photos { uuid } } }",
              "variables": {"uuid": station_uuid}},
    )
    assert len(resp.json()["data"]["station"]["photos"]) == 1
