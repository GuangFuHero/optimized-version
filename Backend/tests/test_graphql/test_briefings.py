"""GraphQL integration tests for briefing templates and briefings.

Tests drive the ASGI app in-process via httpx. They use the shared seeded test DB, so each
test filters results to the UUIDs it created rather than assuming a clean table.
"""

import uuid

import pytest

from app.core.permissions import Perm
from tests.test_graphql.conftest import _create_user_with_grants, _create_user_with_role, auth_header

CREATE_TEMPLATE = """
mutation($content: String!, $tags: [String!]!, $state: BriefingState!) {
  createBriefingTemplate(input: {content: $content, tags: $tags, state: $state}) {
    uuid content tags state creator { uuid }
  }
}
"""

UPDATE_TEMPLATE = """
mutation($uuid: UUID!, $content: String) {
  updateBriefingTemplate(uuid: $uuid, input: {content: $content}) { uuid content state tags }
}
"""

DELETE_TEMPLATE = "mutation($uuid: UUID!) { deleteBriefingTemplate(uuid: $uuid) }"

GENERATE = """
mutation($templateUuid: UUID) {
  generateBriefing(input: {templateUuid: $templateUuid}) {
    uuid templateUuid content tags state status
  }
}
"""

GENERATE_CONTENT = """
mutation($content: String!) {
  generateBriefing(input: {content: $content}) { uuid status }
}
"""

UPDATE_CONTENT = """
mutation($uuid: UUID!, $content: String!) {
  updateBriefing(uuid: $uuid, input: {content: $content}) { uuid content }
}
"""

PUBLISH = """
mutation($uuid: UUID!) {
  publishBriefing(uuid: $uuid) { uuid status publishedAt }
}
"""

TAKE_DOWN = "mutation($uuid: UUID!) { takeDownBriefing(uuid: $uuid) { uuid status } }"

COPY = """
mutation($source: UUID!) {
  generateBriefing(input: {sourceBriefingUuid: $source}) { uuid content status }
}
"""

GET_BRIEFING = "query($uuid: UUID!) { briefing(uuid: $uuid) { uuid } }"

LIST_BY_STATUS = """
query($status: BriefingStatusFilter!) {
  briefings(status: $status) {
    uuid status creator { uuid name } updater { uuid name } publisher { uuid name }
  }
}
"""

UPDATE_BRIEFING = """
mutation($uuid: UUID!, $state: BriefingState) {
  updateBriefing(uuid: $uuid, input: {state: $state}) { uuid state }
}
"""

DELETE_BRIEFING = "mutation($uuid: UUID!) { deleteBriefing(uuid: $uuid) }"

LIST_TEMPLATES = """
query($state: BriefingState, $tag: String) {
  briefingTemplates(state: $state, tag: $tag) { uuid content state tags }
}
"""

LIST_BRIEFINGS = """
query($state: BriefingState, $tag: String) {
  briefings(state: $state, tag: $tag) { uuid templateUuid content state }
}
"""


async def _post(client, query, variables, token=None):
    headers = auth_header(token) if token else {}
    resp = await client.post("/graphql", json={"query": query, "variables": variables}, headers=headers)
    return resp.json()


async def _create_template(client, token, content, tags, state):
    body = await _post(client, CREATE_TEMPLATE, {"content": content, "tags": tags, "state": state}, token)
    assert "errors" not in body, body
    return body["data"]["createBriefingTemplate"]


