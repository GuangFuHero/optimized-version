# RBAC Runtime Management — Phase 1 (Read/Display) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a read-only REST surface under `/admin/rbac` so the frontend can display the RBAC configuration (capability catalog, role×permission matrix, one role's grants, a user's effective permissions).

**Architecture:** New `rbac_admin` REST router mounted at `/admin` (ADR-035), gated by a new `rbac.view` capability (super_admin only). Endpoints are thin: they call read functions in `app/services/rbac_admin.py`, which use new query helpers on the existing `role_repository` / `user_repository`. No new tables, no migration. Effective-permission resolution reuses the existing `user_repository.get_user_permissions` (ADR-018 union, widest-wins).

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, pytest (`uv run pytest`), ruff.

## Global Constraints

- Source spec: `Spec/009-rbac-runtime-management/spec.md` (ADR-055/056/057).
- Reads gated by `Perm.RBAC_VIEW` = **super_admin only** (data_auditor excluded).
- capability catalog + scope values are **read-only** (ADR-057). Phase 1 has **no write endpoints**.
- Capability keys derive `resource`/`action` by `key.partition(".")`; `public` = key ∈ `PUBLIC_PERMS`.
- Run tests with `uv run pytest`; lint with `uv run ruff check`. Line length limit is 110.
- Follow existing `/admin` patterns: `dependencies=[security.has_permission(Perm.X)]` for read gates, `db: AsyncSession = Depends(security.get_db)`.
- Commit style: conventional commits, no AI attribution trailer.

---

## File Structure

- Create `app/schemas/rbac_admin.py` — response models (CapabilityCatalog, Matrix, RoleGrants, UserPermissions).
- Create `app/services/rbac_admin.py` — read functions + `RbacNotFoundError`.
- Create `app/api/v1/endpoints/rbac_admin.py` — the 4 GET endpoints, router gated by `rbac.view`.
- Create `tests/test_rbac_admin_api.py` — integration tests.
- Modify `app/core/permissions.py` — add `RBAC_VIEW`.
- Modify `scripts/seed_rbac.py` — grant `rbac.view` to super_admin.
- Modify `app/repositories/auth_repository.py` — add matrix/user read helpers.
- Modify `app/api/v1/api.py` — mount the router.

---

## Task 1: `rbac.view` capability + router scaffold + capabilities endpoint

