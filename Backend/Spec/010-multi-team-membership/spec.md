# Design: Multi-Team Membership（一個人會有多個 team）

**Date**: 2026-08-16（初版）／**2026-08-19 重大改版：改採完整身分切換**
**Feature**: 010-multi-team-membership
**Status**: ⏸ **Pending — 設計已定案，待團隊對 ADR-068 背書後才進實作**
**Notion**: 補齊功能 → 「情境：一個人會有多個team」（backend-Popo）
**併入本票**: 補齊功能 → 「移除後台權限，回去原有登入狀態」（見 §7）
**Depends on**: RBAC v1（ADR-012~054）、RBAC runtime management（ADR-055~067）
**不依賴**: `Spec/014-session-revocation`（ADR-071 已拆出，兩票可獨立落地）
**決策全文**: `decisions.md`（ADR-068~076、096、097）

---

## 1. 概述

讓一個使用者能同時隸屬多個 team（例如同時是花蓮縣府的人員與慈濟的志工），但**任一時刻只有一個身分生效**，可主動切換。

目前系統寫死「一人一 team」：`users.team_uuid` 是單一 nullable FK（`app/models/auth.py:25`），`UserRoleAssign` 刻意不帶 `team_uuid`（`app/models/rbac.py:51-57`），`add_team_member` 明文拒絕跨隊（`app/services/admin.py:130-131`），ADR-049 附錄 A 也記載「一人一 team」。這個假設貫穿整個 scope 引擎。

### 與初版的核心差異

初版切換的是 **active team**，platform 角色（`super_admin` 等）**恆生效、不被切換影響**。

改版切換的是**完整身分**——platform 角色也會被切走。`super_admin` 切到 `member@慈濟` 時，**super_admin 的權限是真的關閉的**。

### 目標
- 一個使用者可隸屬多個 team，並在多個身分間切換。
- 任一時刻只有一個 **active identity** 生效，權限與資料邊界依它判定。
- 支援跨隊不同角色（在縣府是 `admin`、在慈濟是 `member`）。
- **`super_admin` 可主動降權**，以最小權限執行日常操作。
- 切換身分不影響其他裝置。
- audit log 答得出「這筆操作是他以哪個身分做的」。

### 非目標（YAGNI，明確排除）
- **權限聯集**：不做「同時享有所有身分的權限」（ADR-068）。
- **per-user 的 active identity**：不做「切換後所有裝置一起變」（ADR-069 選 per-session）。
- **市民基底**：不做「platform `user` 的授予恆生效」（ADR-097 改為要求每個身分自給自足）。
- **獨立的成員資格表**：不建 `user_team_assign`（ADR-072 撤回，有角色即是成員）。
- **access token 撤銷機制**：移至 `Spec/014`（ADR-071 撤回）。
- **成員資格的審批流程**：加入／移除 team 仍是管理員直接操作。
- **team 階層**：不做母團隊／子團隊。

---

## 2. 硬性不變式

> 這條是整份設計的安全底線，任何實作變更都不得違反。

**切換只能在使用者已持有的身分之間移動，不能創造新身分。**

- 切換 API 只驗「該身分在你的清單裡」，**永不寫入任何授予**。
- 降權是安全方向；切回高權限身分不是「取得」而是「回到已持有的」。
- `UserRoleAssign.team_uuid` 對 platform-kind 角色恆為 `NULL`（DB CHECK 強制），對 team-kind 恆 `NOT NULL`。

⇒ **沒有任何路徑能藉由切換取得使用者原本不持有的權限。**

現有角色（`scripts/seed_rbac.py`）：platform = `user` / `data_auditor` / `super_admin`；team = `admin` / `member`。

---

## 3. 身分模型

**身分 = `user_role_assign` 的一列。** 一個帳號恰有一個 platform 角色（`assign_role` 的同 kind 取代語意保證）+ 0..N 個 team 角色。

