# RBAC Runtime Management — Phase 3 (Role CRUD + per-user grant + unassign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the runtime RBAC admin: create/rename/delete roles, per-user additive grants, and role unassignment — plus a `(user_uuid, permission_uuid)` unique constraint (ADR-058) so per-user grants can't produce inconsistent duplicate rows.

**Architecture:** New write routes on the `rbac_admin` router. Role CRUD is gated by `rbac.edit`; per-user grants and unassignment by `rbac.assign` (both super_admin-only, checkpoint 1, in the service via `require_scope`). Reuses Phase 2's `RbacConflictError`/`RbacNotFoundError`, the `_remaining_super_admins` guard from `app/services/admin.py`, and the `widest()` scope order from `app/core/rbac_scopes.py`. Adds one Alembic migration (dedup-then-constrain). Tests run on `Base.metadata.create_all` (so the model constraint is exercised directly); the migration is verified separately with `alembic upgrade head`.

**Tech Stack:** FastAPI, SQLAlchemy async (PostgreSQL `ON CONFLICT`), Alembic, Pydantic v2, pytest (`uv run pytest`), ruff.

## Global Constraints

- Source spec: `Spec/009-rbac-runtime-management/spec.md` (§5 Phase 3 block, §6 guards, §13 per-member note, §250 uniqueness precondition, §6.1 IDOR note).
- Role CRUD gated by `Perm.RBAC_EDIT`; per-user grant + unassign gated by `Perm.RBAC_ASSIGN` (checkpoint 1, super_admin only, in the service). Reads keep `rbac.view`.
- **Protected role names** (ADR-059): `PROTECTED_ROLE_NAMES = {SUPER_ADMIN_ROLE_NAME, DEFAULT_PLATFORM_ROLE}` = `{"super_admin", "user"}` — these are referenced by name in code (`app/services/admin.py:22`, `app/services/auth_account.py:11,45`). Create/rename-to/rename-of/delete touching them → **409**.
- Error semantics (ADR-023): missing capability → 403; missing resource → 404; invariant violation / reserved name / name clash → 409; bad input (kind∉{platform,team}, empty/over-50-char name, cap∉Perm, scope∉Scope) → 422.
- **Locked decisions:** per-user grant `scope=none` → **store the row** (no special-case). Unassign when the user lacks the role → **404**. Delete a non-existent role → **404**. Migration dedup → **keep the widest scope** (reuse `widest()` order `all>zone>team>own>none`), tie-break by smallest uuid.
- **TOCTOU:** `_remaining_super_admins` is check-then-act (not a DB constraint), same accepted limitation as ADR-032. Do not add locking.
- Run tests `uv run pytest`; lint `uv run ruff check app scripts tests alembic`. Line length 110. Test functions need docstrings (pydocstyle `D` is on; no per-file ignore for `tests/`).
- Commit style: conventional commits, no AI-attribution trailer.
- Branch: `popo/rbac-role-crud`, stacked on `popo/rbac-matrix-write` (Phase 2). PR base = `popo/rbac-matrix-write`.

---

## File Structure

- Modify `app/models/rbac.py` — add `UniqueConstraint("user_uuid","permission_uuid", name="uq_user_perm")` to `UserPermissionAssign`.
- Create `alembic/versions/<rev>_uq_user_perm.py` — dedup (keep widest) then add `uq_user_perm`; downgrade drops it.
- Modify `app/repositories/auth_repository.py` — `UserRepository.upsert_grant` / `delete_grant` / `unassign_role`; `RoleRepository.rename` (or reuse `update`), `count_assignments`, `delete_with_grants`.
- Modify `app/services/rbac_admin.py` — `PROTECTED_ROLE_NAMES`; `create_role`, `rename_role`, `delete_role`, `set_user_permission`, `revoke_user_permission`, `unassign_user_role`.
- Modify `app/schemas/rbac_admin.py` — `CreateRoleRequest`, `RenameRoleRequest` (constrained name + kind).
- Modify `app/api/v1/endpoints/rbac_admin.py` — `POST/PATCH/DELETE /rbac/roles`, `PUT/DELETE /users/{uuid}/permissions/{cap}`, `DELETE /users/{uuid}/role/{role_uuid}`.
- Modify `tests/test_rbac_admin_api.py` — Phase 3 tests.
- Create `tests/test_rbac_uniqueness.py` — model-level `uq_user_perm` test.
- Modify `Spec/008-rbac-authorization/decisions.md` — transcribe ADR-058, ADR-059, and the `rbac.assign` + role-CRUD half of ADR-056.

---

