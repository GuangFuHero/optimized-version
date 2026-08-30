"""audit_logs.context records the identity a change was made under (feature 010, ADR-076).

The point of the column is attribution that survives: "who did this" is no longer enough
once one person can act as several identities, and the role or team that answers "on whose
behalf" may be renamed or deleted before anyone reads the trail.
"""

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text

from app.db.triggers import AUDIT_TRIGGER_FUNC_SQL, get_audit_trigger_sql
from app.models.audit import AuditLog
from app.models.auth import User
from app.models.rbac import Role, UserRoleAssign
from app.models.team import Team
from tests.conftest import auth_headers_for

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture(autouse=True)
async def _install_audit_trigger_on_users(db_session):
    """Install the real trigger onto `users` for this test's schema instance.

    The schema is dropped and recreated per test, taking any trigger with it.
    """
    await db_session.execute(text(AUDIT_TRIGGER_FUNC_SQL))
    await db_session.execute(text(get_audit_trigger_sql("users")))
    await db_session.commit()


async def _actor_with_identity(db, *, team_name: str | None):
    """A user holding one role, in a team when `team_name` is given.

    Returns (user_uuid, headers) — headers acting as exactly that identity.
    """
    actor = User(name="Audit Actor")
    db.add(actor)
    if team_name:
        role = Role(name="member", kind="team")
        db.add(role)
    else:
        # The db_session fixture already seeds the default platform role.
        role = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one()
    team = Team(name=team_name, type="ngo") if team_name else None
    if team is not None:
        db.add(team)
    await db.flush()
    db.add(
        UserRoleAssign(
            user_uuid=actor.uuid,
            role_uuid=role.uuid,
            team_uuid=team.uuid if team is not None else None,
        )
    )
    actor_uuid = str(actor.uuid)
    headers = auth_headers_for(actor_uuid, role, team)
    role_uuid = str(role.uuid)
    await db.commit()
    return actor_uuid, headers, role_uuid


async def _rename_self(client, headers) -> None:
    """Make one audited write as the caller."""
    resp = await client.patch(
        "/api/v1/users/me", json={"name": "Renamed"}, headers=headers
    )
    assert resp.status_code == 200, resp.text


async def _audit_row(db, actor_uuid: str) -> AuditLog:
    """The single UPDATE row logged for this actor."""
    logs = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.table_name == "users",
                AuditLog.row_id == actor_uuid,
                AuditLog.action == "UPDATE",
            )
        )
    ).scalars().all()
    assert len(logs) == 1
    return logs[0]


async def test_a_team_identity_is_recorded_with_its_role_and_team_names(client, db_session):
    """Acting as member@慈濟 records both names, not just uuids."""
    actor_uuid, headers, role_uuid = await _actor_with_identity(db_session, team_name="慈濟")
    await _rename_self(client, headers)

    identity = (await _audit_row(db_session, actor_uuid)).context["identity"]
    assert identity["role"] == "member"
    assert identity["team"] == "慈濟"
    assert identity["role_uuid"] == role_uuid


async def test_a_platform_identity_records_a_null_team(client, db_session):
    """A platform identity belongs to no team, and the snapshot says so rather than omitting it."""
    actor_uuid, headers, _ = await _actor_with_identity(db_session, team_name=None)
    await _rename_self(client, headers)

    identity = (await _audit_row(db_session, actor_uuid)).context["identity"]
    assert identity["role"] == "user"
    assert identity["team"] is None
    assert identity["team_uuid"] is None


async def test_the_snapshot_outlives_the_role_it_names(client, db_session):
    """Hard-deleting the role afterwards does not erase what the trail says (ADR-076).

    This is why names are copied in rather than joined at read time: DELETE /rbac/roles/{uuid}
    is a hard delete, so a uuid alone would dangle.
    """
    actor_uuid, headers, role_uuid = await _actor_with_identity(db_session, team_name="慈濟")
    await _rename_self(client, headers)

    await db_session.execute(delete(UserRoleAssign).where(UserRoleAssign.role_uuid == role_uuid))
    await db_session.execute(delete(Role).where(Role.uuid == role_uuid))
    await db_session.commit()

    identity = (await _audit_row(db_session, actor_uuid)).context["identity"]
    assert identity["role"] == "member"
    assert identity["team"] == "慈濟"


async def test_an_unauthenticated_write_records_no_identity(client, db_session):
    """No identity means the column stays NULL — never a fabricated one."""
    actor = User(name="Nobody")
    db_session.add(actor)
    await db_session.flush()
    actor_uuid = str(actor.uuid)
    await db_session.commit()

    from sqlalchemy import update

    await db_session.execute(update(User).where(User.uuid == actor_uuid).values(name="Changed"))
    await db_session.commit()

    assert (await _audit_row(db_session, actor_uuid)).context is None
