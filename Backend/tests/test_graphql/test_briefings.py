"""GraphQL integration tests for briefing templates and briefings.

Tests drive the ASGI app in-process via httpx. They use the shared seeded test DB, so each
test filters results to the UUIDs it created rather than assuming a clean table.
"""

import pytest

from tests.test_graphql.conftest import auth_header

CREATE_TEMPLATE = """
mutation($content: String!, $tags: [String!]!, $state: BriefingState!) {
  createBriefingTemplate(input: {content: $content, tags: $tags, state: $state}) {
    uuid content tags state createdBy
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
    uuid templateUuid content tags state
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
    resp = await client.post(
        "/graphql", json={"query": query, "variables": variables}, headers=headers
    )
    return resp.json()


async def _create_template(client, token, content, tags, state):
    body = await _post(
        client, CREATE_TEMPLATE, {"content": content, "tags": tags, "state": state}, token
    )
    assert "errors" not in body, body
    return body["data"]["createBriefingTemplate"]


@pytest.mark.asyncio
async def test_template_and_briefing_lifecycle(client, briefing_admin_auth):
    """Create a template, generate a briefing from it, update both, then delete both."""
    user_uuid, token = briefing_admin_auth

    t = await _create_template(client, token, "supply list", ["supply"], "IN_FIELD")
    assert t["tags"] == ["supply"]
    assert t["state"] == "in_field"
    assert t["createdBy"] == user_uuid

    # Generate a briefing seeded from the template
    gen = await _post(client, GENERATE, {"templateUuid": t["uuid"]}, token)
    assert "errors" not in gen, gen
    b = gen["data"]["generateBriefing"]
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
async def test_mutations_require_briefing_permission(client, login_user_auth):
    """A user without the briefing resource cannot create, generate, or read briefings."""
    _, token = login_user_auth
    created = await _post(
        client, CREATE_TEMPLATE, {"content": "nope", "tags": [], "state": "BRIEFING"}, token
    )
    assert created.get("errors")

    generated = await _post(client, GENERATE, {"templateUuid": None}, token)
    assert generated.get("errors")

    listed = await _post(client, LIST_TEMPLATES, {}, token)
    assert listed.get("errors")
