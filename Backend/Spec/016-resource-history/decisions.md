# Ticket/Resource Station History（版本歷史）— ADR 全集（ADR-127~145）

**Date**: 2026-08-23
**Feature**: 016-resource-history
**Status**: 已實作、已驗證
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/015-bulk-import-export/decisions.md` 的 ADR-126。
**Notion**: 補齊功能 →「系統性 - Ticket/Resource Station History（版本歷史）」（backend-Popo，排 08-18~08-22，2026-08-18 自 Dan/Cedric 移交）

**與既有 ADR 的關係**：本票不推翻任何既有 ADR。ADR-133 補上 `audit_logs` 的索引，那是 `71bd05e07df3` 建表時就缺的，不是任何 ADR 的決定。

**修正 Notion 票面的兩處事實錯誤**：見 ADR-136（「孤立 UUID」不成立）與 ADR-132（「誰配對查 `task_assignments`」查不到已取消的指派）。

---

### ADR-127 歷史用新的 `*.view_history` capability，不重用 `audit.view`

**白話**：看歷史要一把新鑰匙，不是拿稽核員那把。

**Context**：`Perm.AUDIT_VIEW` 早在 RBAC v1 就註冊了（`app/core/permissions.py:102`），但**全 codebase 零使用**——沒有任何讀取 audit 的 API，本票是第一個消費者。矩陣裡它只給 `data_auditor` 與 `super_admin`（`RBAC_RESOURCE_ROLE_MATRIX.md:146`）。而 Notion 的目標明寫「前台、後台皆需要能看到」。兩者直接打架。

三個選項：(A) 一律要 `audit.view`，否決 Notion 的前台需求；(B) 沿用 `ticket.view` / `station.view`，看得到資源就看得到歷史；(C) 新增獨立 capability。

**Decision**：新增 `Perm.TICKET_VIEW_HISTORY = "ticket.view_history"` 與 `Perm.STATION_VIEW_HISTORY = "station.view_history"`。

**Consequences**：
➕ 歷史的可見範圍可以獨立於「看得到這筆資料」調整，不必動 `ticket.view`（它是 `PUBLIC_PERMS` 成員，動它會影響匿名訪客）。
➕ 未來要開放或收緊前台歷史，只要改 seed 的一行。
➖ RBAC 矩陣多兩列、seed 多兩組 grant、多兩組 scope 測試。

**否決 (B) 的理由**：`ticket.view` / `station.view` 在 seed 裡對**所有角色都是 `all`**（`scripts/seed_rbac.py:43,48`），連 Guest 都持有。沿用它等於歷史全站公開，而歷史裡有工作人員姓名與內部審核時間點。

**`audit.view` 沒有被廢**：它在 ADR-130 的 RAW 層仍然是關鍵，只是不再是進入歷史的門票。

---

### ADR-128 `view_history` 的 scope 對齊 `ticket.view_pii`，且團隊角色用 `zone` 而非 `team`

**白話**：誰看得到哪些歷史，跟誰看得到聯絡資訊用同一套分法；團隊看的是自己轄區內的，不是「自己團隊的」。

**Context**：需要決定兩件事——分幾層，以及團隊角色用哪個 scope。

**Decision**：

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| `ticket.view_history` | — | own | all | all | zone | zone |
| `station.view_history` | — | own | all | all | zone | zone |

與現有 `ticket.view_pii` 完全同形。

**Consequences**：
➕ 不發明新的分層語彙，讀矩陣的人一眼看出它跟 PII 同級。
➕ `own` 讓報案人看得到自己那張單的處理歷程，這正是 Notion 前台需求的實質內容。
➖ 兩個 capability 各要測 own/zone/all 三種 scope。

**為什麼不是 `team`**：ADR-049（乙，純地理模型）把 `team_uuid` 從 `base_geometries` 拿掉了。`in_scope()` 的 TEAM 分支讀 `getattr(resource, "team_uuid", None)`，對 ticket/station 一律得到 `None` 而回 `False`（`app/core/rbac_scopes.py:77`）。**發 `team` 給地理資源是一個永遠不成立的授權**。地理資源的團隊邊界只能是 `zone`（工作區域多邊形包含該點）。

---

### ADR-129 欄位揭露走白名單，不是黑名單

**白話**：預設什麼都不給，要給的一個一個列出來；而不是預設全給、把不能給的列出來。

**Context**：audit trigger 寫的是 `to_jsonb(NEW)`——**整列原封不動**，只剝掉 `password_hash`（`app/db/triggers.py:80`）。歷史 API 的原料就是這坨 JSON，不過濾等於把資料表 schema 直接當成 API 回應。

dev DB 裡一列真實的 `tickets` audit 負載就含有 `search_text`——那是**功能 011（搜尋系統）加的反正規化索引欄位**，沒有人為了歷史時間軸決定要顯示它，它是自己跑進 audit 負載裡的。

**Decision**：每張表定一份分層白名單，不在名單上的欄位連欄位名都不出現（RAW 層例外，見 ADR-130）。

**Consequences**：
➕ **fail-closed**：新欄位預設不出現。忘記維護的後果是「少顯示一個欄位」，不是「洩漏一個欄位」。
➕ 白名單同時是這個端點的回應契約，migration 不會悄悄改變 API 形狀。
➖ 加了有價值的新欄位若沒人想到歷史，時間軸會靜默漏掉它——ADR-144 的守衛測試就是為此。

**否決黑名單的理由**：這個專案同時有六條分支在往這些表加欄位，加欄位的人改的是 `tickets` 表，不會想到歷史 API 存在。黑名單的失敗模式是靜默洩漏且無任何錯誤訊號。

---

### ADR-130 四層可見度：一般 / PII / 稽核 / RAW

**白話**：欄位分四級，級別越高要越大的權限；最高一級直接給整列原始 JSON。

**Context**：把「噪音」與「敏感」混為一談是錯的。`search_text` 對 super_admin 一樣沒有意義（看到它從「需要飲用水」變成「需要飲用水 已聯繫」毫無用處），那是可讀性問題；`review_note` 則是有意義但需要權限。

**Decision**：

| 層級 | 內容 | 解鎖條件 |
|---|---|---|
| 一般 | 業務欄位（title/status/priority/type/name/op_hour…） | 過得了 `*.view_history` |
| PII | `contact_name/email/phone`、詳細地址、精確座標 | `ticket.view_pii` 且 in scope，否則遮罩（ADR-141/142） |
| 稽核 | `review_note`、`moderation_status` | `audit.view` |
| RAW | 整列 `old_values` / `new_values` 原始 JSON | `audit.view` |

**Consequences**：
➕ `super_admin` 同時持有 `audit.view=all` 與 `ticket.view_pii=all`（`scripts/seed_rbac.py:65,87`），**自動看得到四層全部，不需要任何特例程式**。
➕ 稽核情境下真的什麼都查得到，白名單不會變成稽核的阻礙。
➖ RAW 層對新欄位不是 fail-closed。

**RAW 層不擴大任何人的實際可見範圍**：`audit.view` 只給 `data_auditor` 與 `super_admin`，這兩個角色在 seed 裡已經是 `ticket.view_pii=all` + `ticket.view=all` + `station.view=all`。它們本來就看得到全部資料，RAW 多給的只是內部欄位。且 `password_hash` 在 trigger 那層就被剝掉，RAW 永遠不含憑證。

---

### ADR-131 聚合到兩跳，涵蓋任務配對與動態欄位

**白話**：一張單的歷史要連它底下的任務、誰接了任務、任務數量改過幾次都算進去。

**Context**：`audit_logs.row_id` 記的是**被改的那一列自己的主鍵**，不是「這件事屬於哪張單」。要湊出一張單的歷史得自己算出哪些 `row_id` 算數：

```
零跳  base_geometries.uuid / tickets.uuid          = 該 uuid 本身
一跳  ticket_tasks.ticket_uuid / secondary_locations.geometry_uuid
      station_properties.station_uuid
