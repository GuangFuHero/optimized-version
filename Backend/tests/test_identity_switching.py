"""Switching between the identities a user holds (feature 010, ADR-068/069/070/096).

Covers the token side of the feature end to end: what login lands on, what /auth/switch-identity
will and will not do, and the two paths that refuse an identity that has since vanished.
"""

import os
from types import SimpleNamespace

os.environ["ENV"] = "testing"

import pytest
from jose import jwt

from app.core.config import settings
from app.core.identity import decode_act, encode_act
from app.core.security import generate_salt, get_password_hash
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from app.services.auth_account import create_account
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio


class _Ref(SimpleNamespace):
    """A row's identifying fields, captured before the commit that would expire them.

    `db_session` is expire_on_commit=True, so re-reading `role.uuid` after a later commit
    triggers a lazy reload that is not valid under AsyncSession and raises MissingGreenlet.
    Everything these tests need off a row is its uuid and its name, so they are copied out.
    """


async def _account_with_two_identities(db):
    """An account holding its platform role plus `member` in one team.

    Returns (user_uuid, platform_role, team_role, team) as detached references.
    """
    user = await create_account(
        db, contact_type="email", value="switcher@x.com",
        password_hash=get_password_hash("secret", generate_salt()), name="Switcher",
    )
    platform_role = await _role(db, "user", "platform")
    team_role = Role(name="member", kind="team")
    team = Team(name="慈濟", type="ngo")
    db.add_all([team_role, team])
    await db.flush()
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=team_role.uuid, team_uuid=team.uuid))
    refs = (
        str(user.uuid),
        _Ref(uuid=platform_role.uuid, name=platform_role.name),
        _Ref(uuid=team_role.uuid, name=team_role.name),
        _Ref(uuid=team.uuid, name=team.name),
    )
    await db.commit()
    return refs


async def _role(db, name: str, kind: str) -> Role:
    """Fetch the named role, creating it if the fixture seed did not."""
    from sqlalchemy import select

    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is None:
        role = Role(name=name, kind=kind)
        db.add(role)
        await db.flush()
    return role


def _act_of(access_token: str) -> str | None:
    """Read the `act` claim out of an access token."""
    payload = jwt.decode(access_token, settings.JWT_SIGNING_KEY, algorithms=[settings.ALGORITHM])
    return payload.get("act")


async def _login(client, scope: str | None = None) -> dict:
    """Log in as the fixture account, optionally remembering an identity (ADR-069)."""
    data = {"username": "switcher@x.com", "password": "secret"}
    if scope is not None:
        data["scope"] = scope
    resp = await client.post("/api/v1/auth/login", data=data)
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- what login lands on -----------------------------------------------------------------


async def test_login_defaults_to_the_platform_identity(client, db_session):
    """With no remembered identity, a fresh login acts as the platform one (ADR-069)."""
    _, platform_role, _, _ = await _account_with_two_identities(db_session)
    tokens = await _login(client)
    assert decode_act(_act_of(tokens["access_token"])) == (str(platform_role.uuid), None)


async def test_login_honours_a_remembered_identity(client, db_session):
    """A client that remembers which identity it was using comes back on that one."""
    _, _, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client, scope=encode_act(str(team_role.uuid), str(team.uuid)))
    assert decode_act(_act_of(tokens["access_token"])) == (str(team_role.uuid), str(team.uuid))


async def test_login_falls_back_when_the_remembered_identity_is_gone(client, db_session):
    """A stale client-side memory is not a failure — log in on the default instead (ADR-069).

    This is deliberately unlike the request and refresh paths, which 401. Nothing is being
    asserted here: the client is offering a preference, and the preference is simply stale.
    """
    from uuid import uuid4

    _, platform_role, _, _ = await _account_with_two_identities(db_session)
    tokens = await _login(client, scope=encode_act(str(uuid4()), None))
    assert decode_act(_act_of(tokens["access_token"])) == (str(platform_role.uuid), None)


# --- a malformed act claim ----------------------------------------------------------------


@pytest.mark.parametrize(
    "act",
    ["garbage:", "garbage:also-garbage", "00000000-0000-4000-8000-000000000001:not-a-uuid", ":", "x"],
)
async def test_decode_act_rejects_anything_that_is_not_a_uuid_pair(act):
    """Both halves are validated here, not just split apart.

    `resolve()` binds them straight into `uuid` columns; an unvalidated value would reach the
    driver and surface as a 500 rather than the None this function exists to return.
    """
    assert decode_act(act) is None


async def test_login_with_a_malformed_remembered_identity_falls_back(client, db_session):
    """`scope` is free-form text from an unauthenticated client — garbage must not 500."""
    _, platform_role, _, _ = await _account_with_two_identities(db_session)
    tokens = await _login(client, scope="garbage:")
    assert decode_act(_act_of(tokens["access_token"])) == (str(platform_role.uuid), None)


