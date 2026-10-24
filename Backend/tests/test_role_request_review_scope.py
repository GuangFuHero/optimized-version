"""Who sees and decides which request (Spec/026 Task 5, ADR-354).

A team admin reviews the member requests for their own team through team.member.manage; a
super admin (role_request.review) reviews everything. Anything outside a reviewer's reach is
not found, so a team admin cannot learn of another team's requests.
"""

import uuid

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.role_request import RoleRequest
from app.models.team import Team
from tests.conftest import auth_headers_for

URL = "/api/v1/admin/role-requests"


async def _role(db, name: str, kind: str = "platform", grants: tuple[tuple[Perm, str], ...] = ()) -> Role:
    """The role called `name`, created on first use with `grants`."""
    role = (await db.execute(select(Role).where(Role.name == name))).scalar_one_or_none()
    if role is not None:
        return role
    role = Role(name=name, kind=kind)
    db.add(role)
    await db.flush()
    for perm, scope in grants:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))
    await db.flush()
    return role


async def _user(db, name: str) -> User:
    user = User(name=name)
    db.add(user)
    await db.flush()
    return user


class World:
    """Two teams with an admin each, a super admin, a member, and one request of every kind."""

    async def build(self, db, redis) -> "World":
        """Arrange the world and mint everyone's headers."""
        self.team_a = Team(name="A 隊", type="ngo", status="active")
        self.team_b = Team(name="B 隊", type="ngo", status="active")
        db.add_all([self.team_a, self.team_b])
        await db.flush()
        admin = await _role(db, "admin", "team", ((Perm.TEAM_MEMBER_MANAGE, "team"),))
        member = await _role(db, "member", "team")
        super_admin = await _role(
            db, "super_admin", grants=((Perm.ROLE_REQUEST_REVIEW, "all"), (Perm.TEAM_MEMBER_MANAGE, "all"))
        )
        plain = await _role(db, "user")
        people = {
            name: await _user(db, name) for name in ("A admin", "B admin", "super", "A member", "applicant")
        }
        db.add_all(
            [
                UserRoleAssign(
                    user_uuid=people["A admin"].uuid, role_uuid=admin.uuid, team_uuid=self.team_a.uuid
                ),
                UserRoleAssign(
                    user_uuid=people["B admin"].uuid, role_uuid=admin.uuid, team_uuid=self.team_b.uuid
                ),
                UserRoleAssign(
                    user_uuid=people["A member"].uuid, role_uuid=member.uuid, team_uuid=self.team_a.uuid
                ),
                UserRoleAssign(user_uuid=people["super"].uuid, role_uuid=super_admin.uuid),
                UserRoleAssign(user_uuid=people["applicant"].uuid, role_uuid=plain.uuid),
            ]
        )
        applicants = [await _user(db, f"申請人{i}") for i in range(4)]
        rows = {
            "A member request": RoleRequest(team_uuid=self.team_a.uuid, requested_role="ngo"),
            "B member request": RoleRequest(team_uuid=self.team_b.uuid, requested_role="ngo"),
            "new team": RoleRequest(new_team_name="新隊", requested_role="ngo"),
            "data auditor": RoleRequest(requested_role="data_auditor"),
        }
        for applicant, row in zip(applicants, rows.values(), strict=True):
            row.reason, row.created_by = "理由", applicant.uuid
            row.applicant_name, row.applicant_phone = "王小明", "+886912345678"
        db.add_all(rows.values())
        await db.flush()
        self.requests = {name: str(row.uuid) for name, row in rows.items()}
        self.team_a_uuid = str(self.team_a.uuid)  # read now: the commit below expires it
        identities = {
            "A admin": (people["A admin"].uuid, admin.uuid, self.team_a.uuid),
            "B admin": (people["B admin"].uuid, admin.uuid, self.team_b.uuid),
            "A member": (people["A member"].uuid, member.uuid, self.team_a.uuid),
            "super": (people["super"].uuid, super_admin.uuid, None),
            "applicant": (people["applicant"].uuid, plain.uuid, None),
        }
        await db.commit()
        self.headers = {who: await auth_headers_for(redis, *ids) for who, ids in identities.items()}
        return self


