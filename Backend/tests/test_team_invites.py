"""Team invite links: create, open and request through them (Spec/026 Task 4, ADR-353).

REST, so "an expired link returns 404" is a real HTTP status (BE-038 step 1). Expiry is judged by
the database clock: the tests move `expires_at` into the past in SQL rather than mocking time,
so nothing the client sends or the test process's clock could decide it.
"""

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text

from app.core.permissions import Perm
from app.models.auth import User, UserContact
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.role_request import RoleRequest
from app.models.team import Team
from app.models.team_invite import TeamInvite
from tests.conftest import auth_headers_for
from tests.test_site_realm import SITE

REASON = "我是光復協會的小隊長"
DETAILS = {"name": "王小明", "reason": REASON}


async def _grant(db, role: Role, perm: Perm, scope: str) -> None:
    """Grant `perm` at `scope` to `role`, creating the capability row on first use."""
    permission = (
        await db.execute(select(Permission).where(Permission.key == perm.value))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    await db.flush()


async def _role(db, name: str, kind: str = "platform", grants: tuple[tuple[Perm, str], ...] = ()) -> Role:
    """The role called `name`, created on first use with `grants`."""
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is None:
        role = Role(name=name, kind=kind)
        db.add(role)
        await db.flush()
        for perm, scope in grants:
            await _grant(db, role, perm, scope)
    return role


async def _team(db, name: str = "光復在地互助協會", type_: str = "ngo", status: str = "active") -> Team:
    """An active team unless told otherwise."""
    team = Team(name=name, type=type_, status=status)
    db.add(team)
    await db.flush()
    return team


async def _person(db, name: str, *, phone: bool = True) -> User:
    """An account holding the platform `user` with role_request.add, as the seed gives it."""
    user = User(name=name)
    db.add(user)
    await db.flush()
    plain = await _role(db, "user")
    if not (
        await db.execute(select(RolePermissionAssign).where(RolePermissionAssign.role_uuid == plain.uuid))
    ).first():
        await _grant(db, plain, Perm.ROLE_REQUEST_ADD, "all")
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=plain.uuid))
    if phone:
        value = f"+8869{uuid.uuid4().int % 10**8:08d}"
        db.add(
            UserContact(
                user_uuid=user.uuid, type="phone", value=value, verified=True, verified_at=datetime.now(UTC)
            )
        )
    await db.flush()
    return user


async def _in_team(db, user: User, team: Team | uuid.UUID, role_name: str) -> Role:
    """Grant `role_name` in the team. Takes a uuid too, for a team expired by a commit."""
    grants = {"admin": ((Perm.TEAM_MEMBER_MANAGE, "team"),), "member": ()}[role_name]
    role = await _role(db, role_name, "team", grants)
    team_uuid = team if isinstance(team, uuid.UUID) else team.uuid
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team_uuid))
    await db.flush()
    return role


async def _super_admin(db) -> tuple[User, Role]:
    user = User(name="超級管理員")
    db.add(user)
    await db.flush()
    role = await _role(db, "super_admin", grants=((Perm.TEAM_MEMBER_MANAGE, "all"),))
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.flush()
    return user, role


async def _team_admin_headers(db, redis, team: Team) -> dict:
    admin = await _person(db, "隊長")
    role = await _in_team(db, admin, team, "admin")
    ids = (admin.uuid, role.uuid, team.uuid)
    await db.commit()
    return await auth_headers_for(redis, ids[0], ids[1], ids[2])


async def _site_headers(db, redis, user: User) -> dict:
    """A site request acts as the caller's `user` grant (ADR-289)."""
    plain = await _role(db, "user")
    ids = (user.uuid, plain.uuid)
    await db.commit()
    return {**await auth_headers_for(redis, ids[0], ids[1]), **SITE}


