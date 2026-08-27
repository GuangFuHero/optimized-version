# Multi-Team Membership — ADR 全集（ADR-068~076、096、097）

**Date**: 2026-08-16（初版）／**2026-08-19 重大改版**
**Feature**: 010-multi-team-membership
**Status**: ✅ **定案待實作**（2026-08-19 拍板；ADR-068 的地基決策已確定，不再等團隊背書）
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。068~076 為本票初版佔號；096~097 為改版新增（077~095 已由 011/012/013 佔用）。

---

## 改版摘要（2026-08-19）

初版採「切換 **active team**」——platform 角色（`super_admin` 等）**恆生效、不被切換影響**，是明文的硬性不變式。

改版後採「切換 **完整身分**」——**platform 角色也會被切走**，`super_admin` 切到 team 身分時是真的降權。

| ADR | 初版 | 改版後 |
|---|---|---|
| 068 | 切換 active team；platform 恆生效 | **改寫**：切換完整身分，含 platform 降權 |
| 069 | active team 在 `act` claim | 保留，`act` 改為身分；補前端記憶與預設身分 |
| 070 | 先建 session 後撤舊 session | **大幅簡化**：不動 session |
| 071 | access token 撤銷 / fail-closed | **撤回** → 移至 `Spec/014-session-revocation` |
| 072 | 獨立 `user_team_assign` 表 | **撤回**：有角色即是成員 |
| 073 | `UserRoleAssign.team_uuid` | 保留並**擴充**至 `UserPermissionAssign`、修正唯一鍵 |
| 074 | scope 以 active team 判定 | **改寫**：以 active identity 判定 |
| 075 | 成員資格異動時選擇性撤銷 session | **撤回**：被 ADR-096 取代 |
| 076 | audit context + 最小必要權力歸因迴圈 | **大幅簡化**：刪除迴圈，只記身分快照 |
| 096 | — | **新增**：身分失效時請求與 refresh 雙路擋下 |
| 097 | — | **新增**：team 角色必須自給自足 |

---

### ADR-068 多 team 成員資格採「完整身分切換」；一次只有一個身分生效，platform 角色亦然

**白話**：一個人可以有好幾個身分（平台管理員、縣府隊長、慈濟志工），但同一時間只有一個在生效。切到志工身分時，管理員權限**是真的關掉的**，不是留著。

**Context**：ADR-019 / ADR-049 附錄 A 訂下「一人一 team」，貫穿整個 scope 引擎。實際情境需要一個人同時是縣府人員與 NGO 志工。

初版曾以「聯集案（union）稽核答不出『這筆操作代表哪個單位』」為由否決聯集、選擇切換。**該理由在改版時被判定為循環論證並撤回**：它引用的是「`audit_logs` 只記 `user_uuid`」這個當時的 schema 限制（`app/models/audit.py:22-24`），而同一份文件的 ADR-076 做的事正是移除該限制。把 ADR-076 套到聯集案上，聯集案的「致命傷」就不存在——每個 team-kind 的 grant 在 ADR-073 之後都帶著 `team_uuid`，歸因迴圈在聯集下照樣跑得出來。

**Decision**：採完整身分切換。

- **身分 = `user_role_assign` 的一列**（role + 選填 team）。
- 一個帳號恰有一個 platform 角色（`assign_role` 的同 kind 取代語意，`app/services/admin.py:74-99`）+ 0..N 個 team 角色。
- 任一時刻只有一個身分生效；**platform 角色同樣會被切走**。

**硬性不變式（取代初版的「platform 角色恆生效」）**：

> 切換只能在使用者**已持有的身分**之間移動，不能創造新身分。切換 API 只驗清單成員資格，**永不寫入任何授予**。

降權是安全方向；切回高權限身分不是「取得」而是「回到已持有的」。這是 AWS assume-role / GCP service account impersonation 的標準模型。

**Consequences**：
➕ **最小權限可實踐**：`super_admin` 可主動降權做日常操作，減少誤觸高權限的風險。這是選擇切換模型的真正理由，比初版的稽核論據更站得住。
➕ 每個操作都有明確的組織歸屬，且**身分即權威**——不需要推論「這次實際靠哪個 grant 過關」（見 ADR-076）。
➕ 權限邊界在任一時刻單一、可預測。
➖ 需要切換 API 與 token 重簽（ADR-069/070），成本高於聯集案。
➖ 同時要處理兩隊事務的使用者必須來回切換。
➖ 曝出既有的 seed 缺陷：team 角色並非自給自足（見 ADR-097）。

