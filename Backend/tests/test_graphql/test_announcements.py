"""GraphQL integration tests for announcements (wiring, permissions, relative ordering).

The GraphQL test DB is shared across tests and not reset between them, so assertions filter
to the UUIDs each test creates and check relative ordering rather than absolute positions.
Strict contiguity of display_order is covered by tests/test_announcements_repository.py.
"""

from uuid import UUID

import pytest
from sqlalchemy import select, update

from app.core.permissions import Perm
from app.models.announcement import Announcement
from app.models.notification import Notification
from tests.test_graphql.conftest import _create_user_with_grants, _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as _test_db

CREATE = """
mutation($content: String!) {
  createAnnouncement(input: {content: $content}) { uuid content active order status publishedAt }
}
"""

LIST = """
query($filter: AnnouncementFilter!) {
  announcements(filter: $filter) { uuid content active order }
}
"""

MOVE = """
mutation($uuid: UUID!, $dir: AnnouncementMoveDirection!) {
  moveAnnouncement(uuid: $uuid, direction: $dir) { uuid content order }
}
"""

SET_ACTIVE = """
mutation($uuid: UUID!, $active: Boolean!) {
  setAnnouncementActive(uuid: $uuid, active: $active) { uuid content active order status }
}
"""

WHO = """
query($filter: AnnouncementFilter!) {
  announcements(filter: $filter) {
    uuid creator { uuid name } updater { uuid name } publisher { uuid name }
  }
}
"""

DELETE = "mutation($uuid: UUID!) { deleteAnnouncement(uuid: $uuid) }"

CREATE_PLACED = """
mutation($content: String!, $placement: AnnouncementPlacement!) {
  createAnnouncement(input: {content: $content, placement: $placement}) { uuid placement }
}
"""

LIST_PLACED = """
query($placement: AnnouncementPlacement!) {
  announcements(placement: $placement) { uuid }
}
"""

LIST_DEFAULT = "{ announcements { uuid } }"

GET_ONE = "query($uuid: UUID!) { announcement(uuid: $uuid) { uuid } }"

UPDATE = """
mutation($uuid: UUID!, $content: String!, $placement: AnnouncementPlacement) {
  updateAnnouncement(uuid: $uuid, input: {content: $content, placement: $placement}) {
    content placement
  }
}
"""


async def _post(client, query, variables, token=None):
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return resp.json()


async def _publish(client, token, uuid):
    body = await _post(client, SET_ACTIVE, {"uuid": uuid, "active": True}, token)
    assert "errors" not in body, body
    return body["data"]["setAnnouncementActive"]


async def _create(client, token, content):
    """Create an announcement and publish it."""
    body = await _post(client, CREATE, {"content": content}, token)
    assert "errors" not in body, body
    return await _publish(client, token, body["data"]["createAnnouncement"]["uuid"])


@pytest.mark.asyncio
async def test_published_announcements_list_publicly_in_order(client, content_admin_auth):
    """Published announcements are active with integer order and appear on the public ACTIVE list."""
    _, token = content_admin_auth
    a = await _create(client, token, "first")
    b = await _create(client, token, "second")
    assert a["active"] is True and isinstance(a["order"], int) and a["status"] == "ACTIVE"

    body = await _post(client, LIST, {"filter": "ACTIVE"})  # no auth → public
    assert "errors" not in body, body
    mine = [x for x in body["data"]["announcements"] if x["uuid"] in {a["uuid"], b["uuid"]}]
    assert [x["content"] for x in mine] == ["first", "second"]
    assert mine[0]["order"] < mine[1]["order"]