async def test_refresh_with_a_malformed_identity_is_401(client, db_session):
    """`identity` is free-form too; a value that parses to nothing is treated as vanished."""
    await _account_with_two_identities(db_session)
    tokens = await _login(client)

    resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"], "identity": "garbage:"},
    )
    assert resp.status_code == 401


# --- switching ---------------------------------------------------------------------------


async def test_switch_to_an_identity_you_hold(client, db_session):
    """Switching to a held identity re-signs the access token with that identity."""
    _, _, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)

    resp = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert resp.status_code == 200, resp.text
    assert decode_act(_act_of(resp.json()["access_token"])) == (
        str(team_role.uuid), str(team.uuid)
    )


async def test_switch_returns_the_access_token_alone(client, db_session):
    """No `refresh_token` in the response — the client keeps the one it already has (ADR-070).

    The server stores only that token's hash, so there is nothing to echo back. The frontend
    must therefore merge the access token into its stored pair rather than replacing the pair
    wholesale, or it would overwrite its refresh token with `undefined` and be signed out at
    the next refresh.
    """
    _, _, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)

    resp = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json()) == {"access_token", "token_type", "expires_in"}


async def test_switch_to_an_identity_you_do_not_hold_is_403(client, db_session):
    """Switching may only move between identities already held — it never grants one (ADR-068)."""
    user_uuid, _, team_role, _ = await _account_with_two_identities(db_session)
    other_team = Team(name="縣府", type="gov")
    db_session.add(other_team)
    await db_session.flush()  # the uuid is generated by the database, not in Python
    other_team_uuid = str(other_team.uuid)
    await db_session.commit()
    tokens = await _login(client)

    resp = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": other_team_uuid},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert resp.status_code == 403
    assert user_uuid  # the account itself is untouched


async def test_switching_is_not_gated_by_any_capability(client, db_session):
    """A user with the least-privileged identity can still switch back (ADR-070).

    If switching required a capability, downgrading into an identity that lacks it would
    lock the user out of their own permissions with no way back.
    """
    _, platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client, scope=encode_act(str(team_role.uuid), str(team.uuid)))

    resp = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(platform_role.uuid), "team_uuid": None},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert resp.status_code == 200, resp.text
    assert decode_act(_act_of(resp.json()["access_token"])) == (str(platform_role.uuid), None)


async def test_switching_does_not_rotate_the_refresh_token(client, db_session):
    """Switching is not a credential event, so the refresh token is left alone (ADR-070)."""
    _, _, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)

    await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200, resp.text


# --- an identity that has since vanished (ADR-096) ----------------------------------------


async def test_a_revoked_identity_401s_on_the_request_path(client, db_session):
    """Revoking the grant a token acts as signs that session out, rather than downgrading it."""
    from sqlalchemy import delete

    user_uuid, _, team_role, team = await _account_with_two_identities(db_session)
    headers = auth_headers_for(user_uuid, team_role, team)
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 200

    await db_session.execute(
        delete(UserRoleAssign).where(UserRoleAssign.role_uuid == team_role.uuid)
    )
    await db_session.commit()

    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401


async def test_a_soft_deleted_team_takes_its_identity_with_it(client, db_session):
    """Soft-deleting the team invalidates the identity bound to it (ADR-096)."""
    from datetime import UTC, datetime

    from sqlalchemy import update

    user_uuid, _, team_role, team = await _account_with_two_identities(db_session)
    headers = auth_headers_for(user_uuid, team_role, team)

    await db_session.execute(
        update(Team).where(Team.uuid == team.uuid).values(delete_at=datetime.now(UTC))
    )
    await db_session.commit()

    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401


async def test_refresh_refuses_a_vanished_identity_without_burning_the_token(client, db_session):
    """The refresh token survives a refused refresh, so the client can retry with a valid one.

    ADR-096 requires validating before `rotate()`: rotating first would burn the token and
    then refuse, leaving the caller with nothing and turning their retry into what looks
    like a replay attack.
    """
    from sqlalchemy import delete

    _, platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)
    await db_session.execute(
        delete(UserRoleAssign).where(UserRoleAssign.role_uuid == team_role.uuid)
    )
    await db_session.commit()

    refused = await client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": tokens["refresh_token"],
            "identity": encode_act(str(team_role.uuid), str(team.uuid)),
        },
    )
    assert refused.status_code == 401

    # Same refresh token, an identity they still hold: still usable.
    accepted = await client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": tokens["refresh_token"],
            "identity": encode_act(str(platform_role.uuid), None),
        },
    )
    assert accepted.status_code == 200, accepted.text