## Task 1: `uq_user_perm` — model constraint + Alembic migration (ADR-058)

**Files:**
- Modify: `app/models/rbac.py` (`UserPermissionAssign.__table_args__`)
- Create: `alembic/versions/<rev>_uq_user_perm.py`
- Test: `tests/test_rbac_uniqueness.py`

**Interfaces:**
- Produces: DB-level `uq_user_perm` on `user_permission_assign(user_uuid, permission_uuid)`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_rbac_uniqueness.py`:

```python
"""The user_permission_assign table enforces one row per (user, capability) (ADR-058)."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.auth import User
from app.models.rbac import Permission, UserPermissionAssign


@pytest.mark.asyncio
async def test_duplicate_user_permission_is_rejected(db_session):
    """A second grant for the same (user, permission) violates uq_user_perm."""
    user = User(name="Dup")
    perm = Permission(key="ticket.export")
    db_session.add(user)
    db_session.add(perm)
    await db_session.flush()

    db_session.add(UserPermissionAssign(user_uuid=user.uuid, permission_uuid=perm.uuid, scope="own"))
    await db_session.flush()

    db_session.add(UserPermissionAssign(user_uuid=user.uuid, permission_uuid=perm.uuid, scope="all"))
    with pytest.raises(IntegrityError):
        await db_session.flush()
```

- [ ] **Step 2: Run to verify it fails**

Run: `uv run pytest tests/test_rbac_uniqueness.py -q`
Expected: FAIL — no constraint yet, the second flush succeeds (no `IntegrityError`).

- [ ] **Step 3: Add the constraint to the model**

In `app/models/rbac.py`, give `UserPermissionAssign` a `__table_args__` (mirroring `RolePermissionAssign`):

```python
class UserPermissionAssign(Base, UUIDPKMixin):
    """Exception direct grant straight to a user, additive.

    ADR-018 — no `effect` column, since union-only means there is nothing to "deny".
    ADR-058 — one row per (user, permission); scope edits upsert this row, never duplicate.
    """

    __tablename__ = "user_permission_assign"
    __table_args__ = (UniqueConstraint("user_uuid", "permission_uuid", name="uq_user_perm"),)
    user_uuid: Mapped[str] = mapped_column(ForeignKey("users.uuid"), index=True)
    permission_uuid: Mapped[str] = mapped_column(ForeignKey("permissions.uuid"), index=True)
    scope: Mapped[str] = mapped_column(String(10), default="none")
```

- [ ] **Step 4: Run to verify it passes**

Run: `uv run pytest tests/test_rbac_uniqueness.py -q`
Expected: PASS (test DB is built via `create_all`, which now emits the constraint).

- [ ] **Step 5: Write the Alembic migration**

Create `alembic/versions/b7c1f0a92d34_uq_user_perm.py` (pick any unused 12-hex revision id if this collides):

```python
"""add uq_user_perm to user_permission_assign (ADR-058)

Revision ID: b7c1f0a92d34
Revises: a3f8d1c9e2b5
Create Date: 2026-07-13 00:00:00.000000

Enforces one grant row per (user_uuid, permission_uuid). Before adding the constraint we
dedup any pre-existing rows, keeping the widest scope (all>zone>team>own>none, matching
app/core/rbac_scopes.py:WIDTH and the effective-permission resolver), tie-broken by the
smallest uuid so the result is deterministic. On a fresh / user-less DB the dedup is a no-op.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'b7c1f0a92d34'
down_revision: str | Sequence[str] | None = 'a3f8d1c9e2b5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_WIDTH = "CASE scope WHEN 'all' THEN 4 WHEN 'zone' THEN 3 WHEN 'team' THEN 2 WHEN 'own' THEN 1 ELSE 0 END"


def upgrade() -> None:
    """Dedup to the widest scope per (user, permission), then add uq_user_perm."""
    op.execute(f"""
        DELETE FROM user_permission_assign a
        USING user_permission_assign b
        WHERE a.user_uuid = b.user_uuid
          AND a.permission_uuid = b.permission_uuid
          AND a.uuid <> b.uuid
          AND (
            ({_WIDTH.replace('scope', 'a.scope')}) < ({_WIDTH.replace('scope', 'b.scope')})
            OR (
              ({_WIDTH.replace('scope', 'a.scope')}) = ({_WIDTH.replace('scope', 'b.scope')})
              AND a.uuid > b.uuid
            )
          )
    """)
    op.execute("""
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_perm') THEN
            ALTER TABLE user_permission_assign
              ADD CONSTRAINT uq_user_perm UNIQUE (user_uuid, permission_uuid);
          END IF;
        END $$;
    """)


