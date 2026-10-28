"""Suspending and restoring a team (Spec/026 Task 9, ADR-357 points 3-4). There is no disbanding.

Suspension switches the team's identities off at the one place every request resolves them
(active_identity_repository), so these tests go through real tokens and real requests.
"""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.notification import Notification
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.role_request import RoleRequest
from app.models.team import Team
from tests.conftest import auth_headers_for

URL = "/api/v1/admin/teams"
ME = "/api/v1/users/me"
SWITCH = "/api/v1/auth/switch-identity"


async def _role(db, name: str, kind: str, grants: tuple[tuple[Perm, str], ...] = ()) -> Role:
    """The role called `name`, created with `grants`."""
    role = Role(name=name, kind=kind)
    db.add(role)
    await db.flush()
    for perm, scope in grants:
        db.add(
            RolePermissionAssign(
                role_uuid=role.uuid, permission_uuid=await _permission(db, perm), scope=scope
            )
        )
    await db.flush()
    return role


async def _permission(db, perm: Perm):
    """The capability row's uuid, created on first use."""
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    return permission.uuid


class World:
    """A team with one member who also holds `user`, a super admin, and a pending request."""

    async def build(self, db, redis) -> "World":
        """Arrange the world and mint headers."""
        team = Team(name="光復隊", type="ngo", status="active")
        db.add(team)
        await db.flush()
        member = await _role(db, "member", "team", ((Perm.TEAM_VIEW, "team"),))
        plain = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one()
        super_admin = await _role(db, "super_admin", "platform", ((Perm.TEAM_EDIT, "all"),))
        admin = await _role(db, "admin", "team")
        db.add(
            RolePermissionAssign(
                role_uuid=admin.uuid, permission_uuid=await _permission(db, Perm.TEAM_EDIT), scope="team"
            )
        )
        person, boss, applicant, captain = (
            User(name="隊員"),
            User(name="超管"),
            User(name="申請人"),
            User(name="隊長"),
        )
        db.add_all([person, boss, applicant, captain])
        await db.flush()
        db.add(
            UserRoleAssign(
                user_uuid=captain.uuid, role_uuid=admin.uuid, team_uuid=team.uuid, role_kind="team"
            )
        )
        db.add_all(
            [
                UserRoleAssign(
                    user_uuid=person.uuid, role_uuid=member.uuid, team_uuid=team.uuid, role_kind="team"
                ),
                UserRoleAssign(user_uuid=person.uuid, role_uuid=plain.uuid),
                UserRoleAssign(user_uuid=boss.uuid, role_uuid=super_admin.uuid),
            ]
        )
        db.add(
            RoleRequest(requested_role="ngo", reason="想加入", team_uuid=team.uuid, created_by=applicant.uuid)
        )
        await db.flush()
        self.team, self.member_role, self.applicant = str(team.uuid), str(member.uuid), applicant.uuid
        ids = {
            "team": (person.uuid, member.uuid, team.uuid),
            "site": (person.uuid, plain.uuid, None),
            "team admin": (captain.uuid, admin.uuid, team.uuid),
        }
        boss_ids = (boss.uuid, super_admin.uuid)
        await db.commit()
        self.headers = {who: await auth_headers_for(redis, *ids_) for who, ids_ in ids.items()}
        self.boss = await auth_headers_for(redis, *boss_ids)
        return self

    async def set(self, client, status: str, headers=None):
        """Change the team's status through the API."""
        return await client.post(
            f"{URL}/{self.team}/status", headers=headers or self.boss, json={"status": status}
        )


@pytest.mark.asyncio
async def test_suspending_switches_the_team_identity_off(client, db_session, redis):
    """A token acting as the team stops working (401); the member's own identity still works."""
    world = await World().build(db_session, redis)

    response = await world.set(client, "suspended")

    assert (response.status_code, response.json()["status"]) == (200, "suspended")
    assert (await client.get(ME, headers=world.headers["team"])).status_code == 401
    assert (await client.get(ME, headers=world.headers["site"])).status_code == 200


@pytest.mark.asyncio
async def test_a_suspended_team_cannot_be_switched_to_or_offered(client, db_session, redis):
    """The switcher no longer lists it, and switching to it is refused."""
    world = await World().build(db_session, redis)
    await world.set(client, "suspended")

    identities = (await client.get(ME, headers=world.headers["site"])).json()["identities"]
    switched = await client.post(
        SWITCH, headers=world.headers["site"], json={"role_uuid": world.member_role, "team_uuid": world.team}
    )

    assert all(identity.get("team_uuid") != world.team for identity in identities)
    assert switched.status_code in (400, 403, 404)


