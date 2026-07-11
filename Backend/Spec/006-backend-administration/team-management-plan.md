# Team Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /admin/teams` (create) and `GET /admin/teams` (scope-filtered list) so teams can be created and listed, closing the RBAC gap where teams can receive members/zones but cannot themselves be created.

**Architecture:** Thin REST endpoints on the existing `/admin` router delegate to flat service functions in `app/services/admin.py`, which own authz (`require_scope`) and persistence. The list path reuses the generic `scope_filter`; to make it work for `Team` (which has no `team_uuid` column — its own `uuid` is the boundary), the scope engine is generalized so a model can declare its team-scope boundary column.

**Tech Stack:** FastAPI, SQLAlchemy (async), Pydantic v2, pytest / pytest-asyncio, PostgreSQL.

## Global Constraints

- Authz is **seed-driven**; do NOT add runtime permission-matrix editing (ADR-049).
- Flat-service style: `db` first, keyword-only args, service owns `require_scope` (match `assign_role` / `add_team_member` in `app/services/admin.py`).
- Conventional commit messages; no attribution trailer (match repo history).
- Tests capture every `uuid` as a plain `str` at creation time (never re-read off an ORM object after a later commit — `db_session` is `expire_on_commit=True`).
- `ruff check` must pass on touched files before each commit.
- Run tests with the env the repo uses: `TEST_DB_URL` / `TEST_ADMIN_DB_URL` pointing at the dedicated test DB.

---

### Task 1: Generalize `scope_filter` for a declared team-scope boundary

**Files:**
- Modify: `app/models/team.py` (add `__team_scope_attr__` to `Team`)
- Modify: `app/core/rbac_scopes.py` (`scope_filter` TEAM branch)
- Modify: `RBAC_V1_DECISIONS.md` (append ADR-053)
- Test: `tests/test_rbac_scopes.py`

**Interfaces:**
- Produces: `scope_filter(Scope.TEAM, actor=..., model=Team)` → `[Team.uuid == actor.team_uuid]`; for any model without `__team_scope_attr__` the behavior is unchanged (uses `team_uuid`).

- [ ] **Step 1: Write the failing unit tests**

Add the two test functions below to the end of `tests/test_rbac_scopes.py`. The imports
shown are what the tests need — **merge them into the file's existing import block** (some,
e.g. `Scope`, `SimpleNamespace`, `uuid4`, may already be imported; do not duplicate — ruff
will flag it):

```python
from types import SimpleNamespace
from uuid import uuid4

from app.core.rbac_scopes import Scope, scope_filter
from app.models.auth import User
from app.models.team import Team


def test_scope_filter_team_uses_declared_boundary_for_team_model():
    """Team declares its own uuid as the team boundary, so team-scope filters on teams.uuid."""
    actor = SimpleNamespace(uuid=uuid4(), team_uuid=uuid4())
    conds = scope_filter(Scope.TEAM, actor=actor, model=Team)
    assert len(conds) == 1
    assert "teams.uuid" in str(conds[0])


def test_scope_filter_team_defaults_to_team_uuid_column():
    """A model without a declared boundary keeps using its team_uuid column (regression)."""
    actor = SimpleNamespace(uuid=uuid4(), team_uuid=uuid4())
    conds = scope_filter(Scope.TEAM, actor=actor, model=User)
    assert len(conds) == 1
    assert "users.team_uuid" in str(conds[0])
```

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `.venv/bin/python -m pytest tests/test_rbac_scopes.py::test_scope_filter_team_uses_declared_boundary_for_team_model -v`
Expected: FAIL — currently `scope_filter(TEAM, Team)` returns `[false()]` (because `Team` has no `team_uuid`), so `str(conds[0])` is `"false"`, not `"teams.uuid ..."`.

- [ ] **Step 3: Declare the boundary on `Team`**

In `app/models/team.py`, update the `Team` class (add the class attribute and note it in the docstring):