**取代關係**：取代 ADR-019 的「一人一 team」，以及 ADR-049 附錄 A 中 team scope 的 `actor.team_uuid` 語意（見 ADR-074）。

**這條 ADR 是整票的地基**——069~076、096、097 全部建立在「一次只有一個身分生效、platform 角色亦然」之上。2026-08-19 拍板定案。

---

### ADR-069 active identity 為 per-session，簽在 access token 的 `act` claim；預設為 platform 身分，記憶由前端保存

**白話**：手機上可以用志工身分、筆電上同時用管理員身分，互不干擾。當前身分寫在登入憑證裡改不了。下次登入時，各裝置各自記得自己上次用哪個身分。

**Context**：per-session vs per-user。per-user（存 `users.active_identity`）的致命問題是同一個人在兩個裝置上同時工作時身分會互相踩到。

**Decision**：

1. **per-session**，簽進 access token 的 `act` claim。
2. **`act` 的內容是 `(role_uuid, team_uuid)`**，不是 `user_role_assign.uuid`。兩者資訊等價（唯一鍵含 team 後），但前者在「刪掉再重加同一筆授予」時不會誤觸登出，且能跨 `rename_role`（`app/services/rbac_admin.py`）存活。
3. **session 不存 `act`**。JWT 是唯一真相；`POST /auth/refresh` 由前端帶上當前 identity，伺服器驗證後簽進新 token。
4. **預設身分 = 該使用者的 platform 身分**。每人恰有一個（同 kind 取代保證），所以這個預設永遠存在、唯一、無歧義，且與現行「platform 角色恆生效」的行為最接近。
5. **「記住上次的身分」由前端保存**，存在 NextAuth 的 session cookie 裡。

**為何記憶放前端**：後端的 `device` 欄位只是 User-Agent 字串（`app/api/v1/endpoints/auth/deps.py:23`）——瀏覽器更新就變、同型號手機完全一樣，**不能當 per-device 的 key**。伺服器端只能做 per-user 記憶，而那會讓「筆電當管理員、手機當志工」的人兩邊預設值互相覆蓋。前端 NextAuth 已有一個 http-only 的 session cookie，**後端的 access/refresh token 本來就存在裡面**（`Frontend/apps/demo/src/lib/server-backend-auth.ts:113-114`），多存一個 `activeIdentity` 是零額外基礎設施、零額外風險，且 cookie 天然一瀏覽器一份。

**為何 `act` 放 JWT 而非 session**：曾考慮把 `act` 存在 Redis session（`Spec/014` 本來就會為每個請求讀一次 session，增量成本為零，且切換可即時生效、無並存視窗）。否決理由是**前端負擔**：

- 前端已有現成的 token 處理管線（`applyTokenPairToBackendAuthToken`），切換只要把新的 access token 併進去即可，幾乎零新邏輯；存 session 則要新寫一套身分狀態管理。（注意：**不能整包丟給該 helper**——它會把 refresh token 覆蓋成 `undefined`，見 ADR-070 的回應格式。）
- 前端可直接解 JWT payload 讀 `act`，永遠知道當前身分，不必額外呼叫 API。
- 同一瀏覽器的多個分頁共用 session，存 session 會讓「分頁 A 切換身分」**默默改變分頁 B 的行為**而 B 的畫面毫無所覺。

**Consequences**：
➕ 多裝置多身分並存，符合實際工作情境。
➕ `act` 是請求授權的單一真相，不會有「JWT 說 A、session 說 B」的分歧。
➕ **本票不依賴 `Spec/014`**。
➖ 切換身分必須重簽 token（claim 不可變更）。
➖ 舊 access token 在切換後仍有效至多 15 分鐘（`ACCESS_TOKEN_EXPIRE_MINUTES`），期間兩個身分並存。**判定可接受**：兩個身分都是使用者合法持有的，不構成提權；且 per-session 模型本來就允許多身分同時存在（手機一個、筆電一個）。
➖ 前端必須在 refresh 時帶上 identity，否則會被退回預設身分。這要寫進 API 契約。

---

### ADR-070 切換端點：獨立、不動 session、不綁任何 capability

