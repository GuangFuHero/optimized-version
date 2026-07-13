# RBAC Runtime Management — Phase 2 (Matrix Write) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super_admin edit one role×capability matrix cell at a time — `PUT`/`DELETE /admin/rbac/roles/{uuid}/permissions/{cap}` — and make `seed_rbac.py` an idempotent bootstrap that never overwrites a runtime-edited grant (ADR-055).

**Architecture:** Two new write routes on the existing `rbac_admin` router. They stay thin (ADR-014): parse input, call a service function in `app/services/rbac_admin.py` that runs checkpoint 1 (`require_scope(actor, Perm.RBAC_EDIT, db)`, super_admin only) and the super_admin self-lock guard, then upserts/deletes one `role_permission_assign` row via new repo helpers. Input is validated by types: `cap: Perm` path param and `scope: Scope` body field auto-422 on bad values (ADR-057). No new table, no migration. Audit is automatic (trigger on `role_permission_assign`, ADR, spec §8).

**Tech Stack:** FastAPI, SQLAlchemy async (PostgreSQL `ON CONFLICT`), Pydantic v2, pytest (`uv run pytest`), ruff.

## Global Constraints

- Source spec: `Spec/009-rbac-runtime-management/spec.md` (Phase 2 = §5 write block, §6 guards, §7 seed, ADR-055 / rbac.edit half of ADR-056).
- Writes gated by `Perm.RBAC_EDIT` (checkpoint 1, super_admin only) **inside the service** via `require_scope` — mirrors `app/services/admin.py` writes. Reads keep their `rbac.view` gate.
- capability catalog + scope values stay **read-only / code-owned** (ADR-057). The only runtime mutation is the grant's scope.
- Input validation: `cap ∈ Perm` and `scope ∈ Scope` → else **422** (via enum types). Missing role → **404**. Invariant violation → **409**.
- super_admin self-lock guard (ADR-056): `super_admin` role must not lose `rbac.edit` or `rbac.assign` — revoking, or setting their scope to `none`, → **409**.
- Run tests with `uv run pytest`; lint with `uv run ruff check app scripts tests`. Line length limit 110.
- Commit style: conventional commits, no AI-attribution trailer. `SUPER_ADMIN_ROLE_NAME = "super_admin"` (reuse `app/services/admin.py`).
- Branch: `popo/rbac-matrix-write`, stacked on `popo/rbac-permission-crud` (Phase 1). PR base = `popo/rbac-permission-crud`.

---

## File Structure

- Modify `scripts/seed_rbac.py` — extract `ensure_role_grant(db, *, role, permission, scope)` helper; remove the overwrite branch (current lines 181-183) so existing grants are never touched (ADR-055).
- Modify `app/repositories/auth_repository.py` — `RoleRepository.upsert_grant` / `RoleRepository.delete_grant`; `PermissionRepository.ensure_by_key`.
- Modify `app/services/rbac_admin.py` — add `RbacConflictError`; `set_role_permission` / `revoke_role_permission` (checkpoint 1 + guards).
- Modify `app/schemas/rbac_admin.py` — add `SetGrantRequest{scope: Scope}`.
- Modify `app/api/v1/endpoints/rbac_admin.py` — move the `rbac.view` gate from router-level to each GET route; add `PUT` (→ `RoleGrants`) and `DELETE` (→ 204) routes.
- Modify `tests/test_rbac_admin_api.py` — Phase 2 write tests.
- Create `tests/test_seed_rbac.py` — ADR-055 idempotency unit tests.
- Modify `RBAC_V1_DECISIONS.md` — transcribe ADR-055 and the rbac.edit half of ADR-056.

---

## Task 1: ADR-055 — seed becomes an idempotent bootstrap

**Files:**
- Modify: `scripts/seed_rbac.py` (extract helper near line 161; remove overwrite at 181-183)
- Test: `tests/test_seed_rbac.py` (create)