def downgrade() -> None:
    """Drop uq_user_perm (rows are not un-deduped)."""
    op.execute("ALTER TABLE user_permission_assign DROP CONSTRAINT IF EXISTS uq_user_perm")
```

- [ ] **Step 6: Verify the migration chains and applies on a fresh DB**

Run: `uv run alembic heads` → expect a single head `b7c1f0a92d34`.
Run (against a scratch DB — use the test DB URL or a throwaway):
`uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`
Expected: no errors (upgrade → downgrade → upgrade round-trips cleanly). If a repo test already covers `alembic upgrade head` on a fresh DB, run that instead: `uv run pytest -k alembic -q`.

- [ ] **Step 7: Commit**

```bash
git add app/models/rbac.py alembic/versions/b7c1f0a92d34_uq_user_perm.py tests/test_rbac_uniqueness.py
git commit -m "feat(rbac): uq_user_perm on user_permission_assign + dedup migration (feature 009 P3, ADR-058)"
```

---

## Task 2: per-user grant — `PUT` / `DELETE /admin/users/{uuid}/permissions/{cap}` (rbac.assign)

**Files:**
- Modify: `app/repositories/auth_repository.py` (`UserRepository.upsert_grant`, `UserRepository.delete_grant`)
- Modify: `app/services/rbac_admin.py` (`set_user_permission`, `revoke_user_permission`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (2 routes)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Consumes: `permission_repository.ensure_by_key`/`get_by_key` (Phase 2), `user_repository.get_by_uuid`, `get_user_permissions_detail` (Phase 1), `require_scope`.
- Produces:
  - `UserRepository.upsert_grant(db, *, user_uuid, permission_uuid, scope) -> None` (PG `ON CONFLICT (user_uuid, permission_uuid) DO UPDATE`)
  - `UserRepository.delete_grant(db, *, user_uuid, permission_uuid) -> int`
  - `set_user_permission(db, *, actor, user_uuid, cap, scope) -> UserPermissionsResponse` (checkpoint 1 `RBAC_ASSIGN`; 404 if user missing; upsert; return refreshed detail)
  - `revoke_user_permission(db, *, actor, user_uuid, cap) -> None` (checkpoint 1; 404 if user missing; idempotent delete)
  - routes `PUT /users/{user_uuid}/permissions/{cap}` → `UserPermissionsResponse`; `DELETE …` → 204

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rbac_admin_api.py` (reuse `_make_super_admin`, `_make_plain_user`, `_auth_header`; add a helper for a target user):

```python
async def _make_target_user(db, name: str = "Target") -> str:
    """A plain user to receive per-user grants. Returns uuid."""
    user = User(name=name)
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    await db.commit()
    return user_uuid


@pytest.mark.asyncio
async def test_put_user_grant_adds_direct_grant(client, db_session):
    """A per-user grant shows up in direct_grants and effective."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{target}/permissions/ticket.export",
        json={"scope": "all"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["direct_grants"]["ticket.export"] == "all"
    assert resp.json()["effective"]["ticket.export"] == "all"


@pytest.mark.asyncio
async def test_put_user_grant_upserts_not_duplicates(client, db_session):
    """A second PUT for the same (user, cap) updates the one row (uq_user_perm)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    hdr = _auth_header(admin_uuid)
    url = f"/api/v1/admin/users/{target}/permissions/ticket.export"
    await client.put(url, json={"scope": "own"}, headers=hdr)
    resp = await client.put(url, json={"scope": "all"}, headers=hdr)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["direct_grants"]["ticket.export"] == "all"

    rows = (
        await db_session.execute(
            select(UserPermissionAssign)
            .join(Permission, Permission.uuid == UserPermissionAssign.permission_uuid)
            .where(UserPermissionAssign.user_uuid == target, Permission.key == "ticket.export")
        )
    ).scalars().all()
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_put_user_grant_unknown_user_404(client, db_session):
    """Granting to a non-existent user returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{uuid4()}/permissions/ticket.export",
        json={"scope": "all"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_put_user_grant_denied_for_non_super_admin(client, db_session):
    """A caller without rbac.assign is denied with 403."""
    plain_uuid = await _make_plain_user(db_session)
    target = await _make_target_user(db_session)
    resp = await client.put(
        f"/api/v1/admin/users/{target}/permissions/ticket.export",
        json={"scope": "all"},
        headers=_auth_header(plain_uuid),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_user_grant_is_idempotent(client, db_session):
    """DELETE removes the direct grant and is a 204 even when it was never set."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    hdr = _auth_header(admin_uuid)
    url = f"/api/v1/admin/users/{target}/permissions/ticket.export"
    await client.put(url, json={"scope": "all"}, headers=hdr)

    assert (await client.delete(url, headers=hdr)).status_code == 204
    assert (await client.delete(url, headers=hdr)).status_code == 204  # idempotent

    detail = await client.get(f"/api/v1/admin/users/{target}/permissions", headers=hdr)
    assert "ticket.export" not in detail.json()["direct_grants"]
```