**白話**：切換身分就是換一組新憑證，不碰登入階段本身。而且這個動作**不能要求任何權限**，否則降權之後可能連切回來的權限都沒有，把自己鎖死。

**Context**：初版設計為「先建新 session → 撤舊 session → 回傳新 TokenPair」，用意是讓舊身分的 token 立即失效。改版後 `act` 不再與 session 綁定（ADR-069），整套 session 操作變得沒有必要。

**Decision**：

```
POST /auth/switch-identity { role_uuid, team_uuid? }
  1. 驗該身分屬於呼叫者（user_role_assign 有對應列，且 team 未被軟刪除）→ 否則 403
  2. 以新的 act 簽發 access token
  3. 回傳 AccessTokenResponse（只有 access token —— refresh token 不輪替、也不回傳）
```

**不動 session、不撤舊 session、不輪替 refresh token。**

**切換端點不得綁任何 capability**——任何已登入者都能切到自己持有的身分。這是硬性要求：若綁了權限，降權後可能失去切換能力而被鎖在低權限狀態。

**為何仍保留獨立端點**：ADR-069 讓 `/auth/refresh` 也接受 identity 並驗證，技術上「用不同 identity 去 refresh」就等於切換，端點是可省的。仍保留的理由是——切換不該順帶輪替 refresh token；且 log 與稽核上分得出「這是一次刻意的切換」而非「例行換發」；日後要為切換單獨加速率限制也有地方掛。

**Consequences**：
➕ 實作大幅簡化：無 session 操作、無先建後撤的順序考量、無鎖死風險。
➕ 回傳形狀與 login/refresh 一致，前端重用既有管線。
➖ 舊 access token 的並存視窗（見 ADR-069 的取捨）。

---

### ~~ADR-071 access token 撤銷~~（**撤回** — 移至 `Spec/014-session-revocation`）

初版把「每請求檢查 `session:{sid}` 存在（fail-closed）+ `denylist:sid` 撤銷記錄」放在本票。

**撤回理由**：它修的是一個**與多 team 完全無關的既有安全洞**——`get_current_user` 只解 JWT 取 `sub` 撈 user（`app/core/security.py:206-212`），從不驗證 `sid`，所以 `/auth/logout` 只殺得掉 refresh token，access token 仍可用滿 15 分鐘。

該問題與本票的排程無關，且它同時是 Notion「移除後台權限，回去原有登入狀態」那張子票缺的最後一塊（撤角色即時生效已經成立——權限每請求從 DB 解析、不烘進 JWT；缺的只有強制失效的能力）。已拆為獨立的 `Spec/014-session-revocation`。

**注意**：本票**不依賴** Spec 014（見 ADR-069 的 `act` 位置決策）。兩者可各自獨立落地。

---

### ~~ADR-072 成員資格獨立為 `user_team_assign` 表~~（**撤回**）

初版主張把成員資格獨立成表，理由是避免 `DELETE /users/{u}/role/{r}`（`app/api/v1/endpoints/rbac_admin.py:193`）產生「順手把人踢出團隊」的副作用。初版自己也記下了代價：「➖ 兩張表需保持一致（有角色但非成員 = 髒資料）」。

**撤回理由**：在完整身分切換模型下，那個「髒資料」升級成**安全漏洞**。身分清單來自 `user_role_assign`；若把某人從 `user_team_assign` 移除（踢出慈濟）卻沒撤角色，那筆 `member@慈濟` 的授予還在，他**照樣切得過去**——「踢出團隊」變成無效操作。

要補洞只有兩條路：切換時同時驗兩張表（兩表就綁死了，分離的意義大減），或踢出團隊連帶撤角色（那正是初版想避免的副作用）。兩條路都讓分離失去價值。

**改採**：**有角色即是成員**。

- 成員資格 = 你在該 team 持有的角色集合。
- 加入團隊 = 授予該團隊的一個角色。
- 踢出團隊 = 撤銷該團隊的所有授予（單一動作）。
- `users.team_uuid` 仍然移除，由 `user_role_assign.team_uuid` 取代。

**連帶改動**：
- `app/services/admin.py:71` 的「必須先屬於某 team 才能授予 team 角色」前置檢查**消失**——授予 team 角色就是入隊。
- `app/services/admin.py:130-131` 的「User already belongs to a different team」檢查移除。
- `POST /teams/{t}/members` 的 `team_role_name` 從選填變為必要（或預設 `member`）——沒有角色就不算成員。