@pytest.mark.asyncio
async def test_create_makes_a_draft_that_only_editors_see(client, content_admin_auth):
    """A new announcement stays off the public list and is readable only by editors until activated."""
    _, token = content_admin_auth
    body = await _post(client, CREATE, {"content": "draft"}, token)
    assert "errors" not in body, body
    d = body["data"]["createAnnouncement"]
    assert (d["status"], d["active"], d["order"], d["publishedAt"]) == ("DRAFT", False, None, None)

    assert await _listed(client, {d["uuid"]}, LIST, {"filter": "ACTIVE"}) == set()
    assert await _listed(client, {d["uuid"]}, LIST, {"filter": "DRAFT"}, token) == {d["uuid"]}
    assert (await _post(client, LIST, {"filter": "DRAFT"})).get("errors")
    assert (await _post(client, GET_ONE, {"uuid": d["uuid"]})).get("errors")

    published = await _publish(client, token, d["uuid"])
    assert published["status"] == "ACTIVE"
    assert await _listed(client, {d["uuid"]}, LIST, {"filter": "ACTIVE"}) == {d["uuid"]}
    assert await _listed(client, {d["uuid"]}, LIST, {"filter": "DRAFT"}, token) == set()


@pytest.mark.asyncio
async def test_create_and_publish_require_content_permission(client, content_admin_auth, login_user_auth):
    """A user without content permission can neither create nor publish announcements."""
    _, admin_token = content_admin_auth
    _, token = login_user_auth  # has map/request, not content
    assert (await _post(client, CREATE, {"content": "nope"}, token)).get("errors")

    draft = await _post(client, CREATE, {"content": "not yours"}, admin_token)
    uuid = draft["data"]["createAnnouncement"]["uuid"]
    assert (await _post(client, SET_ACTIVE, {"uuid": uuid, "active": True}, token)).get("errors")


@pytest.mark.asyncio
async def test_authors_are_shown_to_editors_only(client, redis, content_admin_auth):
    """Editors see who wrote, last changed and published an announcement; guests get null for all three."""
    author_uuid, author_token = content_admin_auth
    editor_uuid, editor_token = await _create_user_with_role(redis, "Content Admin")
    a = await _create(client, author_token, "who")
    edited = await _post(client, UPDATE, {"uuid": a["uuid"], "content": "who?"}, editor_token)
    assert "errors" not in edited, edited

    body = await _post(client, WHO, {"filter": "ALL"}, author_token)
    row = next(x for x in body["data"]["announcements"] if x["uuid"] == a["uuid"])
    assert row["creator"]["uuid"] == author_uuid and row["creator"]["name"]
    assert row["updater"]["uuid"] == editor_uuid and row["updater"]["name"]
    assert row["publisher"]["uuid"] == author_uuid and row["publisher"]["name"]

    public = await _post(client, WHO, {"filter": "ACTIVE"})
    row = next(x for x in public["data"]["announcements"] if x["uuid"] == a["uuid"])
    assert row["creator"] is None and row["updater"] is None and row["publisher"] is None


@pytest.mark.asyncio
async def test_move_up_reorders(client, content_admin_auth):
    """Moving an announcement up places it before its former predecessor."""
    _, token = content_admin_auth
    a = await _create(client, token, "alpha")
    b = await _create(client, token, "beta")
    body = await _post(client, MOVE, {"uuid": b["uuid"], "dir": "UP"}, token)
    assert "errors" not in body, body

    listed = await _post(client, LIST, {"filter": "ACTIVE"})
    mine = [x for x in listed["data"]["announcements"] if x["uuid"] in {a["uuid"], b["uuid"]}]
    assert [x["content"] for x in mine] == ["beta", "alpha"]


@pytest.mark.asyncio
async def test_all_filter_requires_admin_and_includes_inactive(client, content_admin_auth):
    """ALL is admin-only and surfaces deactivated announcements; ACTIVE hides them."""
    _, token = content_admin_auth
    a = await _create(client, token, "to_hide")
    deact = await _post(client, SET_ACTIVE, {"uuid": a["uuid"], "active": False}, token)
    assert "errors" not in deact, deact
    assert deact["data"]["setAnnouncementActive"]["active"] is False
    assert deact["data"]["setAnnouncementActive"]["order"] is None

    public_all = await _post(client, LIST, {"filter": "ALL"})  # no auth
    assert public_all.get("errors")

    admin_all = await _post(client, LIST, {"filter": "ALL"}, token)
    assert "errors" not in admin_all, admin_all
    hidden = next((x for x in admin_all["data"]["announcements"] if x["uuid"] == a["uuid"]), None)
    assert hidden is not None and hidden["active"] is False

    public_active = await _post(client, LIST, {"filter": "ACTIVE"})
    assert all(x["uuid"] != a["uuid"] for x in public_active["data"]["announcements"])


