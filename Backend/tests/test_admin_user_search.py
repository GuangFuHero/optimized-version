"""Searching and filtering `GET /admin/users` (ADR-412, ADR-413).

`q` matches the nickname for every reader and the phone for those who read real names; the
phone is stored in E.164, so the frontend sends `+886…`. `platform_role` and `team_uuid` narrow
the list to holders of that grant. Rows carry `created_at`.
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
    db.add(
        UserRoleAssign(
            user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid if team else None, role_kind=kind
        )
    )


async def _names(client, db, redis, perms, **params) -> set[str]:
    """Nicknames the reader holding `perms` gets back, without the reader itself."""
    ids = await _reader(db, "reader", perms)
    await db.commit()
    response = await client.get(URL, params=params, headers=await auth_headers_for(redis, *ids))
    assert response.status_code == 200, response.text
    return {item["name"] for item in response.json()} - {"reader"}


@pytest.mark.asyncio
async def test_q_matches_part_of_the_nickname_ignoring_case(client, db_session, redis):
    """Any reader of the list searches nicknames."""
    await _person(db_session, "Ming 小明")
    await _person(db_session, "小華")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="ming") == {"Ming 小明"}


@pytest.mark.asyncio
async def test_a_super_admin_finds_a_person_by_part_of_their_phone(client, db_session, redis):
    """The frontend sends the stored E.164 form; part of it is enough."""
    await _person(db_session, "小明", phone="+886912345678")
    await _person(db_session, "小華", phone="+886987654321")

    assert await _names(client, db_session, redis, SUPER_ADMIN, q="+886912") == {"小明"}


@pytest.mark.asyncio
async def test_a_data_auditor_cannot_search_by_phone(client, db_session, redis):
    """Phones are read only by those who read real names (ADR-412), so they are not searchable either."""
    await _person(db_session, "小明", phone="+886912345678")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="+886912") == set()


@pytest.mark.asyncio
async def test_q_treats_like_wildcards_as_text(client, db_session, redis):
    """`%` and `_` are escaped, so `100%` does not match `1000`."""
    await _person(db_session, "100%志工")
    await _person(db_session, "1000志工")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="100%") == {"100%志工"}


@pytest.mark.asyncio
async def test_a_blank_q_filters_nothing(client, db_session, redis):
    """Whitespace alone is no search."""
    await _person(db_session, "小明")

    assert await _names(client, db_session, redis, DATA_AUDITOR, q="  ") == {"小明"}


@pytest.mark.asyncio
async def test_platform_role_keeps_its_holders(client, db_session, redis):
    """Only accounts holding that platform grant."""
    auditor = await _person(db_session, "稽核員")
    await _grant(db_session, auditor, "data_auditor")
    await _person(db_session, "小明")

    assert await _names(client, db_session, redis, DATA_AUDITOR, platform_role="data_auditor") == {"稽核員"}


@pytest.mark.asyncio
async def test_platform_role_ignores_a_team_role_of_the_same_name(client, db_session, redis):
    """`admin` is also a team role; the filter is about platform grants."""
    team = Team(name="甲隊", type="ngo", status="active")
    db_session.add(team)
    await db_session.flush()
    member = await _person(db_session, "隊員")
    await _grant(db_session, member, "admin", team=team)

    assert await _names(client, db_session, redis, DATA_AUDITOR, platform_role="admin") == set()


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
