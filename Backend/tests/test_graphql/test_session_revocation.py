"""The GraphQL path enforces the session check too (feature 014, ADR-102).

`app/graphql/context.py` calls `get_current_user` directly rather than through FastAPI's
dependency injection, so it has to supply redis itself. Miss that and revocation covers
REST only — leaving the interface most of this backend's data flows through still honouring
tokens that were signed out minutes ago.
"""

import uuid as uuid_mod

import pytest

from app.models.auth import User
from app.repositories.session_repository import SessionRepository
from tests.conftest import token_for

# `test_db` is aliased on import: pytest collects any module-level name starting with
# `test_`, and importing it unaliased adds a no-op "test" to the run (three other files
# in this package already do that).
from tests.test_graphql.conftest import auth_header
from tests.test_graphql.conftest import test_db as _test_db

pytestmark = pytest.mark.asyncio

TYPENAME = {"query": "{ __typename }"}


async def _user_with_token(redis) -> tuple[str, str]:
    """A bare user plus a token backed by a live session."""
    async with _test_db() as db:
        user = User(name=f"revoked_{uuid_mod.uuid4().hex[:8]}")
        db.add(user)
        await db.flush()
        return str(user.uuid), await token_for(redis, user.uuid)


async def test_a_revoked_session_is_refused_on_graphql(client, redis):
    """Same token, before and after the session goes: 200 then 401."""
    user_uuid, token = await _user_with_token(redis)
    assert (await client.post("/graphql", json=TYPENAME, headers=auth_header(token))).status_code == 200

    await SessionRepository(redis).revoke_all_for_user(user_uuid)

    res = await client.post("/graphql", json=TYPENAME, headers=auth_header(token))
    assert res.status_code == 401, res.text


async def test_an_anonymous_graphql_request_is_untouched(client, redis):
    """Guests carry no token and so have no session to check (ADR-025) — still served."""
    res = await client.post("/graphql", json=TYPENAME)

    assert res.status_code == 200, res.text
    assert res.json()["data"]["__typename"] == "Query"