**取捨**：「已入隊但尚未授予角色」這個狀態無法表達。判定可接受——該狀態下使用者在系統中什麼都做不了，那個成員資格沒有行為意義。

---

### ADR-073 授予帶 `team_uuid`：`UserRoleAssign` 與 `UserPermissionAssign` 皆是；唯一鍵一併修正

**白話**：同一個人可以在 A 隊當隊長、在 B 隊只是隊員。而 super_admin 這種平台角色不屬於任何隊。

**Context**：`UserRoleAssign` 目前刻意不帶 `team_uuid`（`app/models/rbac.py:51-57` 的 docstring），理由是「一人一 team，存第二次是雙重事實來源」（ADR-039）。該前提被 ADR-068 取代後，此欄位變成必要——否則在縣府是 `admin`（持 `team.member.manage` 的 team scope）的人，切到慈濟後**照樣是 admin**，可以管慈濟的成員。

**Decision**：

```sql
ALTER TABLE user_role_assign       ADD COLUMN team_uuid UUID NULL REFERENCES teams(uuid);
ALTER TABLE user_permission_assign ADD COLUMN team_uuid UUID NULL REFERENCES teams(uuid);
```

- platform-kind 授予恆 `NULL`、team-kind 授予恆 `NOT NULL`，以 DB CHECK 強制（需 join `roles.kind`，實作上以 trigger 或冗餘 `role_kind` 欄位達成，落地時決定）。
- **唯一鍵必須一併修正**（初版漏了這點）：
  - `uq_user_role`：`(user_uuid, role_uuid)` → **`(user_uuid, role_uuid, team_uuid)`**。同時是 `member@慈濟` 與 `member@紅十字會` 是**同一個 `role_uuid` 用兩次**，現有約束會直接擋下。
  - `uq_user_perm`：`(user_uuid, permission_uuid)` → **`(user_uuid, permission_uuid, team_uuid)`**。
- `resolve_scope` 只採計 `team_uuid IS NULL`（platform 身分時）或 `team_uuid = active_team`（team 身分時）的授予。
- `assign_role` 的「同 kind 取代」改為「同 kind + 同 team 取代」。

**為何 `UserPermissionAssign` 也要加**（初版完全沒提到這張表）：直接授予是繞過角色的第三條授權管道（ADR-018：`effective = 平台 grants ∪ team grants ∪ 直接 grants`），有活的 REST 端點（`PUT /rbac/users/{u}/permissions/{cap}`，`app/api/v1/endpoints/rbac_admin.py:109`）。它既沒有 role 也沒有 team，在身分切換下無處可歸。而且**它的 scope 本身就依賴 team 脈絡**——一筆 `scope="zone"` 的直接授予，在 platform 身分下 zone 解為 `false()`（靜默失效），在 team 身分下才有意義。所以「直接授予恆生效、不受身分影響」在 team/zone scope 下根本無法成立。加上 `team_uuid` 後規則與角色授予完全平行：`NULL` = 在 platform 身分下生效，有值 = 在該 team 身分下生效。

`user_permission_assign` 目前 seed 建 0 筆、僅測試在用，且專案無正式使用者，改形狀無遷移包袱。

**Consequences**：
➕ 支援跨隊不同角色，符合真實組織情境。
➕ DB 層擋掉「super_admin 綁在某個 team 上」這種資料。
➕ 三條授權管道規則一致，不留例外。
➖ `resolve_scope()` signature 從 `(actor, perm, db)` 變成 `(actor, perm, db, active_identity)`，波及 4 個呼叫點（`app/core/security.py:271`、`app/graphql/tickets/types.py:385`、`app/services/authz.py:29`）。
➖ `_request_rbac_cache` 的 key 從 `actor.uuid` 變成 `(actor.uuid, active_identity)`。
➖ 擴散到全部既有 RBAC 測試。

**取代關係**：取代 ADR-039（`UserRoleAssign` 不帶 `team_uuid`）。

---

### ADR-074 team / zone scope 以 active identity 判定，不做多隊聯集

**白話**：你現在是哪個身分，就只看得到那個身分的範圍。

**Context**：`app/core/rbac_scopes.py` 現行實作全部讀 `actor.team_uuid`——team scope 比對它（`:81-82`、`:124-129`），zone scope 用它 join `team_zone_assign` 取 WorkZone（`:87-94`、`:134-139`）。

