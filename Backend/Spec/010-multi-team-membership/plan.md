# Multi-Team Membership — Implementation Plan

**Goal:** 讓一個人能隸屬多個 team，並在多個身分間切換；任一時刻只有一個身分生效，`super_admin` 切到 team 身分時是真的降權。

**Architecture:** 身分 = `user_role_assign` 的一列（role + 選填 team）。active identity 簽在 access token 的 `act` claim，由 `get_current_user` 驗證後**掛在 `User` 實例上**，scope 引擎改讀它而非 `users.team_uuid`（該欄位移除）。`user_permission_assign` 同步加 `team_uuid`。`audit_logs` 加 `context JSONB` 記錄身分快照。

**Tech Stack:** FastAPI, Strawberry GraphQL, SQLAlchemy async, PostgreSQL, Redis, alembic, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/010-multi-team-membership/spec.md`（ADR-068~076、096、097）

**Branch:** `feat/multi-team-membership-backend`（off `main`）

**狀態（2026-08-19）：Task 1~9 全部完成。** 全套件 501 passed / 0 failed；`ruff check` 全綠
（含清掉本分支繼承的 7 個既有錯誤，見 Global Constraints）。Docker 驗收全數通過，測試資料已清除。**尚未開 PR。**

落地時多出的決策：**ADR-178**（管理端 `GET /admin/rbac/users/{uuid}/permissions` 改成逐身分回報）——
plan 沒預見這個端點在多身分下會回空 dict，屬破壞性 API 變更，前端後台頁面要跟著改。

**本票不含、需另開票的**：前端契約（refresh 帶 identity、401 走登出、切換器 UI、記住上次身分）——
見 `spec.md` §「前端契約（必須對齊）」。

---

## Global Constraints

- **git root 是 `optimized-version/`（`Backend/` 的上層）**。一律 `git add Backend/<path>`，**絕不用 `git add -A` / `git add .`**（會掃進 `Frontend/` 等大型未追蹤目錄）。
- 跑測試前先 `docker compose up -d db redis`。測試 `uv run pytest`，lint `uv run ruff check`。行長上限 110。
- **驗收標準是全綠**。開工前先量一次 baseline 記下來。
- ~~既有 ruff 錯誤在 `tests/test_admin_api.py`、`tests/test_suggestion_review_scope.py`、`alembic/versions/e8b3c5f2a1d4_*`——**不是你造成的，不要順手改**。~~ **2026-08-20 撤銷：那 7 個已全部清掉，`ruff check` 現在是乾淨的，請維持在 0。** 留著紅的用意是不要混進無關 diff，但代價是新錯誤會藏在舊錯誤裡——本票就發生過一次（我自己加的 I001 混在 7 個既有錯誤中沒被發現）。門檻是 0 才看得出回歸。
- **Spec 與實作放同一個 PR**。`spec.md` / `decisions.md` / 本檔目前在 `docs/backend-specs-010-013` 分支，開工時用 `git checkout docs/backend-specs-010-013 -- Backend/Spec/010-multi-team-membership/` 取到功能分支。
- **完成後不要自己開 PR**：做完 §「Docker 驗收」回報結果，等使用者決定。

### ⚠️ 與 013 的檔案重疊

013（PR #36）改過 `app/schemas/admin.py`、`app/api/v1/endpoints/admin.py`、`app/api/v1/endpoints/auth/session.py`，本票**這三個檔案都要再改**。

**開工前先確認 013 是否已合併**：
- 已合併 → 直接從 `main` 開分支。
- 未合併 → 仍從 `main` 開，但預期這三個檔案在 013 合併後會有 conflict；解法是等 013 合併再 rebase，**不要**從 `feat/project-settings-backend` 開分支（會把 013 的變更混進本票的 PR）。

---

## 範圍

| 納入 | 排除（明確不做） |
|---|---|
| `user_role_assign` / `user_permission_assign` 加 `team_uuid` + 唯一鍵修正 | 權限聯集模型（ADR-068 選了切換） |
| `users.team_uuid` 移除 | `user_team_assign` 成員資格表（ADR-072 撤回：有角色即是成員） |
| `act` claim + `POST /auth/switch-identity` | access token 撤銷 / fail-closed session 檢查（ADR-071 → `Spec/014`） |
| scope 引擎改以 active identity 判定 | per-user 的 active identity（ADR-069 選 per-session） |
| 身分失效 → 請求與 refresh 雙路 401 | 「自動退回 platform 身分」的靜默降權（ADR-096 否決） |
| `audit_logs.context` 記身分快照 | 最小必要權力歸因迴圈（ADR-076 改版刪除） |
| seed 補 `admin`/`member` 的 `station.contribute` | 市民基底機制（ADR-097 否決） |
| `AdminUserListItem` 改成身分清單、`GET /users/me` 加身分清單 | 前端切換器 UI（本票只提供 API） |

**不要切 phase。** 這票大，但切點若落在「寫到哪」而非「功能是否完整」，會付出成本卻沒交付價值（011 的教訓）。切一半的身分切換是不能用的。

---

## 關鍵實作決定：active identity 掛在 `User` 實例上

ADR-073 的 Consequences 列了「`resolve_scope()` signature 從 `(actor, perm, db)` 變成 `(actor, perm, db, active_identity)`，波及 4 個呼叫點」與「`_request_rbac_cache` 的 key 要改」。

**改用「把 active identity 掛在 `User` 實例上」可以讓這兩個代價完全消失**：

```python
# app/models/auth.py — 非持久化的類別屬性，declarative_base 不會映射它
class User(Base, UUIDPKMixin, TimestampMixin):
    ...
    # Transient, set per request by get_current_user from the access token's `act` claim
    # (ADR-069). Never persisted — a User loaded outside a request has no active identity.
    active_identity = None