兩跳  task_assignments.task_uuid / task_properties.task_uuid  （經由 ticket_tasks）
```

`task_assignments` 沒有 `ticket_uuid` 欄位（`app/models/ticket_task.py:60`），它只有 `task_uuid`。而 Notion 的驗收條件明寫要看到「誰配對任務」。

**Decision**：全部納入，兩跳。station 側沒有兩跳（子表都直接掛 station uuid），這個深度只影響 ticket。

**Consequences**：
➕ 唯一能滿足 Notion「誰建立、誰編輯、誰配對」三件的範圍。
➕ station 的「庫存 100 → 80」、ticket 的「需求 5 → 3」都看得到。
➖ 需要先解析出一組 row_id 再查 audit_logs（可壓成兩次查詢）。
➖ 依賴 `station_properties` / `task_properties` 有 audit trigger——那只在功能 015 的分支上，見 ADR-140。

**「任務被硬刪導致斷線」不是風險**：`app/graphql/tickets/mutations.py` 有 `create_ticket_task` / `update_ticket_task`，**沒有 `delete_ticket_task`**，service 層也沒有。任務建了就不會消失，從 ticket 走到 task 的路永遠通。

---

### ADR-132 已取消的指派靠 JSONB 反查，不靠 `row_id`

**白話**：被取消的指派，那列資料已經真的被刪了，只能從歷史紀錄的內容裡反著找。

**Context**：`unassign_task_actor` 呼叫 `task_assignment_repository.remove()`（`app/services/ticket.py:294`），而 generic repository 的 `remove()` 是**硬刪**（`app/infrastructure/repository/base.py:102`，`DELETE ... RETURNING`）。`TaskAssignment` 只繼承 `UUIDPKMixin` 沒有 `TimestampMixin`，**結構上就不可能軟刪**。

於是：`audit_logs.row_id` 對 `task_assignments` 的紀錄存的是 assignment 自己的 uuid（A1），而 A1 已從 `task_assignments` 消失，**無法從 task uuid 推導出 A1**。ADR-131 的 `row_id IN (...)` 路徑撈不到它。

**Decision**：額外一條查詢，從 audit 負載反查：

```sql
SELECT * FROM audit_logs
WHERE table_name = 'task_assignments'
  AND COALESCE(new_values->>'task_uuid', old_values->>'task_uuid') IN (:task_uuids)