**Files:**
- Modify: `app/core/permissions.py` (add `RBAC_VIEW` near line 86)
- Modify: `scripts/seed_rbac.py` (super_admin list, line 81)
- Create: `app/schemas/rbac_admin.py`
- Create: `app/services/rbac_admin.py`
- Create: `app/api/v1/endpoints/rbac_admin.py`
- Modify: `app/api/v1/api.py` (import + include_router)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Produces: `Perm.RBAC_VIEW = "rbac.view"`; `rbac_admin_service.list_capabilities() -> CapabilityCatalogResponse`; `rbac_admin.router` (APIRouter gated by `rbac.view`, mounted at `/admin`); schema `CapabilityCatalogResponse{scopes: list[str], capabilities: list[CapabilityInfo{key,resource,action,public}]}`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_rbac_admin_api.py`:

```python
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
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get(
        "/api/v1/admin/rbac/capabilities", headers=_auth_header(plain_uuid)
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_rbac_admin_api.py -q`
Expected: FAIL — 404 (route not mounted yet) so the 200 assertion fails.

- [ ] **Step 3: Add the capability**

In `app/core/permissions.py`, in the `# RBAC self-management` block (before `RBAC_ASSIGN = "rbac.assign"`), add:

```python
    RBAC_VIEW = "rbac.view"
```

In `scripts/seed_rbac.py`, super_admin's permission list (the line reading `Perm.RBAC_ASSIGN, Perm.RBAC_EDIT, Perm.AUDIT_VIEW,`), change it to:

```python
                Perm.RBAC_VIEW, Perm.RBAC_ASSIGN, Perm.RBAC_EDIT, Perm.AUDIT_VIEW,
```

- [ ] **Step 4: Create the schema file**

Create `app/schemas/rbac_admin.py`:

```python
"""Pydantic schemas for the RBAC admin read surface (feature 009, Phase 1)."""

from uuid import UUID

from pydantic import BaseModel


class CapabilityInfo(BaseModel):
    """One capability key, split for display; `public` = in PUBLIC_PERMS."""

    key: str
    resource: str
    action: str
    public: bool


class CapabilityCatalogResponse(BaseModel):
    """The full capability catalog + allowed scope values (read-only, ADR-057)."""

    scopes: list[str]
    capabilities: list[CapabilityInfo]


class RoleGrants(BaseModel):
    """A role and its capability->scope grants."""

    uuid: UUID
    name: str
    kind: str
    grants: dict[str, str]


class MatrixResponse(BaseModel):
    """The whole role × capability × scope grid."""

    roles: list[RoleGrants]


class RoleRef(BaseModel):
    """A role a user holds."""

    name: str
    kind: str


class UserPermissionsResponse(BaseModel):
    """A user's roles, direct grants, and resolved effective permissions."""

    user_uuid: UUID
    roles: list[RoleRef]
    direct_grants: dict[str, str]
    effective: dict[str, str]
```

- [ ] **Step 5: Create the service file (capabilities only for now)**

Create `app/services/rbac_admin.py`:

```python
"""Read-only RBAC admin surface (feature 009, Phase 1).

Reads only — no RBAC checkpoints here; the router gates every route on `rbac.view`
(checkpoint 1, super_admin only). Missing role/user raises RbacNotFoundError → 404.
"""

from app.core.permissions import PUBLIC_PERMS, Perm
from app.core.rbac_scopes import Scope
from app.schemas.rbac_admin import CapabilityCatalogResponse, CapabilityInfo


class RbacNotFoundError(ValueError):
    """Raised when a role/user referenced by a read endpoint does not exist."""


def list_capabilities() -> CapabilityCatalogResponse:
    """Static capability catalog + scope enum for the frontend's dropdowns (ADR-057)."""
    capabilities = []
    for perm in Perm:
        resource, _, action = perm.value.partition(".")
        capabilities.append(
            CapabilityInfo(
                key=perm.value, resource=resource, action=action, public=perm in PUBLIC_PERMS
            )
        )
    return CapabilityCatalogResponse(
        scopes=[s.value for s in Scope], capabilities=capabilities
    )
```

- [ ] **Step 6: Create the endpoint file (capabilities only for now)**

Create `app/api/v1/endpoints/rbac_admin.py`:

```python
"""Read-only RBAC admin REST endpoints (feature 009, Phase 1).

Every route is gated by `rbac.view` (super_admin only) via the router-level dependency —
checkpoint 1 only; reads carry no per-row scope.
"""

from app.core import security
from app.core.permissions import Perm
from app.schemas.rbac_admin import CapabilityCatalogResponse
from app.services import rbac_admin as rbac_admin_service
from fastapi import APIRouter

router = APIRouter(dependencies=[security.has_permission(Perm.RBAC_VIEW)])


@router.get("/rbac/capabilities", response_model=CapabilityCatalogResponse)
async def get_capabilities():
    """Capability catalog + scope values for the frontend's dropdowns (read-only)."""
    return rbac_admin_service.list_capabilities()
```

- [ ] **Step 7: Mount the router**

In `app/api/v1/api.py`, add `rbac_admin` to the endpoints import:

```python
from app.api.v1.endpoints import admin, auth, map, rbac_admin, rbac_test, users
```

And after the `admin.router` include line, add:

```python
api_router.include_router(rbac_admin.router, prefix="/admin", tags=["RBAC 管理 API"])
```

- [ ] **Step 8: Run test to verify it passes**

Run: `uv run pytest tests/test_rbac_admin_api.py -q`
Expected: PASS (both tests).

- [ ] **Step 9: Lint + commit**

Run: `uv run ruff check app scripts tests`
Expected: All checks passed!

```bash
git add app/core/permissions.py scripts/seed_rbac.py app/schemas/rbac_admin.py \
  app/services/rbac_admin.py app/api/v1/endpoints/rbac_admin.py app/api/v1/api.py \
  tests/test_rbac_admin_api.py
git commit -m "feat(rbac): rbac.view capability + read-only capabilities endpoint (feature 009 P1)"
```

---

## Task 2: Matrix endpoint (`GET /admin/rbac/matrix`)

**Files:**
- Modify: `app/repositories/auth_repository.py` (add to `RoleRepository`)
- Modify: `app/services/rbac_admin.py` (add `get_matrix`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (add route)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Consumes: `role_repository` (singleton).
- Produces: `role_repository.list_all(db) -> list[Role]`; `role_repository.get_grants(db, *, role_uuid: str | None = None) -> list[tuple[str, str, str]]` (role_uuid, capability_key, scope); `rbac_admin_service.get_matrix(db) -> MatrixResponse`.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_rbac_admin_api.py`:

```python
@pytest.mark.asyncio
async def test_matrix_returns_roles_with_grants(client, db_session):
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get("/api/v1/admin/rbac/matrix", headers=_auth_header(admin_uuid))
    assert resp.status_code == 200, resp.json()
    roles = resp.json()["roles"]
    super_admin = next(r for r in roles if r["name"] == "super_admin")
    assert super_admin["kind"] == "platform"
    assert super_admin["grants"]["rbac.view"] == "all"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_rbac_admin_api.py::test_matrix_returns_roles_with_grants -q`
Expected: FAIL — 404 (route not defined).

- [ ] **Step 3: Add repository helpers**

In `app/repositories/auth_repository.py`, inside `class RoleRepository`, add:

```python
    async def list_all(self, db: AsyncSession) -> list[Role]:
        """Every role, ordered by kind then name (for the matrix display)."""
        result = await db.execute(select(Role).order_by(Role.kind, Role.name))
        return list(result.scalars().all())

    async def get_grants(
        self, db: AsyncSession, *, role_uuid: str | None = None
    ) -> list[tuple[str, str, str]]:
        """Return (role_uuid, capability_key, scope) rows; all roles when role_uuid is None."""
        stmt = select(
            RolePermissionAssign.role_uuid, Permission.key, RolePermissionAssign.scope
        ).join(Permission, Permission.uuid == RolePermissionAssign.permission_uuid)
        if role_uuid is not None:
            stmt = stmt.where(RolePermissionAssign.role_uuid == role_uuid)
        rows = (await db.execute(stmt)).all()
        return [(str(role), key, scope) for role, key, scope in rows]
```

- [ ] **Step 4: Add the service function**

In `app/services/rbac_admin.py`, update imports and add `get_matrix`:

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.auth_repository import role_repository
from app.schemas.rbac_admin import (
    CapabilityCatalogResponse,
    CapabilityInfo,
    MatrixResponse,
    RoleGrants,
)
```

```python
async def get_matrix(db: AsyncSession) -> MatrixResponse:
    """All roles with their capability->scope grants (the display grid)."""
    roles = await role_repository.list_all(db)
    grants_by_role: dict[str, dict[str, str]] = {}
    for role_uuid, key, scope in await role_repository.get_grants(db):
        grants_by_role.setdefault(role_uuid, {})[key] = scope
    return MatrixResponse(
        roles=[
            RoleGrants(
                uuid=role.uuid, name=role.name, kind=role.kind,
                grants=grants_by_role.get(str(role.uuid), {}),
            )
            for role in roles
        ]
    )
```

- [ ] **Step 5: Add the endpoint**

In `app/api/v1/endpoints/rbac_admin.py`, update imports and add the route:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.rbac_admin import CapabilityCatalogResponse, MatrixResponse
```

```python
@router.get("/rbac/matrix", response_model=MatrixResponse)
async def get_matrix(db: AsyncSession = Depends(security.get_db)):
    """The full role × capability × scope grid."""
    return await rbac_admin_service.get_matrix(db)
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_rbac_admin_api.py -q`
Expected: PASS (all tests so far).

- [ ] **Step 7: Lint + commit**

Run: `uv run ruff check app tests`
```bash
git add app/repositories/auth_repository.py app/services/rbac_admin.py \
  app/api/v1/endpoints/rbac_admin.py tests/test_rbac_admin_api.py
git commit -m "feat(rbac): GET /admin/rbac/matrix — full role×permission grid (feature 009 P1)"
```

---

## Task 3: Role detail endpoint (`GET /admin/rbac/roles/{role_uuid}`)

**Files:**
- Modify: `app/services/rbac_admin.py` (add `get_role`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (add route + 404 mapping)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Consumes: `role_repository.get_by_uuid(db, uuid) -> Role | None` (inherited from GenericRepository); `role_repository.get_grants(db, *, role_uuid=...)`.
- Produces: `rbac_admin_service.get_role(db, role_uuid: str) -> RoleGrants` (raises `RbacNotFoundError` if missing).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_rbac_admin_api.py`:

```python
@pytest.mark.asyncio
async def test_role_detail_returns_grants(client, db_session):
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
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/rbac/roles/{uuid4()}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_rbac_admin_api.py::test_role_detail_returns_grants tests/test_rbac_admin_api.py::test_role_detail_404_when_missing -q`
Expected: FAIL — 404 for both (route not defined), so the first test's 200 assertion fails.

- [ ] **Step 3: Add the service function**

In `app/services/rbac_admin.py`, add `RoleGrants` to the schema import and add:

```python
async def get_role(db: AsyncSession, role_uuid: str) -> RoleGrants:
    """One role and its grants; raises RbacNotFoundError if the role does not exist."""
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")
    grants = {key: scope for _, key, scope in await role_repository.get_grants(db, role_uuid=role_uuid)}
    return RoleGrants(uuid=role.uuid, name=role.name, kind=role.kind, grants=grants)
```

- [ ] **Step 4: Add the endpoint**

In `app/api/v1/endpoints/rbac_admin.py`, update imports and add the route:

```python
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.rbac_admin import CapabilityCatalogResponse, MatrixResponse, RoleGrants
from app.services.rbac_admin import RbacNotFoundError
```

```python
@router.get("/rbac/roles/{role_uuid}", response_model=RoleGrants)
async def get_role(role_uuid: UUID, db: AsyncSession = Depends(security.get_db)):
    """One role and its grants."""
    try:
        return await rbac_admin_service.get_role(db, str(role_uuid))
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
```

- [ ] **Step 5: Run test to verify it passes**

Run: `uv run pytest tests/test_rbac_admin_api.py -q`
Expected: PASS.

- [ ] **Step 6: Lint + commit**

Run: `uv run ruff check app tests`
```bash
git add app/services/rbac_admin.py app/api/v1/endpoints/rbac_admin.py tests/test_rbac_admin_api.py
git commit -m "feat(rbac): GET /admin/rbac/roles/{uuid} — one role's grants, 404 if missing (feature 009 P1)"
```

---

## Task 4: User permissions endpoint (`GET /admin/users/{user_uuid}/permissions`)

**Files:**
- Modify: `app/repositories/auth_repository.py` (add to `UserRepository`)
- Modify: `app/services/rbac_admin.py` (add `get_user_permissions_detail`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (add route)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Consumes: `user_repository.get_by_uuid`, `user_repository.get_user_permissions(db, user_uuid) -> dict[str, Scope]` (existing).
- Produces: `user_repository.get_role_refs(db, user_uuid) -> list[Role]`; `user_repository.get_direct_grants(db, user_uuid) -> list[tuple[str, str]]`; `rbac_admin_service.get_user_permissions_detail(db, user_uuid: str) -> UserPermissionsResponse` (raises `RbacNotFoundError`).

- [ ] **Step 1: Write the failing test**

Append to `tests/test_rbac_admin_api.py`:

```python
@pytest.mark.asyncio
async def test_user_permissions_returns_roles_and_effective(client, db_session):
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
    admin_uuid = await _make_rbac_admin(db_session)
    resp = await client.get(
        f"/api/v1/admin/users/{uuid4()}/permissions", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_rbac_admin_api.py::test_user_permissions_returns_roles_and_effective tests/test_rbac_admin_api.py::test_user_permissions_404_when_user_missing -q`
Expected: FAIL — 404 for both (route not defined).

- [ ] **Step 3: Add repository helpers**

In `app/repositories/auth_repository.py`, inside `class UserRepository`, add:

```python
    async def get_role_refs(self, db: AsyncSession, user_uuid: str) -> list[Role]:
        """The roles a user currently holds."""
        result = await db.execute(
            select(Role)
            .join(UserRoleAssign, UserRoleAssign.role_uuid == Role.uuid)
            .where(UserRoleAssign.user_uuid == user_uuid)
        )
        return list(result.scalars().all())

    async def get_direct_grants(self, db: AsyncSession, user_uuid: str) -> list[tuple[str, str]]:
        """A user's direct (per-user) capability->scope grants."""
        result = await db.execute(
            select(Permission.key, UserPermissionAssign.scope)
            .join(UserPermissionAssign, UserPermissionAssign.permission_uuid == Permission.uuid)
            .where(UserPermissionAssign.user_uuid == user_uuid)
        )
        return [(key, scope) for key, scope in result.all()]
```

- [ ] **Step 4: Add the service function**

In `app/services/rbac_admin.py`, extend the repo import to `role_repository, user_repository`, add `RoleRef, UserPermissionsResponse` to the schema import, and add:

```python
async def get_user_permissions_detail(db: AsyncSession, user_uuid: str) -> UserPermissionsResponse:
    """A user's roles, direct grants, and resolved effective permissions."""
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise RbacNotFoundError("User not found")
    roles = await user_repository.get_role_refs(db, user_uuid)
    direct = await user_repository.get_direct_grants(db, user_uuid)
    effective = await user_repository.get_user_permissions(db, user_uuid)
    return UserPermissionsResponse(
        user_uuid=user.uuid,
        roles=[RoleRef(name=role.name, kind=role.kind) for role in roles],
        direct_grants=dict(direct),
        effective={key: scope.value for key, scope in effective.items()},
    )
```

- [ ] **Step 5: Add the endpoint**

In `app/api/v1/endpoints/rbac_admin.py`, add `UserPermissionsResponse` to the schema import and add the route:

```python
@router.get("/users/{user_uuid}/permissions", response_model=UserPermissionsResponse)
async def get_user_permissions(user_uuid: UUID, db: AsyncSession = Depends(security.get_db)):
    """A user's roles, direct grants, and resolved effective permissions."""
    try:
        return await rbac_admin_service.get_user_permissions_detail(db, str(user_uuid))
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_rbac_admin_api.py -q`
Expected: PASS (all Phase 1 tests).

- [ ] **Step 7: Full suite + lint**

Run: `uv run pytest -q`
Expected: all pass (adding a new nullable capability + new endpoints does not affect existing tests).
Run: `uv run ruff check app scripts tests`
Expected: All checks passed!

- [ ] **Step 8: Commit**

```bash
git add app/repositories/auth_repository.py app/services/rbac_admin.py \
  app/api/v1/endpoints/rbac_admin.py tests/test_rbac_admin_api.py
git commit -m "feat(rbac): GET /admin/users/{uuid}/permissions — roles + direct + effective (feature 009 P1)"
```

---

## Out of scope for Phase 1 (do NOT build here)

- Any write endpoint (matrix cell set/revoke, role CRUD, per-user grant, unassign) → Phase 2/3.
- seed idempotency change (stop overwriting existing grants) → Phase 2 (where runtime edits first exist and the regression test is meaningful).
- Granting `rbac.view` to `data_auditor` → deferred (spec §2, super_admin only).

## Self-Review

- **Spec coverage:** Phase 1 rows of spec §5 (capabilities, matrix, role detail, user permissions) each map to Tasks 1–4. `rbac.view` (spec §4) = Task 1. seed grant (spec §9 prerequisite) = Task 1. Router mount (spec §9) = Task 1. seed idempotency + writes are explicitly out of scope (Phase 2/3).
- **Placeholder scan:** none — every step has full code and exact commands.
- **Type consistency:** `get_grants` returns `list[tuple[str,str,str]]` (used in Tasks 2 & 3); `get_direct_grants` returns `list[tuple[str,str]]` → `dict(direct)` in Task 4; `get_user_permissions` returns `dict[str, Scope]` → `scope.value` in Task 4. `RbacNotFoundError` defined in Task 1, used in Tasks 3 & 4. `router` gated once at Task 1, reused by all routes.
