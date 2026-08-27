"""End-to-end tests for adding and removing station photos.

Two properties are pinned here, both easy to regress because neither is enforced by a type
or a database constraint:

**A photo url must be short enough for the column and must be https.** The column holds 500
characters, and the API returns database errors to the caller verbatim, so an unchecked
over-long url leaks the table layout in its error message. https-only keeps `javascript:`
and `data:` payloads out of a field that anonymous visitors read back.

**Removing someone else's photo is moderation, adding one is not.** Any registered account
may attach a photo to any station, so removing another person's is deliberately gated on a
different, scarcer capability. Removing *your own* is the one exemption, and it costs exactly
what attaching cost. The ticket-photo test is the subtle one: stations and tickets share the
photos table and a row does not record which kind it is, so a check that only verified "is
this a photo?" would let a station moderator delete a ticket's photos — and because that
test's actor is also the ticket photo's uploader, it doubles as the guard on the uploader
exemption running *after* the station lookup rather than before it.
"""

import uuid as uuid_mod

import pytest
import pytest_asyncio
from geoalchemy2.shape import from_shape
from shapely.geometry import Polygon
from sqlalchemy import select

from app.core.identity import encode_act
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
    """Create a user holding a fresh role with exactly `grants`, and a token acting as it.

    `team_uuid` used to be a column on the user. Since identity switching it is a property of
    the grant (ADR-072/073), so a caller who needs a team gets a team-kind role bound to it —
    the CHECK on user_role_assign rejects a platform role carrying a team, and a team role
    carrying none. The token names that identity in its `act` claim, because grants resolve
    through the active identity and a token naming none resolves to no grants at all
    (ADR-068/074).
    """
    async with test_db() as db:
        user = User(name=f"photo_{uuid_mod.uuid4().hex[:8]}")
        role = Role(
            name=f"photo-role-{uuid_mod.uuid4().hex[:8]}",
            kind="team" if team_uuid is not None else "platform",
        )
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
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_uuid))
        return str(user.uuid), create_access_token(
            data={"sub": str(user.uuid)},
            act=encode_act(str(role.uuid), str(team_uuid) if team_uuid is not None else None),
        )


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
        "https://",                             # scheme but no host — an empty <img src>
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
    # Positive assertion first: since the schema installs MaskErrors, the negative
    # assertions below would also pass with the service validator deleted. This one is
    # what keeps the check in the service load-bearing rather than the mask.
    assert "Photo url" in message, message
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


@pytest.mark.asyncio
async def test_attach_station_photo_accepts_uppercase_scheme(client, coordinator_auth):
    """`HTTPS://` is the same scheme as `https://` — url schemes are case-insensitive.

    RFC 3986 3.1. A literal `startswith("https://")` refuses a perfectly valid url, which is
    why the check parses the url instead of matching a prefix.
    """
    _, token = coordinator_auth
    station_uuid = await _create_station(client, token)

    body = await _attach(client, token, station_uuid, "HTTPS://example.com/photo.jpg")
    assert "errors" not in body, body


# --- A6: moderated removal --------------------------------------------------------------

@pytest.mark.asyncio
async def test_detach_station_photo_removes_it(client, coordinator_auth, contributor_auth):
    """Someone who can moderate stations can remove a photo, and the read path forgets it.

    Removal is a soft delete, so this also confirms the query path filters deleted rows
    rather than the row being physically gone.

    The photo is uploaded by a *different* account from the one that removes it, so this
    exercises the station.review path specifically. Were both the same account, the uploader
    exemption would satisfy the mutation on its own and this test would no longer prove that
    moderators can reach other people's photos.
    """
    _, token = coordinator_auth
    _, uploader_token = contributor_auth
    station_uuid = await _create_station(client, token)
    photo_uuid = (await _attach(client, uploader_token, station_uuid,
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
    """Being able to add a photo does not imply being able to delete *someone else's*.

    Both accounts here hold the capability every registered account gets, which is enough to
    attach. Deleting a photo they did not upload needs the moderation capability neither has,
    so the attempt fails and the photo survives. If removal ever falls back to
    station.contribute for photos in general — rather than only for the uploader's own — this
    test is what catches it.
    """
    _, uploader_token = contributor_auth
    _, other_token = await _make_user_with_grants(
        {Perm.STATION_ADD: "all", Perm.STATION_CONTRIBUTE: "all", Perm.STATION_VIEW: "all"}
    )
    station_uuid = await _create_station(client, uploader_token)
    attached = await _attach(client, uploader_token, station_uuid, "https://example.com/p.jpg")
    assert "errors" not in attached, attached
    photo_uuid = attached["data"]["attachStationPhoto"]["uuid"]

    body = await _detach(client, other_token, photo_uuid)
    assert "errors" in body, body

    # Still there.
    resp = await client.post(
        "/graphql", json={"query": STATION_PHOTOS, "variables": {"uuid": station_uuid}}
    )
    assert len(resp.json()["data"]["station"]["photos"]) == 1


@pytest.mark.asyncio
async def test_detach_station_photo_uploader_removes_own(client, contributor_auth):
    """The uploader can remove their own photo without holding station.review.

    station.review is seeded only at super_admin/all and team admin/zone, so without this
    exemption someone who uploaded the wrong photo could not take it down and had to find a
    moderator. Undoing a contribution costs what making it cost: station.contribute, the same
    capability attach requires, with no scope check — the mirror of attach.
    """
    _, token = contributor_auth
    station_uuid = await _create_station(client, token)
    attached = await _attach(client, token, station_uuid, "https://example.com/mine.jpg")
    assert "errors" not in attached, attached
    photo_uuid = attached["data"]["attachStationPhoto"]["uuid"]

    body = await _detach(client, token, photo_uuid)
    assert "errors" not in body, body
    assert body["data"]["detachStationPhoto"] is True

    resp = await client.post(
        "/graphql", json={"query": STATION_PHOTOS, "variables": {"uuid": station_uuid}}
    )
    assert resp.json()["data"]["station"]["photos"] == []


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

    This actor is also the ticket photo's `created_by`, which makes the test do double duty:
    it fails if the uploader exemption in detach_station_photo is ever moved *above* the
    active-station lookup, because a ticket photo's uploader would then delete it through a
    station mutation — exactly the boundary the lookup exists to hold.
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
