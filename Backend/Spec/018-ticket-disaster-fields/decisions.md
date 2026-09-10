# 通報單災害動態欄位 — ADR 全集（ADR-244~253）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號接續 `Spec/016-resource-history/decisions.md`（ADR-243 為目前全 repo 最大值）。

---

### ADR-244 災害型別詞彙落地為「資料表」，不是 enum

**白話**：功能 013 說「等 PM 的詞彙來了，就在 `app/core/disaster_types.py` 放一個 `DisasterType`
enum」。詞彙來了，但我們沒有放 enum，改放一張表。

**Context**：`app/core/disaster_types.py` 的 docstring 明確保留了 enum 的位置：

> There is deliberately NO closed vocabulary here yet… When that vocabulary lands, a
> `DisasterType` enum belongs in this module and the callers below become validation
> instead of coercion.

PM 交付了六種：水災 / 土石流 / 疫情 / 核／輻射 / 火災 / 地震。但同時提出的需求是
**維運人員要能自己新增災害型別**。

**Decision**：新增 `disaster_types(key, label, is_active)` 主檔，seed 六筆。
`normalize_disaster_types` 維持純同步（repository 會呼叫它），另加 async 的
`validate_disaster_types(db, values)` 去對表檢查。

➕ 沒人預料到的災害只要一次 mutation，不必等部署 —— 災害應變期間這個差別是以小時計的。
➕ enum 帶不了中文顯示名稱，表可以（`label`）。
➕ 驗證從「無」變成「有」：ADR-169 以前只能警告的錯字，現在直接拒絕。
◾ 多一張表、多一次查詢。
➖ 「關閉詞彙」變成執行期資料而非型別，靜態分析看不到有哪些值。

**否決 enum 的理由**：enum 要改就要部署。ADR-091 當初拒絕寫死詞彙的理由是「不該猜別人文件裡的名字」，
而維運需求把這件事推得更遠 —— 就算現在猜對了六個，第七個來的時候還是會卡住。

**否決「不驗證、維持 coercion」的理由**：那正是 ADR-169 只能發警告的原因。錯字會乾淨地存進去，
然後把該災害的欄位全部從表單上抹掉，沒有任何錯誤訊息。

---

### ADR-245 `data_type` 改用「控制項名稱」，並套用到既有兩張設定表

**白話**：`Enum` / `Array` / `Integer` 改叫 `single_select` / `multi_select` / `number`。

**Context**：本來有兩套互相矛盾的詞彙。資料庫裡是 `String`/`Text`/`Integer`/`Boolean`/`Enum`/`Array`
（46 列 seed）；兩個 GraphQL 型別的 `description` 卻寫著 `'string', 'integer', 'float', or 'enum'`。
前端沒有任何程式碼在讀它（`admin/field-configuration/index.tsx` 是純展示元件、mock 資料），
所以現在是唯一能一次改掉、且不會弄壞任何東西的時機。

**Decision**：六個 token，以「表單要畫哪一種控制項」命名：
`text` / `long_text` / `number` / `boolean` / `single_select` / `multi_select`。
定義為 `@strawberry.enum FieldDataType`，三張設定表共用；migration 一併轉換既有 46 列，
`downgrade()` 有反向對照。

➕ `Enum` 與 `Array` 是最該分清楚卻最分不清楚的一對：`Array` 沒說選項來自 `enum_options`，
`Enum` 沒說它是單選。`single_select`/`multi_select` 說了。
➕ ADR-092 下這些列只是渲染提示，用控制項命名才名實相符。
➕ GraphQL enum 取代 `str`，錯的值在 schema 層就被擋掉。
➖ 跨 PR 的協調成本，見 ADR-252。

**否決 `Decimal` 的理由**：PM 的表把水深、裂縫寬列為 Decimal。但既然沒有任何東西驗證，
`number` 與 `Decimal` 在後端行為完全相同；真正會傳到通報者眼前的是單位，所以改成 `number` + `unit`。

---

### ADR-246 `tickets.disaster_type` 改為 `disaster_types text[]`，且寫入時排序

**白話**：一張單可以同時是水災和土石流。存進去的時候順序會被排好。

**Context**：颱風同時帶來水災與土石流是常態，同一棟房子兩種災害都成立。原本的單數欄位逼使用者二選一。

**Decision**：`ARRAY(String) NOT NULL DEFAULT '{}'`，`normalize_disaster_types` 加上排序。

➕ 欄位解析本來就是陣列交集（`&&`），改成陣列不需要任何新的查詢機制。
➕ **排序是功能不是整潔**：`ticket_analytics._duplicate_pair_condition` 用 `=` 比較兩張單的
`disaster_types`，而 PostgreSQL 陣列相等是看順序的 —— 不排序的話 `{flood,fire}` 和 `{fire,flood}`
會被判定成不同災害，重複單就抓不到。
➖ downgrade 對雙災害單有損（只留第一個），migration 內已註明。
◾ 後端接觸面很小：model、三個 GraphQL 宣告、兩行 mutation、一個 service 參數、一個 analytics join。

