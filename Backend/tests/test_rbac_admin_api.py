"""Integration tests for the read-only RBAC admin surface (feature 009, Phase 1)."""

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.permissions import GOV_TEAM_ONLY_PERMS, Perm
from app.models.auth import User
from app.models.rbac import Permission, Role, RolePermissionAssign, UserPermissionAssign, UserRoleAssign
from app.models.team import Team
from tests.conftest import auth_headers_for


async def _auth_header(redis, user_uuid: str) -> dict:
    return await auth_headers_for(redis, user_uuid)


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
async def test_capabilities_lists_catalog_for_super_admin(client, db_session, redis):
    """A super_admin holding only rbac.view sees the full capability catalog + scopes."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        "/api/v1/admin/rbac/capabilities", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert "none" in body["scopes"] and "all" in body["scopes"]
    keys = {c["key"] for c in body["capabilities"]}
    assert "ticket.add" in keys and "rbac.view" in keys
    ticket_view = next(c for c in body["capabilities"] if c["key"] == "ticket.view")
    assert ticket_view["public"] is True
    assert ticket_view["resource"] == "ticket" and ticket_view["action"] == "view"
    assert ticket_view["team_gov_only"] is False


@pytest.mark.asyncio
async def test_capabilities_flag_work_zone_caps_as_gov_team_only(client, db_session, redis):
    """ZONE_* caps are marked team_gov_only so the catalog matches the gov gate, both ways.

    ADR-064: work_zone.py's `_require_gov_zone_authority` gates these; non-zone caps stay False.
    The per-key assertions below document intent readably. The exhaustiveness assertion at the
    end is the drift net: it fails if a future capability is added to `_require_gov_zone_authority`
    without being added to `GOV_TEAM_ONLY_PERMS` (or vice versa), since those two are manually
    synchronised sources of truth.
    """
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        "/api/v1/admin/rbac/capabilities", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    by_key = {c["key"]: c for c in resp.json()["capabilities"]}

    for cap in ("work_zone.add", "work_zone.edit", "work_zone.assign", "work_zone.delete"):
        assert by_key[cap]["team_gov_only"] is True, cap
    # work_zone.view is not gated by _require_gov_zone_authority, so it stays False.
    assert by_key["work_zone.view"]["team_gov_only"] is False
    assert by_key["ticket.assign"]["team_gov_only"] is False

    flagged = {key for key, cap in by_key.items() if cap["team_gov_only"] is True}
    assert flagged == {p.value for p in GOV_TEAM_ONLY_PERMS}


@pytest.mark.asyncio
async def test_capabilities_denied_without_rbac_view(client, db_session, redis):
    """A caller without rbac.view is denied — checkpoint 1 only, but still enforced."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get(
        "/api/v1/admin/rbac/capabilities", headers=await _auth_header(redis, plain_uuid)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_matrix_returns_roles_with_grants(client, db_session, redis):
    """Matrix endpoint lists all roles with their capability->scope grants."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get("/api/v1/admin/rbac/matrix", headers=await _auth_header(redis, admin_uuid))
    assert resp.status_code == 200, resp.json()
    roles = resp.json()["roles"]
    super_admin = next(r for r in roles if r["name"] == "super_admin")
    assert super_admin["kind"] == "platform"
    assert super_admin["grants"]["rbac.view"] == "all"


@pytest.mark.asyncio
async def test_role_detail_returns_grants(client, db_session, redis):
    """Role detail endpoint returns one role's capability->scope grants."""
    admin_uuid = await _make_rbac_admin(db_session)
    matrix = (
        await client.get("/api/v1/admin/rbac/matrix", headers=await _auth_header(redis, admin_uuid))
    ).json()
    role_uuid = next(r["uuid"] for r in matrix["roles"] if r["name"] == "super_admin")
    resp = await client.get(
        f"/api/v1/admin/rbac/roles/{role_uuid}", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["grants"]["rbac.view"] == "all"


@pytest.mark.asyncio
async def test_role_detail_404_when_missing(client, db_session, redis):
    """Role detail endpoint returns 404 for missing role."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/rbac/roles/{uuid4()}", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_permissions_returns_roles_and_effective(client, db_session, redis):
    """User permissions endpoint returns roles, direct grants, and effective permissions."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/users/{admin_uuid}/permissions", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    super_admin = next(i for i in body["identities"] if i["role"] == "super_admin")
    assert super_admin["team"] is None
    assert super_admin["effective"]["rbac.view"] == "all"
    assert body["direct_grants"] == []


@pytest.mark.asyncio
async def test_user_permissions_404_when_user_missing(client, db_session, redis):
    """User permissions endpoint returns 404 for missing user."""
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/users/{uuid4()}/permissions", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_user_permissions_merges_role_and_direct_widest_wins(client, db_session, redis):
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
        f"/api/v1/admin/users/{target_uuid}/permissions", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["direct_grants"] == [
        {"capability": "ticket.view", "scope": "all", "team_uuid": None}
    ]
    viewer = next(i for i in body["identities"] if i["role"] == "viewer")
    assert viewer["effective"]["ticket.view"] == "all"  # widest(team, all) == all


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
async def test_put_grant_sets_new_cell(client, db_session, redis):
    """super_admin can add a role×capability grant; the response reflects the new scope."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)

    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["grants"]["ticket.edit"] == "own"


@pytest.mark.asyncio
async def test_put_grant_updates_existing_cell_without_duplicating(client, db_session, redis):
    """A second PUT to the same cell updates the scope in place (uq_role_perm upsert), not a 2nd row."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    hdr = await _auth_header(redis, admin_uuid)
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
async def test_put_grant_rejects_bad_scope(client, db_session, redis):
    """An out-of-enum scope is rejected by the schema with 422 (ADR-057 fixed scope set)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "galaxy"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_put_grant_rejects_unknown_capability(client, db_session, redis):
    """An unknown capability key in the path is rejected with 422 (cap ∈ Perm, ADR-057)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.telepathy",
        json={"scope": "own"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_put_grant_denied_for_non_super_admin(client, db_session, redis):
    """A caller without rbac.edit is denied with 403 (checkpoint 1, super_admin only)."""
    plain_uuid = await _make_plain_user(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=await _auth_header(redis, plain_uuid),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_put_grant_unknown_role_404(client, db_session, redis):
    """Setting a grant on a non-existent role returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{uuid4()}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_cannot_none_out_super_admin_rbac_edit(client, db_session, redis):
    """Scoping super_admin's rbac.edit down to none is refused with 409 (self-lock guard, ADR-056)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}/permissions/rbac.edit",
        json={"scope": "none"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_grant_revokes_cell(client, db_session, redis):
    """DELETE removes a role's grant; a follow-up read no longer lists that capability."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    hdr = await _auth_header(redis, admin_uuid)
    url = f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit"

    await client.put(url, json={"scope": "own"}, headers=hdr)
    resp = await client.delete(url, headers=hdr)
    assert resp.status_code == 204, resp.text

    detail = await client.get(f"/api/v1/admin/rbac/roles/{role_uuid}", headers=hdr)
    assert "ticket.edit" not in detail.json()["grants"]


@pytest.mark.asyncio
async def test_delete_absent_grant_is_idempotent(client, db_session, redis):
    """Deleting a grant that was never set is a no-op 204, not a 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 204, resp.text


@pytest.mark.asyncio
async def test_delete_cannot_revoke_super_admin_rbac_edit(client, db_session, redis):
    """Revoking super_admin's rbac.edit is refused with 409 (self-lock guard, ADR-056)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}/permissions/rbac.edit",
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_grant_denied_for_non_super_admin(client, db_session, redis):
    """A caller without rbac.edit is denied with 403 (checkpoint 1, super_admin only)."""
    plain_uuid = await _make_plain_user(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        headers=await _auth_header(redis, plain_uuid),
    )
    assert resp.status_code == 403


# --- Phase 3: per-user grants (PUT / DELETE) ------------------------------------------


async def _make_target_user(db, name: str = "Target") -> str:
    """A plain user to receive per-user grants. Returns uuid.

    Holds the default platform role, as every real signup does (`auth_account` grants it):
    a direct grant binds to an identity (ADR-073), so an account with no role at all has
    nowhere for one to take effect.
    """
    user = User(name=name)
    db.add(user)
    await db.flush()
    role = (await db.execute(select(Role).where(Role.name == "user"))).scalar_one()
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


@pytest.mark.asyncio
async def test_put_user_grant_adds_direct_grant(client, db_session, redis):
    """A per-user grant shows up in direct_grants and effective."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{target}/permissions/ticket.export",
        json={"scope": "all"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["direct_grants"] == [
        {"capability": "ticket.export", "scope": "all", "team_uuid": None}
    ]
    # The grant binds to the platform identity, so that is the identity it shows up under.
    platform = next(i for i in body["identities"] if i["team_uuid"] is None)
    assert platform["effective"]["ticket.export"] == "all"


@pytest.mark.asyncio
async def test_put_user_grant_upserts_not_duplicates(client, db_session, redis):
    """A second PUT for the same (user, cap) updates the one row (uq_user_perm)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    hdr = await _auth_header(redis, admin_uuid)
    url = f"/api/v1/admin/users/{target}/permissions/ticket.export"
    await client.put(url, json={"scope": "own"}, headers=hdr)
    resp = await client.put(url, json={"scope": "all"}, headers=hdr)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["direct_grants"] == [
        {"capability": "ticket.export", "scope": "all", "team_uuid": None}
    ]

    rows = (
        await db_session.execute(
            select(UserPermissionAssign)
            .join(Permission, Permission.uuid == UserPermissionAssign.permission_uuid)
            .where(UserPermissionAssign.user_uuid == target, Permission.key == "ticket.export")
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_put_user_grant_unknown_user_404(client, db_session, redis):
    """Granting to a non-existent user returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{uuid4()}/permissions/ticket.export",
        json={"scope": "all"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_user_grant_denied_for_non_super_admin(client, db_session, redis):
    """A caller without rbac.assign is denied with 403."""
    plain_uuid = await _make_plain_user(db_session)
    target = await _make_target_user(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{target}/permissions/ticket.export",
        json={"scope": "all"},
        headers=await _auth_header(redis, plain_uuid),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_user_grant_is_idempotent(client, db_session, redis):
    """DELETE removes the direct grant and is a 204 even when it was never set."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    hdr = await _auth_header(redis, admin_uuid)
    url = f"/api/v1/admin/users/{target}/permissions/ticket.export"
    await client.put(url, json={"scope": "all"}, headers=hdr)

    assert (await client.delete(url, headers=hdr)).status_code == 204
    assert (await client.delete(url, headers=hdr)).status_code == 204  # idempotent

    detail = await client.get(f"/api/v1/admin/users/{target}/permissions", headers=hdr)
    assert "ticket.export" not in detail.json()["direct_grants"]


# --- Phase 3: role create + rename (POST / PATCH) -------------------------------------


@pytest.mark.asyncio
async def test_create_role(client, db_session, redis):
    """super_admin creates a new empty role (201, no grants yet)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "dispatcher", "kind": "team"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["name"] == "dispatcher" and resp.json()["grants"] == {}


@pytest.mark.asyncio
async def test_create_role_duplicate_name_409(client, db_session, redis):
    """Creating a role whose name already exists is a 409."""
    admin_uuid, _ = await _make_super_admin(db_session)
    await _make_editable_role(db_session, name="dispatcher")
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "dispatcher", "kind": "team"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_role_reserved_name_409(client, db_session, redis):
    """Creating a role named 'user' (a code-referenced name) is refused (ADR-059)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "user", "kind": "platform"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_role_bad_kind_422(client, db_session, redis):
    """Kind must be platform or team."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "x", "kind": "wizard"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_rename_role(client, db_session, redis):
    """Renaming a plain role updates its name."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="oldname")
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{role_uuid}",
        json={"name": "newname"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["name"] == "newname"


@pytest.mark.asyncio
async def test_rename_protected_role_409(client, db_session, redis):
    """The super_admin role cannot be renamed (ADR-059)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}",
        json={"name": "root"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_rename_role_denied_for_non_super_admin(client, db_session, redis):
    """A caller without rbac.edit is denied with 403."""
    plain_uuid = await _make_plain_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="oldname")
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{role_uuid}",
        json={"name": "newname"},
        headers=await _auth_header(redis, plain_uuid),
    )
    assert resp.status_code == 403


# --- Phase 3: role delete (DELETE) ----------------------------------------------------


@pytest.mark.asyncio
async def test_delete_role_with_grants_succeeds(client, db_session, redis):
    """Deleting an unassigned role removes it and its permission grants (204)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="temp")
    hdr = await _auth_header(redis, admin_uuid)
    await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "own"}, headers=hdr,
    )
    resp = await client.delete(f"/api/v1/admin/rbac/roles/{role_uuid}", headers=hdr)
    assert resp.status_code == 204, resp.text
    assert (await client.get(f"/api/v1/admin/rbac/roles/{role_uuid}", headers=hdr)).status_code == 404


@pytest.mark.asyncio
async def test_delete_role_with_assignment_409(client, db_session, redis):
    """A role still assigned to a user cannot be deleted (must reassign first)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="temp")
    user = User(name="Holder")
    db_session.add(user)
    await db_session.flush()
    await _assign(db_session, str(user.uuid), role_uuid)

    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{role_uuid}", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_protected_role_409(client, db_session, redis):
    """The super_admin role cannot be deleted (ADR-059)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_role_unknown_404(client, db_session, redis):
    """Deleting a non-existent role returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{uuid4()}", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 404


# --- Phase 3: unassign role (DELETE user/role) ----------------------------------------


async def _assign(db, user_uuid: str, role_uuid: str) -> str | None:
    """Directly grant a role to a user (test setup); returns the team it was granted in.

    A team-kind role has to name a team — the grant row IS the identity now (ADR-073), and
    the CHECK constraint refuses a team role with no team.
    """
    role = (await db.execute(select(Role).where(Role.uuid == role_uuid))).scalar_one()
    team_uuid = None
    if role.kind == "team":
        team = Team(name=f"team-for-{role.name}", type="ngo")
        db.add(team)
        await db.flush()
        team_uuid = str(team.uuid)
    db.add(UserRoleAssign(user_uuid=user_uuid, role_uuid=role_uuid, team_uuid=team_uuid))
    await db.commit()
    return team_uuid


@pytest.mark.asyncio
async def test_unassign_role(client, db_session, redis):
    """Removing a role the user holds succeeds (204) and drops it from their roles."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="helper")
    team_uuid = await _assign(db_session, target, role_uuid)
    hdr = await _auth_header(redis, admin_uuid)

    resp = await client.delete(
        f"/api/v1/admin/users/{target}/role/{role_uuid}?team_uuid={team_uuid}", headers=hdr
    )
    assert resp.status_code == 204, resp.text
    detail = await client.get(f"/api/v1/admin/users/{target}/permissions", headers=hdr)
    assert all(i["role"] != "helper" for i in detail.json()["identities"])


@pytest.mark.asyncio
async def test_unassign_role_user_lacks_it_404(client, db_session, redis):
    """Unassigning a role the user does not hold returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="helper")
    resp = await client.delete(
        f"/api/v1/admin/users/{target}/role/{role_uuid}", headers=await _auth_header(redis, admin_uuid)
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unassign_last_super_admin_409(client, db_session, redis):
    """Removing the only super_admin's super_admin role is refused (409)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/users/{admin_uuid}/role/{super_role_uuid}",
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_unassign_role_denied_for_non_super_admin(client, db_session, redis):
    """A caller without rbac.assign is denied with 403."""
    plain_uuid = await _make_plain_user(db_session)
    target = await _make_target_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="helper")
    await _assign(db_session, target, role_uuid)
    resp = await client.delete(
        f"/api/v1/admin/users/{target}/role/{role_uuid}", headers=await _auth_header(redis, plain_uuid)
    )
    assert resp.status_code == 403


# --- ADR-061: rbac.* is super_admin-only; runtime cannot delegate it -------------------


@pytest.mark.asyncio
async def test_cannot_grant_rbac_edit_to_non_super_admin_role(client, db_session, redis):
    """Granting rbac.edit to a non-super_admin role is refused (409) — no delegated editing."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="member")
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/rbac.edit",
        json={"scope": "all"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_cannot_grant_rbac_view_to_non_super_admin_role(client, db_session, redis):
    """rbac.view is also blocked from runtime delegation; widening it stays a seed decision."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="member")
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/rbac.view",
        json={"scope": "all"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_can_still_set_rbac_edit_on_super_admin_role(client, db_session, redis):
    """Setting rbac.edit on the super_admin role itself stays allowed (idempotent)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}/permissions/rbac.edit",
        json={"scope": "all"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["grants"]["rbac.edit"] == "all"


@pytest.mark.asyncio
async def test_cannot_grant_rbac_as_per_user_grant(client, db_session, redis):
    """rbac.* is a role-bound governance capability; it cannot be a per-user grant (409)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{target}/permissions/rbac.assign",
        json={"scope": "all"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409


# --- ADR-060: a name-uniqueness race that slips past the pre-check maps to 409, not 500 -----


async def _pretend_name_absent(*args, **kwargs):
    """Force get_by_name to report 'free', simulating the TOCTOU window before our commit."""
    return None


@pytest.mark.asyncio
async def test_create_role_name_race_maps_to_409(client, db_session, redis, monkeypatch):
    """Create that races past the name pre-check hits uq roles.name → 409, not 500 (ADR-060)."""
    from app.repositories.auth_repository import role_repository

    admin_uuid, _ = await _make_super_admin(db_session)
    await _make_editable_role(db_session, name="dispatcher")  # the name is already taken
    monkeypatch.setattr(role_repository, "get_by_name", _pretend_name_absent)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "dispatcher", "kind": "team"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409, resp.text


@pytest.mark.asyncio
async def test_rename_role_name_race_maps_to_409(client, db_session, redis, monkeypatch):
    """Rename whose target name is taken under a race hits uq roles.name → 409, not 500 (ADR-060)."""
    from app.repositories.auth_repository import role_repository

    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="oldname")
    await _make_editable_role(db_session, name="taken")  # the target name is already in use
    monkeypatch.setattr(role_repository, "get_by_name", _pretend_name_absent)
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{role_uuid}",
        json={"name": "taken"},
        headers=await _auth_header(redis, admin_uuid),
    )
    assert resp.status_code == 409, resp.text