async def _listed(client, world: World, who: str, **params) -> set[str]:
    response = await client.get(URL, headers=world.headers[who], params=params)
    assert response.status_code == 200, response.text
    names = {uuid_: name for name, uuid_ in world.requests.items()}
    return {names[item["uuid"]] for item in response.json()}


@pytest.mark.asyncio
async def test_a_team_admin_sees_only_their_teams_member_requests(client, db_session, redis):
    """Not the other team's, not new-team or data auditor applications."""
    world = await World().build(db_session, redis)

    assert await _listed(client, world, "A admin") == {"A member request"}
    assert await _listed(client, world, "B admin") == {"B member request"}


@pytest.mark.asyncio
async def test_a_super_admin_sees_every_request(client, db_session, redis):
    """role_request.review reaches every kind of request."""
    world = await World().build(db_session, redis)

    assert await _listed(client, world, "super") == set(world.requests)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"kind": "member"}, {"A member request", "B member request"}),
        ({"kind": "new_team"}, {"new team"}),
        ({"kind": "data_auditor"}, {"data auditor"}),
        ({"team": "A"}, {"A member request"}),
    ],
)
async def test_the_list_filters_by_kind_and_team(client, db_session, redis, params, expected):
    """The super admin's queue can show one kind, or one team, at a time."""
    world = await World().build(db_session, redis)
    if params.pop("team", None):
        params["team_uuid"] = world.team_a_uuid

    assert await _listed(client, world, "super", **params) == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("who", ["A member", "applicant"])
async def test_someone_who_reviews_nothing_cannot_list(client, db_session, redis, who):
    """Neither role_request.review nor team.member.manage: 403."""
    world = await World().build(db_session, redis)

    response = await client.get(URL, headers=world.headers[who])

    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("target", ["B member request", "new team", "data auditor"])
@pytest.mark.parametrize("decision", ["approve", "reject"])
async def test_a_team_admin_cannot_decide_outside_their_reach(client, db_session, redis, target, decision):
    """Not found, not forbidden: the request's existence is not given away."""
    world = await World().build(db_session, redis)

    response = await client.post(
        f"{URL}/{world.requests[target]}/{decision}", headers=world.headers["A admin"], json={"note": "理由"}
    )

    assert (response.status_code, response.json()["detail"]) == (404, "Role request not found")
    status = (
        await db_session.execute(
            select(RoleRequest.status).where(RoleRequest.uuid == uuid.UUID(world.requests[target]))
        )
    ).scalar_one()
    assert status == "pending"


@pytest.mark.asyncio
async def test_a_team_admin_rejects_their_teams_request_with_a_reason(client, db_session, redis):
    """The reason is what the applicant reads."""
    world = await World().build(db_session, redis)

    response = await client.post(
        f"{URL}/{world.requests['A member request']}/reject",
        headers=world.headers["A admin"],
        json={"note": "請先跟隊長確認"},
    )

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["review_note"]) == ("rejected", "請先跟隊長確認")


@pytest.mark.asyncio
@pytest.mark.parametrize("note", [None, "   "])
async def test_rejecting_needs_a_reason(client, db_session, redis, note):
    """BE-038 step 4: a rejection always tells the applicant why."""
    world = await World().build(db_session, redis)

    response = await client.post(
        f"{URL}/{world.requests['A member request']}/reject",
        headers=world.headers["super"],
        json={"note": note},
    )

    assert (response.status_code, response.json()["detail"]) == (422, "A reason is required")


@pytest.mark.asyncio
async def test_a_member_cannot_decide_their_teams_request(client, db_session, redis):
    """Membership alone does not make a reviewer: 403."""
    world = await World().build(db_session, redis)

    response = await client.post(
        f"{URL}/{world.requests['A member request']}/reject",
        headers=world.headers["A member"],
        json={"note": "x"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_the_list_carries_the_team_and_the_applicants_details(client, db_session, redis):
    """So the team admin can call to confirm (ADR-354 point 3)."""
    world = await World().build(db_session, redis)

    [item] = (await client.get(URL, headers=world.headers["A admin"])).json()

    assert (item["team_uuid"], item["team_name"], item["via_invite"]) == (
        world.team_a_uuid,
        "A 隊",
        False,
    )
    assert item["applicant_details"] == {"name": "王小明", "phone": "+886912345678", "email": None}
