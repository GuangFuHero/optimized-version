"""The team directory the 申請成為後台人員 form picks from (Spec/026, `roleRequestTeams`).

An applicant is in no team yet, and `GET /admin/teams` lists only the caller's own, so the form
needs its own list: every active team, by name. Team admins and super admins also read each team's
admins there, so admins of different teams can reach each other (ADR-357 point 5).
"""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import event

from app.core.identity import encode_act
from app.core.security import create_access_token
from app.db.session import engine as app_engine
from app.models.auth import User, UserContact
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
@pytest.mark.parametrize("field", ["taxId", "status", "members", "contactName", "contactPhone"])
async def test_the_entry_has_nothing_beyond_uuid_name_type_and_admins(client, redis, field):
    """Tax ID, status, members and the team's own contact stay behind team.view (ADR-357 point 5)."""
    token = await _plain_user_token(redis)
    query = "{ roleRequestTeams { uuid " + field + " } }"

    response = await client.post("/graphql", json={"query": query}, headers=auth_header(token))

    assert response.json()["errors"][0]["message"].startswith(f"Cannot query field '{field}'")


ADMINS = "{ roleRequestTeams { uuid admins { name phone email } } }"


def _phone() -> str:
    """A phone number no other test uses: contact values are unique across accounts."""
    return f"+8869{uuid.uuid4().int % 10**8:08d}"


def _email() -> str:
    """An email no other test uses."""
    return f"admin-{uuid.uuid4().hex[:12]}@example.test"


async def _team(**row) -> str:
    """One team, active unless `row` says otherwise, under a name of its own; its uuid."""
    teams = await _teams({"name": f"名錄-{uuid.uuid4().hex[:8]}", "type": "ngo", **row})
    return next(iter(teams.values()))


async def _team_with_admins(*admins: dict, **row) -> tuple[str, list[dict]]:
    """A team whose admins are new accounts shaped by `admins`; its uuid and the entries it should list.

    Each dict may give `name`, `real_name`, a verified `phone` and `email`, and an `unverified_email`.
    """
    team_uuid = await _team(**row)
    async with graphql_db() as db:
        role = await ensure_role(db, "admin", kind="team")
        for admin in admins:
            user = User(
                name=admin.get("name", f"acct_{uuid.uuid4().hex[:8]}"), real_name=admin.get("real_name")
            )
            db.add(user)
            await db.flush()
            db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_uuid))
            for kind in ("phone", "email"):
                if admin.get(kind):
                    db.add(UserContact(user_uuid=user.uuid, type=kind, value=admin[kind], verified=True))
            if admin.get("unverified_email"):
                db.add(
                    UserContact(
                        user_uuid=user.uuid, type="email", value=admin["unverified_email"], verified=False
                    )
                )
            admin["name"] = user.name
    listed = [
        {"name": a.get("real_name") or a["name"], "phone": a.get("phone"), "email": a.get("email")}
        for a in admins
    ]
    return team_uuid, sorted(listed, key=lambda entry: entry["name"])


async def _token(redis, *, platform: str, team_grants: tuple[tuple[str, str], ...] = ()) -> str:
    """A token acting as the platform role `platform`; the account also holds each (role, team uuid) given.

    Acting as the platform role shows the answer depends on what the account holds, not on the identity it
    acts as.
    """
    async with graphql_db() as db:
        user = User(name=f"dir_{uuid.uuid4().hex[:8]}")
        db.add(user)
        platform_role = await ensure_role(db, platform)
        await db.flush()
        db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=platform_role.uuid))
        for team_role, team_uuid in team_grants:
            role = await ensure_role(db, team_role, kind="team")
            db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_uuid))
        user_uuid, role_uuid = str(user.uuid), str(platform_role.uuid)
    act = encode_act(role_uuid, None)
    sid, _ = await SessionRepository(redis).create_session(user_uuid, "test", act=act)
    return create_access_token(data={"sub": user_uuid}, sid=sid, act=act)


async def _post_query(client, token: str | None, query: str) -> dict:
    headers = auth_header(token) if token else {}
    return (await client.post("/graphql", json={"query": query}, headers=headers)).json()


async def _admins(client, token: str) -> dict[str, list[dict] | None]:
    """Each listed team's `admins` by uuid, sorted by name so the database collation does not matter."""
    body = await _post_query(client, token, ADMINS)
    assert "errors" not in body, body
    return {
        team["uuid"]: None if team["admins"] is None else sorted(team["admins"], key=lambda a: a["name"])
        for team in body["data"]["roleRequestTeams"]
    }


