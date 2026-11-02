"""Searching and filtering `GET /admin/users` (ADR-412, ADR-413, ADR-432).

`q` matches the nickname only, never a phone, email or real name. `platform_role` is one of the five
the 平台角色 column shows; `team_uuid` narrows to holders of a role in that team. Rows carry `created_at`.
"""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User, UserContact
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from tests.conftest import auth_headers_for
from tests.test_real_name_visibility import _reader

URL = "/api/v1/admin/users"
SUPER_ADMIN = (Perm.USER_VIEW, Perm.ROLE_REQUEST_REVIEW)
DATA_AUDITOR = (Perm.USER_VIEW,)


async def _person(db, name: str, phone: str | None = None) -> User:
    user = User(name=name)
    db.add(user)
    await db.flush()
    if phone is not None:
        db.add(UserContact(user_uuid=user.uuid, type="phone", value=phone, verified=True))
    return user


async def _grant(db, user: User, role_name: str, *, team: Team | None = None) -> None:
    kind = "team" if team else "platform"
    role = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one_or_none()
    if role is None:
        role = Role(name=role_name, kind=kind)
        db.add(role)
        await db.flush()
    assert role.kind == kind, f"seeded {role_name} is {role.kind}"
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid if team else None))


async def _names(client, db, redis, perms, **params) -> set[str]:
    """Nicknames the reader holding `perms` gets back, without the reader itself."""
    ids = await _reader(db, "reader", perms)
    await db.commit()
    return await _listed(client, await auth_headers_for(redis, *ids), **params)


async def _listed(client, headers, **params) -> set[str]:
    response = await client.get(URL, params=params, headers=headers)
    assert response.status_code == 200, response.text
    return {item["name"] for item in response.json()} - {"reader"}


async def _auditor_headers(db, redis) -> dict:
    ids = await _reader(db, "reader", DATA_AUDITOR)
    await db.commit()
    return await auth_headers_for(redis, *ids)


@pytest.mark.asyncio
async def test_q_matches_part_of_the_nickname_ignoring_case(client, db_session, redis):
    """Any reader of the list searches nicknames."""
    await _person(db_session, "Ming 小明")
    await _person(db_session, "小華")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="ming") == {"Ming 小明"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("contact", "q"),
    [("phone", "+886912"), ("email", "ming@example"), ("real_name", "王大明")],
)
async def test_q_never_matches_personal_details(client, db_session, redis, contact, q):
    """Not even for a super admin: a search on them answers whose number or address it is (ADR-412)."""
    person = await _person(db_session, "小明")
    if contact == "real_name":
        person.real_name = "王大明"
    else:
        value = "+886912345678" if contact == "phone" else "ming@example.com"
        db_session.add(UserContact(user_uuid=person.uuid, type=contact, value=value, verified=True))

    assert await _names(client, db_session, redis, SUPER_ADMIN, q=q) == set()


@pytest.mark.asyncio
async def test_q_treats_like_wildcards_as_text(client, db_session, redis):
    """`%` and `_` are escaped, so `100%` does not match `1000`."""
    await _person(db_session, "100%志工")
    await _person(db_session, "1000志工")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="100%") == {"100%志工"}


@pytest.mark.asyncio
async def test_q_folds_full_and_half_width(client, db_session, redis):
    """ADR-432: zh-TW input methods type full-width letters and digits easily; both widths match."""
    await _person(db_session, "Ｍｉｎｇ１號")
    await _person(db_session, "Ming2號")
    headers = await _auditor_headers(db_session, redis)

    assert await _listed(client, headers, q="ming1") == {"Ｍｉｎｇ１號"}
    assert await _listed(client, headers, q="ＭＩＮＧ２") == {"Ming2號"}


@pytest.mark.asyncio
@pytest.mark.parametrize("q", ["\x00", "小\x00明"])
async def test_a_nul_in_q_is_refused_not_a_server_error(client, db_session, redis, q):
    """Postgres refuses NUL in text; the parameter turns it away first, as a 422 (ADR-432)."""
    headers = await _auditor_headers(db_session, redis)

    response = await client.get(URL, params={"q": q}, headers=headers)

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("params", [{"skip": -1}, {"limit": 0}, {"limit": -5}])
async def test_a_negative_page_is_refused_not_a_server_error(client, db_session, redis, params):
    """`skip` below 0 or `limit` below 1 used to reach Postgres and answer 500 (ADR-432)."""
    headers = await _auditor_headers(db_session, redis)

    response = await client.get(URL, params=params, headers=headers)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_a_blank_q_filters_nothing(client, db_session, redis):
    """Whitespace alone is no search."""
    await _person(db_session, "小明")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="  ") == {"小明"}


@pytest.mark.asyncio
async def test_platform_role_keeps_its_holders(client, db_session, redis):
    """Only accounts holding that platform grant."""
    auditor = await _person(db_session, "稽核員")
    await _grant(db_session, auditor, "user")
    await _grant(db_session, auditor, "data_auditor")
    await _grant(db_session, await _person(db_session, "小明"), "user")

    assert await _names(client, db_session, redis, DATA_AUDITOR, platform_role="data_auditor") == {"稽核員"}


