# Design: Team Management (minimal — create + list)

**Date**: 2026-07-10
**Feature**: 006-backend-administration（Team Management slice）
**Status**: Approved design, pending implementation plan
**Depends on**: RBAC v1（ADR-012~052）、既有 `/admin` REST 層

---

## 1. 概述

補上「建立 team」與「列出 team」兩支 REST 接口，關掉 RBAC 現有的功能斷點：目前可以「指派成員 / 指派 WorkZone 給 team」，但**沒有任何 API 能建立或列出 team**，而 `TEAM_EDIT` 在 seed 裡沒有授予任何角色。

### 目標
- `POST /admin/teams`：super_admin 建立一個 gov/ngo team。
- `GET /admin/teams`：依 `TEAM_VIEW` 的 scope 分層列出 team（`all` 全看 / `team` 只看自己那個 / 其餘 403）。
- 讓 list 的 scope 過濾走**通用機制**、endpoint 零特判（rule-driven，改 seed 就能調可見範圍）。

### 非目標（YAGNI，明確排除）
- 編輯 / 停用 / 刪除 team（`PATCH`/`DELETE`）。
- **從後台編輯權限矩陣**（role×permission×scope 開關）。維持 seed-driven（ADR-049 前提：一災一 DB、seed 部署時跑一次）。權限矩陣要改 = 改 `seed_rbac.py` 重跑，不是後台按鈕。
- team 名稱唯一性 / 去重。

---

## 2. API 契約

掛在既有 `admin` router（`/api/v1/admin`）下，與 `POST /admin/teams/{uuid}/members` 同一層。

| Method | Path | 能力（checkpoint） | 成功碼 |
|---|---|---|---|
| `POST` | `/admin/teams` | `TEAM_EDIT`（1 only） | `201` |
| `GET` | `/admin/teams` | `TEAM_VIEW`（scope 驅動） | `200` |

### Schemas（`app/schemas/admin.py` 新增）
```python
class CreateTeamRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["gov", "ngo"]        # 驅動 gov/ngo 語意；Pydantic 擋非法值

class TeamResponse(BaseModel):
    uuid: UUID
    name: str
    type: str
    status: str                        # 建立時採 model 預設 "active"
```

### OpenAPI（順手補「錯誤回應無文件」的洞，當全站樣板）
- `POST /admin/teams`：`status_code=201`、`summary="建立 team"`、`responses={403: {"description": "Permission Denied"}}`。
- `GET /admin/teams`：`summary="列出 team"`、`responses={403: {"description": "Permission Denied"}}`。
- 不回頭改既有 endpoint（另一個工項）。

---

## 3. 授權（RBAC）

- **建立**：service 內 `require_scope(actor, Perm.TEAM_EDIT, db)`（checkpoint 1 only——新 team 無前主）。只有 super_admin 持 `TEAM_EDIT`，故只有 super_admin 能建。
- **列出**：endpoint 注入 `scope = has_permission(Perm.TEAM_VIEW)`（回解析後的 `Scope`，`NONE` → 403），再套通用 `scope_filter`：
  - `all` → 不過濾（全看）
  - `team` → `Team.uuid == actor.team_uuid`（只看自己那個 team）
  - `none`/未持有 → 被 `has_permission` 擋成 403
- 之後要調誰看多少 = 改 seed 的 `TEAM_VIEW` scope，不動 code。

---

## 4. Scope 引擎泛化（核心設計，做法 1）

`Team` 沒有 `team_uuid` 欄位——它自己的 `uuid` 就是 team 邊界。通用 `scope_filter(TEAM, Team)` 現在會因 `hasattr(Team, "team_uuid") is False` 回 `false()`，導致 team admin 列不到自己 team。做法 1 把「邊界欄位」變成 model 可宣告：

**`app/models/team.py`**
```python
class Team(...):
    __team_scope_attr__ = "uuid"     # team 的邊界是自己的 uuid
```

**`app/core/rbac_scopes.py` — `scope_filter` 的 TEAM 分支**
```python
if scope == Scope.TEAM:
    if not actor.team_uuid:
        return [false()]
    attr = getattr(model, "__team_scope_attr__", "team_uuid")   # 預設維持 team_uuid
    if not hasattr(model, attr):
        return [false()]
    return [getattr(model, attr) == actor.team_uuid]
```

- 其他 model 未宣告 `__team_scope_attr__` → 預設 `team_uuid`，**行為完全不變**。
- 範圍界定：只泛化 list 走的 `scope_filter`。`in_scope`（checkpoint 2 單筆）與 `add_team_member` 的既有 `SimpleNamespace(team_uuid=team.uuid)` adaptor **不動**——那條路沒有用到裸 `Team`。

---

## 5. Service / Repository