```python
class Team(Base, UUIDPKMixin, TimestampMixin):
    """A gov or NGO organization. A team IS its own scope boundary (ADR-053): team-scope
    filters key on its own uuid, not a team_uuid column."""

    __tablename__ = "teams"
    # ADR-053: team-scope resources filter on this column; Team's boundary is its own uuid.
    __team_scope_attr__ = "uuid"
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(10))  # "gov" | "ngo" — drives gov/ngo scope
    status: Mapped[str] = mapped_column(String(20), default="active")
```

- [ ] **Step 4: Generalize the `scope_filter` TEAM branch**

In `app/core/rbac_scopes.py`, replace the existing TEAM branch inside `scope_filter`:

```python
    if scope == Scope.TEAM:
        # A model may declare its own team-scope boundary column (ADR-053); default is
        # team_uuid. Team declares "uuid" because a team IS its own boundary.
        if not actor.team_uuid:
            return [false()]
        attr = getattr(model, "__team_scope_attr__", "team_uuid")
        if not hasattr(model, attr):
            return [false()]
        return [getattr(model, attr) == actor.team_uuid]
```

- [ ] **Step 5: Run both unit tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_rbac_scopes.py -k "scope_filter_team" -v`
Expected: 2 passed.

- [ ] **Step 6: Append ADR-053 to `RBAC_V1_DECISIONS.md`**

Insert this block immediately after the ADR-052 section (before `## 附錄 A. Scope 語意表`):

```markdown
#### ADR-053 team-scope 資源可宣告自己的邊界欄位（`__team_scope_attr__`）
> **狀態:ACCEPTED（2026-07-10,Team Management）。**

**Context**:`Team` 沒有 `team_uuid` 欄位（它自己的 uuid 就是邊界）,通用 `scope_filter(TEAM, Team)` 因 `hasattr(Team,"team_uuid") is False` 回 `false()`,導致 team admin 列不到自己 team。

**Decision**:model 可宣告 `__team_scope_attr__`(預設 `team_uuid`);`scope_filter` 的 TEAM 分支讀它,`Team` 宣告 `"uuid"`。範圍限 list/filter 路徑;`in_scope` 維持既有 SimpleNamespace adaptor(裸 Team 不走 in_scope)。其他 model 未宣告 → 行為不變。

---
```

- [ ] **Step 7: Lint and commit**

Run: `.venv/bin/ruff check app/models/team.py app/core/rbac_scopes.py tests/test_rbac_scopes.py`
Expected: All checks passed.

```bash
git add app/models/team.py app/core/rbac_scopes.py tests/test_rbac_scopes.py RBAC_V1_DECISIONS.md
git commit -m "feat(rbac): let models declare their team-scope boundary column (ADR-053)"
```

---

### Task 2: `POST /admin/teams` — create a team (super_admin only)

**Files:**
- Modify: `app/schemas/admin.py` (add `CreateTeamRequest`, `TeamResponse`)
- Modify: `app/services/admin.py` (add `create_team`)
- Modify: `app/api/v1/endpoints/admin.py` (add `POST /teams`)
- Modify: `scripts/seed_rbac.py` (grant `TEAM_EDIT: all` to `super_admin`)
- Modify: `RBAC_V1_DECISIONS.md` (append ADR-054)
- Test: `tests/test_admin_api.py`

**Interfaces:**
- Consumes: `require_scope` (from `app.services.authz`), `team_repository` (from `app.repositories.team_repository`).
- Produces:
  - `CreateTeamRequest(name: str, type: Literal["gov","ngo"])`, `TeamResponse(uuid, name, type, status)`
  - `admin_service.create_team(db, *, actor: User, name: str, type_: str) -> Team`
  - `POST /api/v1/admin/teams` → `201` `TeamResponse`

- [ ] **Step 1: Write the failing integration tests**

First, extend the shared `_make_super_admin` helper in `tests/test_admin_api.py` so the super_admin can create teams — add one line after the existing grants:

```python
    await _grant(db, role, perm_cache, Perm.TEAM_MEMBER_MANAGE, "all")
    await _grant(db, role, perm_cache, Perm.TEAM_EDIT, "all")   # ← add this line
```

Then add these tests at the end of `tests/test_admin_api.py`:

