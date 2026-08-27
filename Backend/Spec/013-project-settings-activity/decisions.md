# Project Settings & Account Activity — ADR 全集（ADR-090~099）

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

> **事實更正（2026-08-16，實作期 docker 驗收發現）**：上一段「兩張表是空的」**不正確**。當時只查了兩個 seed 腳本，漏了 migration 本身——`alembic/versions/a2a8e4d8c51d_ticket_tasks_and_property_configs.py:184` 起就 `INSERT` 了 **36 筆 station config 與 10 筆 task config**（`crowd_level`、`capacity_total`、`beds_available` 等）。
>
> 對本 ADR 的三點影響：
> 1. **決策不變。** 拆「定義／啟用」的理由是混合災害會產生真實的定義衝突，與表是否為空無關。
> 2. **UNIQUE 約束仍安全。** 乾淨 DB 跑完 migration 後實測無重複鍵，`create_unique_constraint` 通過。但「表是空的所以不可能失敗」這個推論站不住腳——**既有部署若曾透過 API 寫過 config，部署前務必先跑重複鍵檢查**（查詢見 `07ac630e0009` 的 docstring）。
> 3. **不需要回填。** 這 51 筆種子列的 `disaster_types` 取欄位預設 `'{}'`，在任何災害設定下都保持啟用，行為與加欄位前完全一致。

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

**型別標籤格式：小寫英文，寫入時正規化，暫不設合法清單**（2026-08-16 補充）。比對是精確且區分大小寫的字串相等，所以 `["Flood"]` 對上 `["flood"]` 會**安靜地**讓整批水災欄位從表單消失（回 200、無錯誤、無警告）。因此在兩邊的寫入路徑統一 `.strip().lower()` 並去重（`app/core/disaster_types.py`）。

但**不寫死合法清單**：型別詞彙的內容與「範本的實際欄位內容」同源，而後者被 `spec.md:28` 明確排除（來源是 PM-Scure 的「三種災難情境下的動態欄位」「泥石流範本先行」）。自行發明列舉等於替 PM 決定一份他們已經擁有的東西，且名稱極可能對不上（spec 寫「泥石流」，英文對應 landslide / debris flow / mudslide 並不唯一）。正規化不需要知道詞彙表就能消滅最常見的大小寫不匹配，且與日後補列舉完全相容——屆時列舉就放在同一個模組。

因兩個 `disaster_types` 欄位都是由 migration `07ac630e0009` 新建，不存在既有的混合大小寫資料，故只在寫入端正規化即為完備，不需要 SQL 層的 `lower()`。

➖ 真正的錯字（`floood`、`flooding`）仍會靜默通過，直到補上列舉驗證。

查詢：`WHERE disaster_types = '{}' OR disaster_types && :current_types`（`&&` 為 PostgreSQL 陣列交集運算子）。

**Consequences**：
➕ **定義衝突在結構上不可能發生**，因此不需要範本表、套用動作、衝突偵測或衝突回報。
➕ 混合災害由單一 SQL 條件處理，不需迴圈或多次查詢。
➕ 工作量從「新表 + 套用 API + 衝突回報 + 設定表」縮為「兩個欄位 + 查詢條件 + 設定表」。
➕ 順帶補上 DB 唯一鍵——應用層 upsert 本來就以 `(type, property_name)` 為鍵（`config_repository.py:28-47`），但 DB 沒保證，並發下可能產生重複列。
➖ 無法表達「同一個欄位名在不同災害下有不同型別」。判斷這是**特性而非限制**——那種需求應該用兩個不同的欄位名表達。
➖ 改定義會立即影響所有啟用該欄位的災害型別。因 ADR-092 無強制力，影響僅限前端渲染。

