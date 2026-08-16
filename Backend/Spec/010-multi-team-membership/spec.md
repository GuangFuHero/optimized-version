# Design: Multi-Team Membership（一個人會有多個 team）

**Date**: 2026-08-16
**Feature**: 010-multi-team-membership
**Status**: ⏸ **Pending — 共識已定案，後續邏輯待團隊決策後才進實作**
**Notion**: 補齊功能 → 「情境：一個人會有多個team」（backend-Popo，08-18~08-22）
**併入本票**: 補齊功能 → 「移除後台權限，回去原有登入狀態」（見 §6）
**Depends on**: RBAC v1（ADR-012~054）、RBAC runtime management（ADR-055~067）
**跨票相依**: ADR-076 需在 `audit_logs` 加欄位——該表的讀取層由 backend-Dan/Cedric 的「Ticket/Resource Station History（版本歷史）」負責，落地前需與其對齊

---

## 1. 概述

讓一個使用者能同時隸屬多個 team（例如同時是花蓮縣府的人員與慈濟的志工），但**任一時刻只有一個 team 身分生效**，可主動切換。

目前系統寫死「一人一 team」：`users.team_uuid` 是單一 nullable FK（`app/models/auth.py:25`），`UserRoleAssign` 刻意不帶 `team_uuid`（`app/models/rbac.py:7-10`），`add_team_member` 明文拒絕跨隊（`app/services/admin.py:130-131`），ADR-049 附錄 A 也記載「一人一 team」。這個假設貫穿整個 scope 引擎。

### 目標
- 一個使用者可隸屬多個 team。
- 任一時刻只有一個 **active team** 生效，權限與資料邊界依它判定。
- 切換 team 時重新簽發 token，舊的 access / refresh token 立即失效。
- 支援跨隊不同角色（在縣府是 `admin`、在慈濟是 `member`）。
- **切換 team 絕不影響 platform 角色**（`user` / `data_auditor` / `super_admin`）。
- audit log 答得出「這筆操作是他以哪個單位、憑哪個權限做的」。

### 非目標（YAGNI，明確排除）
- **權限聯集**：不做「同時享有所有 team 的權限」（ADR-068 選了切換模型而非 union）。
- **per-user 的 active team**：不做「切換後所有裝置一起變」（ADR-069 選 per-session）。
- **切換時降權 super_admin**：platform 角色恆生效，不因 active team 而收窄（ADR-068 硬性不變式）。
- **成員資格的審批流程**：加入／移除 team 仍是管理員直接操作，不做申請—審核。
- **team 階層**：不做母團隊／子團隊。

---

## 2. 硬性不變式

> 這條是整份設計的安全底線，任何實作變更都不得違反。

**platform 角色（`user` / `data_auditor` / `super_admin`）與 team 完全解耦。**

- `UserRoleAssign.team_uuid` 對 platform-kind 角色恆為 `NULL`（DB CHECK 約束強制）。
- platform 角色不參與 active_team 過濾，切到任何 team 都恆生效。
- 切換 API **只驗成員資格、完全不碰角色授予**。

⇒ **沒有任何路徑能藉由切換 team 取得 platform 權限。**

現有角色（`scripts/seed_rbac.py`）：platform = `user` / `data_auditor` / `super_admin`；team = `admin` / `member`。

---

## 3. 資料模型

### 3.1 新增 `user_team_assign`

```sql
CREATE TABLE user_team_assign (
    uuid       UUID PRIMARY KEY,
    user_uuid  UUID NOT NULL REFERENCES users(uuid),
    team_uuid  UUID NOT NULL REFERENCES teams(uuid),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_uuid, team_uuid)
);
```

成員資格與角色授予**分離**：`user_team_assign` 決定「你在不在這隊、能不能切過去」，`UserRoleAssign.team_uuid` 決定「你在這隊能做什麼」。

### 3.2 `users.team_uuid` 移除

現有值搬進 `user_team_assign` 後 drop 該欄。不保留為「預設 team」——留著就會有兩份真相，`rbac_scopes.py` 每個讀 `actor.team_uuid` 的地方都得決定信哪一個。

### 3.3 `UserRoleAssign` 加 `team_uuid`

```sql
ALTER TABLE user_role_assign
  ADD COLUMN team_uuid UUID NULL REFERENCES teams(uuid);

-- platform 角色恆 NULL、team 角色恆 NOT NULL
ALTER TABLE user_role_assign ADD CONSTRAINT ck_role_team_kind CHECK (...);
```

CHECK 需要 join `roles.kind`，實作上以 trigger 或在 `user_role_assign` 冗餘一個 `role_kind` 欄位達成，落地時決定。