**Decision**：全部改以 active identity 的 team 判定。不做多隊 WorkZone 聯集。active identity 為 platform 身分（無 team）時，team / zone scope 一律 `false()`。

**`users.team_uuid` 移除的波及**：全 codebase 共 27 處 `.team_uuid` 引用，其中——
- **8 處在核心 scope 引擎**（`rbac_scopes.py`），機械替換。
- **4 處根本不是 `users.team_uuid`**（是 `TeamZoneAssign.team_uuid` 等別張表），不受影響。
- **`app/services/work_zone.py:32` 的語意完美轉譯**：`if actor.team_uuid is None` 原意是「platform 角色持有者，不受 gov-only 限制」（ADR-064 / `GOV_TEAM_ONLY_PERMS`），新模型下就是「active 身分是 platform 身分」，行為不變。
- **`AdminUserListItem` 被迫改形狀**：`team_uuid` / `team_role` 是單值欄位，但一個人現在可以有多個 team 身分 → 改成清單。

**Consequences**：
➕ 資料邊界在任一時刻單一且可預測，與 ADR-068 一致。
➖ 需要同時看兩隊轄區的使用者必須切換兩次。

**取代關係**：修訂 ADR-049 附錄 A 中 team scope 的定義。ADR-049 的純地理 zone 模型本身不受影響。

**⚠️ 順帶記錄一個既有缺陷（不在本票範圍）**：`WIDTH` 表把 scope 排成 `all > zone > team > own > none`（`app/core/rbac_scopes.py:38-44`），但 **`zone` 與 `own` 實際上不是包含關係**——`widest(own, zone)` 會選 `zone`，導致 team `admin` 刪不掉自己建立在轄區外的 ticket。此缺陷在現行聯集模型下就已存在，非本票造成，另案處理。

---

### ~~ADR-075 成員資格異動時選擇性撤銷 session~~（**撤回** — 被 ADR-096 取代）

初版的問題是「active team 烘進 JWT，被移出團隊後手上的 token 還能再用 15 分鐘」，解法是選擇性撤銷 `active_team` 命中的 session。

**撤回理由**：ADR-096 讓身分失效在**請求路徑與 refresh 路徑雙路擋下**，那 15 分鐘的視窗根本不存在，session 自然變成惰性、隨 TTL 消失。不需要特意去撤。

---

### ADR-076 `audit_logs` 加 `context JSONB`，記錄 active identity 快照

**白話**：每筆異動除了記「誰改的」，還記「他當時用的是哪個身分」。

**Context**：ADR-068 需要稽核答得出「這筆操作代表哪個單位」。`audit_logs` 目前只有 `user_uuid`，沒有身分資訊（`app/models/audit.py:22-24`）。

初版設計了「最小必要權力歸因」：由窄到寬試每個 grant，第一個通過 `in_scope()` 的即為決定性 grant。

**該迴圈在改版後整條刪除。** 它存在的唯一理由是補償初版「切換對 super_admin 形同虛設」的缺陷——初版自己寫道：

> super_admin 的 grant 幾乎都是 `all` scope，union 後會吃掉一切——切到某個 team 對他的權限邊界毫無作用。與其讓切換對 super_admin 形同虛設（**或反過來讓切換降權，那會引入「切換會改動 platform 權限」的路徑**），不如誠實歸因。

ADR-068 改版正是採用了括號裡被否決的那條路。缺陷消失，**active identity 就是 authority，不需要推論**。

**Decision**：`audit_logs` 新增 `context JSONB`：

```json
{
  "identity": {
    "role_uuid": "...", "role": "member",
    "team_uuid": "...", "team": "慈濟基金會"
  }
}
```

- **快照而非參照**：一律同時存 uuid 與**當時的**名稱。`Role` 沒有 `TimestampMixin`（`app/models/rbac.py:50`），`DELETE /rbac/roles/{uuid}` 是硬刪除且可 `rename_role`，UUID 不保證解得開。`Team` 有軟刪除不會斷鏈，但仍存 name 以求可讀。
- platform 身分時 `team_uuid` / `team` 為 `null`。
- 透過 `app.active_identity` GUC 傳給 trigger（比照現有的 `app.current_user_id`，`app/db/triggers.py:49`）。
- **不記 `cap`**（憑哪個 capability 過關）。identity 已回答 ADR-068 要的問題，而「做了什麼」已有 `table_name` / `action` / `old_values` / `new_values`。`cap` 需要授權層額外設一個 GUC，且一個請求改多張表時語意模糊。用 JSONB 的好處正是日後真要補不必改 schema。