> **已知限制（2026-08-16，實作期審查發現）：`'all'` 桶子仍可產生同名衝突定義。**
>
> 上面「定義衝突在結構上不可能發生」的說法**只在災害型別這根軸上成立**。唯一鍵是 `(station_type, property_name)`，但 `list_by_type` 查詢時會把該站點型別與共用的 `station_type='all'` **合併**回傳（`app/repositories/config_repository.py:47`）——約束的範圍比查詢的範圍窄一格，於是 `('all', X)` 與 `('shelter', X)` 可以並存，同一張表單收到兩份定義：
>
> ```
> ('all',     'crowd_level', 'Enum')      ← migration a2a8e4d8c51d:187 的種子資料
> ('shelter', 'crowd_level', 'Integer')   ← 管理員後來建的
> ```
>
> 已實跑驗證：shelter 的 `stationPropertyConfigs` 兩者都回傳。兩列的 `(sort_order, property_name)` 也相同，ADR-095 想修的排序不穩定在此案例上復發。
>
> **決策：本次不修，記為已知限制。** 理由是衝突面極小——`'all'` 桶子目前只有 `crowd_level` 一個欄位，且 task 那側的查詢不合併 `'all'`（`config_repository.py:100`），完全不受影響。等 PM 的範本內容落地、真正踩到再處理。
>
> 屆時的三個選項：①`property_name` 改為全表唯一（最貼近本 ADR 原意，且與 `station_properties` 只存 `property_name`、不存 `station_type` 的實際資料形狀一致；已查證 36+10 筆種子無跨型別同名，migration 可乾淨套用）②查詢層去重、具體型別蓋過 `'all'` ③寫入時擋下回 409。
>
> **與「多種災害疊加」無衝突**：疊加住在啟用軸（單一列的 `disaster_types` 陣列），本限制住在定義軸（`station_type` 是站點種類，與災害無關）。選項①不但不影響疊加，還是同一套「一份定義、多重啟用」邏輯的延伸。

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

---

## PR #36 code review 後補的決策（ADR-096~099）

以下四項是 PR #36 review 實測後拍板的修正，全部有對應測試。

### ADR-096 停用欄位需要一條看得到的路：`includeInactive`（需 `dynamic_field.edit`）

**白話**：欄位一旦停用就完全消失在 API 上，等於救不回來。加一個查詢參數讓有編輯權的人看得到已停用欄位。

**Context**：ADR-095 把 `is_active` 定位成「退役但保留資料」，但 `list_by_type` 是全 codebase 唯一的讀取路徑（`app/graphql/config/queries.py:40`、`:58` 是僅有的兩個呼叫端），而它一律追加 `is_active = true` 與災害類型條件。實測：把欄位設為 `is_active=false` 後 `stationPropertyConfigs` 回傳 `[]`，DB 列仍在但沒有任何 API 列得出來。要復原只能靠人記得完整的 `property_name` 並重打 `data_type` / `enum_options`——「退役」實際上等同「遺失」。

**Decision**：`list_by_type` 增加 `include_inactive: bool = False`；GraphQL 兩個 query 增加 `includeInactive` 參數，為 true 時**額外**要求 `dynamic_field.edit`。表單路徑（不傳參數）行為完全不變。

災害類型過濾**不受** `include_inactive` 影響：那是「這次災害要不要收集」，不是「這個欄位還存不存在」，兩者語意不同。

**Consequences**：
➕ 停用欄位可被列出、可用同一個 `upsert` 重新啟用。
➕ 一般使用者的表單路徑一個字都沒變。
➖ 多一個參數要在前端管理介面接。
➖ 災害類型過濾掉的欄位仍然列不出來（需要先改 project settings 才看得到）——本次不處理。

### ADR-097 station 查詢的排序必須以 `uuid` 收尾

**白話**：`('all', X)` 和 `('shelter', X)` 兩列排序鍵完全一樣，順序還是會跳。

**Context**：ADR-095 加了 `ORDER BY sort_order, property_name`，但 station 查詢會把該類型自己的列和 `'all'` 桶 union 起來，唯一鍵是 `(station_type, property_name)`——`('all','crowd_level')` 與 `('shelter','crowd_level')` 兩個排序鍵全部打平。實測：建立這組打平的列後查一次，接著只對其中一列做一次不改值的 `UPDATE`（tuple 移到 heap 尾端），查詢與資料皆未變而回傳順序翻轉，連跑三次結果一致。

**Decision**：`ORDER BY sort_order, property_name, uuid`。task 側的排序其實已是全序（無 `'all'` 桶且 `(task_type, property_name)` 唯一），仍一併加上，讓兩個查詢讀起來一致。

**Consequences**：
➕ 排序成為全序，同一份資料的回傳順序可重現。
➖ 打平時的相對順序由 `uuid` 決定，也就是任意但穩定；真要指定順序請用 `sort_order`。

### ADR-098 `enum_options` 比照其他欄位：省略=不動，`[]`=清空

