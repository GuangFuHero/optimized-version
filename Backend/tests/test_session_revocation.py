"""Access tokens stop working the moment their session is revoked (feature 014, ADR-099~105).

Before this feature `get_current_user` never looked at the token's `sid`, so every
revocation path — logout, logout-all, change-password, reset-password, an admin kicking
someone out — left the access token usable until it expired, up to 15 minutes later. The
assertions here are all the same shape: revoke, then reuse the SAME token and expect 401.

The GraphQL side of the same check lives in `tests/test_graphql/test_session_revocation.py`:
GraphQL requests resolve their own session off the application engine rather than through
the `get_db` override, so they only work inside that package's fixtures.
"""

import os

os.environ["ENV"] = "testing"

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.redis import get_redis
from app.core.security import create_access_token, generate_salt, get_password_hash
from app.main import app
from app.repositories.session_repository import SessionRepository
from app.services.auth_account import create_account
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio

ME = "/api/v1/users/me"


async def _user(db, email="revoke@x.com", password="secret"):
    """An account with a password identity, returned as a detached uuid string."""
    user = await create_account(
        db, contact_type="email", value=email, name="Revoked",
        password_hash=get_password_hash(password, generate_salt()),
    )
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


async def _sid_of(redis, user_uuid: str) -> str:
    """The one session the user owns."""
    members = await redis.smembers(SessionRepository.USER_SESSIONS + user_uuid)
    assert len(members) == 1, members
    (member,) = members
    return member.decode() if isinstance(member, bytes) else member


# --------------------------------------------------------------------------------------
# The core assertion: a revoked session's token is dead on the next request
# --------------------------------------------------------------------------------------


async def test_logout_kills_the_access_token_immediately(client, db_session, redis):
    """The whole point of the feature: the token that just logged out cannot be reused."""
    user_uuid = await _user(db_session)
    headers = await auth_headers_for(redis, user_uuid)
    assert (await client.get(ME, headers=headers)).status_code == 200

    assert (await client.post("/api/v1/auth/logout", headers=headers)).status_code == 204

    assert (await client.get(ME, headers=headers)).status_code == 401


async def test_logout_all_kills_a_token_held_by_another_device(client, db_session, redis):
    """Signing out everywhere reaches sessions other than the one making the request."""
    user_uuid = await _user(db_session)
    phone_headers = await auth_headers_for(redis, user_uuid)
    laptop_headers = await auth_headers_for(redis, user_uuid)

    assert (await client.post("/api/v1/auth/logout-all", headers=phone_headers)).status_code == 204

    assert (await client.get(ME, headers=laptop_headers)).status_code == 401


async def test_change_password_kills_the_old_tokens(client, db_session, redis):
    """change-password already revoked every session; now that actually ends the sessions."""
    user_uuid = await _user(db_session, email="changer@x.com", password="oldpw1")
    other_device = await auth_headers_for(redis, user_uuid)
    changing_device = await auth_headers_for(redis, user_uuid)

    res = await client.post(
        "/api/v1/auth/change-password", headers=changing_device,
        json={"old_password": "oldpw1", "new_password": "newpw1", "salt_frontend": "deadbeef"},
    )
    assert res.status_code == 204, res.text

    assert (await client.get(ME, headers=other_device)).status_code == 401


async def test_reset_password_kills_the_intruders_token(client, db_session, redis, capture_email):
    """The case this feature exists for.

    "Forgot password" is what someone reaches for when their account may already be
    compromised. Until now it revoked the sessions but left every access token — including
    the intruder's — working for up to another 15 minutes.
    """
    user_uuid = await _user(db_session, email="victim@x.com", password="oldpw1")
    intruder_headers = await auth_headers_for(redis, user_uuid)

    res = await client.post(
        "/api/v1/auth/forgot-password", json={"type": "email", "value": "victim@x.com"}
    )
    assert res.status_code == 202
    res = await client.post(
        "/api/v1/auth/reset-password",
        json={"type": "email", "value": "victim@x.com", "code": capture_email.last_code,
              "new_password": "newpw1", "salt_frontend": "deadbeef"},
    )
    assert res.status_code == 204, res.text

    assert (await client.get(ME, headers=intruder_headers)).status_code == 401


