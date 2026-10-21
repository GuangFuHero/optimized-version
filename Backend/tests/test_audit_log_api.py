"""The audit-log read API (Spec/026 Task 10, ADR-358).

Rows are written directly in the shape the audit trigger leaves (`to_jsonb(row)`, uuids as
strings): the test schema is built from the models and carries no triggers.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import null, select, text

from app.core.permissions import Perm
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from app.models.team import Team
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import auth_headers_for

URL = "/api/v1/admin/audit-logs"


def _seeded(role_name: str, *perms: Perm) -> tuple[tuple[Perm, str], ...]:
    """The scopes the seed gives `role_name` for `perms`, so the test follows the seed."""
    granted = next(spec["permissions"] for spec in ROLES_DATA if spec["name"] == role_name)
    if isinstance(granted, list):  # super_admin's list means `all` for each
        granted = {perm: "all" for perm in granted}
    return tuple((perm, granted[perm]) for perm in perms if perm in granted)


async def _role(db, name: str, kind: str, grants) -> Role:
    """The role called `name`, created with `grants`."""
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


def _row(
    table: str, *, new: dict | None = None, old: dict | None = None, row_id=None, ago: int = 0
) -> AuditLog:
    return AuditLog(
        table_name=table,
        action="INSERT" if old is None else ("DELETE" if new is None else "UPDATE"),
        row_id=row_id or uuid.uuid4(),
        # SQL NULL where the trigger leaves a state out (an INSERT's old, a DELETE's new); a bare
        # None would be stored as JSON null, which COALESCE would pick.
        old_values=null() if old is None else old,
        new_values=null() if new is None else new,
        user_uuid=None,
        client_ip="203.0.113.7",
        created_at=datetime.now(UTC) - timedelta(minutes=ago),
    )


class World:
    """Teams A and B, their audit rows, and the people who read them."""

    async def build(self, db, redis) -> "World":
        """Arrange the world and mint headers."""
        a, b = Team(name="A", type="ngo", status="active"), Team(name="B", type="ngo", status="active")
        db.add_all([a, b])
        await db.flush()
        ta, tb = str(a.uuid), str(b.uuid)
        rows = {
            "A team row": _row("teams", new={"uuid": ta, "name": "A"}, row_id=a.uuid, ago=6),
            "A grant": _row("user_role_assign", new={"team_uuid": ta}, ago=5),
            "A removal": _row("user_role_assign", old={"team_uuid": ta}, ago=4),
            "A request": _row(
                "role_requests", new={"team_uuid": ta, "applicant_phone": "+886912345678"}, ago=3
            ),
            "A founded": _row("role_requests", old={"team_uuid": None}, new={"granted_team_uuid": ta}, ago=2),
            "A invite": _row("team_invites", new={"team_uuid": ta}, ago=1),
            "B grant": _row("user_role_assign", new={"team_uuid": tb}, ago=1),
            "station": _row("stations", new={"team_uuid": ta}, ago=0),
            "user": _row("users", new={"name": "x"}, ago=0),
        }
        db.add_all(rows.values())
        await db.flush()
        self.rows = {str(row.uuid): name for name, row in rows.items()}
        admin = await _role(db, "admin", "team", _seeded("admin", Perm.TEAM_AUDIT_VIEW, Perm.AUDIT_VIEW))
        member = await _role(db, "member", "team", _seeded("member", Perm.TEAM_AUDIT_VIEW, Perm.AUDIT_VIEW))
        auditor = await _role(db, "data_auditor", "platform", _seeded("data_auditor", Perm.AUDIT_VIEW))
        boss = await _role(
            db,
            "super_admin",
            "platform",
            _seeded("super_admin", Perm.AUDIT_VIEW, Perm.TEAM_AUDIT_VIEW, Perm.ROLE_REQUEST_REVIEW),
        )
        identities = {}
        for who, role, team in (
            ("A admin", admin, a),
            ("A member", member, a),
            ("auditor", auditor, None),
            ("super", boss, None),
        ):
            user = User(name=who)
            db.add(user)
            await db.flush()
            db.add(
                UserRoleAssign(
                    user_uuid=user.uuid, role_uuid=role.uuid, team_uuid=team.uuid if team else None
                )
            )
            identities[who] = (user.uuid, role.uuid, team.uuid if team else None)
        await db.commit()
        self.headers = {who: await auth_headers_for(redis, *ids) for who, ids in identities.items()}
        return self


async def _read(client, world: World, who: str, **params) -> list[str]:
    response = await client.get(URL, headers=world.headers[who], params=params)
    assert response.status_code == 200, response.text
    return [world.rows[item["uuid"]] for item in response.json()]


@pytest.mark.asyncio
async def test_a_team_admin_reads_the_changes_to_their_team_newest_first(client, db_session, redis):
    """The team, its grants, requests and invites; not another team's, not stations or users."""
    world = await World().build(db_session, redis)

    assert await _read(client, world, "A admin") == [
        "A invite",
        "A founded",
        "A request",
        "A removal",
        "A grant",
        "A team row",
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("who", ["super", "auditor"])
async def test_the_platform_view_reads_every_change(client, db_session, redis, who):
    """audit.view at `all`: super admins and data auditors."""
    world = await World().build(db_session, redis)

    assert set(await _read(client, world, who)) == set(world.rows.values())


@pytest.mark.asyncio
async def test_a_member_cannot_read_the_log(client, db_session, redis):
    """Team admins only (Popo, 2026-10-20)."""
    world = await World().build(db_session, redis)

    response = await client.get(URL, headers=world.headers["A member"])

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_team_admin_does_not_read_where_people_connected_from(client, db_session, redis):
    """client_ip is for the platform view only."""
    world = await World().build(db_session, redis)

    team_items = (await client.get(URL, headers=world.headers["A admin"])).json()
    platform_items = (await client.get(URL, headers=world.headers["super"])).json()

    assert {item["client_ip"] for item in team_items} == {None}
    assert {item["client_ip"] for item in platform_items} == {"203.0.113.7"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"table": "role_requests"}, ["A founded", "A request"]),
        ({"limit": 2}, ["A invite", "A founded"]),
        ({"limit": 2, "offset": 2}, ["A request", "A removal"]),
    ],
)
async def test_filters_and_pages(client, db_session, redis, params, expected):
    """Narrowing applies inside the team view too."""
    world = await World().build(db_session, redis)

    assert await _read(client, world, "A admin", **params) == expected


