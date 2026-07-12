"""Integration tests for the read-only RBAC admin surface (feature 009, Phase 1)."""

from uuid import uuid4

import pytest

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserRoleAssign


def _auth_header(user_uuid: str) -> dict:
    token = create_access_token(data={"sub": str(user_uuid)})
    return {"Authorization": f"Bearer {token}"}


async def _grant(db, role: Role, perm_cache: dict, perm: Perm, scope: str) -> None:
    permission = perm_cache.get(perm.value)
    if permission is None:
        permission = Permission(key=perm.value)
        db.add(permission)
        await db.flush()
        perm_cache[perm.value] = permission
    db.add(RolePermissionAssign(role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope))


async def _make_rbac_admin(db) -> str:
    """super_admin user holding only rbac.view (enough for the read surface). Returns uuid."""
    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    await _grant(db, role, {}, Perm.RBAC_VIEW, "all")
    user = User(name="RBAC Admin")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid


async def _make_plain_user(db) -> str:
    user = User(name="Plain")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


@pytest.mark.asyncio
async def test_capabilities_lists_catalog_for_super_admin(client, db_session):
    """A super_admin holding only rbac.view sees the full capability catalog + scopes."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        "/api/v1/admin/rbac/capabilities", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert "none" in body["scopes"] and "all" in body["scopes"]
    keys = {c["key"] for c in body["capabilities"]}
    assert "ticket.add" in keys and "rbac.view" in keys
    ticket_view = next(c for c in body["capabilities"] if c["key"] == "ticket.view")
    assert ticket_view["public"] is True
    assert ticket_view["resource"] == "ticket" and ticket_view["action"] == "view"


@pytest.mark.asyncio
async def test_capabilities_denied_without_rbac_view(client, db_session):
    """A caller without rbac.view is denied — checkpoint 1 only, but still enforced."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get(
        "/api/v1/admin/rbac/capabilities", headers=_auth_header(plain_uuid)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_matrix_returns_roles_with_grants(client, db_session):
    """Matrix endpoint lists all roles with their capability->scope grants."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get("/api/v1/admin/rbac/matrix", headers=_auth_header(admin_uuid))
    assert resp.status_code == 200, resp.json()
    roles = resp.json()["roles"]
    super_admin = next(r for r in roles if r["name"] == "super_admin")
    assert super_admin["kind"] == "platform"
    assert super_admin["grants"]["rbac.view"] == "all"


@pytest.mark.asyncio
async def test_role_detail_returns_grants(client, db_session):
    """Role detail endpoint returns one role's capability->scope grants."""
    admin_uuid = await _make_rbac_admin(db_session)
    matrix = (
        await client.get("/api/v1/admin/rbac/matrix", headers=_auth_header(admin_uuid))
    ).json()
    role_uuid = next(r["uuid"] for r in matrix["roles"] if r["name"] == "super_admin")
    resp = await client.get(
        f"/api/v1/admin/rbac/roles/{role_uuid}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["grants"]["rbac.view"] == "all"


@pytest.mark.asyncio
async def test_role_detail_404_when_missing(client, db_session):
    """Role detail endpoint returns 404 for missing role."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/rbac/roles/{uuid4()}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_permissions_returns_roles_and_effective(client, db_session):
    """User permissions endpoint returns roles, direct grants, and effective permissions."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/users/{admin_uuid}/permissions", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert any(r["name"] == "super_admin" for r in body["roles"])
    assert body["effective"]["rbac.view"] == "all"
    assert body["direct_grants"] == {}


@pytest.mark.asyncio
async def test_user_permissions_404_when_user_missing(client, db_session):
    """User permissions endpoint returns 404 for missing user."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/users/{uuid4()}/permissions", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 404