---

### ADR-247 通報單設定表的鍵是 `property_name` 本身，值表一列一個選項

**白話**：station/task 的鍵是「(型別, 欄位名)」，通報單只有「欄位名」。

**Context**：ADR-091 把「定義」與「啟用」拆開，是因為 station 的第一維（`station_type`）不是災害維度，
混合災害時同一個 `property_name` 可能拿到兩份不同定義。通報單不一樣：災害型別**就是**唯一的維度。

**Decision**：`UNIQUE(property_name)`，`disaster_types` 負責全部的範圍控制。
值存進 `ticket_disaster_details`，`UNIQUE(ticket_uuid, property_name, value)`，一個選項一列。

➕ `access_blocked`（水災＋土石流）與 `entrance_blocked`（火災＋地震）各只有**一列**，
不可能各自漂移成兩份定義 —— ADR-091 的保證在這裡是最強的形式。
➕ `multi_select` 就是 N 列，寫入不用 JSON 編碼、讀取不用 parse。
➖ 一個 `property_name` 只能有一個 `label`。PM 的表在水災寫「出入口被水阻斷」、土石流寫「出入口被堵住」，
合併為中性的「出入口被阻斷」。
➖ 值一律存成文字（沿用 `task_properties.property_value` 的做法）。

**否決 JSONB 欄位的理由**：`tickets.disaster_details jsonb` 會更省（一欄取代一張表 + repository +
mutation + loader），但值就跟著整張單一起被稽核成一大塊，看不出「哪一題從 no 改成 yes」。
一張表能逐列稽核，也能被 PR #43 的時間軸逐列展開。

**否決 `(disaster_type, property_name)` 複合鍵的理由**：能保留 PM 表上的每個災害各自的
`顯示順序` 與 label，但共用欄位會變成兩列，可以各自被改到不一致 —— 正是 ADR-091 要消除的東西。

---

### ADR-248 通報單設定表沒有 `sort_order`

**白話**：兩張既有設定表有 `sort_order`，這張沒有。

**Context**：PM 的表有「顯示順序」欄，但每個災害各自從 1 編號，而共用欄位在水災是第 2、
土石流是第 3 —— 一列裝不下兩個順序。經確認顯示順序不是硬需求。

**Decision**：不加 `sort_order`。排序為 `(property_name, uuid)`。

➕ 少一個欄位、少一份要維護的資料。
➖ 表單依 key 的字母序呈現，不是 PM 表上的順序。
◾ 排序仍是全序且穩定（ADR-227 的要求），只是排序依據換了。

**要復原很便宜**：加一個欄位、改一行 `order_by`。

---

### ADR-249 空間欄位放在 `secondary_locations`，且維持一對一

**白話**：「幾房幾廳」「求救者在哪個空間」「可否進入」放在地址表上。

**Context**：PM 原本的欄位表有 `space_record_id`，說明寫著「一張 ticket 可有多個樓層／房間紀錄」。
經確認：**一個房間就是一張單**，不需要一對多。

**Decision**：在 `secondary_locations` 加五欄：`building_section`、`space_description`、
`victim_space`、`access_status`、`landmark_note`。`floor` / `room` 沿用既有欄位
（PM 的 `floor_label` / `unit_label`），不改名。維持一張 geometry 對一列地址。

➕ 這張表本來就有「只在某種 `location_type` 下有意義的可空欄位」（整組 `pole_*`），
新欄位沿用同一個前例。
➕ `space_record_id` 刪掉：它存在的唯一理由是當多列的鍵。
➖ 站點也拿到了這五個欄位，雖然只有通報單會填。
◾ `landmark_note` 是 PII：它描述通報者住家的入口，正是 PR #44 的 `mask_address` 要遮的那一級資訊。

---

### ADR-250 五個新欄位不進 `search_text`

**白話**：新的空間欄位不可被關鍵字搜尋。

**Context**：`secondary_locations.search_text` 是 generated column，改它要 drop + recreate，
還要同步更新 `tests/test_search_schema.py::EXPECTED_SOURCE_COLUMNS`。

**Decision**：不加。

➕ ADR-146 已經規定通報單的地址完全不可搜尋（只有站點走這張表），所以唯一的受益者只有站點的
`building_section`。
➕ 「求救者躲在主臥衣櫃」能被子字串搜到，是不該存在的能力。
◾ 站點的 `building_section` 搜不到,可接受。

---

### ADR-251 三張新表與**兩張既有設定表**一起進 `AUDITED_TABLES`