@pytest.mark.asyncio
async def test_a_page_is_at_most_100(client, db_session, redis):
    """A larger page is refused (422)."""
    world = await World().build(db_session, redis)

    response = await client.get(URL, headers=world.headers["super"], params={"limit": 101})

    assert response.status_code == 422


def test_audit_view_keeps_its_two_holders():
    """ADR-130 rests on it; team admins got a capability of their own (ADR-358 point 5)."""
    holders = [spec["name"] for spec in ROLES_DATA if Perm.AUDIT_VIEW in spec["permissions"]]
    assert holders == ["data_auditor", "super_admin"]


@pytest.mark.asyncio
async def test_the_team_view_uses_the_index(db_session):
    """ADR-358 point 6, on the SQL the API sends, with the index the model and migration create."""
    await db_session.execute(text("SET enable_seqscan = off"))
    plan = (
        (
            await db_session.execute(
                text(
                    "EXPLAIN SELECT * FROM audit_logs"
                    " WHERE (COALESCE(new_values, old_values) ->> 'team_uuid') = :t"
                ),
                {"t": str(uuid.uuid4())},
            )
        )
        .scalars()
        .all()
    )
    assert any("ix_audit_logs_team_uuid" in line for line in plan), plan


@pytest.mark.asyncio
@pytest.mark.parametrize(("who", "expected"), [("auditor", "[redacted]"), ("super", "+886912345678")])
async def test_login_contacts_are_masked_for_data_auditors(client, db_session, redis, who, expected):
    """PR #93 review: `table=user_contacts` must not undo the applicant masking (ADR-359 point 5)."""
    world = await World().build(db_session, redis)
    db_session.add(_row("user_contacts", new={"type": "phone", "value": "+886912345678"}))
    await db_session.commit()

    response = await client.get(URL, headers=world.headers[who], params={"table": "user_contacts"})

    assert [item["new_values"]["value"] for item in response.json()] == [expected]