**Consequences**：
➕ 稽核可回答「以哪個身分做的」，這是 ADR-068 的價值兌現點。
➕ **成本從「安全關鍵路徑上的迴圈」降為「一個 GUC」**。初版列的缺點「➖ 在安全關鍵路徑加入迴圈，需要完整測試覆蓋」與「➖ `get_user_permissions` 回傳型別變更」**全部消失**。
➕ JSONB 讓日後補 request_id、來源介面等 context 不需改 schema。
➖ 不記就永久遺失，事後無法推導。

**不塞進 `old_values` / `new_values`**：那兩個是 `to_jsonb(OLD/NEW)` 的整列快照，混入非欄位資料會破壞語意，任何比對 diff 的工具都會被騙。

**跨票相依（已解除）**：初版註記「`audit_logs` 的讀取層由 backend-Dan/Cedric 的『Ticket/Resource Station History（版本歷史）』負責，加欄位前需與其對齊」。**2026-08-18 該子項目已在 Notion 上移交給 backend-Popo**，兩張票同屬一人，不再需要跨組協調。兩者仍應一起設計 `audit_logs` 的形狀。

---

### ADR-096 身分失效時，請求路徑與 refresh 路徑雙路擋下；使用者被登出

**白話**：管理員把某人的身分撤掉時，他手上的憑證應該立刻不能用，而且也不能靠換發憑證繞過去——兩條路都擋，結果就是被登出。

**Context**：`act` 簽在 JWT（ADR-069），所以身分被撤銷後，手上那把 token 仍宣稱著已不存在的身分。三種失效路徑：角色授予被撤銷、角色本身被硬刪除、team 被軟刪除。

曾考慮「自動退回 platform 身分」（維持登入、權限降級），理由是 Notion 子票名為「移除後台權限，**回去原有登入狀態**」。否決：使用者要的是明確拒絕，而非靜默降權——靜默降權會讓當事人不知道自己的權限已經變了。「回去原有登入狀態」透過重新登入達成（重新登入後預設即 platform 身分，見 ADR-069）。

**Decision**：

| 路徑 | 行為 |
|---|---|
| 一般請求 | `act` 對不上任何有效授予 → **401** |
| `POST /auth/refresh` | 同上 → **401**（不換發） |

兩路皆擋 ⇒ 使用者被登出，必須重新登入。

**觸發條件精確定義**：是「**`act` 指向的那筆授予不存在**」，**不是**「授予集合有任何變動」。因此：

- **新增**身分（加入一個新 team）→ 當前 `act` 不受影響 → **不登出**。
- **提權**（`user` → `super_admin`、`member` → `admin`）→ **會登出**，因為 `assign_role` 是先刪後加（`app/services/admin.py:97-101`），舊那列消失了。這個副作用**已知並接受**：規則單一、無例外、好推理，且提權不頻繁，重新登入後馬上以新身分回來。
- team 被軟刪除 → 該 team 的身分失效 → 登出（驗證需檢查 `Team.delete_at IS NULL`）。

**⚠️ 實作上的硬性約束**：**`act` 的驗證必須在 `rotate()` 之前**。`rotate()` 一執行就燒掉舊 refresh token（`app/repositories/session_repository.py:80` 宣告 `refresh_used:` 旗標），驗證放在它之後會變成「token 燒了卻不發新的」，使用者的重試會被判定為 token 重放而遭 `revoke_session`。這與 `Spec/013` 程式碼審查抓到的 H1 是同一個失效模式，不得重蹈。

**Consequences**：
➕ 撤銷身分立即且徹底生效，沒有 15 分鐘的舊身分視窗，因此不需要 ADR-075 的選擇性 session 撤銷。
➕ 不依賴 `Spec/014`——`act` 驗證本來就要查 DB，`get_user_permissions` 的查詢即可順帶判定。
➖ **前端目前不處理 401**：`Frontend/apps/demo/src/lib/server-backend-auth.ts:71-77` 只依「過期時間」決定要不要 refresh，整個 auth lib 沒有 401 處理也沒有 signOut。API 契約必須明確要求前端在收到 401 時走登出流程，否則使用者會卡在「畫面壞掉但沒被登出」的狀態。**這是本票落地時必須與前端對齊的項目。**
➖ 提權會把當事人踢下線（見上，已知並接受）。