範例資料：

```
user_team_assign:   Popo → 花蓮縣府
                    Popo → 慈濟

user_role_assign:   Popo → super_admin   team_uuid = NULL      (platform)
                    Popo → admin         team_uuid = 花蓮縣府  (team)
                    Popo → member        team_uuid = 慈濟      (team)
```

active_team = 慈濟時，一次請求解出的權限 = **super_admin 的全部 grant** ∪ **`member` 在慈濟的 grant**。`admin` 在花蓮縣府的 grant 不計入。最後 widest-wins。

---

## 4. Session 與 Token

### 4.1 active team 存放

簽進 access token 的 `act` claim（有簽章、不可竄改）。**per-session**——手機用縣府身分、筆電用慈濟身分可並存。

```
access token payload: { sub, sid, jti, act, exp, iat, type }
```

Redis session 記錄**額外存一份 `active_team`**，僅作為伺服器端撤銷用的索引（見 §4.4），不參與請求授權判斷。

### 4.2 每 request 的驗證（fail-closed）

```
驗簽 → MGET session:{sid}, denylist:sid:{sid}
     → session 不存在 → 401
     → 命中 denylist  → 401，並記錄盜用訊號
     → 從 act claim 讀 active team
```

**這順帶修好一個既有的洞**：目前 `get_current_user` 只解 JWT 取 `sub` 撈 user（`app/core/security.py:206-212`），從不驗證 sid，所以 `/auth/logout` 只殺得掉 refresh token，access token 仍可用滿 15 分鐘（`ACCESS_TOKEN_EXPIRE_MINUTES = 15`）。

### 4.3 切換流程

```
POST /auth/switch-team { team_uuid }
  1. 驗 team_uuid ∈ user_team_assign（否則 403）
  2. create_session(user, device, active_team=team_uuid)   ← 先建
  3. revoke_session(舊 sid) + denylist:sid:{舊 sid}         ← 後撤
  4. 回傳新的 TokenPair
```

**先建後撤**：若第 2 步失敗（Redis 異常），使用者維持原狀態；反過來做會把人鎖在門外。

只影響當前 session，其他裝置不受影響。

### 4.4 成員資格異動時的 session 處理

踢出團隊 / team 軟刪除時，**只撤銷 `active_team` 命中該 team 的 session**——因為 active team 被烘進了 JWT 的 `act` claim，不撤就會有最長 15 分鐘的舊身分視窗。這是 Redis session 需要多存一份 `active_team` 的唯一理由。

**撤角色不需要撤 session**：`resolve_scope` 每 request 查 DB，撤角色本來就即時生效。

---

## 5. Scope 引擎改動

| 位置 | 現況 | 改為 |
|---|---|---|
| `app/core/rbac_scopes.py:78-83` | `str(team_uuid) == str(actor.team_uuid)` | 比對 `active_team` |
| `app/core/rbac_scopes.py:94` | `TeamZoneAssign.team_uuid == actor.team_uuid` | `== active_team` |
| `app/core/rbac_scopes.py:124-129` | `if not actor.team_uuid: return [false()]` | 以 `active_team` 判定 |
| `app/core/rbac_scopes.py:134-139` | 同上（zone 分支） | 同上 |
| `app/core/security.py:232` | `resolve_scope(actor, perm, db, cache)` | 加 `active_team` 參數 |
| `app/core/security.py:221-229` | `_request_rbac_cache` key = `actor.uuid` | key = `(actor.uuid, active_team)` |
| `app/repositories/auth_repository.py:31` | `get_user_permissions(db, user_uuid)` | 加 `active_team` 過濾；回傳型別帶出處（見 §7） |

**zone scope 只看 active team，不做多隊聯集**——這是選擇切換模型的直接後果。

`active_team = NULL`（純市民、或 super_admin 以平台身分登入）時，team / zone scope 一律 `false()`，與現行 `actor.team_uuid is None` 的行為一致。

**登入後的預設 active team**：取 `user_team_assign` 中最早加入的一隊；無任何 team 者為 `NULL`。

---

## 6. 併入本票的子項目：「移除後台權限，回去原有登入狀態」

Notion 上這是獨立子項目，但它要的機制與本票完全重疊：

- **撤除角色即時生效** —— 已經成立。權限每 request 從 DB 解析（`resolve_scope`），不烘進 JWT，`DELETE /users/{u}/role/{r}`（`app/api/v1/endpoints/rbac_admin.py:193`）撤掉後下一個請求就失效。
- **「回去原有登入狀態」而非被登出** —— 由 §4.2 的 fail-closed 檢查配合達成：撤角色不撤 session，使用者維持登入，只是權限降回一般使用者。
- **強制失效的能力** —— 由 §4.2 + §4.4 提供，這是目前完全缺失的部分。

