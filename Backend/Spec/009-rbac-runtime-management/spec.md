# Design: RBAC Runtime Management（權限矩陣後台 CRUD + 前端顯示/修改）

**Date**: 2026-07-12
**Feature**: 009-rbac-runtime-management
**Status**: Approved design, pending implementation plan
**Branch**: `popo/rbac-permission-crud`（off `popo/rbac-v1`）
**Depends on**: RBAC v1（ADR-012~054）、既有 `/admin` REST 層（ADR-035）、capability 引擎（`app/core/permissions.py` / `rbac_scopes.py`）

---

## 1. 概述

開一組 REST API，讓前端能**顯示並修改** RBAC 設定：角色↔權限矩陣、角色本身、人↔角色指派、個人例外授權。

目前 RBAC 完全由 `scripts/seed_rbac.py` 決定，`rbac.edit`/`rbac.assign` 兩個 capability 只是佔位（ADR-050），沒有任何端點能在營運中查看或調整權限矩陣。本功能把 RBAC 從「seed 驅動、不可改」轉為「**runtime 可管理**」。

### 目標
- 前端能**顯示**完整權限矩陣（role × capability × scope）、角色清單、某使用者的 effective 權限。
- super_admin 能**修改**矩陣格、角色、人↔角色指派、個人 grant。
- 事實來源由 seed 轉移到 runtime DB；seed 降級為只補缺的 bootstrap。
- 全程沿用既有引擎（`require_scope`、union 解析、audit trigger），不重造。

### 非目標（YAGNI，明確排除）
- **自訂 capability**：`Perm` 目錄是 code-owned、綁 enforcement 點，唯讀（ADR-057）。
- **自訂 scope 值**：固定 `none/own/team/zone/all`（ADR-020）。
- **可委派編輯**：不做「非 super_admin 也能改 + no-escalation 檢查」。只有 super_admin（ADR-056）。
- **後台改 baseline 檔**：baseline 仍在 `seed_rbac.py`／未來 migration，不做「編輯 seed」的 UI。
- 權限版本歷史 UI（歷史查詢靠既有 `audit_logs`）。

---

## 2. 關鍵決策（brainstorm 定案）

1. **事實來源 = runtime DB**；seed = 一次性 idempotent bootstrap（只補缺、不覆蓋既有 grant）。
2. **只有 super_admin 能改**；`rbac.edit`（矩陣/角色/grant）、`rbac.assign`（人↔角色/個人 grant）。護欄：≥1 super_admin、super_admin 不可自我鎖死、刪角色前不得有 assignment。
3. **capability 目錄唯讀**：CRUD 只作用在 grant/role/assignment；capability 與 scope 只能讀來當前端下拉選項。
4. **端點形狀**：granular REST（每次改一格/一筆，掛 `/admin/rbac`）＋一個彙總 `GET /admin/rbac/matrix` 供顯示。
5. **一份 spec、分三階段實作**（Phase 1 讀 → Phase 2 矩陣寫 → Phase 3 角色 CRUD + 個人 grant），各自一個 PR。

### 未決（實作時確認）
- **`data_auditor` 要不要有 `rbac.view`？** 本 spec 預設 **super_admin only**；data_auditor 定位是「全平台唯讀」，若要讓它也看得到矩陣，Phase 1 seed 多授一條即可（低風險，可後補）。

---

## 3. 新增 ADR（055 / 056 / 057）

> 這三條在對應 phase 落地時轉錄進 `RBAC_V1_DECISIONS.md`（沿用該檔「每個決策一條編號 ADR」慣例）。此處為 approved-pending-implementation。

### ADR-055 RBAC 轉 runtime-managed；runtime DB = 事實來源；seed 降為 idempotent bootstrap
**Context**：ADR-049 前提「一場災難 = 短命獨立部署，seed-time 設定就夠、不過度建治理機制」，ADR-054 據此明言「不做後台權限矩陣編輯」。現在產品需要前端能顯示/修改權限，這個前提要調整。
**Decision**：RBAC 設定的事實來源改為 **runtime DB**。`seed_rbac.py` 降為純 bootstrap：permission/role/grant 三者一律「缺才補、既有不動」（移除目前 `:181-183` 更新既有 grant scope 的邏輯）。部署重跑 seed 不再覆蓋後台改動。baseline 若要升級（例如新模組要給某角色預設權限），走新增 grant（seed 會補缺）或一次性 migration，不靠改既有 grant。
**Consequences**：➕ 後台改的權限永久保留、可 runtime 管理。➖ 事實來源不再是單一檔案；重現某環境權限狀態要看 DB，不能只讀 seed。
**取代關係**：取代 ADR-049「seed 即配置面、不建治理機制」前提，與 ADR-054「不做後台權限矩陣編輯」該條；ADR-049 的 scope/geo 模型不受影響。