- [ ] **Step 2: Run to verify they fail** — `uv run pytest tests/test_rbac_admin_api.py -k user_grant -q` → route missing.

- [ ] **Step 3: Add repo helpers**

Add to `UserRepository` in `app/repositories/auth_repository.py`:

```python
    async def upsert_grant(
        self, db: AsyncSession, *, user_uuid: str, permission_uuid: str, scope: str
    ) -> None:
        """Insert or update one per-user grant's scope (PG ON CONFLICT on uq_user_perm)."""
        stmt = insert(UserPermissionAssign).values(
            user_uuid=user_uuid, permission_uuid=permission_uuid, scope=scope
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_uuid", "permission_uuid"], set_={"scope": scope}
        )
        await db.execute(stmt)
        await db.commit()

    async def delete_grant(
        self, db: AsyncSession, *, user_uuid: str, permission_uuid: str
    ) -> int:
        """Delete one per-user grant; returns rows removed (0 when absent)."""
        result = await db.execute(
            delete(UserPermissionAssign).where(
                UserPermissionAssign.user_uuid == user_uuid,
                UserPermissionAssign.permission_uuid == permission_uuid,
            )
        )
        await db.commit()
        return result.rowcount
```

- [ ] **Step 4: Add service functions** (in `app/services/rbac_admin.py`):

```python
async def set_user_permission(
    db: AsyncSession, *, actor: User, user_uuid: str, cap: Perm, scope: Scope
) -> UserPermissionsResponse:
    """Add/update one per-user additive grant. Checkpoint 1: rbac.assign, super_admin only."""
    await require_scope(actor, Perm.RBAC_ASSIGN, db)
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise RbacNotFoundError("User not found")
    permission = await permission_repository.ensure_by_key(db, cap.value)
    await user_repository.upsert_grant(
        db, user_uuid=user_uuid, permission_uuid=str(permission.uuid), scope=scope.value
    )
    return await get_user_permissions_detail(db, user_uuid)


async def revoke_user_permission(
    db: AsyncSession, *, actor: User, user_uuid: str, cap: Perm
) -> None:
    """Remove one per-user grant. Checkpoint 1: rbac.assign. Idempotent."""
    await require_scope(actor, Perm.RBAC_ASSIGN, db)
    user = await user_repository.get_by_uuid(db, user_uuid)
    if user is None:
        raise RbacNotFoundError("User not found")
    permission = await permission_repository.get_by_key(db, cap.value)
    if permission is None:
        return
    await user_repository.delete_grant(
        db, user_uuid=user_uuid, permission_uuid=str(permission.uuid)
    )
```

- [ ] **Step 5: Add endpoints** (in `app/api/v1/endpoints/rbac_admin.py`):

```python
@router.put("/users/{user_uuid}/permissions/{cap}", response_model=UserPermissionsResponse)
async def set_user_permission(
    user_uuid: UUID,
    cap: Perm,
    body: SetGrantRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Add/update one per-user additive grant (super_admin only, via rbac.assign)."""
    try:
        return await rbac_admin_service.set_user_permission(
            db, actor=current_user, user_uuid=str(user_uuid), cap=cap, scope=body.scope
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/users/{user_uuid}/permissions/{cap}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_user_permission(
    user_uuid: UUID,
    cap: Perm,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Remove one per-user grant (super_admin only, via rbac.assign)."""
    try:
        await rbac_admin_service.revoke_user_permission(
            db, actor=current_user, user_uuid=str(user_uuid), cap=cap
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
```

- [ ] **Step 6: Run tests + lint** — `uv run pytest tests/test_rbac_admin_api.py -q && uv run ruff check app tests` → all pass.

- [ ] **Step 7: Commit**

```bash
git add app/repositories/auth_repository.py app/services/rbac_admin.py \
        app/api/v1/endpoints/rbac_admin.py tests/test_rbac_admin_api.py
git commit -m "feat(rbac): PUT/DELETE /admin/users/{uuid}/permissions/{cap} — per-user grant (feature 009 P3)"
```

---