```
Popo 的身分清單：
  [platform] super_admin
  [team]     admin  @ 花蓮縣府
  [team]     member @ 慈濟
```

active identity = 慈濟的 `member` 時，effective 權限 = **`member` 在慈濟的 grants** ∪ **`team_uuid = 慈濟` 的直接授予**。`super_admin` 與 `admin@花蓮縣府` 的 grants **完全不計入**。

---

## 4. 資料模型

### 4.1 `UserRoleAssign` 加 `team_uuid`（ADR-073）

```sql
ALTER TABLE user_role_assign ADD COLUMN team_uuid UUID NULL REFERENCES teams(uuid);
ALTER TABLE user_role_assign ADD CONSTRAINT ck_role_team_kind CHECK (...);
-- 唯一鍵必須一併修正：同時是 member@慈濟 與 member@紅十字會 是同一個 role_uuid 用兩次
ALTER TABLE user_role_assign DROP CONSTRAINT uq_user_role;
ALTER TABLE user_role_assign ADD  CONSTRAINT uq_user_role UNIQUE (user_uuid, role_uuid, team_uuid);
```

### 4.2 `UserPermissionAssign` 同樣加 `team_uuid`（ADR-073）

直接授予是繞過角色的第三條授權管道，有活的 REST 端點（`PUT /rbac/users/{u}/permissions/{cap}`）。它的 `scope` 本身就依賴 team 脈絡（`scope="zone"` 在 platform 身分下解為 `false()`），所以無法「恆生效」。

```sql
ALTER TABLE user_permission_assign ADD COLUMN team_uuid UUID NULL REFERENCES teams(uuid);
ALTER TABLE user_permission_assign DROP CONSTRAINT uq_user_perm;
ALTER TABLE user_permission_assign ADD  CONSTRAINT uq_user_perm
  UNIQUE (user_uuid, permission_uuid, team_uuid);
```

### 4.3 `users.team_uuid` 移除（ADR-072 撤回後）

現有值搬進 `user_role_assign.team_uuid`（對應其既有的 team 角色授予）後 drop 該欄。不保留為「預設 team」——留著就有兩份真相。

**不建 `user_team_assign`**：成員資格 = 你在該 team 持有的角色集合。

### 4.4 `audit_logs` 加 `context JSONB`（ADR-076）

---

## 5. Token 與切換

### 5.1 `act` claim

active identity 簽進 access token 的 `act` claim，內容是 **`(role_uuid, team_uuid)`**（非 assignment PK——可跨 `rename_role` 與「刪掉再重加」存活）。

```
access token payload: { sub, sid, jti, act, exp, iat, type }
```

**session 不存 `act`。JWT 是唯一真相。**

### 5.2 切換流程（ADR-070）

```
POST /auth/switch-identity { role_uuid, team_uuid? }
  1. 驗該身分屬於呼叫者（且 team 未被軟刪除）→ 否則 403
  2. 以新的 act 簽發 access token
  3. 回傳 TokenPair（refresh token 不輪替）
```

**不動 session、不撤舊 session。** 只影響當前裝置。

**此端點不得綁任何 capability**——否則降權後可能連切回來的權限都沒有，把自己鎖死。

### 5.3 預設身分與記憶（ADR-069）

- **預設 = 該使用者的 platform 身分**（每人恰有一個，保證存在、唯一、無歧義）。
- **「記住上次的身分」由前端保存**在 NextAuth 的 http-only session cookie（後端 token 本來就存在那裡，`Frontend/apps/demo/src/lib/server-backend-auth.ts:113-114`）。後端的 `device` 欄位只是 User-Agent 字串，不能當 per-device 的 key。
- `POST /auth/login` 接**選填**的 `identity`；驗不過就退回預設，不報錯。
- `POST /auth/refresh` 由前端帶上當前 identity；驗不過 **401**（見 §5.4）。

### 5.4 身分失效（ADR-096）