**白話**：只想改個顯示名稱，卻會把 Enum 的選項整組清掉。

**Context**：`update_values` 無條件帶入 `enum_options`，而輸入型別的 `enum_options` 預設是 `None`（`app/graphql/config/types.py`）。ADR-095 之後 `upsert` 成了設定 `label` / `sort_order` / `is_active` 的手段，於是 `{propertyName, dataType:"Enum", label:"人潮"}` 這種自然呼叫會讓該列變成 `data_type='Enum'` 但 `enum_options = NULL`。實測確認：回傳與 DB 皆為 `None`，而同一次呼叫的 `sort_order` / `label` 都被完整保留——是這一欄的處理與 `_optional_config_fields` 不一致。

**Decision**：`enum_options` 併入 `_optional_config_fields`，套用同一套 `None` 代表「未提供」的規則。清空選項改用 `enum_options: []`（空陣列是「有提供」，會通過過濾）。

**Consequences**：
➕ 部分更新的語意在所有欄位上一致。
➕ 改 label 不再破壞表單選項。
➖ 明確傳 `null` 會被當成「不動」而非「清空」；清空必須傳 `[]`。這是為了跟旁邊四個欄位共用同一套規則，而不是替單一欄位引入 `UNSET` 機制。

### ADR-099 feature 013 的 migration 改掛在 feature 012 之後

**白話**：兩個 feature 的 migration 都掛在同一個 parent，一起合進 main 就變成雙 head，部署會斷。

**Context**：`07ac630e0009`（feature 013）與 `f2b7c9d4e0a3`（feature 012 搜尋索引）的 `down_revision` 都是 `e1f2a3b4c5d6`。各自單獨看都是單 head，但兩邊都進 main 後 `alembic heads` 會列出兩個 head，`alembic upgrade head` 直接中止（實測輸出：`FAILED: Multiple head revisions are present`）。

**Decision**：feature 012 先合併；`07ac630e0009.down_revision` 改為 `f2b7c9d4e0a3`，鏈成單線。

**Consequences**：
➕ 合併後 `alembic upgrade head` 單 head 可正常跑完。
➖ 在 feature 012 進 main 之前，本分支單獨 checkout 跑 alembic 會找不到 parent revision。這是刻意接受的相依性——PR 合併順序因此固定。

---

### ADR-100 `data_type` 比照其他欄位：省略=不動；只有新增時必填

**白話**：停用一個動態欄位不該需要重新說明「這個欄位是什麼型別」。原本 `data_type` 是 upsert 唯一必填的非鍵欄位，而且每次都會被無條件寫入，於是想停用欄位的呼叫端被迫附帶一個 `dataType`——猜錯就順手把欄位定義改掉了。

**Context**：ADR-095 加上 `is_active` 讓欄位可以退役，ADR-098 把「省略=不動」定為 upsert 的通則。但 `data_type` 沒有跟上：`config_repository` 的 `update_values = {"data_type": data_type, **optional}` 讓它繞過了 `_optional_config_fields()` 的過濾。實測（PR #36 review）：對一個 `data_type='integer'` 的既有欄位送 `{property_name, data_type: 'string', is_active: false}`，欄位確實停用了，型別也一併被改寫成 `string`，沒有任何警告。

**Options**：
- **甲：`data_type` 併入選填集合**（採用）。與 ADR-098 同一條規則，呼叫端 `{propertyName, isActive: false}` 即可退役。
- 乙：另開 `retireStationPropertyConfig` / `retireTaskPropertyConfig` mutation。語意最明確，但多兩個 mutation、兩組權限與測試，而且沒有解決「一般編輯也會誤改型別」這半邊。

**Decision**：`data_type` 改為 `str | None = None` 並交給 `_optional_config_fields()`。欄位是 NOT NULL，所以**新增**時仍必填——這個檢查放在 `_upsert_with_conflict_retry()` 裡，因為那裡才是真正決定 insert 或 update 的地方；缺少時拋 `PropertyConfigValidationError`（繼承 `ValueError`，訊息才能穿過 GraphQL 的 `MaskErrors`），是 client error 而不是 500。

**Consequences**：
➕ 退役欄位不再需要複述欄位定義，也就不會誤改它。
➕ upsert 的所有非鍵欄位語意終於一致，`_optional_config_fields()` 成為唯一的規則所在地。
➖ GraphQL schema 上 `dataType` 由必填變選填，是一個放寬性的 breaking change：既有呼叫端不受影響，但「漏傳 dataType」從 schema 層的錯誤變成執行期的 422。由 `test_creating_a_field_still_requires_a_data_type` 釘住。

