"""Who reads `users.real_name` (Spec/026 Task 11, ADR-355 point 5).

Only those who may decide applicants' requests: super admins (role_request.review) in the user
list. Never the site, history actor names, or anything else that shows `users.name`.
"""

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.graphql.schema import schema
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign
from tests.conftest import auth_headers_for

URL = "/api/v1/admin/users"


async def _reader(db, name: str, perms: tuple[Perm, ...]) -> tuple:
    """An account acting as a fresh platform role holding `perms` at `all`."""
    role = Role(name=name, kind="platform")
    db.add(role)
    await db.flush()
    for perm in perms:
        permission = (
            await db.execute(select(Permission).where(Permission.key == perm.value))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(key=perm.value)
            db.add(permission)
            await db.flush()
        db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope="all"))
    user = User(name=name)
    db.add(user)
    await db.flush()
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    return user.uuid, role.uuid


async def _real_names(client, db, redis, perms: tuple[Perm, ...]) -> dict[str, str | None]:
    """The list as a reader holding `perms` sees it, by nickname."""
    db.add(User(name="小明", real_name="王小明"))
    ids = await _reader(db, f"reader-{len(perms)}", perms)
    await db.commit()
    response = await client.get(URL, headers=await auth_headers_for(redis, *ids))
    assert response.status_code == 200, response.text
    return {item["name"]: item["real_name"] for item in response.json()}


@pytest.mark.asyncio
async def test_a_super_admin_reads_the_real_name(client, db_session, redis):
    """role_request.review: the reviewer who confirmed it."""
    names = await _real_names(client, db_session, redis, (Perm.USER_VIEW, Perm.ROLE_REQUEST_REVIEW))

    assert names["小明"] == "王小明"


@pytest.mark.asyncio
async def test_a_data_auditor_reads_the_list_without_it(client, db_session, redis):
    """user.view alone, as the seed gives data_auditor: the field is there and empty."""
    names = await _real_names(client, db_session, redis, (Perm.USER_VIEW,))

    assert names["小明"] is None


def test_the_site_graphql_schema_never_exposes_it():
    """No type, the user reference and history actors included, carries a real name."""
    sdl = schema.as_str()

    assert "realName" not in sdl
    assert "real_name" not in sdl