@pytest.mark.asyncio
async def test_platform_role_user_means_nothing_more_than_user(client, db_session, redis):
    """Everyone holds `user` (ADR-294), so it filters as the column shows it.

    That is: those with no other platform role.
    """
    auditor = await _person(db_session, "稽核員")
    await _grant(db_session, auditor, "user")
    await _grant(db_session, auditor, "data_auditor")
    await _grant(db_session, await _person(db_session, "小明"), "user")

    assert await _names(client, db_session, redis, DATA_AUDITOR, platform_role="user") == {"小明"}


async def _five_kinds(db) -> None:
    """One account per 平台角色, plus ones that also qualify for a later kind, to pin the order."""
    gov = Team(name="鄉公所", type="gov", status="active")
    ngo = Team(name="救援隊", type="ngo", status="active")
    db.add_all([gov, ngo])
    await db.flush()
    people = {
        # name: (platform roles besides `user`, teams)
        "超管兼稽核在公所": (["super_admin", "data_auditor"], [gov]),
        "稽核在公所": (["data_auditor"], [gov]),
        "公所兼民間": ([], [gov, ngo]),
        "民間隊員": ([], [ngo]),
        "一般人": ([], []),
    }
    for name, (platform, teams) in people.items():
        person = await _person(db, name)
        await _grant(db, person, "user")
        for role in platform:
            await _grant(db, person, role)
        for team in teams:
            await _grant(db, person, "member", team=team)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("key", "expected"),
    [
        ("super_admin", {"超管兼稽核在公所"}),
        ("data_auditor", {"稽核在公所"}),
        ("gov", {"公所兼民間"}),
        ("ngo", {"民間隊員"}),
        ("user", {"一般人"}),
    ],
)
async def test_platform_role_is_the_first_kind_that_applies(client, db_session, redis, key, expected):
    """ADR-432, as #146's `platformOf()`: super_admin > data_auditor > gov > ngo > user."""
    await _five_kinds(db_session)

    assert await _names(client, db_session, redis, DATA_AUDITOR, platform_role=key) == expected


@pytest.mark.asyncio
async def test_each_account_falls_in_exactly_one_kind(client, db_session, redis):
    """The five filters split the seeded kinds without overlap."""
    await _five_kinds(db_session)
    headers = await _auditor_headers(db_session, redis)

    seen = [
        await _listed(client, headers, platform_role=key)
        for key in ("super_admin", "data_auditor", "gov", "ngo", "user")
    ]

    assert sum(len(names) for names in seen) == len(set().union(*seen)) == 5


@pytest.mark.asyncio
async def test_a_team_admin_is_not_a_platform_kind(client, db_session, redis):
    """`admin` is a team role, not one of the five: refused rather than matched by name (ADR-432)."""
    headers = await _auditor_headers(db_session, redis)

    response = await client.get(URL, params={"platform_role": "admin"}, headers=headers)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_team_uuid_keeps_its_members(client, db_session, redis):
    """Any role in the team counts."""
    team = Team(name="甲隊", type="ngo", status="active")
    other = Team(name="乙隊", type="ngo", status="active")
    db_session.add_all([team, other])
    await db_session.flush()
    await _grant(db_session, await _person(db_session, "甲隊員"), "member", team=team)
    await _grant(db_session, await _person(db_session, "乙隊員"), "member", team=other)

    assert await _names(client, db_session, redis, DATA_AUDITOR, team_uuid=str(team.uuid)) == {"甲隊員"}


@pytest.mark.asyncio
async def test_filters_combine(client, db_session, redis):
    """Every given filter applies."""
    team = Team(name="甲隊", type="ngo", status="active")
    db_session.add(team)
    await db_session.flush()
    await _grant(db_session, await _person(db_session, "小明"), "member", team=team)
    await _grant(db_session, await _person(db_session, "小華"), "member", team=team)

    names = await _names(client, db_session, redis, DATA_AUDITOR, q="明", team_uuid=str(team.uuid))

    assert names == {"小明"}


@pytest.mark.asyncio
async def test_each_row_carries_when_the_account_was_created(client, db_session, redis):
    """`created_at` is the 加入時間 the frontend shows (ADR-413)."""
    await _person(db_session, "小明")
    ids = await _reader(db_session, "reader", DATA_AUDITOR)
    await db_session.commit()

    response = await client.get(URL, headers=await auth_headers_for(redis, *ids))

    assert all(item["created_at"] for item in response.json())


def test_created_at_is_always_in_the_contract():
    """`users.created_at` is never null, so the contract says it is always there (ADR-432)."""
    from app.main import app

    schema = app.openapi()["components"]["schemas"]["AdminUserListItem"]

    assert "created_at" in schema["required"]
