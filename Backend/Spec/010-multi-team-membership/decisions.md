# Multi-Team Membership — ADR 全集（ADR-068~076）

**Date**: 2026-08-16
**Feature**: 010-multi-team-membership
**Status**: ⏸ **Pending — 共識已定案，後續邏輯待團隊決策後才進實作**
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。前一個編號為 ADR-067。

---

### ADR-068 多 team 成員資格採「一次一個 active team」的切換模型，非權限聯集

**白話**：一個人可以同時屬於好幾個團隊，但同一時間只有一個身分在生效，要換就明確地切換。不是把所有團隊的權限加起來一起用。

**Context**：ADR-019 / ADR-049 附錄 A 訂下「一人一 team」，貫穿整個 scope 引擎。實際情境需要一個人同時是縣府人員與 NGO 志工。三個選項：

- **A. 同時生效（union）**：zone scope 取所有 team 的 WorkZone 聯集。與 ADR-018/021 的 widest-wins union 世界觀一致，無狀態。
- **B. 切換（active team）**：登入後選一個身分，權限只算當前 team。
- **C. union + 角色綁 team**。

A 的致命問題是**稽核答不出「這筆操作代表哪個單位」**——`audit_logs` 只記 `user_uuid`（`app/models/audit.py:24`），沒有 team。在跨機關協作的災防場景，「這是縣府決定的還是慈濟決定的」是實質問題。

**Decision**：採 B。使用者可隸屬多個 team，任一時刻只有一個 active team 生效。

**硬性不變式**：platform 角色（`user` / `data_auditor` / `super_admin`）與 team 完全解耦，恆生效、不被 active_team 過濾。切換 API 只驗成員資格、完全不碰角色授予——**沒有任何路徑能藉切換取得 platform 權限**。

**Consequences**：
➕ 每個操作都有明確的組織歸屬，audit 可回答「以誰的身分做的」。
➕ 權限邊界在任一時刻都是單一、可預測的，不需要推理多隊聯集的結果。
➖ 需要切換 API、token 重簽、session 綁定一整套機制（ADR-069~071），成本明顯高於 A。
➖ 同時要處理兩隊事務的使用者必須來回切換。

**取代關係**：取代 ADR-019 的「一人一 team」，以及 ADR-049 附錄 A 中 team scope 的 `actor.team_uuid` 語意（見 ADR-074）。

---

### ADR-069 active team 為 per-session，簽進 access token 的 `act` claim

**白話**：手機上可以用縣府身分、筆電上同時用慈濟身分，兩邊互不干擾。身分寫在登入憑證裡，改不了。

**Context**：兩個選項：
- **per-session**：存在 session / token 裡，每個裝置各自獨立。
- **per-user**：存 `users.active_team_uuid`，切換後所有裝置一起變。

per-user 的致命問題：同一個人在兩個裝置上同時工作時身分會互相踩到，稽核反而更糊——而稽核正是選擇切換模型的唯一理由（ADR-068）。此外 per-user 若由 audit trigger join `users` 表取值，拿到的是「查詢當下」而非「操作當下」的值，會是錯的。

**Decision**：per-session。active team 簽進 access token 的 `act` claim（JWT 有簽章，不可竄改，安全性等同存於伺服器端）。Redis session 額外存一份僅作為撤銷索引（見 ADR-075），不參與請求授權判斷。

**Consequences**：
➕ 多裝置多身分可並存，符合實際工作情境。
➕ `act` 是請求授權的單一權威來源，不會有「JWT 說縣府、session 說慈濟」的分歧。
➖ 切換身分必須重簽 token（ADR-070），因為 claim 不可變更。
➖ audit 要記 active_team 得多一個 GUC（ADR-076），無法從 DB join 取得。

---

### ADR-070 切換 team = 先建新 session、後撤舊 session，重簽 TokenPair

**白話**：切換身分時先發新的登入憑證，確定拿到了才把舊的作廢。順序反過來的話，中間出錯就會把人鎖在門外。

**Context**：`act` claim 不可變更，切換必然要重簽 token。撤舊與建新的順序有實質差異：先撤後建時，若建立失敗（Redis 異常），使用者變成被登出狀態。

**Decision**：

```
POST /auth/switch-team { team_uuid }
  1. 驗 team_uuid ∈ user_team_assign        （否則 403）
  2. create_session(user, device, active_team=team_uuid)   ← 先建
  3. revoke_session(舊 sid) + 寫入 denylist                 ← 後撤
  4. 回傳新的 TokenPair
```