```

兩條查詢的結果在應用層合流（ADR-139）。

**Consequences**：
➕ 「張三曾經接過又跑了」看得見。**人員來來去去正是任務配對最需要歷史的地方**，而現況表恰好是唯一看不到它的方式。
➖ 第二條存取路徑，需要專屬索引（ADR-133）。

**修正 Notion 票面**：Notion 寫「『誰配對』需另外查 `task_assignments`（actor_uuid, status, assigned_at, updated_at）」。查現況表只會告訴你「現在誰接著」，被取消的指派整列已消失，時間軸上不留任何痕跡。必須走 `audit_logs`。

**`task_assignments` 硬刪與專案軟刪慣例不一致**（`delete_ticket` 的註解明寫 "a disaster help-request is never truly destroyed"）。本票**不修**——改軟刪要動 `uq_assignment_task_actor` 唯一鍵（否則取消後不能重新指派同一人）與既有 assign/unassign 語義，超出範圍。另開票。

---

### ADR-133 補上 `audit_logs` 的三個索引

**白話**：這張表現在除了主鍵一個索引都沒有，任何查詢都是掃全表。

**Context**：`alembic/versions/71bd05e07df3_create_audit_system.py:51-62` 建 `audit_logs` 時只有 `sa.PrimaryKeyConstraint('uuid')`。`row_id`、`table_name`、`created_at` **全無索引**。而 `audit_logs` 是 39 張表的 append-only 總帳，只增不減（有 protect trigger 擋 DELETE）。

實測（996k 列、1.5 GB，PostgreSQL 16）：

| 查詢 | 無索引 | 有索引 | 倍數 |
|---|---|---|---|
| ADR-131 的聚合查詢 | **737 ms** | **4.9 ms** | 150× |
| ADR-132 的 JSONB 反查 | **415 ms** | **0.95 ms** | 437× |

無索引時兩者都是 `Parallel Seq Scan`，各掃 190,179 個 buffer（≈1.5 GB）——**成本固定等於整張表，與要撈幾列無關**。且 737 ms 是開了 3 個 parallel worker 的樂觀值。

**Decision**：新增 migration：

```sql
CREATE INDEX ix_audit_logs_row_id_created_at ON audit_logs (row_id, created_at DESC);
CREATE INDEX ix_audit_logs_table_created_at  ON audit_logs (table_name, created_at DESC);
CREATE INDEX ix_audit_logs_assign_task ON audit_logs
  ((COALESCE(new_values->>'task_uuid', old_values->>'task_uuid')))
  WHERE table_name = 'task_assignments';
```

**Consequences**：
➕ 前兩個索引不管本票範圍如何都該加——這是既有缺陷，本票只是第一個踩到的。
➖ 寫入變慢：實測寫 2 萬列 313 ms → 609 ms，**每列多約 15 微秒**。單筆 mutation 產生 1~5 列 audit → 多 15~75 µs；015 的批量匯入寫 1000 列 → 多 15 ms。可忽略。
➖ 空間 +48 MB / 1.5 GB = **+3.2%**（`row_id` 39 MB、`table_name` 7.2 MB、expression index **僅 2.1 MB**——因為有 `WHERE table_name = 'task_assignments'` 的 partial 條件）。

---

### ADR-134 事件按 `(row_id, created_at)` 合併

**白話**：使用者按一次儲存，時間軸上就是一行，不管背後寫了幾張表。

**Context**：ticket 與 station 是 joined-table inheritance，資料橫跨 `base_geometries` 與子類表。實測（交易內 rollback，未污染 dev DB）：

```
建立求助單          -> base_geometries/INSERT + tickets/INSERT   2 列
只改 tickets.title  -> tickets/UPDATE                            1 列
只改 tickets.status -> tickets/UPDATE                            1 列
軟刪除              -> base_geometries/UPDATE                    1 列
兩張表都動到        -> base_geometries/UPDATE + tickets/UPDATE   2 列

