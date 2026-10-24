"""The team directory the 申請成為後台人員 form picks from (Spec/026, `roleRequestTeams`).

An applicant is in no team yet, and `GET /admin/teams` lists only the caller's own, so the form
needs its own list: every active team, by name, with nothing beyond what the picker shows.
"""

import uuid
from datetime import UTC, datetime

import pytest

from app.models.rbac import Role
from app.models.team import Team
from tests.test_graphql.conftest import _create_user_with_role, auth_header
from tests.test_graphql.conftest import test_db as graphql_db  # renamed so pytest does not collect it

TEAMS = """
query($type: RoleRequestTeamType) { roleRequestTeams(type: $type) { uuid name type } }
"""


async def _teams(*rows: dict) -> dict[str, str]:
    """Create teams; return their uuids by name."""
    async with graphql_db() as db:
        teams = [Team(**{"status": "active", **row}) for row in rows]
        db.add_all(teams)
        await db.flush()
        return {team.name: str(team.uuid) for team in teams}


async def _plain_user_token(redis) -> str:
    """A token for an account holding only a platform role with no capabilities at all.

    The role gets a name of its own: other GraphQL tests share the `user` role and grant it
    role_request.add only when they create it, so creating a bare `user` here would take that away.
    """
    name = f"plain-{uuid.uuid4().hex[:8]}"
    async with graphql_db() as db:
        db.add(Role(name=name, kind="platform"))
    _, token = await _create_user_with_role(redis, name)
    return token


async def _post(client, token: str | None, variables: dict | None = None) -> dict:
    headers = auth_header(token) if token else {}
    response = await client.post("/graphql", json={"query": TEAMS, "variables": variables}, headers=headers)
    return response.json()


def _names(body: dict) -> list[str]:
    assert "errors" not in body, body
    return [team["name"] for team in body["data"]["roleRequestTeams"]]


@pytest.mark.asyncio
async def test_signed_out_callers_are_refused(client):
    """The list names organisations working on the platform; it is for signed-in applicants."""
    body = await _post(client, None)

    assert body["errors"][0]["message"].startswith("401")


@pytest.mark.asyncio
async def test_a_plain_user_sees_every_active_team_by_name(client, redis):
    """No capability is needed: someone with no team is exactly who reads this."""
    await _teams({"name": "花蓮縣政府", "type": "gov"}, {"name": "光復互助協會", "type": "ngo"})
    token = await _plain_user_token(redis)

    names = _names(await _post(client, token))

    assert names == sorted(names)
    assert {"花蓮縣政府", "光復互助協會"} <= set(names)


@pytest.mark.asyncio
async def test_suspended_and_deleted_teams_are_left_out(client, redis):
    """Only a team someone can still join is offered (ADR-352 point 2, ADR-357)."""
    await _teams(
        {"name": "啟用隊", "type": "ngo"},
        {"name": "停用隊", "type": "ngo", "status": "suspended"},
        {"name": "刪除隊", "type": "ngo", "delete_at": datetime.now(UTC)},
    )
    token = await _plain_user_token(redis)

    names = set(_names(await _post(client, token)))

    assert "啟用隊" in names
    assert names.isdisjoint({"停用隊", "刪除隊"})


@pytest.mark.asyncio
async def test_type_narrows_the_list(client, redis):
    """政府單位人員 picks among government teams, 社福團體人員 among NGOs."""
    await _teams({"name": "某公所", "type": "gov"}, {"name": "某協會", "type": "ngo"})
    token = await _plain_user_token(redis)

    gov = await _post(client, token, {"type": "GOV"})

    assert "errors" not in gov, gov
    assert {team["type"] for team in gov["data"]["roleRequestTeams"]} == {"GOV"}
    assert "某公所" in _names(gov)
    assert "某協會" not in _names(gov)


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["taxId", "contactName", "contactPhone", "status", "members"])
async def test_the_entry_has_nothing_beyond_uuid_name_and_type(client, redis, field):
    """Tax ID, contact and members stay behind team.view (ADR-357 point 5)."""
    token = await _plain_user_token(redis)
    query = "{ roleRequestTeams { uuid " + field + " } }"

    response = await client.post("/graphql", json={"query": query}, headers=auth_header(token))

    assert response.json()["errors"][0]["message"].startswith(f"Cannot query field '{field}'")