async def _create(client, headers, team_uuid) -> dict:
    """Create an invite through the API and return its body."""
    response = await client.post(f"/api/v1/admin/teams/{team_uuid}/invites", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def _invite_for(client, db, redis, team: Team) -> dict:
    """An invite for `team` created by its admin. Reads the uuid before the helper commits."""
    team_uuid = str(team.uuid)
    return await _create(client, await _team_admin_headers(db, redis, team), team_uuid)


async def _expire(db, token: str) -> None:
    """Move an invite's expiry into the past on the database clock."""
    await db.execute(
        text("UPDATE team_invites SET expires_at = now() - interval '1 second' WHERE token = :t"),
        {"t": token},
    )
    await db.commit()


# --- creating (team.member.manage on the team) ---


@pytest.mark.asyncio
async def test_a_team_admin_creates_an_invite_for_their_team(client, db_session, redis):
    """201 with the token and both times; the invite's uuid never leaves the server (ADR-353)."""
    team = await _team(db_session)
    team_uuid = str(team.uuid)
    headers = await _team_admin_headers(db_session, redis, team)

    invite = await _create(client, headers, team_uuid)

    assert set(invite) == {"token", "team_uuid", "created_at", "expires_at"}
    assert invite["team_uuid"] == team_uuid
    lifetime = datetime.fromisoformat(invite["expires_at"]) - datetime.fromisoformat(invite["created_at"])
    assert lifetime.total_seconds() == 24 * 3600
    stored = (await db_session.execute(select(TeamInvite))).scalar_one()
    assert stored.token == invite["token"] and str(stored.uuid) != invite["token"]


@pytest.mark.asyncio
async def test_a_team_admin_cannot_create_an_invite_for_another_team(client, db_session, redis):
    """Another team is not found, so its existence is not given away (ADR-023)."""
    mine, theirs = await _team(db_session, "我的隊"), await _team(db_session, "別人的隊")
    theirs_uuid = str(theirs.uuid)
    headers = await _team_admin_headers(db_session, redis, mine)

    response = await client.post(f"/api/v1/admin/teams/{theirs_uuid}/invites", headers=headers)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_a_member_cannot_create_an_invite(client, db_session, redis):
    """A member does not manage the team's members, so cannot invite (403)."""
    team = await _team(db_session)
    member = await _person(db_session, "隊員")
    role = await _in_team(db_session, member, team, "member")
    ids = (member.uuid, role.uuid, team.uuid)
    await db_session.commit()
    headers = await auth_headers_for(redis, *ids)

    response = await client.post(f"/api/v1/admin/teams/{ids[2]}/invites", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_super_admin_creates_an_invite_for_any_team(client, db_session, redis):
    """team.member.manage at `all` reaches every team."""
    team = await _team(db_session)
    user, role = await _super_admin(db_session)
    ids = (user.uuid, role.uuid, team.uuid)
    await db_session.commit()

    invite = await _create(client, await auth_headers_for(redis, ids[0], ids[1]), ids[2])

    assert invite["team_uuid"] == str(ids[2])


@pytest.mark.asyncio
async def test_the_team_admin_lists_the_invites_still_valid_newest_first(client, db_session, redis):
    """So the page can show the current QR again; an expired one is not listed."""
    team = await _team(db_session)
    team_uuid = str(team.uuid)
    headers = await _team_admin_headers(db_session, redis, team)
    old = await _create(client, headers, team_uuid)
    new = await _create(client, headers, team_uuid)
    expired = await _create(client, headers, team_uuid)
    await db_session.execute(
        text("UPDATE team_invites SET created_at = created_at - interval '1 minute' WHERE token = :t"),
        {"t": old["token"]},
    )
    await _expire(db_session, expired["token"])

    response = await client.get(f"/api/v1/admin/teams/{team_uuid}/invites", headers=headers)

    assert response.status_code == 200
    assert [invite["token"] for invite in response.json()] == [new["token"], old["token"]]


# --- opening (signed in) ---


@pytest.mark.asyncio
async def test_opening_a_valid_invite_names_the_team(client, db_session, redis):
    """The page names the team and when the link stops working."""
    team = await _team(db_session, "光復在地互助協會")
    team_uuid = str(team.uuid)
    invite = await _invite_for(client, db_session, redis, team)
    visitor = await _person(db_session, "志工")

    response = await client.get(
        f"/api/v1/invites/{invite['token']}", headers=await _site_headers(db_session, redis, visitor)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["team"] == {"uuid": team_uuid, "name": "光復在地互助協會", "type": "ngo"}
    assert body["expires_at"] == invite["expires_at"]
    assert (body["my_request"], body["pending_elsewhere"]) == (None, None)


@pytest.mark.asyncio
async def test_opening_needs_a_signed_in_caller(client, db_session, redis):
    """The visitor signs in (or verifies by OTP) before the link shows anything."""
    team = await _team(db_session)
    invite = await _invite_for(client, db_session, redis, team)

    response = await client.get(f"/api/v1/invites/{invite['token']}")

    assert response.status_code == 401


async def _invite_case(client, db_session, redis, case: str) -> tuple[str, dict]:
    """A token that should not work, for each way it can fail, and a visitor's headers."""
    team = await _team(db_session)
    invite = await _invite_for(client, db_session, redis, team)
    token = invite["token"]
    if case == "expired":
        await _expire(db_session, token)
    elif case == "unknown":
        token = "no-such-token"
    elif case == "suspended":
        await db_session.execute(text("UPDATE teams SET status = :s"), {"s": case})
    elif case == "deleted":
        await db_session.execute(text("UPDATE teams SET delete_at = now()"))
    await db_session.commit()
    visitor = await _person(db_session, "志工")
    return token, await _site_headers(db_session, redis, visitor)


CASES = ["expired", "unknown", "suspended", "deleted"]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES)
async def test_an_invite_that_does_not_work_is_a_404_when_opened(client, db_session, redis, case):
    """Every way of not working reads the same, so none can be told apart (ADR-353 point 3)."""
    token, headers = await _invite_case(client, db_session, redis, case)

    response = await client.get(f"/api/v1/invites/{token}", headers=headers)

    assert (response.status_code, response.json()["detail"]) == (404, "Invite not found")


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES)
async def test_an_invite_that_does_not_work_is_a_404_when_used(client, db_session, redis, case):
    """Requesting through it is refused the same way, and nothing is filed."""
    token, headers = await _invite_case(client, db_session, redis, case)

    response = await client.post(f"/api/v1/invites/{token}/requests", headers=headers, json=DETAILS)

    assert (response.status_code, response.json()["detail"]) == (404, "Invite not found")
    assert (await db_session.execute(select(RoleRequest))).first() is None


# --- requesting through it ---


@pytest.mark.asyncio
async def test_requesting_through_an_invite_files_a_member_request_for_its_team(client, db_session, redis):
    """The team and the identity come from the invite: an NGO team's invite is an `ngo` request."""
    team = await _team(db_session, type_="ngo")
    team_uuid = str(team.uuid)
    invite = await _invite_for(client, db_session, redis, team)
    visitor = await _person(db_session, "志工")
    headers = await _site_headers(db_session, redis, visitor)

    response = await client.post(f"/api/v1/invites/{invite['token']}/requests", headers=headers, json=DETAILS)

    assert response.status_code == 201, response.text
    request = (await db_session.execute(select(RoleRequest))).scalar_one()
    stored_invite = (await db_session.execute(select(TeamInvite))).scalar_one()
    assert (request.requested_role, str(request.team_uuid), request.invite_uuid) == (
        "ngo",
        team_uuid,
        stored_invite.uuid,
    )
    assert (request.applicant_name, request.status) == ("王小明", "pending")
    opened = await client.get(f"/api/v1/invites/{invite['token']}", headers=headers)
    assert opened.json()["my_request"]["uuid"] == str(request.uuid)


@pytest.mark.asyncio
async def test_a_gov_teams_invite_files_a_government_request(client, db_session, redis):
    """The identity follows the team's type (ADR-352 point 1)."""
    team = await _team(db_session, "某公所", type_="gov")
    invite = await _invite_for(client, db_session, redis, team)
    headers = await _site_headers(db_session, redis, await _person(db_session, "承辦"))

    response = await client.post(f"/api/v1/invites/{invite['token']}/requests", headers=headers, json=DETAILS)

    assert response.status_code == 201, response.text
    assert response.json()["requested_role"] == "government"


@pytest.mark.asyncio
async def test_a_member_of_another_team_may_request_through_an_invite(client, db_session, redis):
    """ADR-351 point 2, from the site: they act as `user` and hold role_request.add."""
    team, other = await _team(db_session, "B 隊"), await _team(db_session, "A 隊")
    other_uuid = other.uuid  # read now: creating the invite commits
    invite = await _invite_for(client, db_session, redis, team)
    visitor = await _person(db_session, "A 隊員")
    await _in_team(db_session, visitor, other_uuid, "member")

    response = await client.post(
        f"/api/v1/invites/{invite['token']}/requests",
        headers=await _site_headers(db_session, redis, visitor),
        json=DETAILS,
    )

    assert response.status_code == 201, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("setup", "status", "detail"),
    [
        ("member", 409, "You are already a member of this team"),
        ("pending", 409, "You already have a pending request"),
        ("no phone", 422, "A verified phone number is required"),
        ("blank name", 422, "Name is required"),
    ],
)
async def test_refusals_through_an_invite(client, db_session, redis, setup, status, detail):
    """The submit's refusals come back as 409 or 422 with their own words."""
    team = await _team(db_session)
    team_uuid = team.uuid  # read now: creating the invite commits
    invite = await _invite_for(client, db_session, redis, team)
    visitor = await _person(db_session, "志工", phone=setup != "no phone")
    if setup == "member":
        await _in_team(db_session, visitor, team_uuid, "member")
    if setup == "pending":
        db_session.add(RoleRequest(requested_role="data_auditor", reason=REASON, created_by=visitor.uuid))
        await db_session.flush()
    headers = await _site_headers(db_session, redis, visitor)
    body = {**DETAILS, "name": "  "} if setup == "blank name" else DETAILS

    response = await client.post(f"/api/v1/invites/{invite['token']}/requests", headers=headers, json=body)

    assert (response.status_code, response.json()["detail"]) == (status, detail)


@pytest.mark.asyncio
async def test_requesting_through_an_invite_needs_a_signed_in_caller(client, db_session, redis):
    """No account, no request."""
    team = await _team(db_session)
    invite = await _invite_for(client, db_session, redis, team)

    response = await client.post(f"/api/v1/invites/{invite['token']}/requests", json=DETAILS)

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_opening_tells_of_a_pending_request_elsewhere(client, db_session, redis):
    """One pending per account: the page can ask to withdraw it before submitting (PR #93 review)."""
    team, other = await _team(db_session, "B 隊"), await _team(db_session, "A 隊")
    other_uuid = other.uuid
    invite = await _invite_for(client, db_session, redis, team)
    visitor = await _person(db_session, "志工")
    db_session.add(
        RoleRequest(requested_role="ngo", reason=REASON, team_uuid=other_uuid, created_by=visitor.uuid)
    )
    await db_session.flush()
    headers = await _site_headers(db_session, redis, visitor)

    body = (await client.get(f"/api/v1/invites/{invite['token']}", headers=headers)).json()

    assert body["my_request"] is None
    assert (body["pending_elsewhere"]["team_name"], body["pending_elsewhere"]["requested_role"]) == (
        "A 隊",
        "ngo",
    )
