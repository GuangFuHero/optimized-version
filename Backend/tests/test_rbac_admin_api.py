"""Integration tests for the read-only RBAC admin surface (feature 009, Phase 1)."""

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.core.security import create_access_token
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserPermissionAssign, UserRoleAssign


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


@pytest.mark.asyncio
async def test_user_permissions_merges_role_and_direct_widest_wins(client, db_session):
    """Direct and role grants merge, widest scope wins."""
    admin_uuid = await _make_rbac_admin(db_session)
    role = Role(name="viewer", kind="platform")
    db_session.add(role)
    await db_session.flush()
    perm_cache: dict = {}
    await _grant(db_session, role, perm_cache, Perm.TICKET_VIEW, "team")
    target = User(name="Target")
    db_session.add(target)
    await db_session.flush()
    target_uuid = str(target.uuid)
    db_session.add(UserRoleAssign(user_uuid=target.uuid, role_uuid=role.uuid))
    perm = perm_cache[Perm.TICKET_VIEW.value]
    db_session.add(
        UserPermissionAssign(user_uuid=target.uuid, permission_uuid=perm.uuid, scope="all")
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/admin/users/{target_uuid}/permissions", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["direct_grants"]["ticket.view"] == "all"
    assert body["effective"]["ticket.view"] == "all"  # widest(team, all) == all
    assert any(r["name"] == "viewer" for r in body["roles"])


# --- Phase 2: matrix write (PUT / DELETE a cell) ---------------------------------------


async def _make_super_admin(db) -> tuple[str, str]:
    """super_admin holding rbac.view+edit+assign at scope all. Returns (user_uuid, role_uuid)."""
    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    role_uuid = str(role.uuid)
    cache: dict = {}
    for cap in (Perm.RBAC_VIEW, Perm.RBAC_EDIT, Perm.RBAC_ASSIGN):
        await _grant(db, role, cache, cap, "all")
    user = User(name="Root")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid, role_uuid


async def _make_editable_role(db, name: str = "member") -> str:
    """A plain team role with no grants yet, for matrix-edit tests. Returns its uuid."""
    role = Role(name=name, kind="team")
    db.add(role)
    await db.flush()
    role_uuid = str(role.uuid)
    await db.commit()
    return role_uuid


@pytest.mark.asyncio
async def test_put_grant_sets_new_cell(client, db_session):
    """super_admin can add a role×capability grant; the response reflects the new scope."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)

    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["grants"]["ticket.edit"] == "own"


@pytest.mark.asyncio
async def test_put_grant_updates_existing_cell_without_duplicating(client, db_session):
    """A second PUT to the same cell updates the scope in place (uq_role_perm upsert), not a 2nd row."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    hdr = _auth_header(admin_uuid)
    url = f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit"

    await client.put(url, json={"scope": "own"}, headers=hdr)
    resp = await client.put(url, json={"scope": "zone"}, headers=hdr)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["grants"]["ticket.edit"] == "zone"

    rows = (
        await db_session.execute(
            select(RolePermissionAssign)
            .join(Permission, Permission.uuid == RolePermissionAssign.permission_uuid)
            .where(RolePermissionAssign.role_uuid == role_uuid, Permission.key == "ticket.edit")
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_put_grant_rejects_bad_scope(client, db_session):
    """An out-of-enum scope is rejected by the schema with 422 (ADR-057 fixed scope set)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "galaxy"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_put_grant_rejects_unknown_capability(client, db_session):
    """An unknown capability key in the path is rejected with 422 (cap ∈ Perm, ADR-057)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.telepathy",
        json={"scope": "own"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_put_grant_denied_for_non_super_admin(client, db_session):
    """A caller without rbac.edit is denied with 403 (checkpoint 1, super_admin only)."""
    plain_uuid = await _make_plain_user(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=_auth_header(plain_uuid),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_put_grant_unknown_role_404(client, db_session):
    """Setting a grant on a non-existent role returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{uuid4()}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_cannot_none_out_super_admin_rbac_edit(client, db_session):
    """Scoping super_admin's rbac.edit down to none is refused with 409 (self-lock guard, ADR-056)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}/permissions/rbac.edit",
        json={"scope": "none"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409