@pytest.mark.asyncio
async def test_delete_requires_permission_and_removes(client, content_admin_auth, login_user_auth):
    """Delete needs content:delete; once deleted the row is gone from listings."""
    _, admin_token = content_admin_auth
    _, weak_token = login_user_auth
    a = await _create(client, admin_token, "doomed")

    denied = await _post(client, DELETE, {"uuid": a["uuid"]}, weak_token)
    assert denied.get("errors")

    ok = await _post(client, DELETE, {"uuid": a["uuid"]}, admin_token)
    assert "errors" not in ok, ok
    assert ok["data"]["deleteAnnouncement"] is True

    admin_all = await _post(client, LIST, {"filter": "ALL"}, admin_token)
    assert all(x["uuid"] != a["uuid"] for x in admin_all["data"]["announcements"])


async def _create_placed(client, token, content, placement):
    """Create an announcement on `placement` and publish it."""
    body = await _post(client, CREATE_PLACED, {"content": content, "placement": placement}, token)
    assert "errors" not in body, body
    return (await _publish(client, token, body["data"]["createAnnouncement"]["uuid"]))["uuid"]


async def _listed(client, mine, query, variables=None, token=None):
    body = await _post(client, query, variables or {}, token)
    assert "errors" not in body, body
    return {x["uuid"] for x in body["data"]["announcements"]} & mine


async def _notified(ref_uuid):
    async with _test_db() as db:
        rows = await db.execute(
            select(Notification.recipient_uuid, Notification.body).where(
                Notification.ref_uuid == UUID(ref_uuid)
            )
        )
        return {str(u): body for u, body in rows}


@pytest.mark.asyncio
async def test_placement_controls_which_page_lists_it(client, content_admin_auth):
    """Each page lists its own placement plus "all", and guests read public-page rows."""
    _, token = content_admin_auth
    admin_only = await _create_placed(client, token, "admin only", "admin_page")
    public_only = await _create_placed(client, token, "public only", "public_page")
    both = (await _create(client, token, "both"))["uuid"]
    mine = {admin_only, public_only, both}

    assert await _listed(client, mine, LIST_DEFAULT) == {public_only, both}
    assert await _listed(client, mine, LIST_PLACED, {"placement": "admin_page"}, token) == {admin_only, both}
    assert await _listed(client, mine, LIST_PLACED, {"placement": "all"}, token) == mine

    public_get = await _post(client, GET_ONE, {"uuid": public_only})
    assert public_get["data"]["announcement"]["uuid"] == public_only


@pytest.mark.asyncio
async def test_admin_page_needs_view_admin(client, redis, content_admin_auth, login_user_auth):
    """Guests and plain accounts can't read admin-page rows or get notified; staff are, without the text."""
    _, admin_token = content_admin_auth
    user_uuid, user_token = login_user_auth
    staff_uuid, staff_token = await _create_user_with_role(redis, "Content Admin")
    admin_only = await _create_placed(client, admin_token, "admin only", "admin_page")

    for token in (None, user_token):
        assert (await _post(client, LIST_PLACED, {"placement": "admin_page"}, token)).get("errors")
        assert (await _post(client, LIST_PLACED, {"placement": "all"}, token)).get("errors")
        assert (await _post(client, GET_ONE, {"uuid": admin_only}, token)).get("errors")
    staff_get = await _post(client, GET_ONE, {"uuid": admin_only}, staff_token)
    assert staff_get["data"]["announcement"]["uuid"] == admin_only

    notified = await _notified(admin_only)
    assert staff_uuid in notified
    assert "admin only" not in notified[staff_uuid]
    assert notified[staff_uuid] == "管理平台有一則新公告。"
    assert user_uuid not in notified