@pytest.mark.asyncio
async def test_restoring_brings_the_identity_back_as_it_was(client, db_session, redis):
    """Suspension keeps the grants, so restoring needs nothing re-granted."""
    world = await World().build(db_session, redis)
    await world.set(client, "suspended")

    response = await world.set(client, "active")

    assert response.status_code == 200
    assert (await client.get(ME, headers=world.headers["team"])).status_code == 200


@pytest.mark.asyncio
async def test_there_is_no_disbanding(client, db_session, redis):
    """ADMIN-027 Story 4: a team stays, and its last admin with it (ADR-356, ADR-357)."""
    world = await World().build(db_session, redis)

    response = await world.set(client, "disbanded")

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(("status", "note"), [("suspended", "團隊已停用")])
async def test_suspending_rejects_the_teams_pending_requests(client, db_session, redis, status, note):
    """Nobody could approve them any more; the applicant is told why."""
    world = await World().build(db_session, redis)

    await world.set(client, status)

    request = (await db_session.execute(select(RoleRequest))).scalar_one()
    assert (request.status, request.review_note) == ("rejected", note)
    [notice] = (
        await db_session.execute(select(Notification).where(Notification.recipient_uuid == world.applicant))
    ).scalars()
    assert notice.body == note


@pytest.mark.asyncio
async def test_only_a_super_admin_changes_a_teams_status(client, db_session, redis):
    """team.edit at `all`; a team admin's `team` is not enough."""
    world = await World().build(db_session, redis)

    response = await world.set(client, "suspended", headers=world.headers["team admin"])

    assert response.status_code == 403


async def _notices(db, kind: str = "team_suspended") -> list[Notification]:
    return list((await db.execute(select(Notification).where(Notification.type == kind))).scalars())


@pytest.mark.asyncio
async def test_suspending_tells_everyone_in_the_team_once(client, db_session, redis):
    """Spec 029 (ADR-405): the member and the team admin each get one `team_suspended`."""
    world = await World().build(db_session, redis)
    captain = (await db_session.execute(select(User.uuid).where(User.name == "隊長"))).scalar_one()
    db_session.add(
        UserRoleAssign(user_uuid=captain, role_uuid=world.member_role, team_uuid=world.team, role_kind="team")
    )
    await db_session.commit()

    await world.set(client, "suspended")

    notices = await _notices(db_session)
    names = {(await db_session.get(User, notice.recipient_uuid)).name: notice for notice in notices}
    assert len(notices) == 2
    assert set(names) == {"隊員", "隊長"}
    notice = names["隊員"]
    assert (notice.ref_type, str(notice.ref_uuid)) == ("team", world.team)
    assert notice.title == "「光復隊」已暫停"
    assert "光復隊" in notice.body


@pytest.mark.asyncio
async def test_the_super_admin_who_suspends_is_not_told(client, db_session, redis):
    """The actor never hears of their own change, even when they are in the team."""
    world = await World().build(db_session, redis)
    boss = (await db_session.execute(select(User.uuid).where(User.name == "超管"))).scalar_one()
    db_session.add(
        UserRoleAssign(user_uuid=boss, role_uuid=world.member_role, team_uuid=world.team, role_kind="team")
    )
    await db_session.commit()

    await world.set(client, "suspended")

    recipients = {notice.recipient_uuid for notice in await _notices(db_session)}
    assert boss not in recipients
    assert len(recipients) == 2


@pytest.mark.asyncio
async def test_restoring_or_suspending_again_tells_nobody(client, db_session, redis):
    """Only the change to `suspended` is news; restoring and a repeated suspend are not (ADR-405)."""
    world = await World().build(db_session, redis)
    await world.set(client, "suspended")
    await world.set(client, "suspended")
    await world.set(client, "active")

    assert len(await _notices(db_session)) == 2


@pytest.mark.asyncio
async def test_a_notice_that_fails_does_not_undo_the_suspension(client, db_session, redis, monkeypatch):
    """Sent after the commit; a failure is logged, the team stays suspended."""
    from app.services import notification_service

    async def broken(*args, **kwargs):
        raise RuntimeError("notification store down")

    world = await World().build(db_session, redis)
    monkeypatch.setattr(notification_service.NotificationService, "dispatch", broken)

    response = await world.set(client, "suspended")

    assert (response.status_code, response.json()["status"]) == (200, "suspended")