---

### ADR-097 team 角色必須自給自足；補上 `station.contribute`

**白話**：切到志工身分後，不該連「回報站點物資」這種每個市民都能做的事都做不了。

**Context**：完整身分切換曝出一個**既有的 seed 缺陷**。比對 `scripts/seed_rbac.py` 的授予表：

| 角色 | 涵蓋 platform `user` 的 12 項能力？ |
|---|---|
| `super_admin` | ✅ 完全涵蓋 |
| `admin`（team） | ❌ 缺 `station.contribute` |
| `member`（team） | ❌ 缺 `station.contribute` |
| `data_auditor` | ❌ 缺 8 項寫入能力（**刻意**——seed 註解明載「Oversight only — no edit/review/make」）|

現行聯集模型下，team 角色持有者從恆生效的 platform `user` 角色拿到 `station.contribute`，所以這個缺漏**一直被掩蓋著**。切換模型下，慈濟志工切到 `member@慈濟` 身分後會失去「對站點回報物資狀態」的能力——而 `member` 的定位正是「Team field worker: works the team's zone」，現場工作者恰恰是最該做這件事的人。幾乎確定是漏的，不是刻意的。

曾考慮引入「市民基底」（platform `user` 的授予恆生效，可切換身分是基底之上的加項）。否決理由：真正的缺口只有一項，而基底方案要改 `assign_role` 讓 `user` 永不移除，破壞「一人一 platform 角色」的假設，並波及 `AdminUserListItem.platform_role` 等單值欄位——為一個 seed 疏漏付出架構代價。

**Decision**：不引入基底。**每個可切換的行動型身分都必須自給自足**，`seed_rbac.py` 補上 `admin` / `member` 的 `Perm.STATION_CONTRIBUTE: "all"`。

`data_auditor` 列為**已知且刻意的例外**——它是純監督角色，現在就不持有寫入能力（持有 `data_auditor` 而非 `user`），切換模型下行為一致，無回歸。

**Consequences**：
➕ 修掉一個現行模型下看不見的權限缺漏。
➕ 保持「一次一身分」的純粹性，不引入基底這個例外機制。
➖ 日後新增市民能力時，必須記得同步到每個行動型 team 角色。**應以一個回歸測試釘住**：每個行動型身分的能力集合必須涵蓋 platform `user` 的能力集合（`data_auditor` 列為明文例外）。

---

### ADR-098 管理端的 `GET /admin/rbac/users/{uuid}/permissions` 改成逐身分回報

**白話**：一個人有三個身分，「他有什麼權限」這句話就不再有唯一答案。後台要嘛騙人，要嘛把三組都列出來。

**Context**：這個端點原本回一個扁平的 `effective: {capability: scope}`，因為當時「一個人的權限」是所有角色的聯集，確實只有一個答案。ADR-068 之後不是了：`super_admin` + `admin@縣府` + `member@慈濟` 的人，在任一時刻只持有其中一組。端點呼叫的 `get_user_permissions` 現在要求傳入身分，不傳就回空 dict（ADR-074 的 fail-closed 方向），所以照舊呼叫會讓後台顯示「這個人沒有任何權限」——比錯更糟，是反過來的錯。

三個選項：

| 方案 | 取捨 |
|---|---|
| **逐身分（採用）** | 誠實：直接對應「切到哪個身分才有這個權限」。代價是破壞性 schema 變更 |
| 扁平＝所有身分的聯集 | schema 不變，但顯示的是上界而非任一時刻的實況，管理者會以為某人隨時握有 `rbac.edit` |
| 扁平＝只看 platform 身分 | schema 不變，但團隊身分的權限在後台完全隱形，容易誤判某人「沒有權限」 |

聯集方案的失敗模式尤其糟：後台是用來回答「這個人現在能做什麼」的，而聯集回答的是「他最多能做什麼」，兩者在稽核情境下差很多。

**Decision**：`UserPermissionsResponse` 的 `roles` / `effective` 換成 `identities: list[IdentityPermissions]`，每列帶 `role_uuid` / `role` / `team_uuid` / `team` 與該身分的 `effective`。`direct_grants` 保留為扁平（它是使用者層級的資料），但每列帶自己的 `team_uuid`，讓人看得出它綁在哪個身分上。