```python
@pytest.mark.asyncio
async def test_create_team_as_super_admin(client, db_session):
    """super_admin creates a gov team and gets 201 with the persisted row."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "Taipei Gov", "type": "gov"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body["name"] == "Taipei Gov"
    assert body["type"] == "gov"
    assert body["status"] == "active"
    assert body["uuid"]


@pytest.mark.asyncio
async def test_create_team_denied_without_team_edit(client, db_session):
    """A caller without team.edit is denied (403)."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "Rogue", "type": "ngo"},
        headers=_auth_header(plain_uuid),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_team_rejects_bad_type(client, db_session):
    """A type outside {gov, ngo} is rejected by the request schema (422)."""
    admin_uuid = await _make_super_admin(db_session)
    resp = await client.post(
        "/api/v1/admin/teams",
        json={"name": "X", "type": "military"},
        headers=_auth_header(admin_uuid),
    )
    assert resp.status_code == 422
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_admin_api.py -k create_team -v`
Expected: FAIL — `POST /api/v1/admin/teams` returns 404 (route not defined yet).

- [ ] **Step 3: Add the request/response schemas**

In `app/schemas/admin.py`, update the imports and add the two models:

```python
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field
```

```python
class CreateTeamRequest(BaseModel):
    """Body for creating a gov/ngo team."""

    name: str = Field(min_length=1, max_length=100)
    type: Literal["gov", "ngo"]


class TeamResponse(BaseModel):
    """A team's identity and status."""

    uuid: UUID
    name: str
    type: str
    status: str
```

- [ ] **Step 4: Add the `create_team` service function**

In `app/services/admin.py`, add the `team_repository` import near the other repository imports:

```python
from app.repositories.team_repository import team_repository
```

Then add the function (checkpoint 1 only — a new team has no prior owner):

```python
async def create_team(db: AsyncSession, *, actor: User, name: str, type_: str) -> Team:
    """Create a gov/ngo team (checkpoint 1 only — team.edit, super_admin in seed, ADR-054)."""
    await require_scope(actor, Perm.TEAM_EDIT, db)
    return await team_repository.create(db, obj_in={"name": name, "type": type_})
```

- [ ] **Step 5: Add the `POST /teams` endpoint**

In `app/api/v1/endpoints/admin.py`, extend the schema import and add the route. Update the existing schema import line to include the new names:

```python
from app.schemas.admin import (
    AdminUserListItem,
    AssignRoleRequest,
    AssignRoleResponse,
    CreateTeamRequest,
    TeamMemberRequest,
    TeamMemberResponse,
    TeamResponse,
)
```

Add the route (place it above the existing `POST /teams/{team_uuid}/members`):

```python
@router.post(
    "/teams",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
    summary="建立 team",
    responses={403: {"description": "Permission Denied"}},
)
async def create_team(
    body: CreateTeamRequest,
    db: AsyncSession = Depends(security.get_db),
    current_user: User = Depends(security.get_current_user),
):
    """Create a gov/ngo team (super_admin only, via team.edit)."""
    team = await admin_service.create_team(
        db, actor=current_user, name=body.name, type_=body.type
    )
    return TeamResponse(uuid=team.uuid, name=team.name, type=team.type, status=team.status)
```

- [ ] **Step 6: Grant `TEAM_EDIT` to super_admin in the production seed**

In `scripts/seed_rbac.py`, inside the `super_admin` role's permission list, add `Perm.TEAM_EDIT` next to the existing team perms:

```python
                Perm.TEAM_VIEW, Perm.TEAM_EDIT, Perm.TEAM_MEMBER_MANAGE,
```

- [ ] **Step 7: Run the create tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_admin_api.py -k create_team -v`
Expected: 3 passed.

- [ ] **Step 8: Append ADR-054 to `RBAC_V1_DECISIONS.md`**

Insert immediately after the ADR-053 block (before `## 附錄 A. Scope 語意表`):