所有 7 列的相異 created_at 數量: 1
```

第三行是關鍵：**PostgreSQL 的 `now()` 是交易開始時間**，同一交易裡所有 audit 列 `created_at` 完全相同。這既讓合併有可靠依據，也讓交易內排序不可能。

**Decision**：`created_at` 相同且屬於同一資源即視為同一交易，合併成一個事件；欄位變更兩表合成一份。

**Consequences**：
➕ 「一次操作 = 一行」，與使用者的心智模型一致。
➕ 交易內順序不可排這件事不再是問題——合併掉了就不需要排。
➖ 分頁必須切在合併後的事件上（ADR-139）。

**否決 keyset 分頁的理由**：同一交易的兩列可能被切到兩頁，從使用者看來就是同一件事出現兩次。

---

### ADR-135 軟刪除譯成 `DELETED`，不是 `UPDATED`

**白話**：刪除記在地理資料表上，不能照字面顯示成「修改了地理資料」。

**Context**：ADR-134 的實測顯示軟刪除只寫 `base_geometries/UPDATE`（`delete_at` 從 NULL 變成時間）。子類表 `tickets` / `stations` **完全沒有紀錄**。

**Decision**：`base_geometries` 的 UPDATE 若 `delete_at` 由 NULL 變成非 NULL，事件型別是 `DELETED`；反向（非 NULL → NULL）是 `RESTORED`。`delete_at` 本身不作為欄位變更顯示。

**Consequences**：
➕ 「誰刪掉這張單」看得到——這是稽核最常被問的問題之一。
➖ 事件型別推導需要看欄位值而不只是 SQL 動作。

**這也否決了「只看子類表、丟掉 `base_geometries`」的簡化**：那會讓刪除事件與位置變更從時間軸上完全消失。

---

### ADR-136 操作者模型；`user_uuid` 為 NULL 即系統；不存在孤立 UUID

**白話**：查不到人不是因為人被刪了，是因為那次寫入根本沒有經過使用者。

**Context**：dev DB 現有 181 列 audit_logs，`user_uuid` **100% 為 NULL，零列有操作者**。原因在 `app/db/session.py:18`——`app.current_user_id` 只在 `request_user_uuid` 有值時設定，而那個 ContextVar 只有 HTTP 中介層會填（`app/core/context.py:40`）。**任何非 HTTP 路徑的寫入（seed script、alembic migration、未來的爬蟲、背景工作）`user_uuid` 一律 NULL**。

**Decision**：

```
actor: { uuid, name, is_removed, kind }
```

`kind` 為 `system` 當 `user_uuid IS NULL`（ADR-137 進一步細分），否則 `user`。已移除的使用者帶 `is_removed: true` 但姓名照常顯示。

**Consequences**：
➕ 「這件事是一個現在已離開的人做的」在稽核上是有意義的資訊，而後端反正已經 JOIN 了 `users`，多讀一個欄位零成本。
➖ 前端要處理 `kind` 的分支。

**修正 Notion 票面**：Notion 列「已知落差：`audit_logs.user_uuid` 為 logical reference（無 DB FK），若使用者被刪除，歷史紀錄可能顯示孤立的 UUID」。**這不成立**：
1. `Perm.USER_DELETE` 註冊了但**全 codebase 零使用**，目前根本沒有刪除使用者的功能（實測 orphaned = 0）。
2. `User` 繼承 `TimestampMixin`（`app/models/auth.py:15`），移除使用者是設 `delete_at`，**列一直都在**，姓名永遠查得到。
3. 沒有 FK 只是少了資料庫層的約束，不代表列會消失。

因此 `kind: "unknown"`（有 uuid 但查不到人）這個分支**永遠不會發生**，不實作。

---

### ADR-137 `crawler` 只從 INSERT 事件的 `source` 推導

**白話**：爬蟲建的站點被人改過之後，那次修改是人做的，不能因為欄位還寫著 crawler 就算在爬蟲頭上。

**Context**：Notion 的待確認項問「『AI 爬取來源』是否需要特別標示，或 `source=crawler` 已足夠」。查證結果：**全 repo 沒有任何爬蟲**——`crawler` 只出現在四個文件檔（`Spec/Docs/mapping-tasks.csv:15`、`er-diagram.md:230,370`、`mapping-stations.csv:8`），零行程式碼。使用者裁定仍先納入設計，因為後續會有這功能。

語意陷阱：`source` 在 UPDATE 列的 `new_values` 裡也存在，但它只是「這一列現在的 `source` 值」：

```
爬蟲建立站點     INSERT  user_uuid=NULL  new_values.source='crawler'  ← 這次真的是爬蟲
李四改營業時間   UPDATE  user_uuid=李四  new_values.source='crawler'  ← 這次是人
```

**Decision**：**只在 INSERT 事件**且 `user_uuid IS NULL` 時，用 `new_values->>'source'` 把 `system` 細分為 `crawler` / `gov` / `ngo`。非 INSERT 事件一律看 `user_uuid`：有人是 `user`，NULL 是 `system`，不猜。

**Consequences**：
➕ 語意正確，不會出現「爬蟲改了營業時間」但其實是李四改的。
➕ 爬蟲上線後零改動自動生效。
➖ 爬蟲若日後也做 UPDATE，會顯示為 `system` 而非 `crawler`。正解是爬蟲寫入前自行設定 `app.current_user_id`（走專用 system 帳號），那時本 ADR 的推導自然退居備援。

**`source` 的值域沒有真值來源**：GraphQL description 說 `'user' or 'official'`（`app/graphql/tickets/types.py:147`、`app/graphql/geo/types.py:115`），Spec 文件說 `user/gov/crawler/ngo/admin`，DB 是 `String(50)` 零約束。**兩份文件互相矛盾且資料庫兩個都不驗**。這與 ADR-126 的 `priority` 是同一個問題，本票同樣不修，另開票（可與 `priority` 的 enum 票合併）。

---

### ADR-138 API 走 REST，不掛在 GraphQL 上

**白話**：歷史是一個獨立的唯讀端點，不塞進現有的 ticket 查詢裡。

**Context**：station / ticket 的 CRUD 全在 GraphQL，REST 只有 auth / admin / rbac / map，功能 015 的 `/bulk/*` 也是 REST。

**Decision**：

```
GET /api/v1/history/tickets/{uuid}?limit=50&offset=0
GET /api/v1/history/stations/{uuid}?limit=50&offset=0
```

回應沿用專案的 envelope（`success` / `data` / `meta`）。

**Consequences**：
➕ 與 GraphQL 的 N+1 完全無關。掛成 `ticket { history }` 的話 `tickets(limit: 50)` 也能展開它，一次就是 50 次聚合查詢；要防就得替聚合查詢寫 DataLoader，相當麻煩。
➕ 分頁、快取標頭、日後要加匯出都比較直接。
➖ 前端看一張單的詳情要同時打 GraphQL 與 REST 兩種協定。

---

### ADR-139 分頁在應用層，不在 SQL

**白話**：先把這筆資源的歷史全撈回來，在程式裡合併排序好，再切頁。

**Context**：兩個約束讓 SQL 分頁行不通——資料來自兩條查詢（ADR-131 的 `row_id IN` 與 ADR-132 的 JSONB 反查），而且事件是多列合併而成（ADR-134）。SQL 只能切在列上，需要切的是合併後的事件。

**Decision**：兩次查詢各自帶一個硬上限（合計 2000 列）→ 應用層合流、合併成事件、排序 → `[offset:offset+limit]`。回應帶 `meta.total` 與 `meta.truncated`。

**Consequences**：
➕ 合流與合併都在同一層做完，邏輯單純且完全正確。
➕ 實測單筆聚合查詢 4.9 ms，抓幾十列與抓幾百列成本差很小。
➖ 超過 2000 列的資源會截斷，靠 `truncated` 旗標告知。單一資源的歷史實務上是幾十件，這是安全閥不是常態路徑。

---

### ADR-140 base 分支接在功能 015（PR #42）之後

**白話**：這張票要用到 015 才加的兩個 audit trigger，所以得排在它後面。

**Context**：查證六條開發中分支相對 `origin/main` 的改動：

```
#37 multi-team → AUDITED_TABLES 沒加東西（它改的是 trigger 函式的 context 欄位）
#36 project    → + project_settings
#42 bulk       → + project_settings, station_properties, task_properties   ← 只有這裡
```

而 ADR-131 的範圍明確包含 `station_properties` 與 `task_properties`（「庫存 100 → 80」「需求 5 → 3」）。

**Decision**：`feat/resource-history-backend` 的 base 是 `feat/bulk-import-export-backend`，形成 `#36 → #42 → history` 的三層 stacked PR。

**Consequences**：
➕ 兩張 EAV 表的 trigger 現成，不必重複加、不會與 #42 在 `AUDITED_TABLES` 同一行衝突。
➕ `users.team_uuid` 在這條線上還在，測試 fixture 與現有寫法一致。
➖ 必須排在 #36、#42 兩張 PR 之後才能合併。

**不接 #37 鏈的理由**：它帶的 `audit_logs.context` / `app.active_identity` 在 ADR-136 的 actor 模型下用不到；且 #37 刪除了 `users.team_uuid`（改讀 `active_identity.team_uuid`，`app/core/rbac_scopes.py`），會讓本票的測試 fixture 綁死在那一邊。產品程式碼兩邊都能編（都走共用的 `require_scope`），差別只在測試。

**已查證無依賴**：#35 搜尋、#39 account profile、#38 session 撤銷的任何東西本票都不需要。`app/graphql/masking.py` 零分支改動。

---

### ADR-141 `geometry` 只報「位置已變更」，不吐座標

**白話**：位置改了要讓人知道，但不把經緯度印出來。

**Context**：`geometry` 是 WKB 二進位，直接吐出去是 `0101000020E6100000...` 這種亂碼。但搬遷、地址標錯修正都是重要的歷史事件。

**Decision**：偵測 `old_values.geometry != new_values.geometry`，產生一筆 `field: "geometry"` 的變更，`before` / `after` 皆為 null，另帶 `changed: true`。座標值歸在 PII 層（ADR-130），只有 `ticket.view_pii` 且 in scope 才解析成可讀座標。

**Consequences**：
➕ 位置變更看得到，且不外流精確座標——**求助單的精確座標實質上等於報案人住址**。
➖ 前端要為這個欄位做特別呈現（沒有 before/after 可顯示）。

---

### ADR-142 詳細地址納入白名單，放 PII 層

**白話**：地址修正要看得到，但地址本身當敏感資料處理。

**Context**：`secondary_locations` 的 `county/city/lane/alley/no/floor/room/pole_id/pole_type/pole_note` 合起來是完整住址。「地址從 A 改成 B」是實務上很常發生的修正，看不到會少一塊。

但查證發現：`secondary_location` 這個 resolver（`app/graphql/types.py:108`）**完全沒有 PII 閘門**——`_pii_visible` 只管 `contact_*`（`app/graphql/tickets/types.py:395`）。詳細住址今天對任何看得到該單的人都是明文。

**Decision**：納入白名單，歸在 PII 層，與 `contact_*` 同級。

**Consequences**：
➕ 地址修正看得到。
➕ **歷史比現況更嚴**：同一張單，GraphQL 查詢看得到地址，歷史時間軸沒有 `view_pii` 就看不到。這個不一致是刻意的——本票不打算複製一個既有缺陷。
➖ 兩邊行為不一致這件事需要另開票修 GraphQL 側（見文末）。

---

### ADR-143 dedup／評分欄位與外鍵一律排除

**白話**：沒有程式會寫的欄位，和一串沒人看得懂的 uuid，都不放進時間軸。

**Decision**：排除 `is_duplicate`、`dedup_group_id`、`confidence_score`、`priority_score`、`weightings`，以及 `route_uuid`、`child_station_uuid`、`pole_photo_uuid` 等所有外鍵。同時排除 `uuid`、`created_at`、`updated_at`、`delete_at`（`delete_at` 是事件不是欄位，見 ADR-135）、`property_name`（`base_geometries` 的 polymorphic 判別欄，永不變）、`search_text`。

**Consequences**：
➕ 時間軸不出現永遠不會觸發的欄位——ADR-113 已查證全 codebase 沒有任何程式寫 `is_duplicate` / `dedup_group_id`。
➕ 不出現裸 uuid。
➖ 「這個任務被改排到另一條路線」看不到。要看得到需額外 JOIN 把 uuid 解析成名稱，本票不做。
➖ AI dedup 日後做了要回來加，屆時 ADR-144 的守衛測試不會提醒（那些欄位在明確排除清單上，是有意識的決定，不是遺漏）。

---

### ADR-144 白名單另建 `history_fields.py`，並配一個分類守衛測試

**白話**：不跟匯入匯出共用同一張欄位表；另外寫一個測試，逼以後加欄位的人替新欄位做決定。

**Context**：功能 015 的 `app/services/bulk_columns.py` 也是一份策展過的欄位清單，看起來可以共用。但兩者的分類軸根本不同（可否寫入 vs 可見層級），集合也不同：

| | bulk_columns | history 白名單 |
|---|---|---|
| latitude / longitude | 有 | 無（改成「位置已變更」，ADR-141） |
| created_at / updated_at | 有（唯讀匯出欄） | 無（噪音，ADR-143） |
| review_note / moderation_status | 無 | 有（稽核層） |
| task_assignments / station_properties 欄位 | 無 | 有 |
| 涵蓋 | 2 個實體攤平 | 6 張表 |

**Decision**：新建 `app/services/history_fields.py`，不動 `bulk_columns.py`。附守衛測試：

```python
def test_every_column_is_classified():
    for table, model in HISTORY_MODELS.items():
        cols = {c.name for c in model.__table__.columns}
        known = FIELD_TIERS[table].keys() | EXCLUDED[table].keys()
        assert cols - known == set(), f"{table} 新增欄位未分類: {cols - known}"
```

排除清單的每一項要寫理由。

**Consequences**：
➕ 兩個模組各自演化，015 改 bulk 邏輯不會意外動到歷史的可見性。
➕ 新增 `search_text` 這種欄位時 CI 直接擋下來，逃不掉。
➖ 兩份清單，兩處維護。

---

### ADR-145 後端不做中文化

**白話**：後端回英文欄位名和原始值，中文標籤跟狀態詞由前端處理。

**Context**：015 的匯出檔表頭用的就是英文欄位名（`status`、`op_hour`、`county`），專案沒有中文對照表可重用。

**Decision**：

```json
{ "event_type": "UPDATED",
  "at": "2026-08-21T09:12:00Z",
  "actor": { "uuid": "...", "name": "李四", "kind": "user", "is_removed": false },
  "entity": "ticket",
  "changes": [
    { "field": "status",   "before": "pending", "after": "in_progress" },
    { "field": "priority", "before": "medium",  "after": "high" }
  ] }
```

`event_type` 為 `CREATED` / `UPDATED` / `DELETED` / `RESTORED` / `ASSIGNED` / `UNASSIGNED`。

**Consequences**：
➕ 回應可結構化：前端能重新排版、篩選、把新舊值並排。
➕ 不會出現「同一個欄位在單筆畫面叫『狀態』、在歷史叫別的名字」這種漂移——中文標籤只有前端一份真值來源。
➖ 前端要維護欄位名與狀態詞的中文對照。

**事件型別仍由後端推導**：ADR-134 的合併與 ADR-135 的軟刪除判讀都需要後端語意，前端拿 `table_name` + `action` 推不出來。後端給語意、前端給文案，分界在這裡。

---

## 本票不做、要另開的票

1. **`task_assignments` 改軟刪** — 硬刪且無 `delete_at`，與專案軟刪慣例不一致。改動要動 `uq_assignment_task_actor` 唯一鍵與既有 assign/unassign 語義（ADR-132）。
2. **`source` 的值域真值來源** — GraphQL description 與 Spec 文件互相矛盾，DB 零約束。可與 ADR-126 的 `priority` enum 票合併（ADR-137）。
3. **`secondary_location` resolver 的 PII 閘門** — 詳細住址目前對所有能看該單的人明文（ADR-142）。
4. **`crowd_sourcing` / `station_update_suggestions` / `photos` 的 audit trigger** — 這三張表不在 `AUDITED_TABLES`，民眾評價、站點修改建議、照片上傳永遠不會出現在時間軸。補 trigger 只對之後的異動生效，舊資料無回溯。

---

## PR #43 code review 後補（2026-08-30，ADR-197~203）

reviewer 留了 8 條，全部屬實。以下七條 ADR 是逐條裁定（第 8 條是 `history_fields.py` 的排除理由寫錯欄位，改一個常數即可，不另立 ADR，見 ADR-143 的規則本身）。

---

### ADR-197 PII 層用「被讀的那個 entity 自己的」`view_pii`

**白話**：看站點的歷史要用「站點的 PII 權限」，之前用的是「求助單的 PII 權限」。

**Context**：`resolve_visibility` 對兩種 entity 都解析 `Perm.TICKET_VIEW_PII`，所以**站點**時間軸的 PII 層是由 `ticket.view_pii` 決定的。`station.view_pii` 全 codebase 沒有任何地方讀（`grep` 只剩 `permissions.py`、`app/graphql/geo/types.py`，以及 `history_fields.py` 的一句註解）。

這與分層白名單自己給的理由直接矛盾：`history_fields.py:117` 把 `stations.contact_name` / `contact_email` / `contact_phone` 歸為 PII，理由寫的是「`station.view_pii` 正是為了站點帶著真人的聯絡資訊而存在」；而 `app/graphql/geo/types.py:200` 對同樣那三個欄位就是用 `STATION_VIEW_PII` 擋的。**同樣三個欄位，單筆讀取與時間軸用不同的鑰匙。**

seed 剛好蓋住了這件事——四個角色對這兩個 key 的 scope 完全相同——但 scope 在執行期可依角色、也可依使用者調整（`rbac_admin.py:68,109`），所以 seed 不是保證。

**Decision**：`pii_perm = Perm.STATION_VIEW_PII if entity == "station" else Perm.TICKET_VIEW_PII`，checkpoint 2 照舊。

**Consequences**：
➕ 時間軸與單筆讀取對同一個欄位用同一把鑰匙。
➕ 「持有 `station.view_pii=all` 但沒有 `ticket.view_pii` 的人看得到站點聯絡資訊」這件事現在成立——之前是相反的。
➖ 兩個 capability 都要有測試覆蓋；原本 `test_history_permissions.py` 的每個案例都用 ticket 資源、只斷言 `TICKET_VIEW_PII`。

---

### ADR-198 AUDIT / RAW 層明確要求 `audit.view` 為 `Scope.ALL`

**白話**：`audit.view` 給成 `zone` 或 `own` 的人，之前跟給 `all` 的人看到一模一樣的東西。

**Context**：AUDIT 與 RAW 層原本的解鎖條件是 `resolve_scope(...) != Scope.NONE`——**任何** scope 都算，且不對資源跑 checkpoint 2。相對地，同一個函式三行之上的 PII 層在 scope 比 `all` 窄時會跑 `in_scope()`。結果是持有 `audit.view=own` 或 `=zone` 的人，在**每一個**打得開的時間軸上都看得到 `review_note`、`moderation_status` 與完整的 raw 稽核內容——包含那個 scope 之外的資源。

原本 docstring 的理由是「`audit.view` 不是 `all` 就是沒有」。以 seed 而言屬實，`test_audit_view_is_no_longer_an_unwired_shell` 也釘住了持有它的兩個角色。但 `SetGrantRequest.scope` 的型別就是裸的 `Scope` enum（`app/schemas/rbac_admin.py:16`），`PUT /admin/rbac/roles/{uuid}/permissions/audit.view` 送 `{"scope": "zone"}` 會被接受，per-user 的授權端點也接受。**沒有任何東西在維持這個 docstring 依賴的不變量。**

**Decision**：`audit = await resolve_scope(...) == Scope.ALL`。把註解裡的假設變成程式裡的強制。

這與 Spec/014 的 ADR-181 是同一個做法與同一個理由：沒有 checkpoint 2 可以收窄時，範圍條件必須寫在 checkpoint 1 上，否則窄的授權等同最寬的。

**否決的替代方案**：像 PII 一樣跑 `in_scope()`。稽核層的語意不是「這個資源在你管的範圍內」，而是「你是平台層級的稽核者」——對單一資源跑 checkpoint 2 會讓 `audit.view=zone` 變成一種「區域稽核員」，那是一個還沒有人要的新角色概念。真的需要時再設計，這個決定不會擋路。

**Consequences**：
➕ 窄的授權真的看得比較少。
➕ 對現行 seed 零影響：持有者本來就是 `all`。
➖ 未來真要開放「區域稽核員」時會在這一行撞到，被迫先回答「稽核範圍怎麼定義」。這是刻意的。

---

### ADR-199 指派列的 UPDATE 是「更新」，不是「取消指派」

**白話**：志工把自己的任務標成完成，時間軸之前會說他「取消了指派」。

**Context**：`_event_type` 對 `task_assignments` 的判斷是 `ASSIGNED if action == "INSERT" else UNASSIGNED`——`UPDATE` 也落進 `UNASSIGNED`。而更新路徑確實存在：`updateTaskAssignment`（`app/graphql/tickets/mutations.py:221` → `app/services/ticket.py:407`）就地改 `status` / `role`，`tests/test_graphql/test_mutations.py:1312` 有覆蓋。

結果是一個事件寫著 `event_type: "UNASSIGNED"`，`changes` 卻是 `[{"field": "status", "before": "accepted", "after": "completed"}]`——**型別說他放棄了，內容說他完成了**。

`_ASSIGNMENT_FIELDS` 白名單裡就有 `role` 與 `status`（`history_fields.py:163-164`），所以這條路本來就預期會觸發。

**Decision**：`INSERT → ASSIGNED`、`DELETE → UNASSIGNED`、其餘 → `UPDATED`。只有 `unassign_task_actor` 的硬刪代表「有人放掉了這個任務」——那正是 ADR-132 與整條第二存取路徑存在的理由。

**Consequences**：
➕ 事件型別與它的 changes 不再互相矛盾。
➖ `UPDATED` 現在也會出現在指派列上；前端若假設「指派相關事件只有 ASSIGNED / UNASSIGNED」需要跟著調整。

---

### ADR-200 `entity` 是每個事件自己的，不是整條時間軸的

**白話**：一張求助單底下三個任務各被改了一次，之前三個事件長得一模一樣，看不出改的是任務還是求助單本身。

**Context**：`render_events` 對每個事件都填頂層資源，而 `Change.table`（`history.py:206`）算出來之後就被丟掉。於是：

```json
{"event_type": "UPDATED", "entity": "ticket",
 "changes": [{"field": "status", "before": "pending", "after": "in_progress"}]}
```

沒有任何東西告訴呼叫端這個 `status` 是求助單的、是某個任務的、是任務屬性的、還是指派的。

而**同一個 PR 寫的** `Spec/016/spec.md:172` 記載的是相反的行為——UNASSIGNED 的範例寫著 `"entity": "task_assignment"`。實作與 spec 在同一次提交裡互相矛盾。

**Decision**：以事件實際碰到的那些表推導 entity（`_TABLE_ENTITY` + `_event_entity`）。資源自己的表（`base_geometries` + `tickets`/`stations`）映射回資源本身——一次儲存寫兩張表是**一件事**，不是兩件；子表則各自具名。

一個事件的 changes 若跨了兩個不同的子實體，退回資源本身：指名其中任一個都是錯的，而資源是它們的共同點。

**否決的替代方案**：改 spec 去符合實作（把 `entity` 定義成「這條時間軸屬於哪個資源」）。那個欄位就會變成每個事件都一樣的常數，等於沒有資訊，而 caller 分不出改動發生在哪一層的問題仍然存在。

**Consequences**：
➕ 回應能區分「求助單的 status」與「某個任務的 status」。
➕ spec 與實作一致，spec 的範例不必改。
➖ **回應格式變更**：`entity` 的值域從 `ticket` / `station` 擴大到含 `task` / `task_property` / `task_assignment` / `station_property` / `secondary_location`。
➖ 仍然不指出是**哪一個**任務（沒有回傳子列的 uuid）。指出來需要多一個欄位，spec 沒有規定，本票不加。

---

### ADR-201 移除從未被賦值也從未被讀取的 `Change.changed_only`

**白話**：有個欄位的註解說它負責某個決策，但它其實什麼都沒做。

**Context**：`Change.changed_only` 從來沒有被指定過非預設值，也從來沒有被讀過。`build_events` 建每一個 `Change` 都不帶它（312-317 行），模組內與測試都沒有任何地方引用。而 `Change` 的 docstring 說它承載 ADR-141 的「只講有變、不講值」——那個行為實際上是由 `_render_change` 裡兩個 dict literal（449、455 行）產生的，兩者從不參照這個欄位。

危險在於：有人要改 ADR-141 的行為時會去改 `changed_only`，然後發現回應毫無變化。

**Decision**：移除欄位，並把 docstring 改成指向真正決定這件事的地方（欄位的 tier + caller 的 visibility，在 render 時決定）。

**否決的替代方案**：把它接起來，讓 `_render_change` 讀它。那會讓同一個答案有兩個來源——tier 與旗標——遲早漂移。tier 已經是唯一真值來源。

**Consequences**：
➕ 文件說的和程式做的一致。
➖ `Change` 的建構子少一個參數（本來就沒人傳）。

---

### ADR-202 移除 `ix_audit_logs_table_created_at`

**白話**：這個索引沒有任何查詢用得到，卻要 39 張表的每一次寫入都為它付錢。

**Context**：ADR-133 加了三個索引。review 指出第二個的註解理由是假的——它寫「時間軸用 `table_name` 過濾以決定怎麼解讀一列」，但那個判斷是在 Python 做的（`_event_type` 與 `_render_change` 在列已經載入之後才分支）。

實際查證：全 codebase 只有**一處** `table_name` 進到 SQL（`history.py:175`），而它同時帶 `_payload_task_uuid().in_(...)`，`scripts/verify/history_timeline.py:241` 斷言那條走的是 **`ix_audit_logs_assign_task`**（partial，~2.1 MB），不是這一個。

原因是資料形狀：`audit_logs.row_id` 存的是**被改的那一列**的主鍵，不是「這筆改動屬於哪個資源」。所以時間軸必須**先**把資源展開成一組 `row_id`（`resolve_scope_ids`），**才**去查 `audit_logs`。那組 id 本來就只屬於這個資源，再加 `table_name` 過濾一列都不會少撈。

這個索引唯一能服務的查詢形狀是「給我某張表的所有異動」——那是 audit console 的形狀，不在本票內，也還沒有票。

**Decision**：移除。`audit_logs` 是 append-only、39 個寫入者的總帳，這是**永久的寫入成本換零讀取效益**。

**否決的替代方案**：留著並把理由改成「為未來的 audit console 預建」。reviewer 明白說這也可以接受，且省下未來在大表上重建（會再碰一次 ADR-203 的鎖表問題）。否決的理由是：那個 console 沒有票、沒有查詢形狀，所以連「該不該做成 partial、WHERE 寫什麼」都無從決定；帶著真實查詢再建，量得出來也決定得了。

**Consequences**：
➕ 每一次 audit 寫入少維護一個索引；空間少 7.2 MB（原本 48 MB 中的一份）。
➕ 留下的兩個索引都有對應查詢，且都被 verify script 斷言走到——「這個索引是不是還有人用」不必靠讀程式碼推理。
➖ 未來做 audit console 時要在（屆時更大的）表上建索引，會付一次 ADR-203 的阻塞成本。

**與 ADR-133 的關係**：ADR-133 說「前兩個索引不管本票範圍如何都該加，這是既有缺陷」。對 `row_id` 成立，對 `table_name` **不成立**——它沒有讀者，所以不是「缺陷」而是「預備」。本 ADR 收斂 ADR-133 這一半；依專案慣例（後續 ADR 勝），實作以本 ADR 為準。

---

### ADR-203 index 建置維持阻塞鎖，把代價寫成部署說明

**白話**：這個 migration 跑的時候會卡住全站寫入。現在表還小，幾乎沒感覺；但這件事要寫清楚，不要讓下一個人在大表上才發現。

**Context**：兩個索引都是普通的 `CREATE INDEX`，會對 `audit_logs` 取 SHARE 鎖，建置期間阻塞 `INSERT`。而 39 張被稽核的表全都透過 trigger 往 `audit_logs` 寫，所以**建置期間全站寫入都會等**：開求助單、指派任務、登入。

PR 描述量的 996k 列 / 1.5 GB 正是「這件事不再是瞬間完成」的規模。測試計畫只在**乾淨資料庫**上驗過 up / down / up，那裡鎖沒有成本。

**Decision**：不改用 `CONCURRENTLY`，改為在 migration docstring 與 spec §7 寫明阻塞行為與建議的執行時機。

`CONCURRENTLY` 被否決的理由：它不能在 alembic 的交易內執行（要 `op.get_context().autocommit_block()`）、失敗會留下 invalid index 而 downgrade 必須處理、且要跑兩趟掃描。換來的是「未來某一次部署不阻塞」，而本專案目前的 `audit_logs` 小到鎖不花時間——那 996k 列是效能實測時另外造出來的資料量，不是現況。

reviewer 明確表示這不是正確性問題，「說明阻塞多久」與「不要拿阻塞鎖」兩者皆可接受。

**Consequences**：
➕ migration 保持簡單、可原子回滾。
➖ 表長大之後這個 migration 必須排在低峰執行。已寫進 docstring 與 spec，不是口耳相傳。
➖ 若之後真的要在大表上加索引（例如 ADR-202 提到的 audit console），屆時應該重新評估 `CONCURRENTLY`。