async def test_an_expired_session_key_ends_the_token(client, db_session, redis):
    """Sessions have their own 14-day TTL; when the key goes, so does the token."""
    user_uuid = await _user(db_session)
    headers = await auth_headers_for(redis, user_uuid)
    assert (await client.get(ME, headers=headers)).status_code == 200

    await redis.delete(SessionRepository.SESSION + await _sid_of(redis, user_uuid))

    assert (await client.get(ME, headers=headers)).status_code == 401


# --------------------------------------------------------------------------------------
# Edge cases the check must not leave open
# --------------------------------------------------------------------------------------


async def test_a_token_with_no_sid_is_refused(client, db_session, redis):
    """Otherwise "omit the sid" would be a way around the check entirely (ADR-101)."""
    user_uuid = await _user(db_session)
    token = create_access_token(data={"sub": user_uuid})  # no sid

    res = await client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 401


async def test_a_sid_belonging_to_someone_else_is_refused(client, db_session, redis):
    """`sid` and `sub` have to name the same person (ADR-101)."""
    mine = await _user(db_session, email="mine@x.com")
    theirs = await _user(db_session, email="theirs@x.com")
    await auth_headers_for(redis, theirs)
    token = create_access_token(data={"sub": mine}, sid=await _sid_of(redis, theirs))

    res = await client.get(ME, headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 401


async def test_a_live_session_still_passes(client, db_session, redis):
    """The check must not break the ordinary case it sits in front of."""
    user_uuid = await _user(db_session)
    headers = await auth_headers_for(redis, user_uuid)

    res = await client.get(ME, headers=headers)

    assert res.status_code == 200
    assert res.json()["name"] == "Revoked"


# --------------------------------------------------------------------------------------
# Redis outage: refuse, and say why in the log
# --------------------------------------------------------------------------------------


class _DeadRedis:
    """A redis client that is up as far as the caller knows, until it is asked anything."""

    def __getattr__(self, _name):
        async def _boom(*_args, **_kwargs):
            raise RedisConnectionError("redis is down")

        return _boom


async def test_a_redis_outage_refuses_the_request(client, db_session, redis, caplog):
    """Fail closed (ADR-100): an outage must not quietly disable revocation.

    Also asserts the log, because the response is deliberately indistinguishable from an
    invalid token — without the log, a Redis outage looks like "everyone's credentials
    stopped working" with nothing to point at.
    """
    user_uuid = await _user(db_session)
    headers = await auth_headers_for(redis, user_uuid)
    app.dependency_overrides[get_redis] = lambda: _DeadRedis()
    try:
        with caplog.at_level("ERROR"):
            res = await client.get(ME, headers=headers)
    finally:
        app.dependency_overrides[get_redis] = lambda: redis

    assert res.status_code == 401
    assert any("Redis" in r.message or "redis" in r.message for r in caplog.records), caplog.text


# --------------------------------------------------------------------------------------
# Admin kick (ADR-103)
# --------------------------------------------------------------------------------------


async def _admin_who_can_kick(db, redis):
    """A user holding `user.edit` at Scope.ALL, plus bearer headers for them."""
    from app.core.permissions import Perm
    from app.models.auth import User
    from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign

    role = Role(name="kicker", kind="platform")
    permission = Permission(key=Perm.USER_EDIT.value)
    db.add_all([role, permission])
    await db.flush()
    db.add(RolePermissionAssign(
        role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"
    ))
    admin = User(name="Kicker")
    db.add(admin)
    await db.flush()
    db.add(UserRoleAssign(user_uuid=admin.uuid, role_uuid=role.uuid))
    admin_uuid = str(admin.uuid)
    role_ref = type("R", (), {"uuid": role.uuid})
    await db.commit()
    return admin_uuid, await auth_headers_for(redis, admin_uuid, role_ref)


def _kick(user_uuid: str) -> str:
    return f"/api/v1/admin/users/{user_uuid}/revoke-sessions"


async def test_an_admin_can_end_someone_elses_session(client, db_session, redis):
    """Kicking someone out takes effect on their very next request."""
    _, admin_headers = await _admin_who_can_kick(db_session, redis)
    target_uuid = await _user(db_session, email="target@x.com")
    target_headers = await auth_headers_for(redis, target_uuid)
    assert (await client.get(ME, headers=target_headers)).status_code == 200

    res = await client.post(_kick(target_uuid), headers=admin_headers)
    assert res.status_code == 204, res.text

    assert (await client.get(ME, headers=target_headers)).status_code == 401


async def test_kicking_someone_with_no_sessions_is_a_no_op(client, db_session, redis):
    """The caller wants the end state "no live sessions", not a record of having removed one."""
    _, admin_headers = await _admin_who_can_kick(db_session, redis)
    target_uuid = await _user(db_session, email="quiet@x.com")

    res = await client.post(_kick(target_uuid), headers=admin_headers)

    assert res.status_code == 204


async def test_kicking_an_unknown_user_is_404(client, db_session, redis):
    """A typo'd uuid should say so rather than silently succeed."""
    _, admin_headers = await _admin_who_can_kick(db_session, redis)

    res = await client.post(_kick("00000000-0000-0000-0000-000000000000"), headers=admin_headers)

    assert res.status_code == 404


async def test_kicking_requires_user_edit(client, db_session, redis):
    """`user.view` is not enough — reading someone's account is not managing it."""
    target_uuid = await _user(db_session, email="bystander@x.com")
    plain_uuid = await _user(db_session, email="plain@x.com")
    plain_headers = await auth_headers_for(redis, plain_uuid)

    res = await client.post(_kick(target_uuid), headers=plain_headers)

    assert res.status_code == 403


# --------------------------------------------------------------------------------------
# The logout endpoints: idempotent, but a dead token still revokes nothing (ADR-180/190)
# --------------------------------------------------------------------------------------


async def test_logout_all_from_a_revoked_token_revokes_nothing(client, db_session, redis):
    """A revoked token must not be able to sign the user out of a session it never held.

    `get_current_session` decodes the token without looking at the session, so a token that
    had already been revoked could still reach this endpoint. That is not the harmless no-op
    it looks like: an intruder holding a token the victim just revoked could keep calling it,
    kicking the victim out of every session they create afterwards until the stolen token
    expires.

    The answer is 204 rather than 401 (ADR-190) — the caller asked for "every device signed
    out" and this token's device already is — but nothing is revoked, which is the half that
    closes the attack.
    """
    user_uuid = await _user(db_session, email="dos@x.com")
    stolen = await auth_headers_for(redis, user_uuid)
    assert (await client.post("/api/v1/auth/logout-all", headers=stolen)).status_code == 204

    fresh = await auth_headers_for(redis, user_uuid)  # the user signs back in

    assert (await client.post("/api/v1/auth/logout-all", headers=stolen)).status_code == 204
    assert (await client.get(ME, headers=fresh)).status_code == 200  # still signed in


async def test_logout_is_idempotent(client, db_session, redis):
    """"This device is signed out" is already true on the second call (ADR-190).

    Returning 401 there reported a failure that had not happened, and collided with the
    ordinary client pattern of calling logout from a 401 interceptor: 401 → logout → 401.
    """
    user_uuid = await _user(db_session, email="dos2@x.com")
    headers = await auth_headers_for(redis, user_uuid)
    assert (await client.post("/api/v1/auth/logout", headers=headers)).status_code == 204

    assert (await client.post("/api/v1/auth/logout", headers=headers)).status_code == 204
    assert (await client.post("/api/v1/auth/logout-all", headers=headers)).status_code == 204


async def test_logout_accepts_a_token_with_no_sid(client, db_session, redis):
    """Nothing to revoke is not a failure — the end state the caller asked for holds."""
    user_uuid = await _user(db_session, email="nosid@x.com")
    token = create_access_token(data={"sub": user_uuid})  # no sid

    res = await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 204


async def test_a_sid_less_token_cannot_sign_anyone_out_of_anything(client, db_session, redis):
    """The sid-less case must stay a no-op on logout-all too, not a global kick.

    `get_current_session` returns `sub` from the token alone, so without the liveness check
    in `logout_all` a hand-minted token would be a way to sign a user out of every device.
    """
    user_uuid = await _user(db_session, email="nosid2@x.com")
    live = await auth_headers_for(redis, user_uuid)
    token = create_access_token(data={"sub": user_uuid})  # no sid

    res = await client.post(
        "/api/v1/auth/logout-all", headers={"Authorization": f"Bearer {token}"}
    )

    assert res.status_code == 204
    assert (await client.get(ME, headers=live)).status_code == 200  # untouched


async def test_logout_reports_a_redis_outage_rather_than_claiming_success(
    client, db_session, redis
):
    """204 would tell the caller they are signed out when the store never heard the request."""
    user_uuid = await _user(db_session, email="logout-outage@x.com")
    headers = await auth_headers_for(redis, user_uuid)
    app.dependency_overrides[get_redis] = lambda: _DeadRedis()
    try:
        res = await client.post("/api/v1/auth/logout", headers=headers)
    finally:
        app.dependency_overrides[get_redis] = lambda: redis

    assert res.status_code == 503


# --------------------------------------------------------------------------------------
# The kick is Scope.ALL only (ADR-181)
# --------------------------------------------------------------------------------------


async def _kicker_at_scope(db, redis, scope: str):
    """Bearer headers for a user holding `user.edit` at the given scope."""
    from app.core.permissions import Perm
    from app.models.auth import User
    from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign

    role = Role(name=f"kicker_{scope}", kind="platform")
    permission = Permission(key=Perm.USER_EDIT.value)
    db.add_all([role, permission])
    await db.flush()
    db.add(RolePermissionAssign(
        role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
    ))
    actor = User(name=f"Kicker {scope}")
    db.add(actor)
    await db.flush()
    db.add(UserRoleAssign(user_uuid=actor.uuid, role_uuid=role.uuid))
    actor_uuid = str(actor.uuid)
    role_ref = type("R", (), {"uuid": role.uuid})
    await db.commit()
    return await auth_headers_for(redis, actor_uuid, role_ref)


@pytest.mark.parametrize("scope", ["own", "team", "gov", "ngo", "zone"])
async def test_kicking_needs_user_edit_at_scope_all(client, db_session, redis, scope):
    """A narrow `user.edit` must not silently become "sign anyone out" (ADR-181).

    There is no checkpoint 2 on this endpoint — since feature 010 the target has no single
    team to scope against — so without this every scope would behave as `all`. The RBAC
    matrix is editable at runtime, so "the seed only gives this to super_admin" is not a
    property the endpoint can rely on.
    """
    target_uuid = await _user(db_session, email=f"target_{scope}@x.com")
    target_headers = await auth_headers_for(redis, target_uuid)
    headers = await _kicker_at_scope(db_session, redis, scope)

    res = await client.post(_kick(target_uuid), headers=headers)

    assert res.status_code == 403, res.text
    assert (await client.get(ME, headers=target_headers)).status_code == 200  # still signed in


# --------------------------------------------------------------------------------------
# change-password signs the CALLER out too (ADR-189)
# --------------------------------------------------------------------------------------


async def test_change_password_signs_the_changing_device_out_as_well(client, db_session, redis):
    """The intended flow is "change your password, then sign back in" (ADR-189).

    `change-password` calls `revoke_all_for_user`, which includes the session making the
    request — the caller's access token is dead on their very next request, and the refresh
    token that went with it was deleted too, so there is no path back except a fresh login.
    Before feature 014 the access token stayed usable for up to 15 minutes, which hid this.

    Pinned here because it is the one revocation path where the person who triggered it is
    also a victim of it, and it is invisible from the endpoint's own 204.
    """
    user_uuid = await _user(db_session, email="selfchange@x.com", password="oldpw1")
    changing_device = await auth_headers_for(redis, user_uuid)

    res = await client.post(
        "/api/v1/auth/change-password", headers=changing_device,
        json={"old_password": "oldpw1", "new_password": "newpw1", "salt_frontend": "deadbeef"},
    )
    assert res.status_code == 204, res.text

    assert (await client.get(ME, headers=changing_device)).status_code == 401


# --------------------------------------------------------------------------------------
# The kick leaves a trail, and cannot be aimed anywhere (ADR-191/194)
# --------------------------------------------------------------------------------------


async def test_a_kick_writes_an_audit_row_naming_the_actor(client, db_session, redis):
    """The only admin action that touches no table, so nothing else would record it.

    Without the explicit row there is no record anywhere of WHO signed a user out — the log
    line named the target alone, and log files do not survive a container restart.
    """
    from sqlalchemy import select

    from app.models.audit import AuditLog

    admin_uuid, admin_headers = await _admin_who_can_kick(db_session, redis)
    target_uuid = await _user(db_session, email="audited@x.com")
    await auth_headers_for(redis, target_uuid)

    assert (await client.post(_kick(target_uuid), headers=admin_headers)).status_code == 204

    row = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.row_id == target_uuid, AuditLog.action == "REVOKE_SESSIONS"
            )
        )
    ).scalar_one()
    assert str(row.user_uuid) == admin_uuid
    assert row.table_name == "users"
    assert row.new_values == {"revoked_sessions": 1}