## Task 3: role create + rename — `POST` / `PATCH /admin/rbac/roles` (rbac.edit)

**Files:**
- Modify: `app/schemas/rbac_admin.py` (`CreateRoleRequest`, `RenameRoleRequest`)
- Modify: `app/services/rbac_admin.py` (`PROTECTED_ROLE_NAMES`, `create_role`, `rename_role`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (2 routes)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Produces:
  - schemas `CreateRoleRequest{name: <1..50, stripped>, kind: Literal["platform","team"]}`, `RenameRoleRequest{name: <1..50, stripped>}`
  - `PROTECTED_ROLE_NAMES = {SUPER_ADMIN_ROLE_NAME, DEFAULT_PLATFORM_ROLE}`
  - `create_role(db, *, actor, name, kind) -> RoleGrants` (409 reserved/duplicate)
  - `rename_role(db, *, actor, role_uuid, name) -> RoleGrants` (404 missing; 409 renaming protected role / to protected name / to a taken name; same-name no-op)
  - routes `POST /rbac/roles` → 201 `RoleGrants`; `PATCH /rbac/roles/{uuid}` → `RoleGrants`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_rbac_admin_api.py`:

```python
@pytest.mark.asyncio
async def test_create_role(client, db_session):
    """super_admin creates a new empty role (201, no grants yet)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "dispatcher", "kind": "team"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["name"] == "dispatcher" and resp.json()["grants"] == {}


@pytest.mark.asyncio
async def test_create_role_duplicate_name_409(client, db_session):
    """Creating a role whose name already exists is a 409."""
    admin_uuid, _ = await _make_super_admin(db_session)
    await _make_editable_role(db_session, name="dispatcher")
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "dispatcher", "kind": "team"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_role_reserved_name_409(client, db_session):
    """Creating a role named 'user' (a code-referenced name) is refused (ADR-059)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "user", "kind": "platform"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_role_bad_kind_422(client, db_session):
    """kind must be platform or team."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/rbac/roles",
        json={"name": "x", "kind": "wizard"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_rename_role(client, db_session):
    """Renaming a plain role updates its name."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="oldname")
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{role_uuid}",
        json={"name": "newname"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["name"] == "newname"


@pytest.mark.asyncio
async def test_rename_protected_role_409(client, db_session):
    """The super_admin role cannot be renamed (ADR-059)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}",
        json={"name": "root"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_rename_role_denied_for_non_super_admin(client, db_session):
    """A caller without rbac.edit is denied with 403."""
    plain_uuid = await _make_plain_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="oldname")
    resp = await client.patch(
        f"/api/v1/admin/rbac/roles/{role_uuid}",
        json={"name": "newname"},
        headers=_auth_header(plain_uuid),
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Add schemas** (in `app/schemas/rbac_admin.py`; import `Literal` from `typing` and `Field` from `pydantic`):

```python
_RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class CreateRoleRequest(BaseModel):
    """Create-role body; kind is fixed to platform|team, name is trimmed and 1..50 chars."""

    name: _RoleName
    kind: Literal["platform", "team"]


class RenameRoleRequest(BaseModel):
    """Rename-role body (name only; kind is immutable)."""

    name: _RoleName
```

(add imports at top: `from typing import Annotated, Literal` and `from pydantic import BaseModel, StringConstraints`.)

- [ ] **Step 4: Add service functions** (in `app/services/rbac_admin.py`; import `DEFAULT_PLATFORM_ROLE`):

```python
from app.services.auth_account import DEFAULT_PLATFORM_ROLE

# Role names the code references directly; renaming/deleting them breaks flows (ADR-059).
PROTECTED_ROLE_NAMES = {SUPER_ADMIN_ROLE_NAME, DEFAULT_PLATFORM_ROLE}


async def create_role(db: AsyncSession, *, actor: User, name: str, kind: str) -> RoleGrants:
    """Create a new empty role. Checkpoint 1: rbac.edit. Reserved/duplicate name → 409."""
    await require_scope(actor, Perm.RBAC_EDIT, db)
    if name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"'{name}' is a reserved role name")
    if await role_repository.get_by_name(db, name) is not None:
        raise RbacConflictError(f"Role '{name}' already exists")
    role = await role_repository.create(db, obj_in={"name": name, "kind": kind})
    return RoleGrants(uuid=role.uuid, name=role.name, kind=role.kind, grants={})


async def rename_role(db: AsyncSession, *, actor: User, role_uuid: str, name: str) -> RoleGrants:
    """Rename a role. Checkpoint 1: rbac.edit. Protected role / protected or taken name → 409."""
    await require_scope(actor, Perm.RBAC_EDIT, db)
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")
    if role.name == name:
        return await get_role(db, role_uuid)  # no-op
    if role.name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"Cannot rename the '{role.name}' role")
    if name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"'{name}' is a reserved role name")
    if await role_repository.get_by_name(db, name) is not None:
        raise RbacConflictError(f"Role '{name}' already exists")
    await role_repository.update(db, db_obj=role, obj_in={"name": name})
    return await get_role(db, role_uuid)
```

- [ ] **Step 5: Add endpoints** (`POST` returns 201; both map `RbacNotFoundError`→404, `RbacConflictError`→409):

```python
@router.post("/rbac/roles", response_model=RoleGrants, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: CreateRoleRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Create a new empty role (super_admin only, via rbac.edit)."""
    try:
        return await rbac_admin_service.create_role(
            db, actor=current_user, name=body.name, kind=body.kind
        )
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/rbac/roles/{role_uuid}", response_model=RoleGrants)
async def rename_role(
    role_uuid: UUID,
    body: RenameRoleRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Rename a role (super_admin only, via rbac.edit)."""
    try:
        return await rbac_admin_service.rename_role(
            db, actor=current_user, role_uuid=str(role_uuid), name=body.name
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
```

(add `CreateRoleRequest, RenameRoleRequest` to the schema import.)

- [ ] **Step 6: Run tests + lint.**
- [ ] **Step 7: Commit** — `feat(rbac): POST + PATCH /admin/rbac/roles — create & rename roles (feature 009 P3)`

---

## Task 4: role delete — `DELETE /admin/rbac/roles/{uuid}` (rbac.edit)

**Files:**
- Modify: `app/repositories/auth_repository.py` (`RoleRepository.count_assignments`, `RoleRepository.delete_with_grants`)
- Modify: `app/services/rbac_admin.py` (`delete_role`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (`DELETE` route → 204)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Produces:
  - `RoleRepository.count_assignments(db, role_uuid) -> int` (rows in `user_role_assign`)
  - `RoleRepository.delete_with_grants(db, role_uuid) -> None` (delete `role_permission_assign` rows then the role, one transaction)
  - `delete_role(db, *, actor, role_uuid) -> None` (404 missing; 409 protected or has assignments; else cascade-delete grants + role)
  - route `DELETE /rbac/roles/{role_uuid}` → 204

- [ ] **Step 1: Failing tests** (append):

```python
@pytest.mark.asyncio
async def test_delete_role_with_grants_succeeds(client, db_session):
    """Deleting an unassigned role removes it and its permission grants (204)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="temp")
    hdr = _auth_header(admin_uuid)
    await client.put(
        f"/api/v1/admin/rbac/roles/{role_uuid}/permissions/ticket.edit",
        json={"scope": "own"}, headers=hdr,
    )
    resp = await client.delete(f"/api/v1/admin/rbac/roles/{role_uuid}", headers=hdr)
    assert resp.status_code == 204, resp.text
    assert (await client.get(f"/api/v1/admin/rbac/roles/{role_uuid}", headers=hdr)).status_code == 404


@pytest.mark.asyncio
async def test_delete_role_with_assignment_409(client, db_session):
    """A role still assigned to a user cannot be deleted (must reassign first)."""
    admin_uuid, _ = await _make_super_admin(db_session)
    role_uuid = await _make_editable_role(db_session, name="temp")
    user = User(name="Holder")
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role_uuid))
    await db_session.commit()

    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{role_uuid}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_protected_role_409(client, db_session):
    """The super_admin role cannot be deleted (ADR-059)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{super_role_uuid}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_role_unknown_404(client, db_session):
    """Deleting a non-existent role returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/rbac/roles/{uuid4()}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Repo helpers** (in `RoleRepository`):

