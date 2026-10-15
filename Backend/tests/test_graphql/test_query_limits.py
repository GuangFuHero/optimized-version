"""The schema refuses abusive documents and hides introspection outside development.

Every limit is a validation or parse error, raised before any resolver runs, so its message
reaches the client unmasked and names what was exceeded.
"""

import pytest

pytestmark = pytest.mark.asyncio


async def _post(client, query):
    resp = await client.post("/graphql", json={"query": query})
    return resp.json()


def _messages(body) -> list[str]:
    return [error["message"] for error in body.get("errors", [])]


def _aliases(count: int) -> str:
    return "{ " + " ".join(f"a{i}: __typename" for i in range(count)) + " }"


async def test_ten_aliases_are_allowed(client):
    """Ten aliases is the limit, not past it."""
    body = await _post(client, _aliases(10))
    assert "errors" not in body, body
    assert body["data"]["a9"] == "Query"


async def test_eleven_aliases_are_refused(client):
    """One alias past the limit fails the whole document, so 2,000 copies of a field cannot run."""
    body = await _post(client, _aliases(11))
    assert body.get("data") is None
    assert any("aliases" in message for message in _messages(body)), body


async def test_an_over_deep_query_is_refused(client):
    """Eleven nested selections exceed the depth limit of ten.

    No path in the schema nests that deep, so the fields below do not exist and validation
    reports that too; the depth limit is checked on the document's shape alone.
    """
    query = "query Deep { " + "a { " * 11 + "b" + " }" * 11 + " }"
    body = await _post(client, query)
    assert "'Deep' exceeds maximum operation depth of 10" in _messages(body), body


async def test_an_oversized_document_is_refused(client):
    """A document over 1,000 tokens is refused while it is still being parsed."""
    query = "{ " + " ".join("__typename" for _ in range(1000)) + " }"
    body = await _post(client, query)
    assert body.get("data") is None
    assert any("1000 tokens" in message for message in _messages(body)), body


async def test_introspection_is_refused_outside_development(client):
    """The test suite runs as ENV=testing, which must not hand out the schema."""
    body = await _post(client, "{ __schema { types { name } } }")
    assert body.get("data") is None
    assert any("introspection" in message for message in _messages(body)), body


async def test_typename_still_works_without_introspection(client):
    """`__typename` is not introspection, and clients rely on it."""
    body = await _post(client, "{ __typename }")
    assert body == {"data": {"__typename": "Query"}}