async def test_you_cannot_kick_yourself(client, db_session, redis):
    """Signing yourself out is what /auth/logout-all is for.

    Routing it through an admin capability only makes the trail read as an administrative
    action against someone else's account (ADR-191).
    """
    admin_uuid, admin_headers = await _admin_who_can_kick(db_session, redis)

    res = await client.post(_kick(admin_uuid), headers=admin_headers)

    assert res.status_code == 409, res.text
    assert (await client.get(ME, headers=admin_headers)).status_code == 200  # still signed in


async def test_you_cannot_kick_a_super_admin(client, db_session, redis):
    """The platform's highest role must not be lockable out of its own console.

    `user.edit` at `all` would otherwise be enough to hold a super_admin out indefinitely,
    one kick per login (ADR-191).
    """
    from app.models.auth import User
    from app.models.rbac import Role, UserRoleAssign
    from app.services.admin import SUPER_ADMIN_ROLE_NAME

    _, admin_headers = await _admin_who_can_kick(db_session, redis)
    role = Role(name=SUPER_ADMIN_ROLE_NAME, kind="platform")
    victim = User(name="Owner")
    db_session.add_all([role, victim])
    await db_session.flush()
    db_session.add(UserRoleAssign(user_uuid=victim.uuid, role_uuid=role.uuid))
    victim_uuid = str(victim.uuid)
    await db_session.commit()
    victim_headers = await auth_headers_for(redis, victim_uuid)

    res = await client.post(_kick(victim_uuid), headers=admin_headers)

    assert res.status_code == 403, res.text
    assert (await client.get(ME, headers=victim_headers)).status_code == 200


async def test_a_kick_during_a_redis_outage_is_503_not_500(client, db_session, redis):
    """Every other Redis touch this feature adds fails closed with a handled response.

    This one raised `RedisError` out of the endpoint as a 500 with a traceback, which tells
    the caller nothing and leaves it ambiguous whether any sessions were revoked (ADR-194).
    """
    _, admin_headers = await _admin_who_can_kick(db_session, redis)
    target_uuid = await _user(db_session, email="outage-target@x.com")

    real_redis = redis

    class _DeadForTheServiceOnly:
        """Live for authentication, dead the moment the kick reaches the session set.

        The kick's own request has to authenticate first, and authentication reads Redis —
        overriding `get_redis` outright would 401 before the code under test ran.
        """

        def __init__(self):
            self.reads = 0

        def __getattr__(self, name):
            attr = getattr(real_redis, name)
            if name != "smembers":
                return attr

            async def _boom(*_args, **_kwargs):
                raise RedisConnectionError("redis is down")

            return _boom

    app.dependency_overrides[get_redis] = _DeadForTheServiceOnly
    try:
        res = await client.post(_kick(target_uuid), headers=admin_headers)
    finally:
        app.dependency_overrides[get_redis] = lambda: redis

    assert res.status_code == 503, res.text