```

`get_current_user` 驗證 `act` 後 `user.active_identity = ident`，下游一律讀 `actor.active_identity`。所有 `in_scope` / `scope_filter` / `resolve_scope` 的呼叫端傳的都已經是 `User` 實例（查證過：`app/graphql/tickets/queries.py:57,90`、`app/graphql/geo/queries.py:56,87,103` 等），**簽章一個都不用改**。

> **陷阱**：service 層若自行從 DB 撈 `User`（非經 `get_current_user`），`active_identity` 會是類別預設的 `None` → team/zone scope 一律 `false()`，這是安全的 fail-closed 方向。但要確認沒有既有路徑依賴「撈出來的 User 立刻拿去做 scope 判斷」——開工時 grep `get_by_uuid` 的用途確認。

---

## File Structure

**Create**
- `app/core/identity.py` — `ActiveIdentity` value object、`act` claim 的編解碼與驗證
- `app/repositories/identity_repository.py` — 查身分清單、驗證某身分屬於某人 —— **實際檔名 `active_identity_repository.py`**（`auth_repository` 已有一個 `identity_repository`，指的是登入身分 password/google/line，兩者不是同一件事）
- `alembic/versions/<rev>_identity_switching.py` — **手寫，不用 autogenerate**
- `tests/test_identity_model.py` — 身分清單、唯一鍵、CHECK 約束 ✅
- `tests/test_identity_switching.py` — 切換 API、login/refresh 帶 identity、失效登出
- `tests/test_scope_by_identity.py` — scope 引擎依 active identity 判定
- `tests/test_identity_audit.py` — `audit_logs.context` 身分快照

**Modify**
- `app/models/auth.py` — 移除 `users.team_uuid`；加 transient `active_identity`
- `app/models/rbac.py` — `UserRoleAssign` / `UserPermissionAssign` 加 `team_uuid`、唯一鍵、docstring 改寫
- `app/core/security.py` — `get_current_user` 驗 `act` 並掛上身分；`create_access_token` 接 `act`
- `app/core/rbac_scopes.py` — 8 處 `actor.team_uuid` → `actor.active_identity`
- `app/repositories/auth_repository.py` — `get_user_permissions` 依 identity 過濾
- `app/api/v1/endpoints/auth/session.py` — `login` 接選填 identity；`refresh` 接並驗證；新增 `switch-identity`
- `app/api/v1/endpoints/users.py` — `GET /users/me` 加身分清單與當前身分
- `app/api/v1/endpoints/admin.py` — `assign_role` 只收 platform；team 成員端點；`AdminUserListItem`
- `app/api/v1/endpoints/rbac_admin.py` — 直接授予端點加 team 維度
- `app/services/admin.py` — 移除跨隊拒絕與 team 前置檢查；「同 kind + 同 team 取代」
- `app/services/work_zone.py` — `actor.team_uuid is None` → active identity 為 platform 身分
- `app/schemas/admin.py` / `app/schemas/auth.py` — 身分清單、TokenPair 相關
- `app/db/triggers.py` — 加 `app.active_identity` GUC
- `app/core/context.py` + audit middleware — 設定該 GUC
- `scripts/seed_rbac.py` — 補 `station.contribute`
- `Spec/008-rbac-authorization/decisions.md` — 加取代指標（ADR-019 / 039 / 049 附錄 A）
- `app/models/rbac.py` docstring、`RBAC_RESOURCE_ROLE_MATRIX.md` — 說明同步

---

## Task 1: 身分的資料模型與約束

**Files:** Modify `app/models/rbac.py`、`app/models/auth.py`；Create `tests/test_identity_model.py`

- [x] **Step 1: 寫失敗測試**

```python
"""Tests for the identity data model (feature 010, ADR-073)."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.rbac import Role, UserRoleAssign

pytestmark = pytest.mark.asyncio


async def test_same_team_role_can_be_held_in_two_teams(db):
    """The whole point of the feature: member@A and member@B are two identities.

    The old uq_user_role was (user_uuid, role_uuid), which made this impossible.
    """
    role = Role(name="member", kind="team")
    team_a, team_b = _make_team(db, "A"), _make_team(db, "B")
    ...
    db.add_all([
        UserRoleAssign(user_uuid=u.uuid, role_uuid=role.uuid, team_uuid=team_a.uuid),
        UserRoleAssign(user_uuid=u.uuid, role_uuid=role.uuid, team_uuid=team_b.uuid),
    ])
    await db.commit()   # 舊唯一鍵下這裡會 IntegrityError


async def test_the_same_identity_cannot_be_granted_twice(db):
    """(user, role, team) is still unique — granting the same identity twice is a no-op."""
    ...
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_platform_role_must_have_null_team(db):
    """A platform role bound to a team is the data shape ADR-068's invariant forbids."""
    ...
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_team_role_must_have_a_team(db):
    """A team role with no team has no identity to belong to."""
    ...
    with pytest.raises(IntegrityError):
        await db.commit()