@pytest.mark.asyncio
async def test_template_and_briefing_lifecycle(client, briefing_admin_auth):
    """Create a template, generate a briefing from it, update both, then delete both."""
    user_uuid, token = briefing_admin_auth

    t = await _create_template(client, token, "supply list", ["supply"], "IN_FIELD")
    assert t["tags"] == ["supply"]
    assert t["state"] == "in_field"
    assert t["creator"]["uuid"] == user_uuid

    # Generate a briefing seeded from the template
    gen = await _post(client, GENERATE, {"templateUuid": t["uuid"]}, token)
    assert "errors" not in gen, gen
    b = gen["data"]["generateBriefing"]
    assert b["status"] == "DRAFT"
    assert b["templateUuid"] == t["uuid"]
    assert b["content"] == "supply list"
    assert b["tags"] == ["supply"]
    assert b["state"] == "in_field"

    # Update template content; tags/state left unchanged
    upd_t = await _post(client, UPDATE_TEMPLATE, {"uuid": t["uuid"], "content": "new list"}, token)
    assert "errors" not in upd_t, upd_t
    assert upd_t["data"]["updateBriefingTemplate"]["content"] == "new list"
    assert upd_t["data"]["updateBriefingTemplate"]["state"] == "in_field"

    # Update briefing state
    upd_b = await _post(client, UPDATE_BRIEFING, {"uuid": b["uuid"], "state": "DEBRIEF"}, token)
    assert "errors" not in upd_b, upd_b
    assert upd_b["data"]["updateBriefing"]["state"] == "debrief"

    # Delete both
    del_b = await _post(client, DELETE_BRIEFING, {"uuid": b["uuid"]}, token)
    assert del_b["data"]["deleteBriefing"] is True
    del_t = await _post(client, DELETE_TEMPLATE, {"uuid": t["uuid"]}, token)
    assert del_t["data"]["deleteBriefingTemplate"] is True

    # Both gone from list queries
    lt = await _post(client, LIST_TEMPLATES, {}, token)
    assert t["uuid"] not in [x["uuid"] for x in lt["data"]["briefingTemplates"]]
    lb = await _post(client, LIST_BRIEFINGS, {}, token)
    assert b["uuid"] not in [x["uuid"] for x in lb["data"]["briefings"]]


@pytest.mark.asyncio
async def test_generate_ad_hoc_briefing(client, briefing_admin_auth):
    """A briefing can be generated without a template (templateUuid is null)."""
    _, token = briefing_admin_auth
    gen = await _post(client, GENERATE, {"templateUuid": None}, token)
    assert "errors" not in gen, gen
    assert gen["data"]["generateBriefing"]["templateUuid"] is None


@pytest.mark.asyncio
async def test_list_filters_by_state_and_tag(client, briefing_admin_auth):
    """Template list filters by state and by tag."""
    _, token = briefing_admin_auth
    a = await _create_template(client, token, "phaseA", ["medical"], "BRIEFING")
    b = await _create_template(client, token, "phaseB", ["logistics"], "DEBRIEF")

    by_state = await _post(client, LIST_TEMPLATES, {"state": "DEBRIEF"}, token)
    uuids = [x["uuid"] for x in by_state["data"]["briefingTemplates"]]
    assert b["uuid"] in uuids and a["uuid"] not in uuids

    by_tag = await _post(client, LIST_TEMPLATES, {"tag": "medical"}, token)
    uuids = [x["uuid"] for x in by_tag["data"]["briefingTemplates"]]
    assert a["uuid"] in uuids and b["uuid"] not in uuids


@pytest.mark.asyncio
async def test_generate_rejects_a_template_that_is_missing_or_deleted(client, briefing_admin_auth):
    """Both cases raise rather than silently producing an empty briefing / an FK violation."""
    _, token = briefing_admin_auth

    unknown = await _post(client, GENERATE, {"templateUuid": str(uuid.uuid4())}, token)
    assert "Briefing template not found" in str(unknown.get("errors"))

    t = await _create_template(client, token, "gone soon", [], "BRIEFING")
    await _post(client, DELETE_TEMPLATE, {"uuid": t["uuid"]}, token)
    deleted = await _post(client, GENERATE, {"templateUuid": t["uuid"]}, token)
    assert "Briefing template not found" in str(deleted.get("errors"))


@pytest.mark.asyncio
async def test_mutations_require_briefing_permission(client, login_user_auth):
    """A user without any pre_departure grant cannot create or generate."""
    _, token = login_user_auth
    created = await _post(
        client, CREATE_TEMPLATE, {"content": "nope", "tags": [], "state": "BRIEFING"}, token
    )
    assert created.get("errors")

    generated = await _post(client, GENERATE, {"templateUuid": None}, token)
    assert generated.get("errors")