**Consequences**：
➕ 後台看到的權限與請求時真正生效的權限是同一個東西。
➕ 「為什麼他做不了 X」有了直接答案：他持有 X 的那個身分不是現在這個。
➖ 破壞性 API 變更，前端後台頁面要跟著改；本票只改後端，需與前端對齊。

---

### ADR-159 Alembic revision ID 一律由 alembic 產生,不再手寫

**白話**：手編的 revision ID 會撞號，而 alembic 撞號時**不會報錯**，只發一個警告然後靜默丟掉其中一個 migration。

**範圍**：這是**跨功能的工程慣例**，不只適用於 010。寫在這裡是因為修正的執行點在本分支。

**Context**：本功能的 `a1b2c3d4e5f6_identity_switching.py` 與 PR #32
(`feature/bi-implement`) 的 `a1b2c3d4e5f6_station_operational_status_and_task_completed_at.py`
是**兩個完全不同的 migration，卻共用同一個 revision ID**，parent 也不同
（`e1f2a3b4c5d6` vs `b8f4d2a6e1c3`）。

把兩個檔案同時放進 `alembic/versions/` 實測：

```
UserWarning: Revision a1b2c3d4e5f6 is present more than once
8ebfc3903041 (head)
b7e4c1a90d52 (head)
a1b2c3d4e5f6 (head)
a1b2c3d4e5f6 (head)

ScriptDirectory.get_revision('a1b2c3d4e5f6')
  -> station operational status and task completed_at/canceled_at
```

**只是 `UserWarning`，不是 error。** 部署不會停，另一個 migration 被靜默丟棄、永遠不會執行，
schema 少了一半而沒有任何訊號。這比 multiple-head 危險：multiple-head 會讓
`alembic upgrade head` 大聲失敗，撞號不會。

根因是 revision ID 用**人編的序列**——`a1b2c3d4e5f6`、`e1f2a3b4c5d6`、`c3f2a1b4d5e6`、
`b8f4d2a6e1c3` 一望即知不是隨機值。在同時開著 9 個 PR、其中 7 個帶 migration 的情況下，
人編序列撞號是遲早的事，不是意外。

**Decision**：

1. **revision ID 一律用 `alembic revision` 產生**（`uuid4().hex[-12:]`），不再手寫。
   即使 migration 本身是手寫的（computed column、operator class 這類 autogenerate
   偵測不到的東西），ID 也要由工具產生。
2. 本次把 `a1b2c3d4e5f6` 換成 `90c93167fa66`，在 #37 / #38 / #39 三個分支同步套用
   —— 這三個分支上該檔案是同一個 blob，只改其中一個會讓三者分裂。
   PR #32 是他人的分支，不需要因為我們的命名疏失而改動。
3. **「merge 前重指 `down_revision`」視為機械步驟**，不是流程缺失。Alembic 的
   migration 是單向鏈結串列，parent 硬寫在檔案裡，git rebase 不會改寫它。
   只要有平行分支，誰先 merge 誰贏，後者一定要重指。接受它是例行動作即可。
4. 重指優先於加 merge revision。merge revision 會**永久**留在版本樹裡
   （main 已累積 `c7d8e9f0a1b2`、`8ebfc3903041` 兩個），而且解決不了下一次分岔
   —— 你的 merge revision 和 main 的下一個 migration 依然是兩個 head。

**Consequences**：
➕ 消除撞號這類**靜默**失敗；剩下的 multiple-head 至少會大聲失敗。
➕ 重指 `down_revision` 的成本明確且有界（一個字串），不再被誤當成流程問題來爭論。
➖ 手寫 migration 時多一個步驟：先跑 `alembic revision` 拿 ID，再把內容填進去。
➖ 本次改名要同步三個分支；三者未來若各自 rebase，需確認 ID 仍一致。
⚠️ **本 ADR 不會自動被執行**。CI（`.github/workflows/`）目前只有 `ruff-check.yml`，
   不跑測試、不檢查 migration。要讓撞號與 multiple-head 在 PR 階段被擋下來，
   需要另外加一個 workflow 跑 `alembic heads` 並把 `present more than once`
   視為失敗——**尚未實作，留待後續決定**。