**Interfaces:**
- Produces: `scripts.seed_rbac.ensure_role_grant(db: AsyncSession, *, role: Role, permission: Permission, scope: str) -> bool` — inserts a `RolePermissionAssign` when absent (returns True), leaves an existing grant **untouched** (returns False). Never updates scope.

- [ ] **Step 1: Write the failing test**

Create `tests/test_seed_rbac.py`:

```python
"""Unit tests for seed_rbac idempotent-bootstrap behavior (feature 009, ADR-055)."""

import pytest

from app.models.rbac import Permission, Role, RolePermissionAssign
from scripts.seed_rbac import ensure_role_grant
from sqlalchemy import select


async def _role_and_perm(db) -> tuple[Role, Permission]:
    role = Role(name="seed_role", kind="platform")
    perm = Permission(key="ticket.edit")
    db.add(role)
    db.add(perm)
    await db.flush()
    return role, perm


@pytest.mark.asyncio
async def test_ensure_role_grant_inserts_when_absent(db_session):
    role, perm = await _role_and_perm(db_session)

    created = await ensure_role_grant(db_session, role=role, permission=perm, scope="own")
    await db_session.flush()

    assert created is True
    grant = (
        await db_session.execute(
            select(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role.uuid,
                RolePermissionAssign.permission_uuid == perm.uuid,
            )
        )
    ).scalar_one()
    assert grant.scope == "own"


@pytest.mark.asyncio
async def test_ensure_role_grant_never_overwrites_existing(db_session):
    role, perm = await _role_and_perm(db_session)
    db_session.add(
        RolePermissionAssign(role_uuid=role.uuid, permission_uuid=perm.uuid, scope="all")
    )
    await db_session.flush()

    created = await ensure_role_grant(db_session, role=role, permission=perm, scope="own")
    await db_session.flush()

    assert created is False
    grant = (
        await db_session.execute(
            select(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role.uuid,
                RolePermissionAssign.permission_uuid == perm.uuid,
            )
        )
    ).scalar_one()
    assert grant.scope == "all"  # runtime edit preserved; seed did NOT overwrite
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_seed_rbac.py -v`
Expected: FAIL — `ImportError: cannot import name 'ensure_role_grant'`.

- [ ] **Step 3: Extract the helper and remove the overwrite**

In `scripts/seed_rbac.py`, add this module-level function above `async def seed()` (after the `ROLES_DATA` block):

```python
async def ensure_role_grant(
    db: AsyncSession, *, role: Role, permission: Permission, scope: str
) -> bool:
    """Insert a role→permission grant only when it is missing (ADR-055 idempotent bootstrap).

    Never touches an existing grant: runtime edits made via /admin/rbac survive re-seeding.
    Returns True when a new grant was inserted, False when one already existed.
    """
    existing = (
        await db.execute(
            select(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role.uuid,
                RolePermissionAssign.permission_uuid == permission.uuid,
            )
        )
    ).scalars().first()
    if existing is not None:
        return False
    db.add(
        RolePermissionAssign(
            role_uuid=role.uuid, permission_uuid=permission.uuid, scope=scope
        )
    )
    print(f"為角色 {role.name} 授予 {permission.key} ({scope})")
    return True
```

Then replace the grant loop inside `seed()` (current lines 171-188) with:

```python
            for perm, scope in role_info["permissions"].items():
                permission = perm_by_key[perm.value]
                await ensure_role_grant(db, role=role, permission=permission, scope=scope)
```