| 路徑 | 行為 |
|---|---|
| 一般請求 | `act` 對不上任何有效授予 → **401** |
| `POST /auth/refresh` | 同上 → **401** |

兩路皆擋 ⇒ 使用者被登出，重新登入後以 platform 身分回來。

**觸發條件是「`act` 指向的那筆授予不存在」，不是「授予集合有任何變動」**：

- **新增**身分 → 不登出。
- **提權**（`user`→`super_admin`）→ **會登出**，因為 `assign_role` 是先刪後加。已知並接受。
- team 被軟刪除 → 登出。

> ⚠️ **`act` 驗證必須在 `rotate()` 之前**。`rotate()` 一執行就燒掉舊 refresh token（`app/repositories/session_repository.py:80`），驗證放在它之後會導致「token 燒了卻不發新的」，重試被判定為重放而遭 `revoke_session`。與 `Spec/013` 審查抓到的 H1 同一失效模式。

---

## 6. Scope 引擎改動（ADR-074）

| 位置 | 現況 | 改為 |
|---|---|---|
| `app/core/rbac_scopes.py:81-82` | `str(team_uuid) == str(actor.team_uuid)` | 比對 active identity 的 team |
| `app/core/rbac_scopes.py:94` | `TeamZoneAssign.team_uuid == actor.team_uuid` | `== active_team` |
| `app/core/rbac_scopes.py:124-129` | `if not actor.team_uuid: return [false()]` | 以 active identity 判定 |
| `app/core/rbac_scopes.py:134-139` | 同上（zone 分支） | 同上 |
| `app/core/security.py:232` | `resolve_scope(actor, perm, db, cache)` | 加 `active_identity` 參數（4 個呼叫點） |
| `app/core/security.py:221-229` | `_request_rbac_cache` key = `actor.uuid` | key = `(actor.uuid, active_identity)` |
| `app/repositories/auth_repository.py:31` | `get_user_permissions(db, user_uuid)` | 加 `active_identity` 過濾 |
| `app/services/work_zone.py:32` | `if actor.team_uuid is None` → 放行 | 「active 身分是 platform 身分」→ 放行（語意不變，ADR-064 行為保留） |

`active identity` 為 platform 身分（無 team）時，team / zone scope 一律 `false()`。

**`.team_uuid` 全 codebase 共 27 處引用**，其中 8 處在核心 scope 引擎、4 處根本是別張表的欄位（`TeamZoneAssign.team_uuid` 等）不受影響。

---

## 7. 併入本票的子項目：「移除後台權限，回去原有登入狀態」

- **撤除角色即時生效** —— **已經成立**。權限每 request 從 DB 解析（`resolve_scope` → `get_user_permissions`），不烘進 JWT（payload 只有 `sub`/`type`/`exp`/`jti`/`sid`），`DELETE /users/{u}/role/{r}` 撤掉後下一個請求就失效。
- **「回去原有登入狀態」** —— 由 ADR-096 達成：身分失效 → 兩路擋下 → 登出 → 重新登入後預設即 platform 身分。
- **強制失效的能力** —— 一般 access token 的撤銷（登出／踢人）由 `Spec/014` 提供。

---

## 8. 連帶改動