**白話**：順手補上一個沒人寫下來的漏洞。

**Context**：`station_property_config` / `task_property_config` **在所有分支上都沒有稽核**，
而且我沒有找到任何 ADR、註解或測試提過這件事（ADR-124 記錄的是 `station_properties` /
`task_properties` 這兩張**值**表的漏洞，不是設定表）。這很不一致：`project_settings` 之所以被稽核，
理由正是「改災害型別會一次翻動一整批動態欄位」—— 而欄位是在設定表裡定義的。

**Decision**：`disaster_types`、`ticket_property_config`、`ticket_disaster_details`
三張新表，加上 `station_property_config`、`task_property_config` 兩張既有表，一起在本功能的
migration 掛上 trigger（凍結快照寫法）。

➕ 補掉一個沒被記錄的漏洞，成本是同一個迴圈裡多兩個表名。
➕ `ticket_disaster_details` 進了稽核，PR #43 的時間軸才可能展開它。
◾ **這裡最容易犯的錯**：`AUDITED_TABLES` 只是一份 Python list，執行期沒有任何程式讀它；
真正掛 trigger 的是 migration。而 `tests/test_audit.py` 的 autouse fixture 會在執行期
**依那份 list 自行掛 trigger** —— 所以漏寫 migration 的話，整套測試照樣全綠，
正式環境卻永遠不會寫入任何一列稽核。
◾ 稽核 trigger 寫死 `r_id := NEW.uuid`，所以 `ticket_disaster_details` 必須用代理主鍵，
不能用 `(ticket_uuid, property_name, value)` 複合鍵 —— 否則每次寫入都會炸。
➖ 值表的稽核會把通報者填的內容原封不動存進 `audit_logs`（trigger 只遮 `password_hash`）。
目前 14 個 seed 欄位全是選項與數值，但維運人員一旦透過 `upsertTicketPropertyConfig` 新增
自由文字欄位，這句話就不再成立 —— 屆時需要重新檢視 PR #43 的分級。

---

## 跨 PR 整合

### ADR-252 `data_type` 重新命名必須與 PR #42 同步

**白話**：git 會乾淨地合併，然後行為是錯的。

**Context**：`app/services/bulk_columns.py`（PR #42 新增）把舊詞彙寫死成模組常數
（`ENUM = "Enum"`、`ARRAY = "Array"`、`INTEGER = "Integer"`…），`bulk_validate.py` 拿它們做
`column.data_type ==` 比較，`bulk_export.py` 直接 import 兩個設定 model。
**這些檔案全部是 #42 新增的**，與本功能零檔案重疊。

**Decision**：合併時同一次 PR 內更新 #42 的常數。若 #42 先合且不能動，退路是只把新詞彙套在
`ticket_property_config`，station/task 維持舊值。

➖ 退路違反「整個系統用同一套詞彙」的初衷，只在被迫時採用。
◾ 沒有自動化能擋住這個 —— 零檔案重疊代表 git 不會提示，CI 也不跑 pytest。

### ADR-253 本分支疊在 PR #48 上，migration 接在 `c3f0a1b2d4e6` 之後

**Context**：`c3f0a1b2d4e6`（briefings, PR #49）與 `90c93167fa66`（identity switching）都宣告
`down_revision = '07ac630e0009'`。本功能疊在 PR #48（`feat/er-diagram-update` → `feat/briefings`）上，
而 **#48 的分支上根本沒有 `90c93167fa66`** —— 它是隨 feature 010 進 main 的。

**Decision**：`e7b249d0af31.down_revision = 'c3f0a1b2d4e6'`。不建合併 revision。

➕ PR 的 diff 只有本功能，是乾淨的 stacked PR。
➕ 不去改 PR #49 的 migration 檔（改寫別人 PR 的 revision 是更糟的耦合）。
➖ **合併順序變成硬性的**：#49 → #48 → 本 PR。在 #48 進 main 之前，任何沒有 `c3f0a1b2d4e6`
的分支上 `alembic upgrade head` 都無法解析父節點。這是接受的成本，不是缺陷 —— 與 ADR-173 同一個判斷。
➖ 本分支上沒有 feature 010/014，所以測試 fixture 用的是舊的 token 產生方式（無 session、無 `act`）。
等 #48 進 main、main 再併回來時，這些 fixture 會需要跟著 `_create_user_with_role` 的簽章調整。

**兩個 head 的問題還在，只是不歸本 PR 處理**：等 #49/#48 進 main 之後，`c3f0a1b2d4e6` 與
`90c93167fa66` 就是共用 `07ac630e0009` 的兩個 head，需要一支空的合併 revision
（前例：`8ebfc3903041`、`c7d8e9f0a1b2`）。那屬於後進的那個 PR。
