"""GraphQL surface of 請求協助 (spec note/help-request-spec.md, D1).

The rules — what is filed, what is refused — are pinned at the service layer in
tests/test_help_request.py; these only prove the mutation is wired to them.
"""

import pytest

from tests.test_graphql.conftest import _create_user_with_role, auth_header

FILE = """
mutation($input: CreateHelpRequestInput!) {
  createHelpRequest(input: $input) {
    title priority contactName contactPhone
    secondaryLocation { landmarkNote floor room }
    tasks { taskName taskType quantity }
  }
}
"""


def _input(**overrides) -> dict:
    return {
        "title": "一樓客廳積泥需要幫忙清",
        "geometry": {"type": "Point", "coordinates": [121.4235, 23.6725]},
        "contactName": "王阿嬤",
        "contactPhone": "0912345678",
        "secondaryLocation": {"landmarkNote": "花蓮縣光復鄉中山路100號", "floor": "1", "room": "2"},
        "tasks": [{"taskType": "hr", "taskName": "清淤人力", "quantity": 3}],
        **overrides,
    }


@pytest.mark.asyncio
async def test_a_citizen_files_a_help_request_through_graphql(client, redis):
    """The filed ticket comes back with its needs, and the requester sees their own contact."""
    _, token = await _create_user_with_role(redis, "Login User")

    res = await client.post(
        "/graphql", json={"query": FILE, "variables": {"input": _input()}}, headers=auth_header(token)
    )

    assert "errors" not in res.json(), res.json()
    assert res.json()["data"]["createHelpRequest"] == {
        "title": "一樓客廳積泥需要幫忙清",
        "priority": "medium",
        "contactName": "王阿嬤",
        "contactPhone": "0912345678",
        "secondaryLocation": {"landmarkNote": "花蓮縣光復鄉中山路100號", "floor": "1", "room": "2"},
        "tasks": [{"taskName": "清淤人力", "taskType": "hr", "quantity": 3}],
    }


@pytest.mark.asyncio
async def test_a_guest_cannot_file_a_help_request(client):
    """Sign-in first: the site shows a guest why before any form (spec Q5)."""
    res = await client.post("/graphql", json={"query": FILE, "variables": {"input": _input()}})

    assert [e["message"] for e in res.json()["errors"]] == ["401: Could not validate credentials"]


@pytest.mark.asyncio
async def test_a_refused_request_says_why(client, redis):
    """The service's reason reaches the client as written; the site translates it."""
    _, token = await _create_user_with_role(redis, "Login User")

    res = await client.post(
        "/graphql",
        json={"query": FILE, "variables": {"input": _input(tasks=[])}},
        headers=auth_header(token),
    )

    assert [e["message"] for e in res.json()["errors"]] == ["At least one task is required"]


@pytest.mark.asyncio
async def test_the_needs_come_back_in_the_order_they_were_listed(client, redis):
    """「第 1 件、第 2 件…」 stays in that order.

    Filed in one transaction the needs share one `now()`, and the loader breaks the tie on
    uuid — random. Five needs, so the old code passing by luck is a 1-in-120 chance.
    """
    _, token = await _create_user_with_role(redis, "Login User")
    names = ["清淤人力", "搬運家具", "送餐", "修屋頂", "接送就醫"]

    res = await client.post(
        "/graphql",
        json={
            "query": FILE,
            "variables": {"input": _input(tasks=[{"taskType": "hr", "taskName": n} for n in names])},
        },
        headers=auth_header(token),
    )

    assert "errors" not in res.json(), res.json()
    assert [t["taskName"] for t in res.json()["data"]["createHelpRequest"]["tasks"]] == names