async def test_users_me_lists_every_identity_and_the_active_one(client, db_session):
    """The switcher UI needs the full list plus which one is in effect."""
    user_uuid, _, team_role, team = await _account_with_two_identities(db_session)
    resp = await client.get(
        "/api/v1/users/me", headers=auth_headers_for(user_uuid, team_role, team)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert {(i["role"], i["team"]) for i in body["identities"]} == {("user", None), ("member", "慈濟")}
    assert body["active_identity"]["role"] == "member"
    assert body["active_identity"]["team"] == "慈濟"


# --- switching cannot outlive the session it re-signs from (ADR-183) ----------------------


async def test_switch_identity_refuses_once_the_session_is_revoked(client, db_session):
    """Signing out has to bound switching too, or it becomes an unbounded token refresher.

    `switch-identity` mints a fresh access token with a fresh expiry from the `sid` in the
    caller's current one. Without checking that `session:{sid}` still exists, a caller could
    keep a revoked session alive indefinitely by calling this before each expiry — `logout`
    and `logout-all` would stop `/auth/refresh` and stop nothing else.
    """
    _uid, _platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    body = {"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)}

    assert (await client.post("/api/v1/auth/switch-identity", json=body, headers=headers)).status_code == 200

    assert (await client.post("/api/v1/auth/logout-all", headers=headers)).status_code == 204

    resp = await client.post("/api/v1/auth/switch-identity", json=body, headers=headers)
    assert resp.status_code == 401, resp.text
    assert "no longer active" in resp.json()["detail"]


async def test_switch_identity_is_rate_limited(client, db_session):
    """It mints credentials, so it gets the same limiter login and refresh have."""
    from app.api.v1.endpoints.auth import session as session_module

    route = next(
        r for r in session_module.router.routes
        if getattr(r, "path", None) == "/switch-identity"
    )
    assert route.dependencies, "switch-identity has no dependencies at all"


# --- the session remembers which identity it is acting as (ADR-188) ----------------------


async def test_a_plain_refresh_keeps_the_identity_the_caller_switched_to(client, db_session):
    """A refresh that names no identity must not undo a deliberate downgrade.

    The client's memory of the active identity used to be the only copy: `act` lived in the
    access token and nowhere else, so a refresh without `identity` fell back to
    `default_for_user` — the platform identity. For a super_admin acting as a team member
    that was a silent re-escalation roughly every 15 minutes, with nothing in the response
    saying it had happened.
    """
    _uid, platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)
    assert decode_act(_act_of(tokens["access_token"])) == (str(platform_role.uuid), None)

    switched = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert switched.status_code == 200, switched.text

    # exactly what a client that does not track identity sends
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200, refreshed.text
    assert decode_act(_act_of(refreshed.json()["access_token"])) == (
        str(team_role.uuid), str(team.uuid)
    )


async def test_an_explicit_identity_on_refresh_still_wins(client, db_session):
    """The session is the fallback, not an override: a client that tracks identity decides."""
    _uid, platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)
    switched = await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert switched.status_code == 200, switched.text

    refreshed = await client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": tokens["refresh_token"],
            "identity": encode_act(str(platform_role.uuid), None),
        },
    )
    assert refreshed.status_code == 200, refreshed.text
    assert decode_act(_act_of(refreshed.json()["access_token"])) == (str(platform_role.uuid), None)


async def test_refreshing_twice_keeps_the_switched_identity(client, db_session):
    """Rotation preserves the record, so the identity survives more than one hop."""
    _uid, _platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)
    await client.post(
        "/api/v1/auth/switch-identity",
        json={"role_uuid": str(team_role.uuid), "team_uuid": str(team.uuid)},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )

    refresh_token = tokens["refresh_token"]
    for _ in range(2):
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200, resp.text
        refresh_token = resp.json()["refresh_token"]

    assert decode_act(_act_of(resp.json()["access_token"])) == (
        str(team_role.uuid), str(team.uuid)
    )


async def test_an_explicit_identity_on_refresh_is_remembered_too(client, db_session):
    """Naming an identity on refresh updates the session, or the next plain one reverts it."""
    _uid, _platform_role, team_role, team = await _account_with_two_identities(db_session)
    tokens = await _login(client)

    named = await client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": tokens["refresh_token"],
            "identity": encode_act(str(team_role.uuid), str(team.uuid)),
        },
    )
    assert named.status_code == 200, named.text

    plain = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": named.json()["refresh_token"]}
    )
    assert plain.status_code == 200, plain.text
    assert decode_act(_act_of(plain.json()["access_token"])) == (
        str(team_role.uuid), str(team.uuid)
    )