只影響當前 session，其他裝置不受影響（per-session 的必然結果）。

**Consequences**：
➕ 任何步驟失敗都不會把使用者鎖在門外——最壞情況是切換沒成功，維持原身分。
➖ 第 3 步失敗時會短暫留下兩個有效 session。舊 session 的 refresh TTL 到期後自然消失，且舊身分本來就是使用者自己合法持有的，風險可接受。
➖ 客戶端必須替換儲存的 refresh token，不能沿用。

---

### ADR-071 access token 撤銷：fail-closed 的 session 存在性檢查 + `denylist:sid` 撤銷記錄

**白話**：每次請求都確認這個登入階段還活著；登出或被踢時直接把它刪掉，憑證立刻失效。另外單獨記一筆「這個階段是被誰、為什麼撤掉的」，之後有人拿著作廢的憑證來打，就抓得到。

**Context**：目前 access token 是**純無狀態**的——`get_current_user` 只解 JWT 取 `sub` 撈 user（`app/core/security.py:206-212`），從不驗證 `sid`。所以 `/auth/logout` 只殺得掉 refresh token，access token 仍可用滿 `ACCESS_TOKEN_EXPIRE_MINUTES = 15`。這是一個既有的洞，不只影響本功能。

**Decision**：分兩層，職責分離。

| 層 | 機制 | 職責 |
|---|---|---|
| **攔截** | 每 request 檢查 `session:{sid}` 存在，不存在即 401（**fail-closed**） | 擋下所有失效 token。撤銷 = `DEL session:{sid}` |
| **記錄** | `denylist:sid:{sid}` = `{reason, revoked_by, revoked_at}`，`EX` = access token 壽命 | 回答「為什麼被擋」；命中即盜用訊號 |

兩把 key 以一次 `MGET` 取得，不增加 round trip。denylist 的 TTL 到期自動消失——之後 token 本來就過期了，不需要清理排程。

**為何保留 denylist（它不是攔截機制）**：session 存在性檢查已足以攔截，但它無法區分「自然過期」與「被強制撤銷後仍被使用」。denylist 提供後者的訊號——正常客戶端拿到 401 會去重新登入，不會拿著已撤銷的 token 連續打。這正是 XSS 或憑證外洩的偵測點，與既有的 refresh token 重放偵測同構（`app/repositories/session_repository.py:88-93` 的 `refresh_used:` NX 宣告 → `RefreshTokenReuse`）。access token 目前缺的就是同一套東西。

**Consequences**：
➕ 順帶修好 `/auth/logout` 殺不掉 access token 的既有洞。
➕ 登出／踢人立即生效，不再有 15 分鐘視窗。
➕ 憑證外洩有可觀測的訊號。
➖ 每個請求多一次 Redis `MGET`（本來就有 Redis 連線，約 0.2ms）。
➖ **fail-closed**：Redis 資料遺失（重啟未持久化、eviction）會導致全站立即 401、強制重新登入。這是明確選擇的失敗模式——寧可全體重新登入，不接受已撤銷的憑證復活。

---

### ADR-072 成員資格獨立為 `user_team_assign` 表；`users.team_uuid` 移除

**白話**：「你屬於哪些隊」跟「你在隊裡能做什麼」分成兩張表。調權限的 API 不該有踢人出隊的副作用。

**Context**：ADR-073 讓 `UserRoleAssign` 帶 `team_uuid` 之後，成員資格其實可以不另外存——「屬於慈濟」＝「有一列指向慈濟的 team-kind 角色」。但這樣 `DELETE /users/{u}/role/{r}`（`app/api/v1/endpoints/rbac_admin.py:193`）會變成「順手把人踢出團隊」，一個純粹的權限操作產生組織關係的副作用。

**Decision**：獨立 `user_team_assign(user_uuid, team_uuid)` 表，`UNIQUE(user_uuid, team_uuid)`。`users.team_uuid` 移除，現有值搬進新表，不保留為「預設 team」。

**登入後的預設 active team**：取最早加入的一隊；無任何 team 者為 `NULL`（純市民即為此類），此時 team / zone scope 一律 `false()`，與現行 `actor.team_uuid is None` 的行為一致。

**Consequences**：
➕ 語意乾淨：`user_team_assign` 管「能不能切過去」，`UserRoleAssign.team_uuid` 管「切過去能做什麼」。
➕ 既有 RBAC 管理 API 不會有意外的組織關係副作用。
➖ 兩張表需保持一致（有角色但非成員 = 髒資料），靠 FK 與 use-case 層檢查擋。
➖ 移除 `users.team_uuid` 波及所有讀取它的位置（`app/core/rbac_scopes.py`、`app/services/admin.py`、`app/schemas/admin.py`）。