```python
    async def count_assignments(self, db: AsyncSession, role_uuid: str) -> int:
        """Number of users currently assigned this role."""
        rows = (
            await db.execute(
                select(UserRoleAssign.uuid).where(UserRoleAssign.role_uuid == role_uuid)
            )
        ).all()
        return len(rows)

    async def delete_with_grants(self, db: AsyncSession, role_uuid: str) -> None:
        """Delete a role's permission grants then the role itself, in one transaction."""
        await db.execute(
            delete(RolePermissionAssign).where(RolePermissionAssign.role_uuid == role_uuid)
        )
        await db.execute(delete(Role).where(Role.uuid == role_uuid))
        await db.commit()
```

(ensure `UserRoleAssign` and `Role` are imported in the module — they already are.)

- [ ] **Step 4: Service** (in `app/services/rbac_admin.py`):

```python
async def delete_role(db: AsyncSession, *, actor: User, role_uuid: str) -> None:
    """Delete a role and its grants. Checkpoint 1: rbac.edit.

    Guards: protected role → 409; any remaining UserRoleAssign → 409 (reassign first, ADR-056).
    """
    await require_scope(actor, Perm.RBAC_EDIT, db)
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")
    if role.name in PROTECTED_ROLE_NAMES:
        raise RbacConflictError(f"Cannot delete the '{role.name}' role")
    if await role_repository.count_assignments(db, role_uuid) > 0:
        raise RbacConflictError("Role still has members; reassign them before deleting")
    await role_repository.delete_with_grants(db, role_uuid)
```