```markdown
#### ADR-054 team 建立/編輯 = super_admin 專屬（`TEAM_EDIT=all`）
> **狀態:ACCEPTED（2026-07-10,Team Management）。**

**Context**:`TEAM_EDIT` 原本 seed 沒授予任何角色,導致沒人能建 team(而指派成員/zone 的前提是 team 存在)。

**Decision**:`super_admin` 加 `TEAM_EDIT: all`;其餘角色不給。team admin 只管成員(`TEAM_MEMBER_MANAGE`),不管 team 本身。維持 seed-driven,不做後台權限矩陣編輯(ADR-049 前提)。`POST /admin/teams` 用 `TEAM_EDIT`(checkpoint 1)把關。

---
```

- [ ] **Step 9: Lint and commit**

Run: `.venv/bin/ruff check app/schemas/admin.py app/services/admin.py app/api/v1/endpoints/admin.py scripts/seed_rbac.py tests/test_admin_api.py`
Expected: All checks passed.

```bash
git add app/schemas/admin.py app/services/admin.py app/api/v1/endpoints/admin.py scripts/seed_rbac.py RBAC_V1_DECISIONS.md tests/test_admin_api.py
git commit -m "feat(admin): POST /admin/teams to create a team, super_admin only (ADR-054)"
```

---

### Task 3: `GET /admin/teams` — scope-filtered list

**Files:**
- Modify: `app/repositories/team_repository.py` (add `list_active` to `TeamRepository`)
- Modify: `app/services/admin.py` (add `list_teams`)
- Modify: `app/api/v1/endpoints/admin.py` (add `GET /teams`)
- Test: `tests/test_admin_api.py`

**Interfaces:**
- Consumes: `scope_filter` (from `app.core.rbac_scopes`, generalized in Task 1), `TeamResponse` (Task 2), `security.has_permission` (returns the resolved `Scope`, 403 on NONE).
- Produces:
  - `TeamRepository.list_active(db, *, extra_filters=()) -> list[Team]`
  - `admin_service.list_teams(db, *, actor: User, scope: Scope) -> list[Team]`
  - `GET /api/v1/admin/teams` → `200` `list[TeamResponse]`

- [ ] **Step 1: Write the failing integration tests**

First, extend `_make_super_admin` in `tests/test_admin_api.py` so it can also list (add one line after the `TEAM_EDIT` grant from Task 2):

```python
    await _grant(db, role, perm_cache, Perm.TEAM_EDIT, "all")
    await _grant(db, role, perm_cache, Perm.TEAM_VIEW, "all")   # ← add this line
```

Add a helper (place it near the other `_make_*` helpers) and the `uuid4` import at the top of the file:

```python
from uuid import uuid4
```

```python
async def _make_team_admin(db, team_uuid: str) -> str:
    """Create a user in team_uuid holding team.view=team; return their uuid as a str."""
    from app.core.permissions import Perm

    role = Role(name=f"team-viewer-{uuid4().hex[:8]}", kind="team")
    db.add(role)
    await db.flush()
    perm_cache: dict = {}
    await _grant(db, role, perm_cache, Perm.TEAM_VIEW, "team")

    user = User(name="Team Admin", team_uuid=team_uuid)
    db.add(user)
    await db.flush()
    user_uuid = str(user.uuid)
    db.add(UserRoleAssign(user_uuid=user.uuid, role_uuid=role.uuid))
    await db.commit()
    return user_uuid
```

Then add the tests:

```python
@pytest.mark.asyncio
async def test_list_teams_super_admin_sees_all(client, db_session):
    """team.view=all returns every team."""
    admin_uuid = await _make_super_admin(db_session)
    await _make_team(db_session, name="Gov A", type_="gov")
    await _make_team(db_session, name="NGO B", type_="ngo")
    resp = await client.get("/api/v1/admin/teams", headers=_auth_header(admin_uuid))
    assert resp.status_code == 200, resp.json()
    names = {t["name"] for t in resp.json()}
    assert {"Gov A", "NGO B"} <= names


@pytest.mark.asyncio
async def test_list_teams_team_admin_sees_only_own(client, db_session):
    """team.view=team returns only the caller's own team (ADR-053 boundary)."""
    my_team = await _make_team(db_session, name="My Team", type_="ngo")
    await _make_team(db_session, name="Other Team", type_="gov")
    viewer_uuid = await _make_team_admin(db_session, my_team)
    resp = await client.get("/api/v1/admin/teams", headers=_auth_header(viewer_uuid))
    assert resp.status_code == 200, resp.json()
    names = {t["name"] for t in resp.json()}
    assert names == {"My Team"}


@pytest.mark.asyncio
async def test_list_teams_denied_without_team_view(client, db_session):
    """A caller without team.view is denied (403)."""
    plain_uuid = await _make_plain_user(db_session)
    resp = await client.get("/api/v1/admin/teams", headers=_auth_header(plain_uuid))
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_admin_api.py -k list_teams -v`
Expected: FAIL — `GET /api/v1/admin/teams` returns 404 (route not defined yet).