This deletes the `if grant.scope != scope: grant.scope = scope` overwrite branch (old 181-183).

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_seed_rbac.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed_rbac.py tests/test_seed_rbac.py
git commit -m "refactor(rbac): seed = idempotent bootstrap, never overwrite existing grant (ADR-055)"
```

---

## Task 2: `PUT /admin/rbac/roles/{uuid}/permissions/{cap}` — upsert one matrix cell

**Files:**
- Modify: `app/schemas/rbac_admin.py` (add `SetGrantRequest`)
- Modify: `app/repositories/auth_repository.py` (`PermissionRepository.ensure_by_key`, `RoleRepository.upsert_grant`)
- Modify: `app/services/rbac_admin.py` (`RbacConflictError`, `set_role_permission`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (per-route `rbac.view` gate; `PUT` route)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Consumes: `role_repository.get_by_uuid`, `role_repository.get_grants` (Phase 1); `require_scope` (`app/services/authz`); `Perm`, `Scope`, `SUPER_ADMIN_ROLE_NAME`.
- Produces:
  - schema `SetGrantRequest{scope: Scope}`
  - `PermissionRepository.ensure_by_key(db, key: str) -> Permission` (get-or-create; capability rows mirror `Perm`, ADR-057)
  - `RoleRepository.upsert_grant(db, *, role_uuid: str, permission_uuid: str, scope: str) -> None` (PG `ON CONFLICT (role_uuid, permission_uuid) DO UPDATE`)
  - `rbac_admin_service.RbacConflictError(ValueError)`
  - `rbac_admin_service.set_role_permission(db, *, actor: User, role_uuid: str, cap: Perm, scope: Scope) -> RoleGrants` — checkpoint 1 (`RBAC_EDIT`) + self-lock guard, then upsert; returns the role's full grants after the change.
  - route `PUT /rbac/roles/{role_uuid}/permissions/{cap}` → `RoleGrants`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rbac_admin_api.py` (reuse the module's existing `_auth_header`, `_grant`, `_make_rbac_admin`, `_make_plain_user` helpers):

```python
async def _make_super_admin(db):
    """super_admin holding the full rbac.* set (view+edit+assign at scope all). Returns (uuid, role)."""
    role = Role(name="super_admin", kind="platform")
    db.add(role)
    await db.flush()
    cache: dict = {}
    for cap in (Perm.RBAC_VIEW, Perm.RBAC_EDIT, Perm.RBAC_ASSIGN):
        await _grant(db, role, cache, cap, "all")
    user = User(name="Root")
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid, role


async def _make_editable_role(db, name="member") -> str:
    role = Role(name=name, kind="team")
    db.add(role)
    await db.flush()
    role_uuid = str(role.uuid)
    await db.commit()
    return role_uuid


@pytest.mark.asyncio
async def test_put_grant_sets_new_cell(client, db_session):
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
            select(RolePermissionAssign).join(
                Permission, Permission.uuid == RolePermissionAssign.permission_uuid
            ).where(
                RolePermissionAssign.role_uuid == role_uuid, Permission.key == "ticket.edit"
            )
        )
    ).scalars().all()
    assert len(rows) == 1  # uq_role_perm upsert, not a second row


@pytest.mark.asyncio
async def test_put_grant_rejects_bad_scope(client, db_session):
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
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{uuid4()}/permissions/ticket.edit",
        json={"scope": "own"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_cannot_none_out_super_admin_rbac_edit(client, db_session):
    admin_uuid, super_role = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/rbac/roles/{super_role.uuid}/permissions/rbac.edit",
        json={"scope": "none"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_rbac_admin_api.py -k "put_grant or none_out" -v`
Expected: FAIL — route not found (404/405) / `set_role_permission` missing.

- [ ] **Step 3: Add the schema**

In `app/schemas/rbac_admin.py`, add (import `Scope` at top: `from app.core.rbac_scopes import Scope`):

```python
class SetGrantRequest(BaseModel):
    """Upsert body for a single matrix cell; `scope` is validated against the Scope enum."""

    scope: Scope
```

- [ ] **Step 4: Add repo helpers**

In `app/repositories/auth_repository.py`, add to `PermissionRepository`:

```python
    async def ensure_by_key(self, db: AsyncSession, key: str) -> Permission:
        """Return the Permission row for a code-owned capability key, creating it if absent.

        Capability rows mirror `Perm` (ADR-057); auto-creating on first grant keeps the
        write path working on a DB seeded before the key existed.
        """
        permission = await self.get_by_key(db, key)
        if permission is None:
            permission = Permission(key=key)
            db.add(permission)
            await db.flush()
        return permission
```

Add to `RoleRepository`:

```python
    async def upsert_grant(
        self, db: AsyncSession, *, role_uuid: str, permission_uuid: str, scope: str
    ) -> None:
        """Insert or update one role→permission grant's scope (PG ON CONFLICT on uq_role_perm)."""
        stmt = insert(RolePermissionAssign).values(
            role_uuid=role_uuid, permission_uuid=permission_uuid, scope=scope
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["role_uuid", "permission_uuid"], set_={"scope": scope}
        )
        await db.execute(stmt)
        await db.commit()
```

(`insert` from `sqlalchemy.dialects.postgresql` is already imported at the top of the file.)

- [ ] **Step 5: Add the service function**

In `app/services/rbac_admin.py`: add imports and the conflict error + function.

Add to the imports block:

```python
from app.core.rbac_scopes import Scope
from app.models.auth import User
from app.repositories.auth_repository import permission_repository, role_repository, user_repository
from app.services.admin import SUPER_ADMIN_ROLE_NAME
from app.services.authz import require_scope

_SUPER_ADMIN_LOCKED_CAPS = {Perm.RBAC_EDIT, Perm.RBAC_ASSIGN}
```

Add the error class next to `RbacNotFoundError`:

```python
class RbacConflictError(ValueError):
    """A write would violate an RBAC invariant (e.g. stripping super_admin's rbac.edit)."""
```

Add the function:

```python
async def set_role_permission(
    db: AsyncSession, *, actor: User, role_uuid: str, cap: Perm, scope: Scope
) -> RoleGrants:
    """Upsert one matrix cell (role→capability→scope). Checkpoint 1: rbac.edit, super_admin only.

    Guards (ADR-056): super_admin must not have rbac.edit/rbac.assign scoped down to `none`.
    """
    await require_scope(actor, Perm.RBAC_EDIT, db)

    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")

    if (
        role.name == SUPER_ADMIN_ROLE_NAME
        and cap in _SUPER_ADMIN_LOCKED_CAPS
        and scope == Scope.NONE
    ):
        raise RbacConflictError(f"Cannot remove {cap.value} from {SUPER_ADMIN_ROLE_NAME}")

    permission = await permission_repository.ensure_by_key(db, cap.value)
    await role_repository.upsert_grant(
        db, role_uuid=role_uuid, permission_uuid=str(permission.uuid), scope=scope.value
    )
    return await get_role(db, role_uuid)
```

- [ ] **Step 6: Rework the router gate and add the PUT route**

In `app/api/v1/endpoints/rbac_admin.py`:

1. Change the router so writes are not gated on `rbac.view`. Replace:

```python
router = APIRouter(dependencies=[security.has_permission(Perm.RBAC_VIEW)])
```

with:

```python
router = APIRouter()

_view_gate = [security.has_permission(Perm.RBAC_VIEW)]
```

and add `dependencies=_view_gate` to each of the four existing `@router.get(...)` decorators, e.g.:

```python
@router.get("/rbac/capabilities", response_model=CapabilityCatalogResponse, dependencies=_view_gate)
```

2. Extend imports:

```python
from app.core.security import get_current_user  # if not already imported via `security`
from app.models.auth import User
from app.schemas.rbac_admin import SetGrantRequest
from app.services.rbac_admin import RbacConflictError, RbacNotFoundError
from app.core.permissions import Perm
```

(Use `security.get_current_user` to match the existing style; keep a single import approach consistent with the file.)

3. Add the route:

```python
@router.put("/rbac/roles/{role_uuid}/permissions/{cap}", response_model=RoleGrants)
async def set_role_permission(
    role_uuid: UUID,
    cap: Perm,
    body: SetGrantRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Upsert one role×capability matrix cell (super_admin only, via rbac.edit)."""
    try:
        return await rbac_admin_service.set_role_permission(
            db, actor=current_user, role_uuid=str(role_uuid), cap=cap, scope=body.scope
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `uv run pytest tests/test_rbac_admin_api.py -v`
Expected: PASS (Phase 1 tests still green + new PUT tests). Then `uv run ruff check app scripts tests`.

- [ ] **Step 8: Commit**

```bash
git add app/schemas/rbac_admin.py app/repositories/auth_repository.py \
        app/services/rbac_admin.py app/api/v1/endpoints/rbac_admin.py \
        tests/test_rbac_admin_api.py
git commit -m "feat(rbac): PUT /admin/rbac/roles/{uuid}/permissions/{cap} — upsert matrix cell (feature 009 P2)"
```

---

## Task 3: `DELETE /admin/rbac/roles/{uuid}/permissions/{cap}` — revoke one cell

**Files:**
- Modify: `app/repositories/auth_repository.py` (`RoleRepository.delete_grant`)
- Modify: `app/services/rbac_admin.py` (`revoke_role_permission`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (`DELETE` route → 204)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Produces:
  - `RoleRepository.delete_grant(db, *, role_uuid: str, permission_uuid: str) -> int` (rows deleted)
  - `rbac_admin_service.revoke_role_permission(db, *, actor: User, role_uuid: str, cap: Perm) -> None` — checkpoint 1 (`RBAC_EDIT`) + self-lock guard; idempotent (absent grant is a no-op).
  - route `DELETE /rbac/roles/{role_uuid}/permissions/{cap}` → `204 No Content`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rbac_admin_api.py`:

```python
@pytest.mark.asyncio
async def test_delete_grant_revokes_cell(client, db_session):
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    hdr = _auth_header(admin_uuid)
    url = f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit"

    await client.put(url, json={"scope": "own"}, headers=hdr)
    resp = await client.delete(url, headers=hdr)
    assert resp.status_code == 204, resp.text

    detail = await client.get(f"/api/v1/admin/rbac/roles/{role_uuid}", headers=hdr)
    assert "ticket.edit" not in detail.json()["grants"]


@pytest.mark.asyncio
async def test_delete_absent_grant_is_idempotent(client, db_session):
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 204, resp.text


@pytest.mark.asyncio
async def test_delete_cannot_revoke_super_admin_rbac_edit(client, db_session):
    admin_uuid, super_role = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{super_role.uuid}/permissions/rbac.edit",
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_grant_denied_for_non_super_admin(client, db_session):
    plain_uuid = await _make_plain_user(db_session)
    role_uuid = await _make_editable_role(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        headers=_auth_header(plain_uuid),
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_rbac_admin_api.py -k "delete" -v`
Expected: FAIL — DELETE route missing (405/404).

- [ ] **Step 3: Add the repo helper**

Add to `RoleRepository` in `app/repositories/auth_repository.py` (add `delete` to the sqlalchemy import: `from sqlalchemy import delete, select`):

```python
    async def delete_grant(
        self, db: AsyncSession, *, role_uuid: str, permission_uuid: str
    ) -> int:
        """Delete one role→permission grant; returns rows removed (0 when absent)."""
        result = await db.execute(
            delete(RolePermissionAssign).where(
                RolePermissionAssign.role_uuid == role_uuid,
                RolePermissionAssign.permission_uuid == permission_uuid,
            )
        )
        await db.commit()
        return result.rowcount
```

- [ ] **Step 4: Add the service function**

In `app/services/rbac_admin.py`:

```python
async def revoke_role_permission(
    db: AsyncSession, *, actor: User, role_uuid: str, cap: Perm
) -> None:
    """Revoke one matrix cell. Checkpoint 1: rbac.edit, super_admin only. Idempotent.

    Guard (ADR-056): super_admin must not lose rbac.edit/rbac.assign.
    """
    await require_scope(actor, Perm.RBAC_EDIT, db)

    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")

    if role.name == SUPER_ADMIN_ROLE_NAME and cap in _SUPER_ADMIN_LOCKED_CAPS:
        raise RbacConflictError(f"Cannot remove {cap.value} from {SUPER_ADMIN_ROLE_NAME}")

    permission = await permission_repository.get_by_key(db, cap.value)
    if permission is None:
        return  # nothing registered → nothing to revoke (idempotent)
    await role_repository.delete_grant(
        db, role_uuid=role_uuid, permission_uuid=str(permission.uuid)
    )
```

- [ ] **Step 5: Add the DELETE route**

In `app/api/v1/endpoints/rbac_admin.py`:

```python
@router.delete(
    "/rbac/roles/{role_uuid}/permissions/{cap}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_role_permission(
    role_uuid: UUID,
    cap: Perm,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Revoke one role×capability matrix cell (super_admin only, via rbac.edit)."""
    try:
        await rbac_admin_service.revoke_role_permission(
            db, actor=current_user, role_uuid=str(role_uuid), cap=cap
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
```

- [ ] **Step 6: Run tests + lint**

Run: `uv run pytest tests/test_rbac_admin_api.py -v && uv run ruff check app scripts tests`
Expected: all PASS, lint clean.

- [ ] **Step 7: Commit**

```bash
git add app/repositories/auth_repository.py app/services/rbac_admin.py \
        app/api/v1/endpoints/rbac_admin.py tests/test_rbac_admin_api.py
git commit -m "feat(rbac): DELETE /admin/rbac/roles/{uuid}/permissions/{cap} — revoke matrix cell (feature 009 P2)"
```

---

## Task 4: Transcribe ADRs + close Phase 2 docs

**Files:**
- Modify: `RBAC_V1_DECISIONS.md` (append ADR-055 + rbac.edit half of ADR-056)
- Modify: `Spec/009-rbac-runtime-management/spec.md` (mark Phase 2 status if a status line exists)

- [ ] **Step 1: Locate the ADR log format**

Run: `grep -nE '^### ADR-05[0-9]|^## ADR|^ADR-' RBAC_V1_DECISIONS.md | tail -20`
Match the existing heading + field style (Context / Decision / Consequences / 取代關係).

- [ ] **Step 2: Append ADR-055 and the Phase 2 slice of ADR-056**

Transcribe verbatim from `spec.md` §3 (ADR-055) and the `rbac.edit` enforcement portion of ADR-056 (the `require_scope(actor, Perm.RBAC_EDIT, db)` checkpoint on matrix writes + the super_admin self-lock guard). Note that `rbac.assign` and the role-CRUD guards land in Phase 3.

- [ ] **Step 3: Commit**

```bash
git add RBAC_V1_DECISIONS.md Spec/009-rbac-runtime-management/spec.md
git commit -m "docs(rbac): transcribe ADR-055 + rbac.edit half of ADR-056 (feature 009 P2)"
```

---

## Self-Review (spec coverage)

- §5 Phase 2 `PUT` upsert → Task 2. `DELETE` revoke → Task 3. ✅
- §6 input validation (cap∈Perm, scope∈Scope → 422) → enum types, Task 2 (bad-scope / bad-cap tests). ✅
- §6 super_admin self-lock (revoke / none-out rbac.edit/assign → 409) → Task 2 + Task 3 guard + tests. ✅
- §6 error semantics (403 missing cap / 404 missing role / 409 invariant) → `require_scope`, `RbacNotFoundError`, `RbacConflictError`. ✅
- §7 / ADR-055 seed idempotent (remove overwrite) → Task 1. ✅
- §8 audit (zero work — trigger on `role_permission_assign`) → no task needed; covered by existing trigger. ✅
- §2 "≥1 super_admin" / role-CRUD / per-user grant guards → **Phase 3**, not this plan. ✅ (deferred by design)

**Note carried to Phase 3:** the `(user_uuid, permission_uuid)` unique constraint + migration + upsert + dedup (decision "方案 A") and ADR-058 belong to the Phase 3 plan.