- [ ] **Step 5: Endpoint**:

```python
@router.delete("/rbac/roles/{role_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Delete a role and its grants (super_admin only, via rbac.edit)."""
    try:
        await rbac_admin_service.delete_role(db, actor=current_user, role_uuid=str(role_uuid))
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
```

- [ ] **Step 6: Run tests + lint.**
- [ ] **Step 7: Commit** — `feat(rbac): DELETE /admin/rbac/roles/{uuid} — delete role + cascade grants (feature 009 P3)`

---

## Task 5: unassign role — `DELETE /admin/users/{uuid}/role/{role_uuid}` (rbac.assign)

**Files:**
- Modify: `app/repositories/auth_repository.py` (`UserRepository.unassign_role`)
- Modify: `app/services/rbac_admin.py` (`unassign_user_role`)
- Modify: `app/api/v1/endpoints/rbac_admin.py` (`DELETE` route → 204)
- Test: `tests/test_rbac_admin_api.py`

**Interfaces:**
- Consumes: `_remaining_super_admins` (`app/services/admin.py`), `SUPER_ADMIN_ROLE_NAME`.
- Produces:
  - `UserRepository.unassign_role(db, *, user_uuid, role_uuid) -> int` (delete the assignment; rows removed)
  - `unassign_user_role(db, *, actor, user_uuid, role_uuid) -> None` (404 if user/role/assignment missing; 409 if it would drop the last super_admin)
  - route `DELETE /users/{user_uuid}/role/{role_uuid}` → 204

- [ ] **Step 1: Failing tests** (append; import `_remaining_super_admins` indirectly via API behavior):

```python
async def _assign(db, user_uuid: str, role_uuid: str) -> None:
    """Directly attach a role to a user (test setup)."""
    db.add(UserRoleAssign(user_uuid=user_uuid, role_uuid=role_uuid))
    await db.commit()


@pytest.mark.asyncio
async def test_unassign_role(client, db_session):
    """Removing a role the user holds succeeds (204) and drops it from their roles."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="helper")
    await _assign(db_session, target, role_uuid)
    hdr = _auth_header(admin_uuid)

    resp = await client.delete(f"/api/v1/admin/users/{target}/role/{role_uuid}", headers=hdr)
    assert resp.status_code == 204, resp.text
    detail = await client.get(f"/api/v1/admin/users/{target}/permissions", headers=hdr)
    assert all(r["name"] != "helper" for r in detail.json()["roles"])


@pytest.mark.asyncio
async def test_unassign_role_user_lacks_it_404(client, db_session):
    """Unassigning a role the user does not hold returns 404."""
    admin_uuid, _ = await _make_super_admin(db_session)
    target = await _make_target_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="helper")
    resp = await client.delete(
        f"/api/v1/admin/users/{target}/role/{role_uuid}", headers=_auth_header(admin_uuid)
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_unassign_last_super_admin_409(client, db_session):
    """Removing the only super_admin's super_admin role is refused (409)."""
    admin_uuid, super_role_uuid = await _make_super_admin(db_session)
    resp = await client.delete(
        f"/api/v1/admin/users/{admin_uuid}/role/{super_role_uuid}",
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_unassign_role_denied_for_non_super_admin(client, db_session):
    """A caller without rbac.assign is denied with 403."""
    plain_uuid = await _make_plain_user(db_session)
    target = await _make_target_user(db_session)
    role_uuid = await _make_editable_role(db_session, name="helper")
    await _assign(db_session, target, role_uuid)
    resp = await client.delete(
        f"/api/v1/admin/users/{target}/role/{role_uuid}", headers=_auth_header(plain_uuid)
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Repo helper** (in `UserRepository`):

```python
    async def unassign_role(self, db: AsyncSession, *, user_uuid: str, role_uuid: str) -> int:
        """Delete a user↔role assignment; returns rows removed (0 when absent)."""
        result = await db.execute(
            delete(UserRoleAssign).where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.role_uuid == role_uuid,
            )
        )
        await db.commit()
        return result.rowcount