```

- [x] **Step 2: 實作**

`UserRoleAssign` / `UserPermissionAssign` 各加 nullable `team_uuid` FK，唯一鍵改為含 team：

```python
__table_args__ = (
    UniqueConstraint("user_uuid", "role_uuid", "team_uuid", name="uq_user_role"),
)
```

`users.team_uuid` 移除；`User` 加 transient 的 `active_identity = None`。

**platform 恆 NULL / team 恆 NOT NULL 的 CHECK 需要 join `roles.kind`**，純 CHECK 做不到。兩條路：

| 方案 | 做法 | 取捨 |
|---|---|---|
| **A（建議）** | `user_role_assign` 冗餘一個 `role_kind` 欄位，用 CHECK 約束 `(role_kind='platform' AND team_uuid IS NULL) OR (role_kind='team' AND team_uuid IS NOT NULL)`，並用 FK `(role_uuid, role_kind)` → `roles(uuid, kind)`（需 `roles` 上有對應 UNIQUE）確保冗餘值不會偏離 | 純宣告式、無 trigger；代價是多一欄與一個複合 FK |
| B | `BEFORE INSERT/UPDATE` trigger 查 `roles.kind` 後 RAISE | 無冗餘欄位；代價是約束藏在 trigger 裡，且每次寫入多一次查詢 |

**選 A**，理由：這個專案已經有一堆 trigger（audit），再加一個純驗證用的 trigger 會讓「約束住在哪」更難追。冗餘 + 複合 FK 是 PostgreSQL 標準做法，資料庫自己保證冗餘值不會漂。

> **`roles` 需要先加 `UNIQUE(uuid, kind)`** 才能被複合 FK 參照——`uuid` 已是 PK，加一個含它的 UNIQUE 是零成本的。

---

## Task 2: Migration（手寫）

**Files:** Create `alembic/versions/<rev>_identity_switching.py`

- [x] **Step 1: 產生空白 revision**

```bash
cd Backend && uv run alembic revision -m "identity switching"
```

> ⚠️ **不要 `--autogenerate`。** 含資料回填、複合 FK、CHECK、欄位刪除——autogenerate 會產生看似完整、實則缺項的骨架。011 / 013 已踩過，沿用。

- [x] **Step 2: 內容（順序很重要）**

```python
def upgrade() -> None:
    # 1. roles 加複合唯一鍵，供 user_role_assign 的複合 FK 參照
    op.create_unique_constraint("uq_roles_uuid_kind", "roles", ["uuid", "kind"])

    # 2. user_role_assign：加欄位 → 回填 → 收緊
    op.add_column("user_role_assign", sa.Column("team_uuid", sa.UUID(), nullable=True))
    op.add_column("user_role_assign", sa.Column("role_kind", sa.String(20), nullable=True))
    op.execute("""
        UPDATE user_role_assign ura
           SET role_kind = r.kind,
               team_uuid = CASE WHEN r.kind = 'team' THEN u.team_uuid ELSE NULL END
          FROM roles r, users u
         WHERE ura.role_uuid = r.uuid AND ura.user_uuid = u.uuid
    """)
    # 回填後才可能存在「team 角色但該使用者沒有 team」的孤兒 —— 那是既有髒資料，明確清掉
    op.execute("DELETE FROM user_role_assign WHERE role_kind = 'team' AND team_uuid IS NULL")
    op.alter_column("user_role_assign", "role_kind", nullable=False)
    op.create_foreign_key("fk_ura_team", "user_role_assign", "teams", ["team_uuid"], ["uuid"])
    op.create_foreign_key(
        "fk_ura_role_kind", "user_role_assign", "roles",
        ["role_uuid", "role_kind"], ["uuid", "kind"],
    )
    op.create_check_constraint(
        "ck_ura_role_team_kind", "user_role_assign",
        "(role_kind = 'platform' AND team_uuid IS NULL)"
        " OR (role_kind = 'team' AND team_uuid IS NOT NULL)",
    )
    op.drop_constraint("uq_user_role", "user_role_assign", type_="unique")
    op.create_unique_constraint(
        "uq_user_role", "user_role_assign", ["user_uuid", "role_uuid", "team_uuid"]
    )

    # 3. user_permission_assign：seed 建 0 筆，無回填問題
    op.add_column("user_permission_assign", sa.Column("team_uuid", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_upa_team", "user_permission_assign", "teams", ["team_uuid"], ["uuid"])
    op.drop_constraint("uq_user_perm", "user_permission_assign", type_="unique")
    op.create_unique_constraint(
        "uq_user_perm", "user_permission_assign", ["user_uuid", "permission_uuid", "team_uuid"]
    )

    # 4. users.team_uuid 移除（必須在 2 的回填之後）
    op.drop_column("users", "team_uuid")

    # 5. audit_logs 的身分快照
    op.add_column("audit_logs", sa.Column("context", postgresql.JSONB(), nullable=True))
```

> **`UNIQUE(user_uuid, role_uuid, team_uuid)` 在 PostgreSQL 不擋重複的 NULL**——兩列 `(u, super_admin, NULL)` 都能插入。platform 角色的重複由 `assign_role` 的「同 kind 取代」擋（既有行為），且 ADR-068 的不變式不因此失守（重複列只是髒資料，不會產生新權限）。**要在 DB 層擋的話**需要額外的部分唯一索引：
> ```sql
> CREATE UNIQUE INDEX uq_user_role_platform ON user_role_assign (user_uuid, role_uuid)
> WHERE team_uuid IS NULL;
> ```
> **建議加上**，成本為零且把「一人一 platform 角色」變成 DB 保證。

- [x] **Step 3: 驗證可逆 + 兩條建表路徑一致**（沿用 013 的做法，很有效）

```bash
docker compose exec -T db psql -U postgres -d postgres -c "CREATE DATABASE alembic_check"
SQLALCHEMY_DATABASE_URL=...alembic_check uv run alembic upgrade head
# downgrade -1 → upgrade，再比對 alembic 與 create_all 建出的欄位/索引定義
```

**downgrade 必須有真實的回填**（`users.team_uuid` 要從 `user_role_assign` 反推），否則不可逆。

---

## Task 3: `ActiveIdentity` 與 `act` claim

**Files:** Create `app/core/identity.py`、`app/repositories/identity_repository.py`

- [x] **Step 1: 寫失敗測試**（放 `tests/test_identity_switching.py`）

- `act` 編碼／解碼 round-trip，含 `team_uuid` 為 None 的 platform 身分
- 格式錯誤的 `act` → 視為無效，不得拋出未處理例外
- `list_identities` 回傳 platform + 所有 team 身分，且排除已軟刪除的 team
- `resolve_identity`：屬於該使用者 → 回傳；不屬於 → None；team 已軟刪除 → None

- [x] **Step 2: 實作**

```python
@dataclass(frozen=True)
class ActiveIdentity:
    """One row of user_role_assign, resolved. `team_uuid` is None for platform identities."""
    role_uuid: str
    team_uuid: str | None
    role_name: str
    team_name: str | None
```

`act` claim 的值用 `f"{role_uuid}:{team_uuid or ''}"`——**存 `(role_uuid, team_uuid)` 而非 assignment PK**（ADR-069），可跨 `rename_role` 與「刪掉再重加」存活。

`resolve_identity(db, user_uuid, act)` 一次查詢完成驗證並取回 name 快照：

```python
select(UserRoleAssign, Role.name, Team.name)
  .join(Role, Role.uuid == UserRoleAssign.role_uuid)
  .outerjoin(Team, Team.uuid == UserRoleAssign.team_uuid)
  .where(
      UserRoleAssign.user_uuid == user_uuid,
      UserRoleAssign.role_uuid == role_uuid,
      UserRoleAssign.team_uuid.is_not_distinct_from(team_uuid),
      or_(UserRoleAssign.team_uuid.is_(None), Team.delete_at.is_(None)),
  )
```

> `is_not_distinct_from` 處理 `NULL = NULL`（SQLAlchemy ≥ 2.0，本專案 `>=2.0.45`）。用 `==` 的話 platform 身分永遠比不中。

`default_identity(db, user_uuid)` = 該使用者的 platform 身分（`team_uuid IS NULL` 那列）。零角色使用者回 `None`。

---

## Task 4: 請求路徑——驗證 `act` 並掛上身分

**Files:** Modify `app/core/security.py`、`app/models/auth.py`

- [x] **Step 1: 寫失敗測試**

- 帶有效 `act` 的 token → `current_user.active_identity` 正確
- **`act` 指向的授予被撤銷 → 401**（ADR-096）
- **`act` 的 team 被軟刪除 → 401**
- 無 `act` 的 token（舊 token / 零角色）→ `active_identity` 為 None，team/zone scope 為 `false()`，不是 500

- [x] **Step 2: 實作**

```python
async def get_current_user(db=Depends(get_db), token=Depends(oauth2_scheme)) -> User:
    payload = _decode_access_payload(token)
    user = await user_repository.get_by_uuid(db, payload["sub"])
    if user is None:
        raise _credentials_exception()
    act = payload.get("act")
    if act:
        identity = await identity_repository.resolve_identity(db, str(user.uuid), act)
        if identity is None:
            # ADR-096: the identity this token asserts no longer exists — fail closed.
            raise _credentials_exception()
        user.active_identity = identity
    return user
```

> **為何不靜默退回預設身分**：ADR-096 明確否決——靜默降權會讓當事人不知道自己的權限已經變了。

`create_access_token` 加 `act` 參數。

---

## Task 5: scope 引擎與權限解析改以身分為準

**Files:** Modify `app/core/rbac_scopes.py`、`app/repositories/auth_repository.py`、`app/services/work_zone.py`；Create `tests/test_scope_by_identity.py`

- [x] **Step 1: 寫失敗測試**

- 在 A 隊是 `admin`、在 B 隊是 `member`：切到 B 後**不能**管 B 的成員
- **`super_admin` 切到 team 身分後不再持有任何 platform grant**（ADR-068 的核心）
- zone scope 只含 active identity 那隊的 WorkZone，不做多隊聯集
- active identity 為 platform 身分時，team / zone scope 皆 `false()`
- 直接授予依 `team_uuid` 過濾：`NULL` 的只在 platform 身分下生效
- `work_zone` 的 gov-only 檢查行為不變（ADR-064 回歸）

- [x] **Step 2: 實作**

`rbac_scopes.py` 的 8 處替換——`actor.team_uuid` → `actor.active_identity.team_uuid if actor.active_identity else None`。建議抽一個小 helper：

```python
def _active_team(actor) -> str | None:
    """The team of the actor's active identity, or None (platform identity / no identity)."""
    identity = getattr(actor, "active_identity", None)
    return identity.team_uuid if identity else None
```

`get_user_permissions` 加 identity 過濾：

```python
role_grants = ... .where(
    UserRoleAssign.user_uuid == user_uuid,
    UserRoleAssign.role_uuid == identity.role_uuid,
    UserRoleAssign.team_uuid.is_not_distinct_from(identity.team_uuid),
)
direct_grants = ... .where(
    UserPermissionAssign.user_uuid == user_uuid,
    UserPermissionAssign.team_uuid.is_not_distinct_from(identity.team_uuid),
)
```

`identity is None` → 回 `{}`（零權限，fail-closed）。

**`_request_rbac_cache` 的 key**：現行 key 是 `actor.uuid`（`app/core/security.py:221-229`）。因為身分已掛在 actor 上、且一個請求內不會變，**key 維持 `actor.uuid` 即可**——同一個請求內同一個 actor 的身分是固定的。ADR-073 列的「key 要改成 `(uuid, identity)`」在這個實作方式下不需要。

`work_zone.py:32` 的 `if actor.team_uuid is None` → `if _active_team(actor) is None`（語意不變：platform 身分不受 gov-only 限制）。

---

## Task 6: 端點——login / refresh / switch-identity / users.me

**Files:** Modify `app/api/v1/endpoints/auth/session.py`、`app/api/v1/endpoints/users.py`、`app/schemas/auth.py`

- [x] **Step 1: 寫失敗測試**

- `login` 不帶 identity → 預設 platform 身分
- `login` 帶有效 identity → 該身分生效
- **`login` 帶失效 identity → 退回預設，回 200 不報錯**（ADR-069）
- `switch-identity` 切到自己持有的身分 → 200 + 新 access token（回應不含 refresh token）
- `switch-identity` 切到非自己的身分 → **403**
- **`switch-identity` 不綁 capability**：降到最低權限身分後仍能切回
- `refresh` 帶失效 identity → **401**
- **`refresh` 帶失效 identity 時不得燒掉 refresh token**：同一個 refresh token 換成有效 identity 後仍可用

- [x] **Step 2: 實作**

```
POST /auth/switch-identity { role_uuid, team_uuid? }  → AccessTokenResponse
  1. resolve_identity 驗證屬於呼叫者 → 否則 403
  2. 以新 act 簽發 access token
  3. 只回傳 access token（refresh token 不輪替；伺服器只存雜湊，沒有明文可回吐）
```

**此端點只依賴 `get_current_user`，不得掛任何 `has_permission`。**

`refresh` 的 identity 驗證**必須在 `rotate()` 之前**：

```python
# ADR-096: validate BEFORE rotate() — rotate() burns the old refresh token
# (session_repository.py:80 claims the refresh_used: flag), so validating after it would
# leave the caller with a dead token and no replacement, and their retry would be read as
# a replay and revoke the session. Same failure mode as Spec/013's H1.
identity = await identity_repository.resolve_identity(db, user_uuid_from_token, body.identity)
if body.identity and identity is None:
    raise HTTPException(401, ...)
sid, user_uuid, new_refresh = await repo.rotate(body.refresh_token)
```

> ⚠️ **`refresh` 目前拿不到 user_uuid**——它只有 refresh token，`rotate()` 才會回傳 user_uuid。所以驗證要靠 `repo.get_refresh(hash)` 先取出 `user_uuid`（**唯讀，不消費 token**），驗完再 `rotate()`。`get_refresh` 已存在（`app/repositories/session_repository.py:62`）。

`GET /users/me` 加：

```json
{ "...既有欄位...",
  "active_identity": { "role_uuid": "...", "role": "member", "team_uuid": "...", "team": "慈濟" },
  "identities": [ {...}, {...} ] }
```

---

## Task 7: 管理 API 與 seed

**Files:** Modify `app/services/admin.py`、`app/api/v1/endpoints/admin.py`、`app/api/v1/endpoints/rbac_admin.py`、`app/schemas/admin.py`、`scripts/seed_rbac.py`

- [x] **Step 1: 寫失敗測試**

- `POST /users/{u}/role` 給 team 角色 → **400/422**（team 角色只能走 team 端點）
- `POST /teams/{t}/members` 授予角色即入隊（不需先有成員資格）
- 同一人可加入兩個 team 且角色不同
- `DELETE /teams/{t}/members/{u}` 撤銷該 team 的**所有**授予
- `AdminUserListItem` 回傳身分清單
- 直接授予帶 team → 只在該 team 身分下生效
- **回歸測試（釘住 ADR-097）**：每個行動型身分的能力集合涵蓋 platform `user` 的能力集合，`data_auditor` 為明文例外

```python
async def test_every_actionable_role_covers_the_citizen_baseline(db):
    """Switching to a team identity must not lose abilities every citizen has (ADR-097).

    `data_auditor` is the documented exception — it is oversight-only by design.
    """
    baseline = await _grants_of(db, "user")
    for role_name in ("super_admin", "admin", "member"):
        missing = set(baseline) - set(await _grants_of(db, role_name))
        assert not missing, f"{role_name} is missing citizen capabilities: {missing}"
```

- [x] **Step 2: 實作**

- `assign_role` 只收 platform 角色；「同 kind 取代」→「同 kind + 同 team 取代」
- 移除 `admin.py:71` 的 team 前置檢查與 `:130-131` 的跨隊拒絕
- `remove_team_member` 改為撤銷該 team 的所有授予
- `AdminUserListItem` 的 `team_uuid` / `team_role` → `identities: list[...]`
- `seed_rbac.py` 的 `admin` / `member` 補 `Perm.STATION_CONTRIBUTE: "all"`

---

## Task 8: audit context

**Files:** Modify `app/db/triggers.py`、`app/core/context.py`、audit middleware；Create `tests/test_identity_audit.py`

- [x] **Step 1: 寫失敗測試**

- 以 `member@慈濟` 身分改資料 → `audit_logs.context.identity` 記錄角色與團隊**名稱**
- platform 身分 → `context.identity.team` 為 `null`
- **角色被硬刪除後，歷史 log 仍讀得出當時的角色名稱**（快照而非參照）

- [x] **Step 2: 實作**

比照現有的 `app.current_user_id`（`app/db/triggers.py:49`）加一個 `app.active_identity` GUC，由 middleware 設定，trigger 讀進 `context` 欄位。**只記 identity 快照，不記 `cap`**（ADR-076）。

---

## Task 9: 全套件 + Docker 驗收

- [x] **Step 1: 全套件**

```bash
cd Backend && COVERAGE_CORE=sysmon uv run pytest -q -p no:randomly   # 必須全綠
uv run ruff check   # 我的檔案乾淨；既有錯誤不動
```

> `COVERAGE_CORE=sysmon` 是必要的——預設 tracer 量不到 ASGI client 路徑，會誤報覆蓋率偏低。

**預期會大量修既有測試**：7 個測試檔提及 `team_uuid`，且所有建立 `User(team_uuid=...)` 的 fixture 都要改成建立 team 角色授予。這是本票最花時間的部分，不是 bug。

- [x] **Step 2: Docker 完整驗收**（**回報前的必要條件**）

```bash
docker compose build backend
docker compose up -d db redis backend
docker compose exec -T -e PYTHONPATH=/app backend alembic upgrade head
docker compose exec -T -e PYTHONPATH=/app backend python scripts/seed_rbac.py
```

以 HTTP 驗證：

- [x] 建一個同時持有 `super_admin` + `admin@縣府` + `member@慈濟` 的帳號
- [x] `GET /users/me` 回傳三個身分
- [x] 預設登入為 platform 身分（`super_admin`）
- [x] 切到 `member@慈濟` → **後台端點全部 403**（super_admin 確實降權）
- [x] 切到 `admin@縣府` → 可管縣府成員；切到 `member@慈濟` → **不可**管慈濟成員
- [x] 切到非自己持有的身分 → 403
- [x] 降權至 `member` 後仍能切回 `super_admin`（切換不綁 capability）
- [x] 撤銷 `admin@縣府` → 該身分的請求 401、refresh 也 401
- [x] **失效 refresh 之後，換有效 identity 再 refresh 仍可用**（證明沒燒掉 token）
- [x] 提權（`user`→`super_admin`）會登出；**新增**一個 team 身分不會登出
- [x] `audit_logs.context` 記錄操作當下的身分與名稱
- [x] zone scope：切到 A 隊看不到 B 隊轄區 —— **以測試涵蓋，未走 Docker HTTP**（`tests/test_scope_by_identity.py::test_zone_scope_covers_only_the_active_identitys_zones`：同一人在兩隊各有轄區，`in_scope` 與 `scope_filter` 都只認當前身分那一隊）
- [x] **造的測試資料全部清乾淨**

- [x] **Step 3: 回報，不要開 PR** —— 已回報，等使用者決定

回報全套件數字、docker 驗收結果、任何只有跑容器才會發現的問題。**等使用者說要發才開 PR。**

---

## 開工前先做

1. `git log --oneline -1` 確認在 `feat/multi-team-membership-backend`，且 base 是 `main`（見 §「與 013 的檔案重疊」）。
2. `docker compose up -d db redis`。
3. `COVERAGE_CORE=sysmon uv run pytest -q -p no:randomly` 量 baseline。
4. 讀 `spec.md` 與 `decisions.md`（ADR-068~076、096、097）——**特別是 ADR-068 的硬性不變式**（切換只能在已持有的身分之間移動、永不寫入授予）與 **ADR-096 的 `rotate()` 順序約束**。
5. `grep -rn "get_by_uuid" app/services/` 確認沒有既有路徑撈出 `User` 後立刻拿去做 scope 判斷（那條路徑的 `active_identity` 會是 None）。