**`app/services/admin.py`（沿用 flat-service 慣例，與 `assign_role`/`add_team_member` 一致）**
```python
async def create_team(db, *, actor, name, type_) -> Team:
    await require_scope(actor, Perm.TEAM_EDIT, db)          # checkpoint 1 only
    return await team_repository.create(db, obj_in={"name": name, "type": type_})

async def list_teams(db, *, actor, scope) -> list[Team]:
    filters = scope_filter(scope, actor=actor, model=Team)
    return await team_repository.list_active(db, extra_filters=filters)
```

**`app/repositories/team_repository.py` — `TeamRepository` 加 `list_active`**
```python
async def list_active(self, db, *, extra_filters=()) -> list[Team]:
    query = (
        select(Team)
        .where(Team.delete_at.is_(None), *extra_filters)
        .order_by(Team.created_at.desc())
    )
    return (await db.execute(query)).scalars().all()
```

**Endpoint 接線（`app/api/v1/endpoints/admin.py`，thin）**
- `create_team`：呼叫 `admin_service.create_team`（service 自己 require_scope，endpoint 不加宣告式 dependency，與 `assign_role` 一致）。
- `list_teams`：注入 `scope = security.has_permission(Perm.TEAM_VIEW)` + `current_user`，交給 `admin_service.list_teams`。

---

## 6. Seed 改動（`scripts/seed_rbac.py`）

- `super_admin` 角色新增 `Perm.TEAM_EDIT: "all"`。
- 其餘角色不給 `TEAM_EDIT` → 只有 super_admin 能建 team。
- 備註：`data_auditor` 目前無 `TEAM_VIEW`，故列不到 team；若要讓稽核看得到，是加 seed grant 的 rule 決定，不是 code。
- 測試 seed（`tests/test_admin_api.py` 若自建 super_admin 角色）需同步授予 `TEAM_EDIT`。

---

## 7. ADR（兩條，各自一個決策，寫入 `RBAC_V1_DECISIONS.md`）

- **ADR-053**：team 建立/編輯 = super_admin 專屬（`TEAM_EDIT=all`）；team admin 只管成員（`TEAM_MEMBER_MANAGE`），不管 team 本身。維持 seed-driven，未做後台權限編輯（ADR-049 前提）。
- **ADR-054**：team-scope 資源可宣告自己的邊界欄位（`__team_scope_attr__`）；`Team` 用 `uuid`，`scope_filter` 讀它、預設 `team_uuid`。範圍限 list/filter 路徑；`in_scope` 維持既有 adaptor。

---

## 8. 測試計畫

**整合（`tests/test_admin_api.py`）**
- super_admin `POST /admin/teams`（gov）→ 201，回傳含 uuid/name/type/status="active"。
- 非 super_admin（login user / 無 `TEAM_EDIT`）`POST` → 403。
- `POST` type 非 gov/ngo → 422（Pydantic）。
- super_admin `GET /admin/teams` → 看到所有 team。
- team admin（`TEAM_VIEW=team`）`GET` → 只看到自己那個 team。
- 無 `TEAM_VIEW` 者 `GET` → 403。

**單元（`tests/test_rbac_scopes.py`）**
- `scope_filter(Scope.TEAM, actor, Team)` 產出 `Team.uuid == actor.team_uuid`（泛化驗證）。
- 未宣告 `__team_scope_attr__` 的 model（如 `Tickets`）在 `Scope.TEAM` 下仍用 `team_uuid`（迴歸，確認無副作用）。

**Seed**
- seed 後 `super_admin` 持有 `TEAM_EDIT`。

---

## 9. 動到的檔

| 檔 | 動作 |
|---|---|
| `app/models/team.py` | 加 `__team_scope_attr__ = "uuid"` |
| `app/core/rbac_scopes.py` | `scope_filter` TEAM 分支讀宣告欄位 |
| `app/repositories/team_repository.py` | 加 `list_active` |
| `app/schemas/admin.py` | 加 `CreateTeamRequest` / `TeamResponse` |
| `app/services/admin.py` | 加 `create_team` / `list_teams` |
| `app/api/v1/endpoints/admin.py` | 加 `POST /teams`、`GET /teams`（含 `responses=`） |
| `scripts/seed_rbac.py` | super_admin 加 `TEAM_EDIT: all` |
| `RBAC_V1_DECISIONS.md` | ADR-053、ADR-054 |
| `tests/test_admin_api.py` | 新增整合測試 |
| `tests/test_rbac_scopes.py` | 新增泛化單元測試 |

---

## 10. 已知取捨 / 風險

- team 名稱不唯一（沿用現有 model）——v1 允許同名。
- 未做 audit trigger 特別處理；`teams` 的 create 走既有稽核機制（若有）。
- `has_permission` 對 `TEAM_VIEW=none` 回 403（不是空清單）——與其他 admin read 一致。
- scope 泛化只覆蓋 `scope_filter`；若未來需要對裸 `Team` 做 `in_scope`（checkpoint 2），需另行讓 `in_scope` 也讀 `__team_scope_attr__`（ADR-054 已標記為後續可擴充點）。