### ADR-056 RBAC 自管 API — super_admin only，接上 rbac.view/edit/assign enforcement
**Context**：ADR-050 把 `rbac.edit`/`rbac.assign` 標為「純超前定義，等對應功能才接 enforcement」。本功能即該功能。
**Decision**：新增 `/admin/rbac` REST 端點（沿 ADR-035）。寫入全走 `require_scope(actor, Perm.RBAC_EDIT|RBAC_ASSIGN, db)`（checkpoint 1，super_admin only）。新增 `rbac.view` capability 給讀取面。護欄（沿 ADR-032 use-case 層、非 DB 約束）：
- 至少 1 個 user 持 `super_admin`（撤角色/刪角色/刪使用者前檢查，reuse `_remaining_super_admins`）。
- `super_admin` 角色不可被刪、改名、或撤掉 `rbac.edit`/`rbac.assign`（避免自我鎖死）。
- 刪角色前該角色不得有任何 `UserRoleAssign`（409，先 reassign）。
**Consequences**：➕ 兌現 ADR-050 的超前定義；提權面受限（唯一能改的 super_admin 本就全權，無「授出自己沒有的權限」問題）。➖ super_admin 成為單點；靠護欄防鎖死。
**取代關係**：兌現 ADR-050；延續 ADR-032/035/040。

### ADR-057 capability 目錄 code-owned & 唯讀；runtime CRUD 只作用在 grant/role/assignment
**Context**：「權限 CRUD」易被誤解為能新增 capability。但 `Perm` key 綁在程式 enforcement 點，runtime 新增沒有意義。
**Decision**：capability 目錄（`Perm`）與 scope 值（`Scope`）維持 code-defined、API 唯讀（`GET /admin/rbac/capabilities`）。寫入 API 一律驗證 `capability ∈ Perm`、`scope ∈ Scope`，否則 422。runtime 可 CRUD 的只有：role-permission grant、role、user-role assignment、user direct grant。
**Consequences**：➕ 不會出現「有 grant 卻無 enforcement」的無效權限；輸入邊界清楚。➖ 新 capability 仍要改 code（低頻，可接受）。
**取代關係**：呼應 ADR-020（固定 scope、不做通用 ABAC）。

---

## 4. 資料模型

**不新增資料表、不需 Alembic migration。** 現有 5 張表已完全支援：

| 表 | 角色 |
|---|---|
| `roles` | 角色定義（name, kind=platform\|team） |
| `permissions` | capability key 目錄（由 seed 依 `Perm` 建立） |
| `role_permission_assign` | 矩陣格：role × permission × scope |
| `user_role_assign` | 人↔角色 |
| `user_permission_assign` | 個人例外 grant |

**唯一新增**：`app/core/permissions.py` 加 `RBAC_VIEW = "rbac.view"`。

---

## 5. 端點設計（掛 `/admin/rbac`，REST）

### Phase 1 — 讀取/顯示（`rbac.view`，super_admin）

```
GET /admin/rbac/capabilities
  → { "scopes": ["none","own","team","zone","all"],
      "capabilities": [ {"key":"ticket.add","resource":"ticket","action":"add","public":false}, ... ] }

GET /admin/rbac/matrix
  → { "roles": [ {"uuid","name":"user","kind":"platform","grants":{"map.view":"all","station.add":"all", ...}}, ... ] }

GET /admin/rbac/roles/{uuid}
  → { "uuid","name":"admin","kind":"team","grants":{ "...":"zone", ... } }

GET /admin/users/{uuid}/permissions
  → { "user_uuid",
      "roles":[{"name":"admin","kind":"team"}],
      "direct_grants":{"ticket.export":"all"},
      "effective":{"ticket.view":"all","ticket.edit":"zone", ...} }   # widest-wins union（reuse get_user_permissions）
```

### Phase 2 — 矩陣寫入（`rbac.edit`，super_admin）

```
PUT    /admin/rbac/roles/{uuid}/permissions/{cap}   body {"scope":"own"}   # upsert 一格；驗證 cap∈Perm、scope∈Scope → 否則 422
DELETE /admin/rbac/roles/{uuid}/permissions/{cap}                          # 撤銷一格
```

### Phase 3 — 角色 CRUD + 個人 grant + 取消指派

```
POST   /admin/rbac/roles              body {"name","kind":"platform|team"}   (rbac.edit)
PATCH  /admin/rbac/roles/{uuid}       body {"name"}                          (rbac.edit)   # 改名
DELETE /admin/rbac/roles/{uuid}                                              (rbac.edit)   # 護欄：無 assignment 才可、非 super_admin
PUT    /admin/users/{uuid}/permissions/{cap}   body {"scope"}                (rbac.assign) # 個人 grant upsert
DELETE /admin/users/{uuid}/permissions/{cap}                                (rbac.assign)
DELETE /admin/users/{uuid}/role/{role_uuid}                                 (rbac.assign) # 取消指派；護欄：不撤最後一個 super_admin
POST   /admin/users/{uuid}/role       （已存在，ADR-032）
```

---

## 6. 安全 & 護欄

