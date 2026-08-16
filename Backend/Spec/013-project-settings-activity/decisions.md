# Project Settings & Account Activity — ADR 全集（ADR-090~095）

**Date**: 2026-08-16
**Feature**: 013-project-settings-activity
**Status**: 定案，待實作
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/012-account-profile/decisions.md`（ADR-084~089）。

---

### ADR-090 一個部署 = 一場混合型災害；以單列 `project_settings` 承載，不引入 project/event entity

**白話**：一次部署就是在處理一場災害，但這場災害可能同時是土石流又是水災。不做「一個系統管理很多場災害」那種設計。

**Context**：Notion 票名「後台 - 專案起始資料設定」在 codebase 裡沒有對應概念——沒有 project / disaster event / campaign entity，唯一沾到的是 `tickets.disaster_type`（自由字串，`app/models/request.py:25`）。釐清後確認語意為「災難情境的動態欄位範本」，且**災害可能是混合型**（土石流＋水災或更多）。

「混合型」有兩種讀法：

- **讀法一**：一個部署 = 一場災害事件，該事件的**型別是集合**。
- **讀法二**：一個部署同時承載**多場獨立事件**，各自有自己的 Ticket / Station。

**Decision**：採讀法一。新增 `project_settings` 單列全域設定表（`name`、`disaster_types text[]`、`started_at`），可由後台修改，納入 `AUDITED_TABLES`。

**Consequences**：
➕ `tickets` / `stations` / `ticket_tasks` **不需要新增事件外鍵**，所有既有查詢（RBAC scope、ADR-077 的搜尋、地圖 bbox）不受影響。
➕ 與 roadmap 的 BE-MULTI-1 方向一致——那份文件的隔離手段是「每場災難一個 DB namespace」，而非同庫內的事件維度。
➖ 同一部署無法並行處理兩場需要資料隔離的災害。要做就是再開一個部署。
➖ 單列表需要額外約束（固定 PK 或唯一部分索引）擋住多列。

**否決讀法二的理由**：它需要 `disaster_events` 主檔加上三張核心表的外鍵，並讓所有查詢都帶事件維度——這是架構級改動，範圍遠超一張「起始資料設定」的票，且會卡住 010（多 team）與 011（搜尋）的實作，兩者的查詢都得跟著加事件過濾。

**否決環境變數方案的理由**：`DISASTER_TYPES` 寫在 `.env` 雖零 schema，但改設定要重新部署且後台改不了，與票名「後台 - 專案起始資料設定」直接矛盾。

**否決通用 key-value 設定表的理由**：`system_settings(key, value JSONB)` 最有彈性，但本票的設定是有結構的（型別清單、名稱、起訖時間），具名欄位好驗證也好查詢；JSONB 的彈性在只有一組設定時是負債——每個讀取點都要自行處理「key 不存在」「格式不對」。真長出第二、第三組不相關的全域設定時再抽不遲。

---

### ADR-091 動態欄位設定拆為「定義」與「啟用」；不做範本表與套用動作

**白話**：「樓層救援是什麼型別的欄位」只定義一次；「哪些災害要顯示它」另外記。這樣就不會有兩份範本對同一個欄位講不同話的問題。

**Context**：原先的設計方向是「災難情境範本表 + 建立專案時複製進 config 表」，並比照 ADR-055（RBAC seed → runtime）採「只補缺、不覆蓋」語意。但混合災害會產生真實衝突：

```
土石流範本：property_name="淹水深度"  data_type="number"
水災範本：  property_name="淹水深度"  data_type="enum"  enum_options=[...]
```

在「只補缺不覆蓋」下，勝出者取決於 `disaster_types` 陣列的排列順序——由運氣決定現場人員拿到的是數字輸入還是下拉選單。

進一步查證發現：兩張 config 表**目前是空的**（`scripts/seed_rbac.py` 與 `scripts/seed_mock_scenarios.sql` 各建 0 列），且沒有任何寫入路徑依賴它（見 ADR-092）。「保護管理員的現場客製不被範本覆蓋」是在保護不存在的東西。

**Decision**：把「定義」與「啟用」拆開——

| 概念 | 內容 | 唯一性 |
|---|---|---|
| 定義 | `data_type` / `enum_options` | 全域唯一，每個 `(target_type, property_name)` 一份 |
| 啟用 | 哪些災害型別顯示此欄位 | `disaster_types text[]` |

```sql
ALTER TABLE station_property_config ADD COLUMN disaster_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE task_property_config    ADD COLUMN disaster_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE station_property_config ADD CONSTRAINT uq_station_prop UNIQUE (station_type, property_name);
ALTER TABLE task_property_config    ADD CONSTRAINT uq_task_prop    UNIQUE (task_type, property_name);
```

`disaster_types = '{}'` 代表不分災害型別一律啟用——沿用 `station_type = 'all'` 的既有慣例（`app/repositories/config_repository.py:17-26`）。

查詢：`WHERE disaster_types = '{}' OR disaster_types && :current_types`（`&&` 為 PostgreSQL 陣列交集運算子）。

**Consequences**：
➕ **定義衝突在結構上不可能發生**，因此不需要範本表、套用動作、衝突偵測或衝突回報。
➕ 混合災害由單一 SQL 條件處理，不需迴圈或多次查詢。
➕ 工作量從「新表 + 套用 API + 衝突回報 + 設定表」縮為「兩個欄位 + 查詢條件 + 設定表」。
➕ 順帶補上 DB 唯一鍵——應用層 upsert 本來就以 `(type, property_name)` 為鍵（`config_repository.py:28-47`），但 DB 沒保證，並發下可能產生重複列。
➖ 無法表達「同一個欄位名在不同災害下有不同型別」。判斷這是**特性而非限制**——那種需求應該用兩個不同的欄位名表達。
➖ 改定義會立即影響所有啟用該欄位的災害型別。因 ADR-092 無強制力，影響僅限前端渲染。

---

### ADR-092 動態欄位設定維持無強制力，且定義可自由修改

**白話**：這些設定只是「告訴前端要畫哪些欄位」，後端不會因為值不符合定義就擋下來。定義本身隨時可以改。

**Context**：查證發現 config 目前**完全沒有強制力**——寫入 property 的兩條路徑從不查 config 表：

```
app/services/station.py:106-137   create_station_property
app/services/ticket.py:207-231    create_task_property
```

設定 `data_type="enum"` 且 `enum_options=["A","B"]`，後端照樣接受任意字串。唯一消費者是 GraphQL 查詢 `stationPropertyConfigs` / `taskPropertyConfigs`（`app/graphql/config/queries.py:24-49`），供前端渲染表單。

三個選項：維持無強制力／全面強制／有定義才驗（未定義的 `property_name` 放行，保住 `create_station_property` docstring 明載的 open crowd-sourcing 性質）。

**Decision**：維持無強制力。config 的角色就是「定義」，供前端渲染；定義可自由修改，不加「已有資料的欄位不得改 `data_type`」之類的限制。

**Consequences**：
➕ 零改動，現有寫入行為完全不變。
➕ 群眾外包的開放性不受影響——現場臨時回報的、尚未定義的欄位照樣寫得進去。
➕ 定義可自由修改，後台調整欄位不需要考慮既有資料。
➖ **BI 會拿到自由格式的值**（「有」／「1台」／「Y」／「發電機×2」），統計時需在 BI 層正規化。roadmap 上 BI 是實票（backend-HC 與 frontend 皆有 BI 子項），屆時可能需要回頭補寫入驗證。
➖ 前端依 config 渲染的下拉選單，與後端實際接受的值不一致——前端是唯一的把關者。

**易混淆點（記錄以免誤讀 code）**：`app/graphql/suggestions/fields.py` 有一份寫死在 code 裡、**確實有驗證**的 `SUGGESTABLE_FIELDS`（`:49-56` 驗 integer 與 enum）。專案裡「有強制力的欄位定義」與「動態欄位設定」是兩套不同機制。

---

### ADR-093 `last_activity_at` 於 refresh token 輪替時寫入，粒度約 15 分鐘

**白話**：不是每次操作都去更新資料庫，而是趁使用者的登入憑證換發時順手記一次，誤差 15 分鐘內。

**Context**：「最後活動時間」目前完全不存在。Redis session 有 `last_used_at`，但只在 refresh token 輪替時更新（`app/repositories/session_repository.py:96`），且 14 天 TTL 到期即消失——查不到「三個月沒上線的帳號」，而那正是後台最需要的資訊。

四個選項：每請求更新 DB／Redis 即時記後定期 flush／沿用 refresh 時機／只讀 Redis 不落 DB。

**Decision**：`users` 新增 `last_activity_at`，在 `session_repository.rotate()` 時寫入。access token TTL 為 15 分鐘，活躍使用者約每 15 分鐘輪替一次，因此誤差在 15 分鐘內。

**Consequences**：
➕ 零額外機制——`rotate()` 本來就在更新 session 記錄。
➕ 資料落在 DB，查得到久未活動的帳號。
➕ 後台用途是判斷「帳號還活著嗎、該不該回收權限」，15 分鐘粒度綽綽有餘。
➖ 只在客戶端實際 refresh 時更新。若客戶端行為異常（不 refresh、每次重新登入），數值會偏舊。
➖ 無法用於精確的操作稽核——那是 `audit_logs` 的職責。

**否決每請求更新 DB 的理由（最重要）**：`users` 在 `AUDITED_TABLES` 裡（`app/db/triggers.py:7`），每請求 `UPDATE users` 會讓 **`audit_logs` 每請求多一列**，稽核表被活動記錄淹沒。加上寫入放大與 autovacuum 壓力，成本完全不成比例。這個副作用容易被忽略，明確記錄。

**否決只讀 Redis 的理由**：session 14 天 TTL 到期即消失，答不出「這個帳號多久沒上線」——正是後台最需要的問題。

---

### ADR-094 後台使用者列表增加 last_login_at / last_activity_at / active_session_count

**白話**：後台看得到每個人上次登入、上次活動是什麼時候，以及現在有幾台裝置登入中。

**Context**：`users.last_login_at` 欄位與寫入都已存在（`app/api/v1/endpoints/auth/session.py:59`、`sso.py:83`/`:163`），但 `AdminUserListItem` 只有 `uuid` / `name` / `team_uuid` / `platform_role` / `team_role`（`app/schemas/admin.py:9-16`），後台讀不到。

**Decision**：`AdminUserListItem` 增加三個欄位——

| 欄位 | 來源 |
|---|---|
| `last_login_at` | `users.last_login_at`（已有，僅未曝露） |
| `last_activity_at` | `users.last_activity_at`（ADR-093 新增） |
| `active_session_count` | Redis `user_sessions:{uuid}` set 的 size |

**Consequences**：
➕ 「最後登入」零成本——欄位早就在寫了，只是沒回傳。
➕ `active_session_count` 讓管理員看得出「這個帳號同時在幾台裝置上登入」，異常多的裝置數是憑證外洩的訊號。
➖ `active_session_count` 需對列表中每個使用者查一次 Redis。以 `limit=100` 的預設分頁計，應以 pipeline 批次取得，避免 100 次 round trip。
➖ 引入 admin API 對 Redis 的依賴——Redis 不可用時該欄位需優雅降級為 `null`，不應讓整個列表失敗。

---

### ADR-095 `property_name` 為不可變的鍵，顯示文字改用 `label`；補上 `sort_order` 與 `is_active`

**白話**：欄位的「代號」建立後不能改，因為既有資料是靠這個代號對應的；要改顯示名稱請改 `label`。另外補上排序與停用開關。

**Context**：`station_properties` / `task_properties` 是**以字串** `property_name` 對應到 config，**沒有外鍵**（`app/models/station_property.py:16`、`app/models/ticket_task.py:47`）。ADR-092 決定「定義可自由修改」，但若「修改」包含改名，既有資料會立刻變成孤兒——它們仍帶著舊名稱，前端依新定義渲染時找不到對應。

查證後發現風險目前是關著的：`app/services/config.py` 只有 `upsert`，沒有 update 或 delete；而 `upsert` 以 `(station_type, property_name)` 為鍵（`app/repositories/config_repository.py:28-47`），傳入新名稱只會**新增一列**，不會改到舊列。**API 上根本不存在「改名」這個動作。**

同時，config 作為表單定義還缺三樣東西：顯示文字與鍵綁在一起、沒有排序依據（`list_by_type` 完全沒有 `ORDER BY`，前端拿到的順序不保證穩定）、沒有停用機制（只能刪除，而刪除會讓既有資料變孤兒）。

**Decision**：純加欄位，不改欄位名、不加額外約束——

| 欄位 | 用途 |
|---|---|
| `label varchar(100)` | 顯示文字，可自由修改。`NULL` 時前端回退顯示 `property_name` |
| `sort_order int NOT NULL DEFAULT 0` | 表單欄位順序。查詢改為 `ORDER BY sort_order, property_name` |
| `is_active boolean NOT NULL DEFAULT true` | 停用開關。查詢一律追加 `AND is_active = true` |

`property_name` 明文定位為**不可變的鍵**。不新增改名端點；既有的「傳新名稱 = 新增一列」語意即為此決策的實作。

**Consequences**：
➕ 顯示文字與資料關聯解耦——改 label 不影響任何既有資料。
➕ `sort_order` 讓表單欄位順序可控。目前 `list_by_type` 無 `ORDER BY`，順序由 PostgreSQL 自行決定，同一個查詢兩次可能得到不同順序。
➕ `is_active` 讓「這個欄位不再收集了」有安全的表達方式——停用後既有資料仍可讀，不像刪除會產生孤兒。
➕ 純加欄位，全部有預設值，既有列不需回填。
➖ `property_name` 打錯字就永久留著（只能停用後另建）。這是刻意的取捨——資料完整性優先於命名美觀。
➖ 前端要處理 `label` 為 `NULL` 的回退邏輯。

**刻意未加的欄位**（等前端提出實際需求再補，屆時仍是純加欄位）：`required`、`unit`、`hint`、`default_value`、`min` / `max`、`group`。`project_settings` 同理未加 `ended_at`、`status`、`default_bounds`、`contact_info`。