@pytest.mark.asyncio
async def test_update_changes_placement(client, content_admin_auth):
    """Updating placement moves an announcement off the public page; omitting it or resending it keeps it."""
    _, token = content_admin_auth
    a = await _create_placed(client, token, "moving", "public_page")

    moved = await _post(client, UPDATE, {"uuid": a, "content": "moving", "placement": "admin_page"}, token)
    assert "errors" not in moved, moved
    assert moved["data"]["updateAnnouncement"] == {"content": "moving", "placement": "admin_page"}
    assert await _listed(client, {a}, LIST_DEFAULT) == set()

    kept = await _post(client, UPDATE, {"uuid": a, "content": "edited"}, token)
    assert "errors" not in kept, kept
    assert kept["data"]["updateAnnouncement"] == {"content": "edited", "placement": "admin_page"}

    read_back = kept["data"]["updateAnnouncement"]["placement"]
    resaved = await _post(client, UPDATE, {"uuid": a, "content": "edited", "placement": read_back}, token)
    assert "errors" not in resaved, resaved


@pytest.mark.asyncio
async def test_unknown_placement_is_kept_off_the_public_site(
    client, redis, content_admin_auth, login_user_auth
):
    """A placement outside the enum, written straight to the DB, is read and notified like admin_page."""
    _, admin_token = content_admin_auth
    user_uuid, _ = login_user_auth
    staff_uuid, _ = await _create_user_with_role(redis, "Content Admin")
    a = await _create_placed(client, admin_token, "staff only", "admin_page")
    async with _test_db() as db:
        await db.execute(update(Announcement).where(Announcement.uuid == UUID(a)).values(placement="staff"))
        await db.commit()

    for active in (False, True):
        body = await _post(client, SET_ACTIVE, {"uuid": a, "active": active}, admin_token)
        assert "errors" not in body, body

    assert (await _post(client, GET_ONE, {"uuid": a})).get("errors")
    notified = await _notified(a)
    assert "staff only" not in notified[staff_uuid]
    assert user_uuid not in notified


@pytest.mark.asyncio
async def test_edit_alone_cannot_put_an_announcement_live(client, redis, content_admin_auth):
    """Without announcement.publish an editor can draft and edit, but can't activate or edit a live one."""
    _, admin_token = content_admin_auth
    _, editor = await _create_user_with_grants(redis, ((Perm.ANN_VIEW_ADMIN, "all"), (Perm.ANN_EDIT, "all")))
    draft = await _post(client, CREATE_PLACED, {"content": "staff", "placement": "admin_page"}, editor)
    assert "errors" not in draft, draft
    d = draft["data"]["createAnnouncement"]["uuid"]
    assert (await _post(client, SET_ACTIVE, {"uuid": d, "active": True}, editor)).get("errors")
    moved_draft = await _post(client, UPDATE, {"uuid": d, "content": "staff", "placement": "all"}, editor)
    assert "errors" not in moved_draft, moved_draft

    live = await _create_placed(client, admin_token, "staff only", "admin_page")
    assert (await _post(client, UPDATE, {"uuid": live, "content": "staff only!"}, editor)).get("errors")
    widened = await _post(client, UPDATE, {"uuid": live, "content": "x", "placement": "public_page"}, editor)
    assert widened.get("errors")
    assert await _listed(client, {live}, LIST_DEFAULT) == set()

    assert "errors" not in await _post(client, SET_ACTIVE, {"uuid": live, "active": False}, editor)
    edited = await _post(client, UPDATE, {"uuid": live, "content": "staff only!"}, editor)
    assert "errors" not in edited, edited