async def _directory() -> dict[str, list[dict]]:
    """A team with two admins (one fully filled in, one with only an account name) and a team with none.

    The second admin's email was never verified, so it is not listed.
    """
    two, two_listed = await _team_with_admins(
        {"name": "帳號甲", "real_name": "王小明", "phone": _phone(), "email": _email()},
        {"name": "帳號乙", "phone": _phone(), "unverified_email": _email()},
    )
    none, none_listed = await _team_with_admins(type="gov")
    return {two: two_listed, none: none_listed}


@pytest.mark.asyncio
@pytest.mark.parametrize("own_type", ["gov", "ngo"])
async def test_a_team_admin_reads_every_teams_admins(client, redis, own_type):
    """A government or NGO team's admin reads the admins of every active team, not only their own."""
    expected = await _directory()
    own = await _team(type=own_type)
    token = await _token(redis, platform="plain-holder", team_grants=(("admin", own),))

    admins = await _admins(client, token)

    assert {uuid_: admins[uuid_] for uuid_ in expected} == expected
    assert len(admins[own]) == 1


@pytest.mark.asyncio
async def test_a_super_admin_reads_every_teams_admins(client, redis):
    """A super admin is in no team and still reads every team's admins."""
    expected = await _directory()
    token = await _token(redis, platform="super_admin")

    admins = await _admins(client, token)

    assert {uuid_: admins[uuid_] for uuid_ in expected} == expected
    assert all(entry is not None for entry in admins.values())


@pytest.mark.asyncio
async def test_each_admin_is_listed_with_verified_contacts_and_a_name(client, redis):
    """Both admins are listed; no real name shows the account name, and an unverified email is null."""
    phone, email = _phone(), _email()
    team, _ = await _team_with_admins(
        {"name": "帳號甲", "real_name": "王小明", "phone": phone, "email": email},
        {"name": "帳號乙", "unverified_email": _email()},
    )
    token = await _token(redis, platform="super_admin")

    admins = (await _admins(client, token))[team]

    assert admins == [
        {"name": "帳號乙", "phone": None, "email": None},
        {"name": "王小明", "phone": phone, "email": email},
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "caller",
    [
        "member of an active team",
        "data auditor",
        "applicant in no team",
        "admin of a suspended team only",
        "admin of a deleted team only",
        "admin of a suspended team and member of an active one",
    ],
)
async def test_anyone_else_reads_no_admins(client, redis, caller):
    """Members, data auditors, applicants and admins of a team that is off get null for every team."""
    expected = await _directory()
    grants = {
        "member of an active team": (("member", await _team()),),
        "data auditor": (),
        "applicant in no team": (),
        "admin of a suspended team only": (("admin", await _team(status="suspended")),),
        "admin of a deleted team only": (("admin", await _team(delete_at=datetime.now(UTC))),),
        "admin of a suspended team and member of an active one": (
            ("admin", await _team(status="suspended")),
            ("member", await _team()),
        ),
    }[caller]
    platform = "data_auditor" if caller == "data auditor" else "plain-holder"
    token = await _token(redis, platform=platform, team_grants=grants)

    admins = await _admins(client, token)

    assert set(expected) <= set(admins)
    assert set(map(type, admins.values())) == {type(None)}


@pytest.mark.asyncio
async def test_the_query_count_does_not_grow_with_the_teams(client, redis):
    """Every team's admins come in one query, however many teams there are."""
    await _directory()
    token = await _token(redis, platform="super_admin")

    async def statements() -> int:
        seen = []

        def on_execute(conn, cursor, statement, params, context, executemany):
            seen.append(statement)

        event.listen(app_engine.sync_engine, "before_cursor_execute", on_execute)
        try:
            await _admins(client, token)
        finally:
            event.remove(app_engine.sync_engine, "before_cursor_execute", on_execute)
        return len(seen)

    before = await statements()
    for _ in range(3):
        await _team_with_admins({"phone": _phone(), "email": _email()}, {"real_name": "副管理員"})

    assert await statements() == before


@pytest.mark.asyncio
async def test_a_guest_is_refused_the_admins_too(client):
    """Asking for the admins does not open the list to signed-out callers."""
    body = await _post_query(client, None, ADMINS)

    assert body["errors"][0]["message"].startswith("401")