---

## 7. Audit 歸因

`audit_logs` 新增 `context JSONB` 欄位：

```json
{
  "active_team": { "uuid": "550e8400-...", "name": "慈濟基金會" },
  "cap": "ticket.edit",
  "authority": { "kind": "platform", "role": "super_admin" }
}
```

- `kind` ∈ `platform` / `team` / `direct`
- `kind = "team"` 時不需再記 team——依定義即 active_team
- **一律存「當下快照」而非外鍵參照**：`Role` 沒有 `TimestampMixin`（`app/models/rbac.py:19`），`DELETE /rbac/roles/{uuid}` 是硬刪除且可改名，UUID 不保證解得開。`Team` / `User` 有軟刪除（`delete_at`）不會斷鏈，但仍存 `name` 快照以求可讀。

**歸因策略：最小必要權力**——由窄到寬試每個 grant，第一個通過 `in_scope()` 的即為決定性 grant。

```
grants = [(own, member@慈濟), (all, super_admin@platform)]   # 由窄到寬
for scope, source in grants:
    if in_scope(scope, actor, resource): authorized_by = source; break
```

寫入路徑透過 `app.authorized_by` / `app.active_team_id` GUC 傳給 trigger（比照現有的 `app.current_user_id`，`app/db/triggers.py:48-51`）。只有 mutation 需要計算——audit trigger 本來就只掛 INSERT/UPDATE/DELETE，讀取熱路徑不受影響。

---

## 8. 連帶改動

| 檔案 | 改動 |
|---|---|
| `app/services/admin.py:130-131` | 移除「User already belongs to a different team」檢查——它存在的唯一理由就是一人一 team |
| `app/services/admin.py:71` | `if new_role.kind == "team" and not target.team_uuid` → 改查 `user_team_assign` |
| `app/services/admin.py:96-99` | 「同 kind 取代」→「同 kind + 同 team 取代」 |
| `app/api/v1/endpoints/users.py:13` | `GET /users/me` 增加 `teams[]` 與 `active_team_uuid` |
| `app/api/v1/endpoints/auth/session.py` | 新增 `POST /auth/switch-team` |
| `app/core/security.py:206` | `get_current_user` 加 session 存在性檢查 |
| `app/db/triggers.py` | 加 `app.active_team_id` / `app.authorized_by` GUC 讀取；`user_team_assign` 進 `AUDITED_TABLES` |
| `Spec/008-rbac-authorization/decisions.md` | 加指標，註明 ADR-019 與附錄 A 的 team scope 語意已被 ADR-068 / 074 取代 |

---

## 9. Migration

無正式使用者，不需保守的分階段遷移：

1. 建 `user_team_assign`，把 `users.team_uuid` 的現有值搬進去。
2. `user_role_assign` 加 `team_uuid`，team-kind 的既有列回填為該使用者原本的 team。
3. Drop `users.team_uuid`。
4. `audit_logs` 加 `context JSONB`（**需先與 Dan/Cedric 對齊**）。

---

## 10. 測試計畫

| 類型 | 案例 |
|---|---|
| 安全 | **切換 team 不改變 platform 權限**：super_admin 切到任一 team 後仍持有全部 platform grant |
| 安全 | **無法藉切換取得 platform 權限**：只有 team 角色的使用者切遍所有 team，都拿不到 `super_admin` grant |
| 安全 | 切到非成員的 team → 403 |
| 安全 | 切換後舊 access token → 401（fail-closed） |
| 安全 | 切換後舊 refresh token → 401 |
| 安全 | 被踢出 team 後，該 team 身分的 session → 401；其他 team 身分的 session 不受影響 |
| 功能 | 跨隊不同角色：在 A 隊是 `admin` 可管成員，切到 B 隊是 `member` 則不可 |
| 功能 | zone scope 只看 active team，不含其他隊的 WorkZone |
| 功能 | `active_team = NULL` 時 team / zone scope 皆 `false()` |
| 功能 | 先建後撤：第 3 步失敗時使用者仍持有可用的新 session |
| Audit | 以 `member` 權限可完成的操作 → `authority.kind = "team"` |
| Audit | 超出 team 權限、靠 `super_admin` 才過的操作 → `authority.kind = "platform"` |
| Audit | 角色被刪除後，歷史 log 仍讀得出當時的角色名稱 |