- 所有寫入端點 checkpoint 1：`require_scope(actor, Perm.RBAC_EDIT|RBAC_ASSIGN, db)`（super_admin only）。
- **輸入驗證**：`{cap}` ∈ `Perm`、`scope` ∈ `Scope`、`kind` ∈ {platform, team}，否則 422。
- **不變量**（use-case 層，非 DB 約束，沿 ADR-032）：
  - 至少 1 個 user 持 `super_admin`（reuse `_remaining_super_admins`）——撤角色/刪角色前檢查，違反 → 409。
  - `super_admin` 角色不可刪、改名、或撤掉 `rbac.edit`/`rbac.assign` → 409/403。
  - 刪角色前不得有 `UserRoleAssign` 指向它 → 409（訊息提示先 reassign）。
- 錯誤語意沿 ADR-023：缺 capability → 403；資源不存在 → 404；違反不變量 → 409（`AdminConflictError`）。

---

## 7. seed 改造（ADR-055）

`scripts/seed_rbac.py`：
- super_admin 權限清單 +`Perm.RBAC_VIEW`。
- **移除 `:181-183`**（`if grant.scope != scope: grant.scope = scope`）——既有 grant 一律不動；只在 grant 不存在時 insert。permission/role 本就是「缺才建」，維持不變。
- 結果：全新 DB → 建立完整 baseline；既有 DB → 只補新加的 grant，後台改動不被覆蓋。

---

## 8. Audit（零工作）

`roles`/`permissions`/`role_permission_assign`/`user_role_assign`/`user_permission_assign` 五張表已在 `app/db/triggers.py:AUDITED_TABLES`。每筆 runtime 改動經 `AuditContextMiddleware` 設定的 `app.current_user_id`，自動寫 append-only `audit_logs`（含 old/new）。**無需新增 audit 程式碼。**

**快取**（ADR-046）：request-scoped `_rbac_cache` 短命 → 矩陣改動於**下一個 request 自動生效**，無快取失效邏輯。

---

## 9. Blast Radius

**共用前置（Phase 1 之前）**
- `app/core/permissions.py` — +`RBAC_VIEW = "rbac.view"`
- `scripts/seed_rbac.py` — super_admin +`rbac.view`；移除 `:181-183`（ADR-055）
- `app/api/v1/api.py` — 掛新 `rbac_admin` router（`/admin/rbac`）

**Phase 1（新檔）**
- `app/api/v1/endpoints/rbac_admin.py` — 4 個 GET
- `app/services/rbac_admin.py` — 組矩陣 / 角色明細 / capability 目錄 / 使用者 effective
- `app/schemas/rbac_admin.py` — response models
- `app/repositories/auth_repository.py` — +「列所有角色含 grants」「列所有 permission」「角色+grants by uuid」「使用者的直接 grant + 角色指派」
- `tests/test_rbac_admin_api.py`

**Phase 2**
- `app/services/rbac_admin.py` +`set_role_permission` / `revoke_role_permission`（護欄 + 驗證）
- `app/api/v1/endpoints/rbac_admin.py` +PUT/DELETE grant
- `app/repositories/auth_repository.py` +grant upsert/delete
- 測試

**Phase 3**
- `app/services/rbac_admin.py` +角色 create/update/delete（護欄）、個人 grant set/remove、unassign role
- `app/api/v1/endpoints/rbac_admin.py` +對應端點
- `app/schemas/rbac_admin.py` +request models
- `app/repositories/auth_repository.py` +角色 CRUD、`user_permission` upsert/delete、`user_role` delete
- 測試

**不碰**：無新表、無 migration、audit 零工作、無快取失效。

---

## 10. 分階段實作

| Phase | 內容 | 依賴 | 交付 |
|---|---|---|---|
| **1** | 讀取/顯示面 + `rbac.view` + seed idempotent 改造 | 共用前置 | 前端能顯示矩陣 |
| **2** | 矩陣格 upsert/revoke + 護欄 | Phase 1 | 前端能改矩陣 |
| **3** | 角色 CRUD + 個人 grant + 取消指派 | Phase 2 | 完整 RBAC 後台 |

每 phase 各自 spec-slice→plan→PR，堆疊在本 branch。

---

## 11. 測試計畫

每 phase 併行（pytest，沿既有 `tests/test_admin_api.py` 慣例）：
- **輸入驗證**：壞 capability / 壞 scope / 壞 kind → 422。
- **授權**：非 super_admin 打寫入端點 → 403；匿名 → 401。
- **護欄**：撤/刪最後一個 super_admin → 409；刪有成員的角色 → 409；撤 super_admin 的 `rbac.edit` → 409。
- **矩陣讀取**：`GET /matrix` 反映 seed baseline；改一格後再讀反映新值。
- **effective 解析**：某使用者的 role∪direct union、最寬勝正確。
- **seed idempotency**：後台改一格 scope → 重跑 seed → 該格不被覆蓋（ADR-055 回歸測試）。
- **audit**：改一格後 `audit_logs` 有對應 old/new row。

---

## 12. 開放問題清單

1. `data_auditor` 是否給 `rbac.view`？（預設否）
2. 三個新 ADR 落地時轉錄進 `RBAC_V1_DECISIONS.md` 的時機：隨各 phase PR 一起（建議），或一次補齊。