@pytest.mark.asyncio
async def test_briefings_are_public_but_templates_are_not(client, login_user_auth):
    """pre_departure.view is a PUBLIC_PERM, so an account must not read *less* than a guest.

    Templates are the authoring surface and need pre_departure.publish, so they stay closed
    to both.
    """
    _, token = login_user_auth
    for caller in (None, token):
        listed = await _post(client, LIST_BRIEFINGS, {}, caller)
        assert "errors" not in listed, listed

        templates = await _post(client, LIST_TEMPLATES, {}, caller)
        assert templates.get("errors"), templates


def _row(body, uuid):
    assert "errors" not in body, body
    return next((x for x in body["data"]["briefings"] if x["uuid"] == uuid), None)


@pytest.mark.asyncio
async def test_draft_stays_private_until_published_then_freezes(client, redis, briefing_admin_auth):
    """A draft is editable and editor-only; publishing makes it public and read-only."""
    author_uuid, author_token = briefing_admin_auth
    editor_uuid, editor_token = await _create_user_with_role(redis, "Briefing Admin")
    gen = await _post(client, GENERATE_CONTENT, {"content": "v1"}, author_token)
    assert "errors" not in gen, gen
    uuid = gen["data"]["generateBriefing"]["uuid"]

    assert _row(await _post(client, LIST_BY_STATUS, {"status": "PUBLISHED"}), uuid) is None
    assert (await _post(client, GET_BRIEFING, {"uuid": uuid}))["data"]["briefing"] is None
    edited = await _post(client, UPDATE_CONTENT, {"uuid": uuid, "content": "v1 edited"}, editor_token)
    assert "errors" not in edited, edited

    draft = _row(await _post(client, LIST_BY_STATUS, {"status": "DRAFT"}, author_token), uuid)
    assert draft["status"] == "DRAFT" and draft["publisher"] is None
    assert draft["creator"]["uuid"] == author_uuid and draft["updater"]["uuid"] == editor_uuid

    pub = await _post(client, PUBLISH, {"uuid": uuid}, editor_token)
    assert "errors" not in pub, pub
    assert pub["data"]["publishBriefing"]["status"] == "PUBLISHED"
    assert pub["data"]["publishBriefing"]["publishedAt"]

    again = await _post(client, PUBLISH, {"uuid": uuid}, editor_token)
    assert "Only a draft can be published" in str(again.get("errors"))
    frozen = await _post(client, UPDATE_CONTENT, {"uuid": uuid, "content": "v2"}, author_token)
    assert "Only a draft can be edited" in str(frozen.get("errors"))

    admin_row = _row(await _post(client, LIST_BY_STATUS, {"status": "ALL"}, author_token), uuid)
    assert admin_row["publisher"]["uuid"] == editor_uuid and admin_row["publisher"]["name"]
    public_row = _row(await _post(client, LIST_BY_STATUS, {"status": "PUBLISHED"}), uuid)
    assert public_row["status"] == "PUBLISHED"
    assert public_row["creator"] is None and public_row["publisher"] is None
    assert (await _post(client, GET_BRIEFING, {"uuid": uuid}))["data"]["briefing"]["uuid"] == uuid


@pytest.mark.asyncio
async def test_draft_lists_and_publishing_need_editor_permissions(
    client, briefing_admin_auth, login_user_auth
):
    """Guests and plain accounts can list only published briefings and cannot publish."""
    _, admin_token = briefing_admin_auth
    _, user_token = login_user_auth
    gen = await _post(client, GENERATE_CONTENT, {"content": "draft"}, admin_token)
    uuid = gen["data"]["generateBriefing"]["uuid"]
    for caller in (None, user_token):
        for status in ("DRAFT", "ALL"):
            assert (await _post(client, LIST_BY_STATUS, {"status": status}, caller)).get("errors")
        assert (await _post(client, PUBLISH, {"uuid": uuid}, caller)).get("errors")


@pytest.mark.asyncio
async def test_edit_alone_drafts_but_cannot_publish_or_read_templates(client, redis, briefing_admin_auth):
    """Without .publish an editor can draft ad hoc, but can't publish, copy or edit a template."""
    _, admin_token = briefing_admin_auth
    _, editor = await _create_user_with_grants(redis, ((Perm.PREDEP_EDIT, "all"),))
    t = await _create_template(client, admin_token, "template body", [], "BRIEFING")

    seeded = await _post(client, GENERATE, {"templateUuid": t["uuid"]}, editor)
    assert seeded.get("errors") and "template body" not in str(seeded)
    touched = await _post(client, UPDATE_TEMPLATE, {"uuid": t["uuid"], "content": None}, editor)
    assert touched.get("errors") and "template body" not in str(touched)

    gen = await _post(client, GENERATE_CONTENT, {"content": "ad hoc"}, editor)
    assert "errors" not in gen, gen
    uuid = gen["data"]["generateBriefing"]["uuid"]
    assert (await _post(client, PUBLISH, {"uuid": uuid}, editor)).get("errors")


