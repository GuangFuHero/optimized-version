"""GraphQL integration tests for announcements (wiring, permissions, relative ordering).

The GraphQL test DB is shared across tests and not reset between them, so assertions filter
to the UUIDs each test creates and check relative ordering rather than absolute positions.
Strict contiguity of display_order is covered by tests/test_announcements_repository.py.
"""

import pytest

from tests.test_graphql.conftest import auth_header

CREATE = """
mutation($content: String!) {
  createAnnouncement(input: {content: $content}) { uuid content active order }
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
  setAnnouncementActive(uuid: $uuid, active: $active) { uuid content active order }
}
"""

DELETE = "mutation($uuid: UUID!) { deleteAnnouncement(uuid: $uuid) }"


async def _post(client, query, variables, token=None):
    headers = auth_header(token) if token else {}
    resp = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=headers
    )
    return resp.json()


async def _create(client, token, content):
    body = await _post(client, CREATE, {"content": content}, token)
    assert "errors" not in body, body
    return body["data"]["createAnnouncement"]


@pytest.mark.asyncio
async def test_create_then_active_list_is_public(client, content_admin_auth):
    """Created announcements are active with integer order and appear on the public ACTIVE list."""
    _, token = content_admin_auth
    a = await _create(client, token, "first")
    b = await _create(client, token, "second")
    assert a["active"] is True and isinstance(a["order"], int)

    body = await _post(client, LIST, {"filter": "ACTIVE"})  # no auth → public
    assert "errors" not in body, body
    mine = [x for x in body["data"]["announcements"] if x["uuid"] in {a["uuid"], b["uuid"]}]
    assert [x["content"] for x in mine] == ["first", "second"]
    assert mine[0]["order"] < mine[1]["order"]


@pytest.mark.asyncio
async def test_create_requires_content_permission(client, login_user_auth):
    """A user without content permission cannot create announcements."""
    _, token = login_user_auth  # has map/request, not content
    body = await _post(client, CREATE, {"content": "nope"}, token)
    assert body.get("errors")


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
    hidden = next(
        (x for x in admin_all["data"]["announcements"] if x["uuid"] == a["uuid"]), None
    )
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