**為何不保留為預設 team**：留著就有兩份真相，`rbac_scopes.py` 每個讀取點都得決定信哪一個。

---

### ADR-073 team 角色 per-team 授予：`UserRoleAssign.team_uuid`；platform 角色恆為 NULL

**白話**：同一個人可以在 A 隊當隊長、在 B 隊只是隊員。而 super_admin 這種平台角色不屬於任何隊，永遠有效。

**Context**：`UserRoleAssign` 目前刻意不帶 `team_uuid`（`app/models/rbac.py:7-10`），理由是「一人一 team，存第二次是雙重事實來源」（ADR-039）。該前提被 ADR-068 取代後，此欄位變成必要。

不加的話有實質權限外洩：在縣府是 `admin`（持 `team.member_manage` 的 team scope）的人，切到慈濟後**照樣是 admin**，可以管慈濟的成員。

**Decision**：`UserRoleAssign` 新增 nullable `team_uuid`，FK 到 `teams.uuid`。DB CHECK 強制：platform-kind 角色恆為 `NULL`、team-kind 角色恆 `NOT NULL`。`resolve_scope` 只採計 `team_uuid IS NULL`（platform）或 `team_uuid = active_team`（team）的授予。

`assign_role` 的「同 kind 取代」邏輯（`app/services/admin.py:96-99`）改為「同 kind + 同 team 取代」。

**Consequences**：
➕ 支援跨隊不同角色，符合真實組織情境。
➕ DB 層擋掉「super_admin 綁在某個 team 上」這種資料。
➕ platform 角色因 `team_uuid IS NULL` 而天然不參與 active_team 過濾，ADR-068 的硬性不變式由 schema 保證，不靠程式碼自律。
➖ `resolve_scope()` signature 從 `(actor, perm, db)` 變成 `(actor, perm, db, active_team)`，波及 `PermissionChecker`、`require_scope`、GraphQL `check_permission` 三個呼叫點。
➖ `_request_rbac_cache` 的 key 從 `actor.uuid` 變成 `(actor.uuid, active_team)`。
➖ 擴散到全部既有 RBAC 測試。

**取代關係**：取代 ADR-039（`UserRoleAssign` 不帶 `team_uuid`）。

---

### ADR-074 team / zone scope 以 active team 判定，不做多隊聯集

**白話**：你現在代表哪一隊，就只看得到那一隊的範圍。

**Context**：`rbac_scopes.py` 現行實作全部讀 `actor.team_uuid`——team scope 比對它（`:78-83`、`:124-129`），zone scope 用它 join `team_zone_assign` 取 WorkZone（`:87-96`、`:134-139`）。

**Decision**：全部改以 active team 判定。不做多隊 WorkZone 聯集。`active_team = NULL` 時 team / zone scope 一律 `false()`。

**Consequences**：
➕ 資料邊界在任一時刻單一且可預測，與 ADR-068 的切換模型一致。
➖ 需要同時看兩隊轄區的使用者必須切換兩次。
➖ 這是 ADR-068 選擇切換而非 union 的直接代價，接受。

**取代關係**：修訂 ADR-049 附錄 A 中 team scope 的定義——「`resource.team_uuid == actor.team_uuid`（一人一 team，`users.team_uuid`）」改為以 active team 判定。ADR-049 的純地理 zone 模型本身不受影響。

---

### ADR-075 成員資格異動時，選擇性撤銷 active_team 命中的 session

**白話**：把某人踢出某隊時，只把他「以那一隊身分」登入的裝置踢掉，其他裝置不動。

**Context**：active team 被烘進 JWT 的 `act` claim（ADR-069），所以被移出團隊後，手上那把以該 team 身分簽發的 token 還能再用滿 15 分鐘。三個選項：全部踢掉 / 只踢相關的 / 不處理。

「全部踢掉」在災防現場是實際困擾（有人正在填表就被登出）；「不處理」讓「踢出團隊」這個動作變得不可信。

**Decision**：只撤銷 `active_team` 命中該 team 的 session。Redis session 記錄額外存一份 `active_team` 作為撤銷索引——寫入時同步、僅供伺服器端撤銷用，不參與請求授權判斷（授權一律讀 JWT 的 `act`）。