@pytest.mark.asyncio
async def test_publish_replaces_take_down_empties_and_a_copy_starts_a_draft(
    client, briefing_admin_auth, login_user_auth
):
    """Publishing v2 hides v1, taking v2 down leaves nothing public, and v2 is edited through a copy."""
    _, admin = briefing_admin_auth
    _, user = login_user_auth
    v1, v2 = [
        (await _post(client, GENERATE_CONTENT, {"content": c}, admin))["data"]["generateBriefing"]["uuid"]
        for c in ("v1", "v2")
    ]
    for version in (v1, v2):
        published = await _post(client, PUBLISH, {"uuid": version}, admin)
        assert "errors" not in published, published
    public = await _post(client, LIST_BY_STATUS, {"status": "PUBLISHED"})
    assert _row(public, v1) is None and _row(public, v2)["status"] == "PUBLISHED"

    for caller in (None, user):
        assert (await _post(client, TAKE_DOWN, {"uuid": v2}, caller)).get("errors")
    down = await _post(client, TAKE_DOWN, {"uuid": v2}, admin)
    assert down["data"]["takeDownBriefing"]["status"] == "INACTIVE"
    assert _row(await _post(client, LIST_BY_STATUS, {"status": "PUBLISHED"}), v2) is None
    for caller in (None, user):
        assert (await _post(client, GET_BRIEFING, {"uuid": v2}, caller))["data"]["briefing"] is None
    assert (await _post(client, GET_BRIEFING, {"uuid": v2}, admin))["data"]["briefing"]["uuid"] == v2
    again = await _post(client, TAKE_DOWN, {"uuid": v2}, admin)
    assert "Only a published briefing can be taken down" in str(again.get("errors"))
    edited = await _post(client, UPDATE_CONTENT, {"uuid": v2, "content": "v2 edited"}, admin)
    assert "Only a draft can be edited" in str(edited.get("errors"))

    copy = await _post(client, COPY, {"source": v2}, admin)
    assert "errors" not in copy, copy
    draft = copy["data"]["generateBriefing"]
    assert draft["uuid"] != v2 and (draft["status"], draft["content"]) == ("DRAFT", "v2")
    rows = await _post(client, LIST_BY_STATUS, {"status": "ALL"}, admin)
    assert _row(rows, v1)["status"] == _row(rows, v2)["status"] == "INACTIVE"
    from_draft = await _post(client, COPY, {"source": draft["uuid"]}, admin)
    assert "Only a published or inactive briefing can be copied" in str(from_draft.get("errors"))


@pytest.mark.asyncio
async def test_only_a_draft_can_be_deleted(client, briefing_admin_auth):
    """A live or taken-down version is the record of what was published, so deleting refuses it."""
    _, admin = briefing_admin_auth
    gen = await _post(client, GENERATE_CONTENT, {"content": "live"}, admin)
    uuid = gen["data"]["generateBriefing"]["uuid"]
    published = await _post(client, PUBLISH, {"uuid": uuid}, admin)
    assert "errors" not in published, published

    refused = await _post(client, DELETE_BRIEFING, {"uuid": uuid}, admin)
    assert "Only a draft can be deleted" in str(refused.get("errors"))
    assert _row(await _post(client, LIST_BY_STATUS, {"status": "PUBLISHED"}), uuid) is not None

    down = await _post(client, TAKE_DOWN, {"uuid": uuid}, admin)
    assert "errors" not in down, down
    refused = await _post(client, DELETE_BRIEFING, {"uuid": uuid}, admin)
    assert "Only a draft can be deleted" in str(refused.get("errors"))
    rows = await _post(client, LIST_BY_STATUS, {"status": "ALL"}, admin)
    assert _row(rows, uuid)["status"] == "INACTIVE"