```

- [ ] **Step 4: Service** (in `app/services/rbac_admin.py`; import `_remaining_super_admins`):

```python
from app.services.admin import SUPER_ADMIN_ROLE_NAME, _remaining_super_admins


async def unassign_user_role(
    db: AsyncSession, *, actor: User, user_uuid: str, role_uuid: str
) -> None:
    """Remove a role from a user. Checkpoint 1: rbac.assign.

    Guard: refuses to drop the last super_admin (ADR-032/056).
    """
    await require_scope(actor, Perm.RBAC_ASSIGN, db)
    role = await role_repository.get_by_uuid(db, role_uuid)
    if role is None:
        raise RbacNotFoundError("Role not found")

    assignment = (
        await db.execute(
            select(UserRoleAssign).where(
                UserRoleAssign.user_uuid == user_uuid,
                UserRoleAssign.role_uuid == role_uuid,
            )
        )
    ).scalars().first()
    if assignment is None:
        raise RbacNotFoundError("User is not assigned this role")

    if role.name == SUPER_ADMIN_ROLE_NAME:
        remaining = await _remaining_super_admins(db, role_uuid, excluding=user_uuid)
        if remaining == 0:
            raise RbacConflictError("Cannot remove the last super_admin")

    await user_repository.unassign_role(db, user_uuid=user_uuid, role_uuid=role_uuid)
```

(add `UserRoleAssign` and `select` imports to `app/services/rbac_admin.py`.)

- [ ] **Step 5: Endpoint**:

```python
@router.delete(
    "/users/{user_uuid}/role/{role_uuid}", status_code=status.HTTP_204_NO_CONTENT
)
async def unassign_user_role(
    user_uuid: UUID,
    role_uuid: UUID,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Remove a role from a user (super_admin only, via rbac.assign)."""
    try:
        await rbac_admin_service.unassign_user_role(
            db, actor=current_user, user_uuid=str(user_uuid), role_uuid=str(role_uuid)
        )
    except RbacNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except RbacConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
```

- [ ] **Step 6: Run tests + lint** — full `uv run pytest tests/test_rbac_admin_api.py -q` + `uv run ruff check app tests`.
- [ ] **Step 7: Commit** — `feat(rbac): DELETE /admin/users/{uuid}/role/{role_uuid} — unassign role (feature 009 P3)`

---

## Task 6: transcribe ADR-058 / ADR-059 / rest of ADR-056

**Files:**
- Modify: `Spec/008-rbac-authorization/decisions.md`

- [ ] **Step 1: Append ADR-058 (uniqueness) and ADR-059 (protected role names)** after ADR-056/057, matching the existing `#### ADR-0XX` + Context/Decision/Consequences/取代關係 format. ADR-058 body: constraint + dedup-keep-widest migration + upsert (see this plan's Task 1). ADR-059 body: `PROTECTED_ROLE_NAMES = {"super_admin","user"}`, code-coupling rationale (`auth_account.py:11,45`, `admin.py:22`), create/rename/delete → 409.

- [ ] **Step 2: Extend ADR-056's status note** to record that Phase 3 landed `rbac.assign` enforcement (per-user grant + unassign) and the role-CRUD guards (≥1 super_admin via `_remaining_super_admins`; no-assignment-before-delete; protected-name guard).

- [ ] **Step 3: Commit** — `docs(rbac): transcribe ADR-058 + ADR-059, close ADR-056 rbac.assign (feature 009 P3)`

---

## Self-Review (spec coverage)

- §5 Phase 3 role CRUD (`POST`/`PATCH`/`DELETE /rbac/roles`) → Tasks 3, 4. ✅
- §5 per-user grant (`PUT`/`DELETE /users/{uuid}/permissions/{cap}`) → Task 2. ✅
- §5 unassign (`DELETE /users/{uuid}/role/{role_uuid}`) → Task 5. ✅
- §6 guards: ≥1 super_admin (unassign) → Task 5; no-assignment-before-delete → Task 4; protected role (super_admin+user) rename/delete → Tasks 3/4 (ADR-059). ✅
- §6 input validation (kind, name length, cap, scope) → Task 3 schemas + enum types. ✅
- §13 / §250 uniqueness precondition (方案 A) → Task 1 (ADR-058). ✅
- §8 audit (zero work) → existing triggers on all five tables. ✅
- POST /users/{uuid}/role (already exists, ADR-032) → not re-implemented. ✅