| 檔案 | 改動 |
|---|---|
| `app/services/admin.py:71` | 移除「必須先屬於某 team 才能授予 team 角色」——授予 team 角色**就是**入隊 |
| `app/services/admin.py:96-99` | 「同 kind 取代」→「同 kind + 同 team 取代」 |
| `app/services/admin.py:130-131` | 移除「User already belongs to a different team」 |
| `app/api/v1/endpoints/admin.py` | `POST /users/{u}/role` 只處理 **platform** 角色；team 角色一律走 `POST /teams/{t}/members` |
| `app/schemas/admin.py:9-16` | `AdminUserListItem` 的 `team_uuid` / `team_role` 單值欄位 → 改成身分清單 |
| `app/api/v1/endpoints/users.py:13` | `GET /users/me` 增加身分清單與當前身分 |
| `app/api/v1/endpoints/auth/session.py` | 新增 `POST /auth/switch-identity`；`login` 接選填 identity；`refresh` 接 identity 並驗證 |
| `app/api/v1/endpoints/rbac_admin.py:109` | 直接授予端點加 team 維度 |
| `scripts/seed_rbac.py` | `admin` / `member` 補上 `Perm.STATION_CONTRIBUTE: "all"`（ADR-097） |
| `app/db/triggers.py` | 加 `app.active_identity` GUC 讀取 |
| `app/models/rbac.py:51-57` | `UserRoleAssign` docstring 的「一人一 team」說明整段改寫 |
| `Spec/008-rbac-authorization/decisions.md` | 加指標，註明 ADR-019 / ADR-039 與附錄 A 的 team scope 語意已被 ADR-068 / 073 / 074 取代 |

### 前端契約（必須對齊）

1. **NextAuth JWT 多存 `activeIdentity`**，login / refresh 時帶上。
2. **收到 401 要走登出流程。** 目前 `Frontend/apps/demo/src/lib/server-backend-auth.ts:71-77` 只依過期時間決定要不要 refresh，整個 auth lib 沒有 401 處理也沒有 signOut——不補的話，身分被撤時使用者會卡在「畫面壞掉但沒被登出」的狀態。
3. **切換器 UI** 消費 `GET /users/me` 的身分清單。
4. 切換回傳 TokenPair，可直接餵給既有的 `applyTokenPairToBackendAuthToken`。

---

## 9. Migration

無正式使用者，不需保守的分階段遷移：

1. `user_role_assign` 加 `team_uuid` + CHECK；team-kind 的既有列回填為該使用者原本的 `users.team_uuid`；唯一鍵改為 `(user_uuid, role_uuid, team_uuid)`。
2. `user_permission_assign` 加 `team_uuid`；唯一鍵改為 `(user_uuid, permission_uuid, team_uuid)`。（該表 seed 建 0 筆、僅測試在用，無回填問題。）
3. Drop `users.team_uuid`。
4. `audit_logs` 加 `context JSONB`。

---

## 10. 測試計畫

| 類型 | 案例 |
|---|---|
| 安全 | **切換不會創造新身分**：切遍所有身分，effective 權限恆為某一筆已持有授予的子集 |
| 安全 | **super_admin 切到 team 身分後確實降權**：不再持有任何 platform grant |
| 安全 | 切到非自己持有的身分 → 403 |
| 安全 | 切換端點不綁 capability：降權至最低身分後仍能切回 |
| 安全 | 身分被撤銷後，一般請求 401 **且** refresh 401 |
| 安全 | team 被軟刪除後，該 team 的身分失效 |
| 安全 | **`act` 驗證在 `rotate()` 之前**：失效身分的 refresh 不得燒掉 refresh token |
| 功能 | 跨隊不同角色：在 A 隊是 `admin` 可管成員，切到 B 隊是 `member` 則不可 |
| 功能 | zone scope 只看 active identity 的 team，不含其他隊的 WorkZone |
| 功能 | platform 身分時 team / zone scope 皆 `false()` |
| 功能 | **新增**身分不會登出；**提權**會登出 |
| 功能 | 直接授予依 `team_uuid` 過濾：`NULL` 只在 platform 身分下生效 |
| 功能 | login 帶失效 identity → 退回預設 platform 身分，不報錯 |
| 功能 | 同一個 role 可在兩個 team 各持有一次（唯一鍵修正的回歸測試） |
| 回歸 | **每個行動型身分的能力集合涵蓋 platform `user`**（`data_auditor` 為明文例外）——釘住 ADR-097 |
| Audit | 以 `member@慈濟` 身分的操作 → `context.identity` 記錄該角色與團隊名稱 |
| Audit | 角色被硬刪除後，歷史 log 仍讀得出當時的角色名稱（快照而非參照） |