---

### ADR-101 `disaster_types` 對不到任何欄位時回傳 warning，不擋下寫入

**白話**：災害型別打錯字（`floods` 之於 `flood`）目前完全沒有回饋——回 200、存進去、然後所有該型別的動態欄位從表單上消失。運維沒有任何辦法分辨「打錯字」和「這個型別本來就還沒設欄位」。

**Context**：ADR-091 明確接受「這裡沒有封閉字彙」——真正的災害型別清單屬於 PM-Scure 的規格，不屬於本 repo，在這裡發明一個 enum 等於猜測那份文件擁有的命名。那部分不變。問題在於寫入路徑上**沒有任何形式的回饋**。實測（PR #36 review）：`PATCH {"disaster_types": ["floods"]}` 回 200，`warnings` 不存在，log 一片空白，而掛在 `flood` 下的欄位當場從表單消失。

**Options**：
- **甲：回應帶 `warnings` + WARNING log**（採用）。
- 乙：對不到欄位就 422 拒絕。保護最強，但會強制「先設動態欄位、後設災害型別」的順序，首次部署時會擋住完全合法的操作。
- 丙：只寫 log。改動最小，但操作者在 console 上看不到，得有人去翻 log 才會發現——等於把發現時機推遲到「表單少了欄位」之後，正是這條要解決的問題。

**Decision**：`update_project_settings()` 在寫入前比對送進來的標籤與 `disaster_types_in_use()`（所有 config 列實際用到的標籤集合）。對不到的標籤變成 `ProjectSettingsUpdateResult.warnings`，由 `ProjectSettingsResponse.warnings` 回給呼叫端，同時寫一筆 WARNING log。**永遠不拒絕**：先設定災害、後設定欄位是合法的工作順序。

`disaster_types` 為空的 config 列是「所有型別通用」，不貢獻標籤——它們無論如何都會啟用，所以不可能是打錯的標籤原本想指向的對象。

**Consequences**：
➕ 打錯字在存檔當下就看得到，而不是等某張救援表單少了欄位才發現。
➕ 回應與 log 兩邊都有：前者給當下在 console 的人，後者給幾天後追查「為什麼淹水欄位不見了」的人。
➖ 每次 PATCH 多兩個 `SELECT DISTINCT unnest(...)`，僅在 `disaster_types` 有被送出時發生；這是低流量的後台端點。
➖ 這是啟發式的，不是驗證：一個「已經有欄位在用」的錯字仍然無法被偵測。等 PM-Scure 的字彙落地，這裡應該換成真正的 enum 驗證（ADR-091 已載明該接口）。

---

### ADR-102 `/auth/login`、`/auth/refresh`、SSO callback 的 `users` 寫入要指名 actor

**白話**：這幾條路徑都會更新 `users`（`last_login_at` / `last_activity_at`），而 `users` 是被稽核的表，所以每次都會寫一筆 `audit_logs`。但它們身上沒有 access token——使用者正在「證明」自己是誰，而不是「主張」——所以稽核觸發器讀到的 actor 是空的，每一筆都寫成 `user_uuid = NULL`。

**Context**：稽核觸發器從 `app.current_user_id` 這個 Postgres session 變數讀 actor，該變數由 `AuditContextMiddleware` 從 access token 解出、再由 `set_audit_session_variables`（`after_begin`）套用。這三條路徑的 middleware 解不到 token，ContextVar 全程是空的。實測（PR #36 review）：一次 refresh 後 `audit_logs` 得到 `action=UPDATE user_uuid=None row_id=<該使用者>`；login 那筆也是 NULL。PR 的測試計畫宣稱稽核列「帶 actor」，對本 feature 新增的這些列並不成立。

**Options**：
- **甲：補上 actor**（採用）。三條路徑寫入時，身分都剛剛被確立——password 驗證通過、refresh token 被 `rotate()` 接受、或 provider 的 ID token 驗證通過。
- 乙：接受 NULL actor，改成在 ADR-093 寫明「靠 `row_id` 追溯」。不改行為，但等於承認稽核表對「帳號自己的活動」這一類寫入是失憶的。