- [ ] **Step 3: Add `list_active` to `TeamRepository`**

In `app/repositories/team_repository.py`, add the method to `TeamRepository` (the `func, select` imports are already present):

```python
    async def list_active(self, db: AsyncSession, *, extra_filters=()) -> list[Team]:
        """List non-deleted teams, newest first, honoring RBAC scope_filter conditions."""
        query = (
            select(Team)
            .where(Team.delete_at.is_(None), *extra_filters)
            .order_by(Team.created_at.desc())
        )
        return (await db.execute(query)).scalars().all()
```

- [ ] **Step 4: Add the `list_teams` service function**

In `app/services/admin.py`, extend the rbac_scopes import (add `Scope`, `scope_filter`) near the top:

```python
from app.core.rbac_scopes import Scope, scope_filter
```

Then add the function:

```python
async def list_teams(db: AsyncSession, *, actor: User, scope: Scope) -> list[Team]:
    """List teams within the caller's team.view scope (all / own team / none, ADR-053)."""
    filters = scope_filter(scope, actor=actor, model=Team)
    return await team_repository.list_active(db, extra_filters=filters)
```

- [ ] **Step 5: Add the `GET /teams` endpoint**

In `app/api/v1/endpoints/admin.py`, add the `Scope` import:

```python
from app.core.rbac_scopes import Scope
```

Add the route (place it next to the `POST /teams` route from Task 2):

```python
@router.get(
    "/teams",
    response_model=list[TeamResponse],
    summary="列出 team",
    responses={403: {"description": "Permission Denied"}},
)
async def list_teams(
    scope: Scope = security.has_permission(Perm.TEAM_VIEW),
    current_user: User = Depends(security.get_current_user),
    db: AsyncSession = Depends(security.get_db),
):
    """List teams filtered by the caller's team.view scope (all / own team / none)."""
    teams = await admin_service.list_teams(db, actor=current_user, scope=scope)
    return [
        TeamResponse(uuid=t.uuid, name=t.name, type=t.type, status=t.status) for t in teams
    ]
```

- [ ] **Step 6: Run the list tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_admin_api.py -k list_teams -v`
Expected: 3 passed.

- [ ] **Step 7: Run the full admin + scope suites as a regression gate**

Run: `.venv/bin/python -m pytest tests/test_admin_api.py tests/test_rbac_scopes.py -q`
Expected: all passed (existing tests + the new ones).

- [ ] **Step 8: Lint and commit**

Run: `.venv/bin/ruff check app/repositories/team_repository.py app/services/admin.py app/api/v1/endpoints/admin.py tests/test_admin_api.py`
Expected: All checks passed.

```bash
git add app/repositories/team_repository.py app/services/admin.py app/api/v1/endpoints/admin.py tests/test_admin_api.py
git commit -m "feat(admin): GET /admin/teams scope-filtered list (all/own/none)"
```

---

## Notes for the implementer

- **`has_permission` returns the resolved `Scope`** and raises 403 when it is `Scope.NONE` — that is why `GET /teams` needs no manual permission check, just `scope: Scope = security.has_permission(Perm.TEAM_VIEW)`.
- **`create_team` relies on the service's `require_scope`** for the 403 (like `assign_role`); the endpoint adds no declarative dependency.
- **`Role.name` is unique** — `_make_team_admin` uses a random suffix to avoid collisions across tests.
- **Team `status` defaults to `"active"`** via the model column default; create does not set it explicitly.
