"""A revoked identity moves the session to the default identity instead of signing out (Spec 029).

ADR-402/404 on the request path, ADR-403 on the refresh. The account here is `user` plus `member` of
甲隊 and 乙隊, signed in as 甲隊's member; each test takes that identity away the way one of the five
operations does — they all end in the same place: the grant no longer resolves.
"""

import uuid

import pytest
import pytest_asyncio
from redis.exceptions import RedisError
from sqlalchemy import delete, select, update

from app.core import auth_cookies
from app.core.config import settings
from app.core.identity import encode_act
from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from app.repositories.session_repository import SessionRepository
from tests.conftest import auth_headers_for
from tests.cookies import cookie_header, cookies_set_by

pytestmark = pytest.mark.asyncio

SITE = "https://site.test"
ME = "/api/v1/users/me"
BROWSER_REFRESH = "/api/v1/auth/session/refresh"
BEARER_REFRESH = "/api/v1/auth/refresh"
BACK_OFFICE = {"X-WG-Realm": "admin"}


@pytest.fixture(autouse=True)
def _site_is_allowed(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_ALLOWED_ORIGINS", SITE)


async def _role(db, name: str, kind: str) -> uuid.UUID:
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is None:
        role = Role(name=name, kind=kind)
        db.add(role)
        await db.flush()
    return role.uuid


class Member:
    """An account on 甲隊's `member` identity, with a live session, a token and a refresh token."""

    async def build(self, db, redis) -> "Member":
        """Arrange the account and its session."""
        self.user_role = await _role(db, "user", "platform")
        self.member_role = await _role(db, "member", "team")
        self.team_a, self.team_b = Team(name="甲隊", type="ngo"), Team(name="乙隊", type="ngo")
        db.add_all([self.team_a, self.team_b])
        account = User(name="小明")
        db.add(account)
        await db.flush()
        self.user_uuid = str(account.uuid)
        self.a, self.b = self.team_a.uuid, self.team_b.uuid
        for role, team in ((self.user_role, None), (self.member_role, self.a), (self.member_role, self.b)):
            db.add(UserRoleAssign(user_uuid=account.uuid, role_uuid=role, team_uuid=team))
        await db.commit()
        self.act = encode_act(str(self.member_role), str(self.a))
        self.default_act = encode_act(str(self.user_role), None)
        self.repo = SessionRepository(redis)
        self.sid, self.refresh = await self.repo.create_session(self.user_uuid, "test", act=self.act)
        self.token = create_access_token({"sub": self.user_uuid}, sid=self.sid, act=self.act)
        return self

    @property
    def bearer(self) -> dict:
        """Headers sending the token as Bearer."""
        return {"Authorization": f"Bearer {self.token}"}

    @property
    def cookies(self) -> dict:
        """Headers sending both sign-in cookies, as a browser does."""
        return cookie_header(
            **{
                auth_cookies.access_cookie_name(): self.token,
                auth_cookies.refresh_cookie_name(): self.refresh,
            }
        )

    async def session_act(self) -> str | None:
        """The identity the session record acts as now."""
        return (await self.repo.get_session(self.sid))["act"]


@pytest_asyncio.fixture
async def member(db_session, redis) -> Member:
    """The account, built fresh per test."""
    return await Member().build(db_session, redis)


async def _suspend_team_a(db, member: Member) -> None:
    await db.execute(update(Team).where(Team.uuid == member.a).values(status="suspended"))
    await db.commit()


async def _remove_from_team_a(db, member: Member) -> None:
    await db.execute(
        delete(UserRoleAssign).where(
            UserRoleAssign.user_uuid == member.user_uuid, UserRoleAssign.team_uuid == member.a
        )
    )
    await db.commit()


def _assert_reset(response, role: str | None, team: str | None) -> None:
    assert response.status_code == 401, response.text
    body = response.json()
    assert body["code"] == "identity_reset"
    assert body["revoked_identity"] == {"role": role, "team": team}
    assert response.headers["www-authenticate"] == "Bearer"


# --- the request path (ADR-402, ADR-404) ---------------------------------------------------------


@pytest.mark.parametrize("take_away", [_suspend_team_a, _remove_from_team_a], ids=["suspended", "removed"])
async def test_the_next_request_answers_identity_reset_and_moves_the_session(
    client, db_session, member, take_away
):
    """Not signed out: the session now acts as the default identity, and the response says what went."""
    await take_away(db_session, member)

    response = await client.get(ME, headers=member.bearer)

    _assert_reset(response, "member", "甲隊")
    assert await member.session_act() == member.default_act


async def test_the_cookies_are_kept(client, db_session, member):
    """The refresh that follows needs them."""
    await _suspend_team_a(db_session, member)

    response = await client.get(ME, headers=member.cookies)

    _assert_reset(response, "member", "甲隊")
    assert cookies_set_by(response) == {}


async def test_a_deleted_role_leaves_its_name_out(client, db_session, member):
    """`DELETE /rbac/roles/{uuid}` takes the name with it; the team is still named."""
    temp = Role(name="臨時", kind="team")
    db_session.add(temp)
    await db_session.flush()
    temp_uuid = temp.uuid
    db_session.add(UserRoleAssign(user_uuid=member.user_uuid, role_uuid=temp_uuid, team_uuid=member.a))
    await db_session.commit()
    act = encode_act(str(temp_uuid), str(member.a))
    await member.repo.set_identity(member.sid, act)
    token = create_access_token({"sub": member.user_uuid}, sid=member.sid, act=act)
    await db_session.execute(delete(UserRoleAssign).where(UserRoleAssign.role_uuid == temp_uuid))
    await db_session.execute(delete(Role).where(Role.uuid == temp_uuid))
    await db_session.commit()

    response = await client.get(ME, headers={"Authorization": f"Bearer {token}"})

    _assert_reset(response, None, "甲隊")


async def test_it_is_said_once_then_the_old_token_is_only_stale(client, db_session, member):
    """Other tabs holding the same token refresh as usual: the session moved on."""
    await _suspend_team_a(db_session, member)
    await client.get(ME, headers=member.bearer)

    response = await client.get(ME, headers=member.bearer)

    assert response.status_code == 401
    assert response.json()["code"] == "access_token_stale"


async def test_the_request_is_not_carried_out(client, db_session, member):
    """Nothing is done under another identity than the one the user meant (ADR-402)."""
    await _suspend_team_a(db_session, member)

    response = await client.patch(ME, json={"name": "改名了"}, headers=member.bearer)

    assert response.json()["code"] == "identity_reset"
    name = await db_session.scalar(select(User.name).where(User.uuid == member.user_uuid))
    assert name == "小明"


async def test_the_back_office_lands_on_the_other_team(client, db_session, member):
    """After the refresh the session is on `user`, which the back office turns into 乙隊's member."""
    await _suspend_team_a(db_session, member)
    await client.get(ME, headers=member.cookies)

    refreshed = await client.post(BROWSER_REFRESH, headers={**member.cookies, "Origin": SITE})
    assert refreshed.status_code == 204, refreshed.text
    access = cookies_set_by(refreshed)[auth_cookies.access_cookie_name()]["value"]

    response = await client.get(ME, headers={"Authorization": f"Bearer {access}", **BACK_OFFICE})

    identity = response.json()["active_identity"]
    assert (identity["role"], identity["team"]) == ("member", "乙隊")


# --- the refresh path (ADR-403) --------------------------------------------------------------


async def test_a_browser_refresh_first_answers_identity_reset_then_refreshes(client, db_session, member):
    """The first refresh says what went and rotates nothing; the same cookie then refreshes."""
    await _suspend_team_a(db_session, member)
    headers = {**member.cookies, "Origin": SITE}

    first = await client.post(BROWSER_REFRESH, headers=headers)

    _assert_reset(first, "member", "甲隊")
    assert cookies_set_by(first) == {}
    assert await member.session_act() == member.default_act
    second = await client.post(BROWSER_REFRESH, headers=headers)
    assert second.status_code == 204, second.text


async def test_a_bearer_refresh_naming_the_revoked_identity_keeps_answering_identity_reset(
    client, db_session, member
):
    """A client that does not forget the identity it remembers is not let through, nor signed out.

    The first answer names what the session lost. After it the session is on the default, so the
    identity the client keeps naming is only its own stale memory: no names (ADR-415).
    """
    await _suspend_team_a(db_session, member)
    body = {"refresh_token": member.refresh, "identity": member.act}

    first = await client.post(BEARER_REFRESH, json=body)
    second = await client.post(BEARER_REFRESH, json=body)

    _assert_reset(first, "member", "甲隊")
    _assert_reset(second, None, None)
    assert await member.repo.get_session(member.sid) is not None


# --- what a refresh token cannot be used for (ADR-415) ----------------------------------------


async def _another_team(db) -> str:
    team = Team(name="別隊", type="gov")
    db.add(team)
    await db.flush()
    team_uuid = str(team.uuid)
    await db.commit()
    return team_uuid


async def test_naming_someone_elses_team_reveals_nothing_and_changes_nothing(client, db_session, member):
    """The caller's own identity names what to look up only when it is the session's: no name oracle."""
    other = await _another_team(db_session)

    response = await client.post(
        BEARER_REFRESH,
        json={"refresh_token": member.refresh, "identity": encode_act(str(member.member_role), other)},
    )

    _assert_reset(response, None, None)
    assert await member.session_act() == member.act


async def test_a_rotated_refresh_token_replayed_late_ends_the_session(
    client, db_session, member, past_the_refresh_grace_period
):
    """An old token is judged by rotate(): past the grace period it is a theft signal (ADR-415, ADR-330).

    A revoked identity must not shelter it from that check, nor let it move the session first.
    """
    stale = member.refresh
    rotated = await client.post(BEARER_REFRESH, json={"refresh_token": stale})
    assert rotated.status_code == 200, rotated.text
    await _suspend_team_a(db_session, member)
    past_the_refresh_grace_period()

    response = await client.post(BEARER_REFRESH, json={"refresh_token": stale, "identity": member.act})

    assert (response.status_code, response.json()["code"]) == (401, "refresh_token_invalid")
    assert await member.repo.get_session(member.sid) is None


async def test_a_rotated_refresh_token_within_the_grace_period_lands_on_the_default(
    client, db_session, member, past_the_refresh_grace_period
):
    """Within the grace period it is the same client (ADR-330): it gets the new token, on the default."""
    stale = member.refresh
    rotated = await client.post(BEARER_REFRESH, json={"refresh_token": stale})
    assert rotated.status_code == 200, rotated.text
    await _suspend_team_a(db_session, member)

    response = await client.post(BEARER_REFRESH, json={"refresh_token": stale, "identity": member.act})

    assert response.status_code == 200, response.text
    assert response.json()["refresh_token"] == rotated.json()["refresh_token"]
    assert response.json()["identity"]["role"] == "user"
    assert await member.session_act() == member.default_act


async def test_a_rotated_refresh_token_keeps_an_identity_that_still_works(
    client, db_session, member, past_the_refresh_grace_period
):
    """A bogus identity named with an old token within the grace period does not move a sound session."""
    stale = member.refresh
    rotated = await client.post(BEARER_REFRESH, json={"refresh_token": stale})
    assert rotated.status_code == 200, rotated.text
    other = await _another_team(db_session)

    response = await client.post(
        BEARER_REFRESH,
        json={"refresh_token": stale, "identity": encode_act(str(member.member_role), other)},
    )

    assert response.status_code == 200, response.text
    assert await member.session_act() == member.act


# --- the session store failing mid-reset ----------------------------------------------------------


async def test_an_unreachable_session_store_during_the_reset_is_a_503(
    client, db_session, member, monkeypatch
):
    """As anywhere else the session store fails (ADR-328 point 3): refused, nobody signed out."""

    async def unreachable(self, sid, act):
        raise RedisError("connection refused")

    await _suspend_team_a(db_session, member)
    monkeypatch.setattr(SessionRepository, "set_identity", unreachable)

    request = await client.get(ME, headers=member.cookies)
    refresh = await client.post(BEARER_REFRESH, json={"refresh_token": member.refresh})

    for response in (request, refresh):
        assert response.status_code == 503, response.text
        assert response.json()["code"] == "session_store_unavailable"
    assert cookies_set_by(request) == {}


# --- the other ways an identity is taken away, through their real endpoints -------------------


async def _boss(db, redis) -> dict:
    """Headers for an account holding rbac.assign at `all`, as the seed gives super_admin."""
    role = Role(name="boss", kind="platform")
    db.add(role)
    await db.flush()
    db.add(
        RolePermissionAssign(
            role_uuid=role.uuid, permission_uuid=await _permission(db, Perm.RBAC_ASSIGN), scope="all"
        )
    )
    boss = User(name="boss")
    db.add(boss)
    await db.flush()
    ids = (boss.uuid, role.uuid)
    db.add(UserRoleAssign(user_uuid=ids[0], role_uuid=ids[1]))
    await db.commit()
    return await auth_headers_for(redis, *ids)


async def _permission(db, perm: Perm):
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    return permission.uuid


async def test_revoking_the_team_role_through_the_api_resets(client, db_session, redis, member):
    """`DELETE /admin/users/{uuid}/role/{role_uuid}?team_uuid=…` takes 甲隊's member away."""
    boss = await _boss(db_session, redis)

    revoked = await client.delete(
        f"/api/v1/admin/users/{member.user_uuid}/role/{member.member_role}",
        params={"team_uuid": str(member.a)},
        headers=boss,
    )
    assert revoked.status_code == 204, revoked.text

    _assert_reset(await client.get(ME, headers=member.bearer), "member", "甲隊")
    assert await member.session_act() == member.default_act


async def test_changing_the_platform_role_through_the_api_resets(client, db_session, redis, member):
    """`POST /admin/users/{uuid}/role` with `user` takes data_auditor away (ADR-294)."""
    boss = await _boss(db_session, redis)
    auditor = await _role(db_session, "data_auditor", "platform")
    db_session.add(UserRoleAssign(user_uuid=member.user_uuid, role_uuid=auditor))
    await db_session.commit()
    act = encode_act(str(auditor), None)
    await member.repo.set_identity(member.sid, act)
    token = create_access_token({"sub": member.user_uuid}, sid=member.sid, act=act)

    changed = await client.post(
        f"/api/v1/admin/users/{member.user_uuid}/role", json={"role_name": "user"}, headers=boss
    )
    assert changed.status_code == 200, changed.text

    _assert_reset(await client.get(ME, headers={"Authorization": f"Bearer {token}"}), "data_auditor", None)
    assert await member.session_act() == member.default_act


async def test_a_bearer_refresh_without_an_identity_lands_on_the_default(client, db_session, member):
    """Forgetting the remembered identity is all it takes."""
    await _suspend_team_a(db_session, member)
    await client.post(BEARER_REFRESH, json={"refresh_token": member.refresh, "identity": member.act})

    response = await client.post(BEARER_REFRESH, json={"refresh_token": member.refresh})

    assert response.status_code == 200, response.text
    assert response.json()["identity"]["role"] == "user"