同一機制適用於 **team 被軟刪除**。

**撤角色不撤 session**：`resolve_scope` 每 request 查 DB，撤角色本來就即時生效；只有「成員資格」需要撤 session，因為它被烘進了 token。

**Consequences**：
➕ 撤銷精準，不影響無關的裝置。
➕ 「踢出團隊」立即生效。
➖ Redis session 多存一份 `active_team`，寫入時需與 JWT 同步。這不違反單一真相原則——它是索引，不是權威來源。

---

### ADR-076 `audit_logs` 加 `context JSONB`，記錄 active_team、capability 與最小必要權力歸因

**白話**：每筆異動除了記「誰改的」，還記「他當時代表哪個單位」「用的是哪一個權限」。而且記的是**最小必要的那個權限**——如果他用一般隊員身分就做得到，就記隊員；只有超出隊員權限時才記成 super_admin。

**Context**：ADR-068 選擇切換模型的唯一理由是稽核可答「代表哪個單位」。不記 `active_team` 的話，整套切換機制的成本全部白付。

而 super_admin 的 grant 幾乎都是 `all` scope，union 後會吃掉一切——切到某個 team 對他的權限邊界毫無作用。與其讓切換對 super_admin 形同虛設（或反過來讓切換降權，那會引入「切換會改動 platform 權限」的路徑，與 ADR-068 的不變式牴觸），不如**誠實歸因**：不降權，但記錄這次操作實際上是靠哪一個 grant 過關的。

**Decision**：`audit_logs` 新增 `context JSONB`：

```json
{
  "active_team": { "uuid": "550e8400-...", "name": "慈濟基金會" },
  "cap": "ticket.edit",
  "authority": { "kind": "platform", "role": "super_admin" }
}
```

- `kind` ∈ `platform` / `team` / `direct`；`kind = "team"` 時不需再記 team，依定義即 active_team。
- **快照而非參照**：一律同時存 uuid 與**當時的**名稱。`Role` 沒有 `TimestampMixin`（`app/models/rbac.py:19`），`DELETE /rbac/roles/{uuid}` 是硬刪除且可改名（`rename_role`），UUID 不保證解得開。`Team` / `User` 有軟刪除不會斷鏈，但仍存 name 以求可讀。
- **歸因策略 = 最小必要權力**：由窄到寬試每個 grant，第一個通過 `in_scope()` 的即為決定性 grant。

`get_user_permissions()` 目前在最後一行丟掉出處（`app/repositories/auth_repository.py:62`：`{key: widest(scopes) ...}`），需改為保留 `role_name` + `team_uuid` + 來源類型。

寫入路徑透過 `app.active_team_id` / `app.authorized_by` GUC 傳給 trigger（比照 `app.current_user_id`，`app/db/triggers.py:48-51`）。

**Consequences**：
➕ 稽核可回答「以哪個單位、憑哪個權限」，這是 ADR-068 的價值兌現點。
➕ 「查 super_admin 有沒有濫用權限」不再一堆假警報——他用隊員身分就能做的事不會被記成 super_admin。
➕ 用 JSONB 而非兩個獨立欄位：日後要多記 request_id、來源介面等 context **不需要再改 schema**。
➕ 成本比預期低：`require_scope` 現行在 scope 為 `all` 時直接跳過 checkpoint 2（`app/services/authz.py:33`），改為由窄到寬試之後，`own` / `team` 是純欄位比對不查 DB，最壞情況只多一次 zone 的 `ST_Contains` 查詢，且只發生在 widest 為 `all` 的使用者做 mutation 時。
➕ 只有 mutation 需要計算——audit trigger 只掛 INSERT/UPDATE/DELETE，讀取熱路徑不受影響。
➖ `get_user_permissions` 回傳型別變更，連帶 `resolve_scope` 與 request cache。
➖ 在安全關鍵路徑加入迴圈，需要完整測試覆蓋。
➖ 不記就永久遺失，事後無法推導——決定性 grant 取決於當下的資源座標與當時的 zone 指派，而 `work_zones` 與 `team_zone_assign` 都會變動。

**不塞進 `old_values` / `new_values`**：那兩個是 `to_jsonb(OLD/NEW)` 的整列快照，混入非欄位資料會破壞語意，任何比對 diff 的工具都會被騙。

**⚠️ 跨票相依**：`audit_logs` 的讀取層由 backend-Dan/Cedric 的「Ticket/Resource Station History（版本歷史）」負責，加欄位前需與其對齊。