**Decision**：`app/db/session.py` 新增 `attribute_writes_to(db, user_uuid)`，在該次寫入前指名 actor。**只設 ContextVar 是不夠的**：這三條路徑都先讀過資料庫，交易早已開啟，`after_begin` 已經過去了——所以同時做兩件事，對已開啟的交易直接下 `set_config`，並設 ContextVar 讓同一請求後續（含 rollback 後新開的）交易也被歸屬。

範圍超出 review 提出的 refresh 一處：SSO 的兩處 `last_login_at` 是同一個缺陷的同一個形狀，只修 refresh 會讓本 ADR 當場自相矛盾。

**Consequences**：
➕ 「這個帳號最近做了什麼」在稽核表裡從 `row_id` 反查升級為 actor 直接可查。
➕ 唯一的 helper，之後任何「先驗證身分、再寫入」的路徑照抄即可。
➖ 每條路徑多一次 `SELECT set_config(...)` 的往返。
➖ actor 是這幾條路徑「自己宣告」的，不像一般請求那樣由 middleware 從已簽章的 token 解出。這在此處是安全的——三者都在身分驗證通過之後才呼叫——但這是個必須維持的前提，不是憑空的保證。

---

### ADR-103 `strict=True` 的 zip 移出 `except`：程式錯誤不得偽裝成 Redis 故障

**白話**：`_session_counts()` 的 `except Exception` 原本連 `strict=True` zip 拋的 `ValueError` 一起吃掉。那是這個函式自己的 bug，卻會被記成「Redis unavailable」，把查問題的人指向一個運作正常的子系統。

**Context**：ADR-094 決定 Redis 掛掉時每個 count 降級為 `null` 而不是讓整份使用者清單失敗，這部分是對的。PR 說明把 `strict=True` 辯護為「長度不符是程式錯誤，不是基礎設施故障」——但它就寫在 `try` 裡面，所以那個程式錯誤永遠不會浮出來。實測（PR #36 review）：讓第二次 pipeline 少回一個 flag，函式回傳 `{uuid: None}`、log 印出 `"Redis unavailable; omitting active_session_count"`，底層例外實際上是 `ValueError`。

**Options**：
- **甲：把兩個 zip 移到 `try` 之外**（採用）。`try` 只包住真正的 Redis 往返。
- 乙：把 `except` 收窄成 `redis.RedisError` / `ConnectionError` 等。Redis 客戶端的錯誤型別分散，漏掉一種就會讓整份使用者清單 500——把 ADR-094 的降級保證換成一份需要持續維護的型別清單。

**Decision**：兩次 `pipe.execute()` 留在 `try` 內，後續的計數與兩個 `strict=True` zip 移到其後。降級行為完全不變（由 `test_redis_being_down_still_degrades_quietly` 釘住），而長度不符現在會照實往外拋。

**Consequences**：
➕ 「Redis unavailable」這行 log 現在只代表 Redis 真的有問題。
➖ 這類 bug 從「靜默降級」變成 500。這是刻意的：一個會讓每個使用者的 count 都變成 `null` 的 bug，本來就該吵。

---

### ADR-104 `project_settings` 不繼承 `TimestampMixin`，理由寫在欄位上方

**白話**：`created_at` / `updated_at` 是逐字從 `TimestampMixin` 抄過來的，但沒有任何一行說明為什麼不直接繼承，讀起來像是無意的偏移。

**Context**：`TimestampMixin` 同時帶進 `delete_at`。本表是單列的部署設定（ADR-090），只會被更新、不會被軟刪除——一個沒有任何程式碼知道怎麼讀的軟刪除旗標，比重複兩個欄位更糟。理由成立，但檔案裡沒寫。

**Options**：甲：改用 mixin（會帶進不該存在的 `delete_at`）。**乙：留下兩個欄位，把理由寫成註解**（採用）。

**Decision**：在兩個欄位上方加註解說明 mixin 是刻意不繼承的，並補 `test_the_settings_row_is_never_soft_deleted` 釘住「沒有 `delete_at`、有那兩個時間欄位」。註解說明原因，測試防止有人「順手統一」時把 `delete_at` 帶回來。

**Consequences**：
➕ 下一個讀到這裡的人不會把它當成待清理的漂移。
➖ 兩個欄位定義仍然重複；若日後出現第二張「只更新不刪除」的表，值得抽一個 `UpdatedTimestampMixin`。
