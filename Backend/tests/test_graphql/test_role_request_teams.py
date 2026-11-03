"""The team directory the 申請成為後台人員 form picks from (Spec/026, `roleRequestTeams`).

An applicant is in no team yet, and `GET /admin/teams` lists only the caller's own, so the form
needs its own list: every active team, by name. Team holders and super admins also read each team's
contact there, so teams can find each other (ADR-357 point 5).
"""

import uuid
from datetime import UTC, datetime

import pytest

from app.core.identity import encode_act
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.repositories.session_repository import SessionRepository
from tests.conftest import ensure_role
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
@pytest.mark.parametrize("field", ["taxId", "status", "members"])
async def test_the_entry_has_nothing_beyond_uuid_name_type_and_contact(client, redis, field):
    """Tax ID, status and members stay behind team.view (ADR-357 point 5)."""
    token = await _plain_user_token(redis)
    query = "{ roleRequestTeams { uuid " + field + " } }"

    response = await client.post("/graphql", json={"query": query}, headers=auth_header(token))

    assert response.json()["errors"][0]["message"].startswith(f"Cannot query field '{field}'")


CONTACTS = "{ roleRequestTeams { uuid name contactName contactPhone } }"


async def _contact_team(**row) -> str:
    """One active team under a name of its own; its uuid."""
    teams = await _teams({"name": f"聯絡-{uuid.uuid4().hex[:8]}", "type": "ngo", **row})
    return next(iter(teams.values()))


async def _contact_teams() -> dict[str, tuple[str, str]]:
    """Two active teams with a contact each: their (contactName, contactPhone) by uuid."""
    return {
        await _contact_team(contact_name="王小明", contact_phone="0912345678"): ("王小明", "0912345678"),
        await _contact_team(type="gov", contact_name="李大華", contact_phone="0387654321"): (
            "李大華",
            "0387654321",
        ),
    }


async def _token(redis, *, platform: str, team_role: str | None = None, team_uuid: str | None = None) -> str:
    """A token acting as the platform role `platform`; the account may also hold `team_role` in a team.

    Acting as the platform role shows the contact depends on what the account holds, not on the identity it
    acts as.
    """
    async with graphql_db() as db:
        user = User(name=f"dir_{uuid.uuid4().hex[:8]}")
        db.add(user)
        platform_role = await ensure_role(db, platform)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=platform_role.uuid))
        if team_role is not None:
            role = await ensure_role(db, team_role, kind="team")
            db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_uuid))
        user_uuid, role_uuid = str(user.uuid), str(platform_role.uuid)
    act = encode_act(role_uuid, None)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test", act=act)
    return create_access_token(data={"sub": user_uuid}, sid=sid, act=act)


async def _contacts(client, token: str) -> dict[str, tuple[str | None, str | None]]:
    """Each listed team's (contactName, contactPhone), by uuid."""
    body = await _post_query(client, token, CONTACTS)
    assert "errors" not in body, body
    return {t["uuid"]: (t["contactName"], t["contactPhone"]) for t in body["data"]["roleRequestTeams"]}


async def _post_query(client, token: str | None, query: str) -> dict:
    headers = auth_header(token) if token else {}
    return (await client.post("/graphql", json={"query": query}, headers=headers)).json()


@pytest.mark.asyncio
@pytest.mark.parametrize("team_role", ["member", "admin"])
async def test_a_team_holder_reads_every_teams_contact(client, redis, team_role):
    """A member or admin of one team reads the contact of every active team, its own and the others."""
    others = await _contact_teams()
    own = await _contact_team(contact_name="陳隊長")
    token = await _token(redis, platform="plain-holder", team_role=team_role, team_uuid=own)

    contacts = await _contacts(client, token)

    assert {uuid_: contacts[uuid_] for uuid_ in others} == others
    assert contacts[own] == ("陳隊長", None)


@pytest.mark.asyncio
async def test_a_super_admin_reads_every_teams_contact(client, redis):
    """A super admin is in no team and still reads every contact."""
    teams = await _contact_teams()
    token = await _token(redis, platform="super_admin")

    contacts = await _contacts(client, token)

    assert {uuid_: contacts[uuid_] for uuid_ in teams} == teams


@pytest.mark.asyncio
@pytest.mark.parametrize("platform", ["plain-holder", "data_auditor"])
async def test_an_account_with_no_team_identity_reads_no_contact(client, redis, platform):
    """A signed-in applicant or a data auditor in no team still sees every team, but no contact."""
    teams = await _contact_teams()
    token = await _token(redis, platform=platform)

    contacts = await _contacts(client, token)

    assert set(teams) <= set(contacts)
    assert set(contacts.values()) == {(None, None)}


@pytest.mark.asyncio
async def test_a_suspended_teams_member_reads_no_contact(client, redis):
    """Suspension switches a team's grants off, so holding a role only there counts as no team identity."""
    teams = await _contact_teams()
    suspended = await _contact_team(status="suspended")
    token = await _token(redis, platform="plain-holder", team_role="member", team_uuid=suspended)

    contacts = await _contacts(client, token)

    assert set(teams) <= set(contacts)
    assert set(contacts.values()) == {(None, None)}


@pytest.mark.asyncio
async def test_a_guest_is_refused_the_contacts_too(client):
    """Asking for the contact does not open the list to signed-out callers."""
    body = await _post_query(client, None, CONTACTS)

    assert body["errors"][0]["message"].startswith("401")
