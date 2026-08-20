"""End-to-end tests for adding and removing station photos.

Two properties are pinned here, both easy to regress because neither is enforced by a type
or a database constraint:

**A photo url must be short enough for the column and must be https.** The column holds 500
characters, and the API returns database errors to the caller verbatim, so an unchecked
over-long url leaks the table layout in its error message. https-only keeps `javascript:`
and `data:` payloads out of a field that anonymous visitors read back.

**Removing a photo is moderation, adding one is not.** Any registered account may attach a
photo to any station, so removal is deliberately gated on a different, scarcer capability.
The last test is the subtle one: stations and tickets share the photos table and a row does
not record which kind it is, so a check that only verified "is this a photo?" would let a
station moderator delete a ticket's photos.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Polygon
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.photo import Photo
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team, TeamZoneAssign, WorkZone
from tests.test_graphql.conftest import auth_header, test_db

CREATE_STATION = """
mutation($input: CreateStationInput!) { createStation(input: $input) { uuid } }
"""

ATTACH_STATION_PHOTO = """
mutation($stationUuid: UUID!, $url: String!) {
    attachStationPhoto(stationUuid: $stationUuid, url: $url) { uuid url refType }
}
"""

DETACH_STATION_PHOTO = """
mutation($uuid: UUID!) { detachStationPhoto(uuid: $uuid) }
"""

STATION_PHOTOS = """
query($uuid: UUID!) { station(uuid: $uuid) { photos { uuid url } } }
"""

CREATE_TICKET = """
mutation($input: CreateTicketInput!) { createTicket(input: $input) { uuid } }
"""

# Matches test_zone_scope.py: the zone covers 121-122E/24-25N.
ZONE_POLYGON = Polygon([(121.0, 24.0), (121.0, 25.0), (122.0, 25.0), (122.0, 24.0), (121.0, 24.0)])
OUTSIDE_ZONE_LONLAT = [123.5, 24.5]


async def _create_station(client, token: str, lonlat=(121.5, 24.5)) -> str:
    resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_STATION,
            "variables": {"input": {"geometry": {"type": "Point", "coordinates": list(lonlat)}}},
        },
        headers=auth_header(token),
    )
    body = resp.json()
    assert "errors" not in body, body
    return body["data"]["createStation"]["uuid"]


async def _attach(client, token: str, station_uuid: str, url: str):
    resp = await client.post(
        "/graphql",
        json={"query": ATTACH_STATION_PHOTO,
              "variables": {"stationUuid": station_uuid, "url": url}},
        headers=auth_header(token),
    )
    return resp.json()


async def _detach(client, token: str, photo_uuid: str):
    resp = await client.post(
        "/graphql",
        json={"query": DETACH_STATION_PHOTO, "variables": {"uuid": photo_uuid}},
        headers=auth_header(token),
    )
    return resp.json()


async def _make_user_with_grants(grants: dict[Perm, str], *, team_uuid: str | None = None):
    """Create a user holding a fresh platform role with exactly `grants`."""
    async with test_db() as db:
        user = User(name=f"photo_{uuid_mod.uuid4().hex[:8]}", team_uuid=team_uuid)
        role = Role(name=f"photo-role-{uuid_mod.uuid4().hex[:8]}", kind="platform")
        db.add_all([user, role])
        await db.flush()

        for perm, scope in grants.items():
            result = await db.execute(select(Permission).where(Permission.key == perm.value))
            permission = result.scalar_one_or_none()
            if not permission:
                permission = Permission(key=perm.value)
                db.add(permission)
                await db.flush()
            db.add(
                RolePermissionAssign(
                    role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
                )
            )
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
        return str(user.uuid), create_access_token(data={"sub": str(user.uuid)})


@pytest_asyncio.fixture
async def contributor_auth():
    """A user who can attach photos but holds no station.review — the plain-citizen shape."""
    return await _make_user_with_grants(
        {Perm.STATION_ADD: "all", Perm.STATION_CONTRIBUTE: "all", Perm.STATION_VIEW: "all"}
    )


@pytest_asyncio.fixture
async def team_assigned_to_zone() -> str:
    """A Team assigned to a WorkZone covering 121-122E/24-25N."""
    async with test_db() as db:
        team = Team(name=f"Photo Zone Team {uuid_mod.uuid4().hex[:8]}", type="gov")
        assigner = User(name=f"assigner_{uuid_mod.uuid4().hex[:8]}")
        zone = WorkZone(name="Photo Test Zone", geometry=from_shape(ZONE_POLYGON, srid=4326))
        db.add_all([team, assigner, zone])
        await db.flush()
        db.add(
            TeamZoneAssign(
                team_uuid=team.uuid, zone_uuid=zone.uuid, assigned_by=str(assigner.uuid)
            )
        )
        await db.flush()
        return str(team.uuid)


# --- A2: url validation -----------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad_url",
    [
        "https://example.com/" + "a" * 500,     # over the String(500) column width
        "javascript:alert(1)",                  # scheme not in the allowlist
        "data:text/html,<script>alert(1)</script>",
        "not a url at all",
        "http://example.com/photo.jpg",         # plain http is rejected too
        "   ",                                  # whitespace-only
    ],
)
async def test_attach_station_photo_rejects_bad_url(client, coordinator_auth, bad_url):
    """An over-long or non-https url is refused, and no row is written.

    Also asserts the error text is clean: the point of checking length in the service is that
    letting the database reject it instead echoes the INSERT statement back to the caller.
    """
    _, token = coordinator_auth
    station_uuid = await _create_station(client, token)

    body = await _attach(client, token, station_uuid, bad_url)
    assert "errors" in body, body
    message = body["errors"][0]["message"]
    # The point of validating length: asyncpg's truncation error quotes the whole
    # statement, which leaked the photos table layout to any authenticated caller.
    assert "INSERT" not in message.upper(), message
    assert "photos" not in message, message

    resp = await client.post(
        "/graphql", json={"query": STATION_PHOTOS, "variables": {"uuid": station_uuid}}
    )
    assert resp.json()["data"]["station"]["photos"] == []


@pytest.mark.asyncio
async def test_attach_station_photo_accepts_https_and_trims(client, coordinator_auth):
    """A valid https url is accepted, with surrounding whitespace stripped."""
    _, token = coordinator_auth
    station_uuid = await _create_station(client, token)

    body = await _attach(client, token, station_uuid, "  https://example.com/photo.jpg  ")
    assert "errors" not in body, body
    assert body["data"]["attachStationPhoto"]["url"] == "https://example.com/photo.jpg"


# --- A6: moderated removal --------------------------------------------------------------

@pytest.mark.asyncio
async def test_detach_station_photo_removes_it(client, coordinator_auth):
    """Someone who can moderate stations can remove a photo, and the read path forgets it.

    Removal is a soft delete, so this also confirms the query path filters deleted rows
    rather than the row being physically gone.
    """
    _, token = coordinator_auth
    station_uuid = await _create_station(client, token)
    photo_uuid = (await _attach(client, token, station_uuid,
                               "https://example.com/p.jpg"))["data"]["attachStationPhoto"]["uuid"]

    body = await _detach(client, token, photo_uuid)
    assert "errors" not in body, body
    assert body["data"]["detachStationPhoto"] is True

    resp = await client.post(
        "/graphql", json={"query": STATION_PHOTOS, "variables": {"uuid": station_uuid}}
    )
    assert resp.json()["data"]["station"]["photos"] == []


@pytest.mark.asyncio
async def test_detach_station_photo_denied_without_review(client, contributor_auth):
    """Being able to add a photo does not imply being able to delete one.

    This user has the capability every registered account gets, which is enough to attach.
    Removal needs the moderation capability they lack, so the attempt fails and the photo
    survives. If both actions ever share one capability, this test is what catches it.
    """
    _, token = contributor_auth
    station_uuid = await _create_station(client, token)
    attached = await _attach(client, token, station_uuid, "https://example.com/p.jpg")
    assert "errors" not in attached, attached
    photo_uuid = attached["data"]["attachStationPhoto"]["uuid"]

    body = await _detach(client, token, photo_uuid)
    assert "errors" in body, body

    # Still there.
    resp = await client.post(
        "/graphql", json={"query": STATION_PHOTOS, "variables": {"uuid": station_uuid}}
    )
    assert len(resp.json()["data"]["station"]["photos"]) == 1


@pytest.mark.asyncio
async def test_detach_station_photo_zone_scoped_reviewer_outside_zone(
    client, coordinator_auth, team_assigned_to_zone
):
    """A moderator limited to their team's area can only remove photos inside it.

    Both halves matter. The rejection shows the geographic limit is enforced. The success
    shows it is enforced using the *station's* coordinates: a photo has no location of its
    own, so if the check did not borrow the parent station's, even the in-area case would
    fail and the limit would look like a blanket denial.
    """
    _, coord_token = coordinator_auth
    _, reviewer_token = await _make_user_with_grants(
        {Perm.STATION_REVIEW: "zone", Perm.STATION_VIEW: "all"}, team_uuid=team_assigned_to_zone
    )

    inside = await _create_station(client, coord_token, (121.5, 24.5))
    outside = await _create_station(client, coord_token, OUTSIDE_ZONE_LONLAT)
    inside_photo = (await _attach(client, coord_token, inside,
                                  "https://example.com/in.jpg"))["data"]["attachStationPhoto"]["uuid"]
    outside_photo = (await _attach(client, coord_token, outside,
                                   "https://example.com/out.jpg"))["data"]["attachStationPhoto"]["uuid"]

    denied = await _detach(client, reviewer_token, outside_photo)
    assert "errors" in denied, denied

    allowed = await _detach(client, reviewer_token, inside_photo)
    assert "errors" not in allowed, allowed


@pytest.mark.asyncio
async def test_detach_station_photo_rejects_a_ticket_photo(client, coordinator_auth):
    """A station moderator cannot use this mutation to delete a ticket's photo.

    Stations and tickets both extend the same parent table and share the photos table, storing
    the same kind of uuid under the same type tag — so nothing in a photo row identifies which
    one owns it. Ticket photos are governed by ticket capabilities, not station ones, so this
    mutation has to resolve the owner before deciding. The response must also be
    indistinguishable from an unknown uuid, or it becomes a way to test whether a given uuid
    is a ticket.
    """
    user_uuid, token = coordinator_auth
    resp = await client.post(
        "/graphql",
        json={
            "query": CREATE_TICKET,
            "variables": {"input": {
                "title": "Ticket owning a photo",
                "geometry": {"type": "Point", "coordinates": [121.5, 24.5]},
                "contactName": "Ticket Contact",
            }},
        },
        headers=auth_header(token),
    )
    body = resp.json()
    assert "errors" not in body, body
    ticket_uuid = body["data"]["createTicket"]["uuid"]

    # No ticket-photo mutation exists yet, so insert the row the way a future one would.
    async with test_db() as db:
        photo = Photo(ref_uuid=ticket_uuid, ref_type="geometry",
                      url="https://example.com/ticket.jpg", created_by=user_uuid)
        db.add(photo)
        await db.flush()
        ticket_photo_uuid = str(photo.uuid)

    denied = await _detach(client, token, ticket_photo_uuid)
    assert "errors" in denied, denied
    assert "not found" in denied["errors"][0]["message"].lower()

    # And it is genuinely still there.
    async with test_db() as db:
        result = await db.execute(select(Photo).where(Photo.uuid == ticket_photo_uuid))
        assert result.scalar_one().delete_at is None
