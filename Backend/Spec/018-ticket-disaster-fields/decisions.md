# 通報單災害動態欄位 — ADR 全集（ADR-244~258）

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

**兩個 head 的問題還在**：等 #49/#48 進 main 之後，`c3f0a1b2d4e6` 與
`90c93167fa66` 就是共用 `07ac630e0009` 的兩個 head，需要一支空的合併 revision
（前例：`8ebfc3903041`、`c7d8e9f0a1b2`）。那屬於後進的那個 PR。

**PR #50 審查補正**：依本 ADR 自己訂的順序（#49 → #48 → 本 PR），後進的就是**本 PR**，
所以那支合併 revision 是本 PR 的責任。但它**不能現在寫**：
`90c93167fa66_identity_switching.py` 這個檔案在本分支上不存在，
所以宣告 `down_revision = ("e7b249d0af31", "90c93167fa66")` 會讓**本分支自己的**
`alembic upgrade head` 以 `Can't locate revision identified by '90c93167fa66'` 失敗。
正確順序是：#49 → #48 進 main → 把 origin/main 併回本分支（此時兩個父節點才都解析得到）
→ 才加合併 revision → 確認 `alembic heads` 只有一個 head → 合併本 PR。
已實測：把 main 的 migration 檔放進本分支的 versions/ 後，`alembic heads` 確實回報兩個 head。

---

## PR #50 審查修正（ADR-254~258）

以下五條來自 PR #50 的審查與端對端實測。前四條是缺陷修正，第五條是把既有的隱性約定寫成 schema。

### ADR-254 兩個通報者檢傷欄位納入 `ticket.view_pii`

**Context**：實測發現，**完全不帶 `Authorization` 標頭**的請求可以讀到
`personTrappedReported: "yes"`，而同一筆資料的 `contactName` 卻被遮成 `王◯◯`。
`ticket.view` 本來就是公開的（ADR-027），地圖上的座標也是公開的 —— 等於對全世界公告
「這個座標有人受困」。ADR-249 明明因為 PII 疑慮而刻意不把 `secondaryLocation` 掛上
`TicketType`，同一類判斷卻在這兩個欄位上得到相反的結果，而且看得出來不是想過之後的選擇。

**Decision**：`person_trapped_reported` / `immediate_danger_reported` 改成 gated resolver，
沿用 `TicketType._pii_visible`（與三個 `contact_*` 共用同一次 scope 檢查）。
`disasterDetails` **維持公開** —— 水深、瓦斯味、明火是救災現場的情境資訊，不是個資。

➕ 不必新增 capability：不用 seed `permissions` 列、不用改五個角色、不用動 RBAC 矩陣。
➕ 拒絕一律回 `null`，不丟 GraphQL error —— 與 `contact_*` 的既有契約一致
（`test_query_rbac.py` 對每個 PII 案例都斷言 `"errors" not in body`）。
➖ 權限不足的呼叫端**分不出「沒人問過」與「你不能看」** —— 這正是這個欄位存在的
null vs `unknown` 區別。接受：這個區別只對「能據以行動的人」有意義，而那種人依定義持有該 capability。
◾ `ticket.view_pii` 的字面意思偏「識別身分」，這兩個欄位其實是情境資訊。沿用而非新增，
是因為它們同樣是通報者對自身處境的私人陳述，屬於同一條信任邊界。

### ADR-255 三張設定表一律驗證 `disaster_types`

**Context**：ADR-244 只讓 `upsertTicketPropertyConfig` 驗證，station / task 兩張表照舊直接存。
實測：`disasterTypes: ["totally_made_up"]` 在 station 表存得乾乾淨淨，然後那個欄位對誰都不顯示 ——
正是 ADR-244 要關掉的沉默失敗，只是關了三分之一。更糟的是那個錯字會進
`disaster_types_in_use()`，而 `_unmatched_disaster_types` 正是拿它來比對專案設定，
所以兩邊打一樣的錯字反而會被當成「已設定」而不發警告。

**Decision**：`upsert_station_property_config` / `upsert_task_property_config` 加上與
ticket 側完全相同的兩行 `validate_disaster_types`。

➕ 三張表的行為一致，不必記得哪張表會驗證。
➖ 理論上舊資料列若帶著失效標籤，下次編輯會被擋。實際風險趨近於零：
`_optional_config_fields` 會濾掉 `None`，所以只有**明確送出** `disasterTypes` 時才驗證 ——
改個 label 不會重新驗證既有值。而且 migration 給 station/task 的種子資料一律是空陣列 `{}`。

### ADR-256 每個 list DataLoader 都要帶全序 `ORDER BY`

**Context**：`app/graphql/loaders.py` 從來沒有任何一個 loader 下過 `ORDER BY`。
功能 018 新增的 `disaster_details_by_ticket` 讓它浮出水面：同一批資料，
`setTicketDisasterDetails` 回 `crack_width_mm, exposed_wire, gas_odor, sparks`，
`ticket { disasterDetails }` 回 `sparks, gas_odor, exposed_wire, crack_width_mm` ——
因為 repository 有排序而 loader 沒有，而前端讀的是後者。

**Decision**：`_make_one_to_many_loader` 新增 `order_by` 參數，六個呼叫端全部帶上；
`photos_by_geometry` 與 `teams_by_zones`（在 repository 內）一併補。排序鍵一律以唯一欄位收尾，
使順序為全序（ADR-227）—— 與 property-config 查詢同一條規則。

➕ 修正範圍刻意大於本 PR 的 diff：這是既有缺口，新 loader 只是讓它可見。
➕ 沒有任何既有測試斷言過 loader 的順序，所以是純增益。
◾ `disaster_details_by_ticket` 刻意停在 `(property_name, value)` 而不補 `uuid`：
與 `list_by_ticket` 逐字相同才是修正的重點，而 `uq_ticket_disaster_detail_value` 已使該組合唯一。

### ADR-257 `setTicketDisasterDetails` 對重複的 `propertyName` 取聯集

**Context**：mutation 用 dict comprehension 建對應表，所以同一個 `propertyName` 出現兩次時
只留最後一筆。實測：送 `utility_hazards:[gas_odor]` 再送 `utility_hazards:[sparks, power_out]`，
只存到後者。一個「每勾一個框就送一筆」的前端會靜默掉光除了最後一格以外的所有勾選。

**Decision**：改用 `setdefault(...).extend(...)` 取聯集。

➕ 聯集本來就是 `multi_select` 的語意，也正是逐框送出的前端在表達的東西。
➕ service 層已用 `dict.fromkeys` 去重且保序，所以跨兩筆重複的值會塌成一列，
不會撞 `uq_ticket_disaster_detail_value`。

### ADR-258 `data_type` 以 CHECK 約束釘死在封閉詞彙上

**Context**：ADR-245 的詞彙改寫是一次性的資料修正，沒有任何東西擋得住之後手寫的 INSERT
再塞回舊 token。這不是美觀問題：`FieldDataType(m.data_type)` 會丟 `ValueError`，
而 `MaskErrors` 的白名單會原樣放行，所以**一列壞資料就讓整個
`stationPropertyConfigs` 查詢回 `data: null`** —— 不是那一列降級，是整個查詢死掉。

**Decision**：在同一支 migration（`e7b249d0af31`）為三張設定表加
`ck_<table>_data_type` CHECK。用 guarded `DO` 區塊，不用
`ADD CONSTRAINT ... IF NOT EXISTS`（Postgres 的 table constraint 不支援該語法）。

➕ 把不變式寫進 schema，寫入時就被拒，而不是讀取時才炸。
➕ 若既有資料庫已有壞資料列，migration 會帶著表名大聲失敗 —— 部署時就知道，
而不是等到有人打開表單。
➖ `downgrade()` 必須**先**移除約束再跑 `_DATA_TYPE_MAP_INVERSE`，
否則把 `Enum` / `Array` 寫回去會違反 CHECK。已驗證 up → down → up 往返。
◾ `_FIELD_DATA_TYPES` 在 migration 內凍結一份，不讀 `FieldDataType`，
理由與 `_FEATURE_018_AUDITED_TABLES` 相同：歷史 migration 不該追著後續功能擴充的 enum 跑。
日後新增控制項是「新一支 revision 重建約束」，不是回頭改這裡。

---

## PR #50 審查修正第二輪（ADR-263~272）

第二輪審查在真實 PostGIS 實例上端對端實測，並把 `origin/main` 併進來重跑全套測試。
以下十條全部有可重現的失敗案例。

### ADR-263 `ticketPropertyConfigs` 與 `disasterTypes` 改由 `ticket.view` 把關

**Context**：兩支查詢分別要 `dynamic_field.view` 與 `project.view`，兩者都不在 `PUBLIC_PERMS`，
而種子角色裡只有 `super_admin` 持有。`ticket.add` 卻是發給 `user` 的 ——
**一般民眾可以送出通報單，卻拿不到那張表單的題目，也拿不到災害型別選單**。
測試沒抓到，是因為 `coordinator_auth` 直接授予 `FIELD_VIEW`。

**Decision**：兩支查詢改用公開的 `Perm.TICKET_VIEW`。`includeInactive` 仍各自要
`dynamic_field.edit` / `project.edit`（ADR-226 不變）。

➕ 這兩支描述的資料本來就是公開的：`ticket.disasterTypes` 與 `disasterDetails` 匿名可讀，
少了這裡的 label / unit，`disasterDetails` 讀起來只是一串裸鍵。
➕ 不動 `PUBLIC_PERMS`、不動角色矩陣，也一次修好匿名、`user` 與兩個團隊角色。
◾ `stationPropertyConfigs` / `taskPropertyConfigs` 維持 `dynamic_field.view`：
那是後台表單，不是民眾填的那一張。

### ADR-264 `disaster_types_in_use()` 只看 station/task 兩張設定表

**Context**：ADR-255 把 `TicketPropertyConfig` 加進這個函式，但它唯一的呼叫端是
`_unmatched_disaster_types` —— 而 `project_settings.disaster_types` 只決定 station/task 表單，
通報單的欄位是用「每張單自己的型別」解析的。migration 又替六種型別都種了通報單欄位，
所以**這個警告從此永遠不會觸發**：station/task 對 `radiation` 一個欄位都沒有，PATCH 仍回 `warnings: []`。

**Decision**：函式退回只掃 `StationPropertyConfig` 與 `TaskPropertyConfig`。

➕ 警告要講的就是「這兩張表單會被清空」，計入不受 project settings 管的表只會讓它沉默。
➖ 原本的測試是靠「測試資料庫沒有通報單設定列」才通過的；補一條明確種入通報單欄位仍要求警告出現的測試。

### ADR-265 `list_for_disasters` 先正規化參數

**Context**：`ticketPropertyConfigs(disasterTypes: ["Flood"])` 回 `[]`，`["flood"]` 回兩列。
`&&` 是逐元素字串相等，大小寫沒被攤平就永遠對不上 —— 而且是靜默的空表單，不是錯誤。

**Decision**：進查詢前跑 `normalize_disaster_types`。

➕ 寫入端一直都會正規化，讀取端沒有是不對稱。

### ADR-266 `validate_disaster_types` 新增 `keep`：紀錄已持有的 label 不受停用影響

**Context**：ADR-244 說停用是「既有資料照樣可讀，只是不能再新開」，但檢查是對**整份送出的清單**跑的。
實測：`{flood, landslide}` 的通報單、停用 `landslide` 之後，
`updateTicket(disasterTypes: ["landslide"])`（通報者拿掉 flood）被擋；
project settings 只改 `name` 可以過，同一個 PATCH 帶上沒變的 `disaster_types` 就 422。

**Decision**：`validate_disaster_types(db, values, *, keep=())`，`keep` 內的 label 一律放行。
`update_ticket` 傳入該單目前的型別，project settings 傳入目前存著的清單。

➕ 只有「真的新增」的 label 才受 `is_active` 檢查，這正是 ADR-244 原本的意思。
➕ 未知（不在表裡）的 label 仍然被拒 —— `keep` 放行的是既有事實，不是任意字串。
◾ 三張設定表沒有接 `keep`：它們的更新本來就是部分更新，不送 `disaster_types` 就不會被檢查，
為此多讀一次既有列不值得。

### ADR-267 `setTicketDisasterDetails` 設上限

**Context**：ADR-092 說不驗證值，但從來沒有人限制**量**。實測：以 `user` 角色對自己的單送出
500 個 key、每個 10,000 字，全部存下；接著匿名讀 `ticket { disasterDetails }` 回
**5,021,433 bytes**，而且每一列都寫進 `audit_logs`。

**Decision**：在 service 層加四個上限 —— 100 個欄位、每欄 50 個值、單值 500 字、key 100 字。
超過丟 `ValueError`（`MaskErrors` 白名單內，訊息會原樣傳給呼叫端）。

➕ ADR-092 保護的是「不要因為設定變更弄丟受困者的答案」，那只需要不檢查**鍵**；量的上限不衝突。
➕ key 的長度上限順手修掉另一個問題：101 字的 `propertyName` 原本會撞 `String(100)` 並回
「Unexpected error.」，現在會指名哪個鍵太長。
◾ 數字是對照種子表單訂的（14 個欄位，最大的 multi_select 有 4 個選項），寬鬆但仍是硬上限。

### ADR-268 通報單的地址可以修改，且讀取由 `ticket.view_pii` 把關

**Context**：spec 說「寫入面已完成，只有讀取面延後」，但其實**建立之後就再也改不了**：
`UpdateTicketInput` 沒有 `secondaryLocation`，`TicketType` 也沒有。
打錯的門牌永遠是錯的，當初沒填地址的單也永遠補不上 —— 而 `app/graphql/shared.py` 的註解
還寫著 `updateTicket` 會轉送這個 input。

**Decision**：`UpdateTicketInput` 加上 `secondaryLocation`（整份取代，沒有列就建立），
並在 `TicketType` 開出 `secondaryLocation`，用既有的 `_pii_visible` 把關。

➕ ADR-146 要的那個 PII 判斷就此做出，而不是繼續延後：拒絕時回 `null`，與 ADR-254 的兩個檢傷欄位一致。
➕ 沒有新的能力、沒有新的檢查點 —— 重用 `TicketType._pii_visible`。
➕ 車站那一側維持公開：避難所的地址本來就在地圖上。
◾ `SecondaryLocationType` 跟著 input 搬進 `app/graphql/shared.py`，
否則 `tickets/types.py` 與 `geo/types.py` 會互相 import。

### ADR-269 不需要合併 revision

**Context**：ADR-253 規劃了一支 `down_revision = ("e7b249d0af31", "90c93167fa66")` 的空合併 revision。
但 main 上 `90c93167fa66` 已經不是 head（`b3f1c07d2a95` 接在它後面，head 是 `c4a91e77b0d3`），
照那個父節點寫仍然是兩個 head。

**Decision**：不寫合併 revision。PR #48 已經把 `origin/main` 併進去並把
`c3f0a1b2d4e6` 重新接到 `c4a91e77b0d3` 之後，所以本分支併上 #48 之後鏈是線性的，
`alembic heads` 只回報 `e7b249d0af31`。ADR-253 的 runbook 作廢。

### ADR-270 `mudslide` 改名要涵蓋 settings 與兩張設定表

**Context**：`_reshape_tickets` 只改 `tickets`。實測從 `c3f0a1b2d4e6` 升上來：
通報單變成 `{landslide}`，但 `project_settings` 與 `station_property_config` 仍是 `{mudslide}` ——
`mudslide` 圈定的欄位從此對不上任何一張單，而之後一次原樣送回 `mudslide` 的 settings 寫入會 422。

**Decision**：新增 `_rename_legacy_disaster_labels()`，對 `project_settings` 與兩張既有設定表
跑 `array_replace(disaster_types, 'mudslide', 'landslide')`。

◾ `Typhoon` 這種不在六種之列的舊值不處理：沒有正確的對應可猜。有了 ADR-266，
帶著它的紀錄至少不會因此被鎖死。

### ADR-271 migration 的 `data_type` 對應改為不分大小寫

**Context**：main 的 `stationPropertyConfigs` 文件把 `data_type` 寫成
`'string', 'integer', 'float', or 'enum'`，欄位又是自由文字。只認首字大寫的對應表漏掉這些列，
接著 ADR-258 的 CHECK 就讓升級整個失敗：
`CheckViolationError: check constraint "ck_station_property_config_data_type" ... is violated by some row`。

**Decision**：`WHERE lower(data_type) = lower(:old) AND data_type NOT IN (<新詞彙>)`。

➕ `NOT IN (<新詞彙>)` 是關鍵：少了它，小寫的舊 `text` 會在 `String → text` 之後被
`Text → long_text` 再改一次。
➕ 真正無法對應的值仍然會撞 CHECK 並指名表格 —— 靜默塞成 `text` 等於改寫欄位的定義。
◾ 新增 `tests/test_migration_legacy_disaster_data.py`：真的跑到 `c3f0a1b2d4e6`、寫入舊資料、再升到 head。

### ADR-272 bulk 匯入的型別詞彙與設定表的詞彙分開

**Context**：ADR-252 預告過 PR #42 的衝突，#42 已經進 main。`bulk_columns.py` 把舊 token
寫死成模組常數，`bulk_import.py` 還在傳 `disaster_type=`（單數）。

**Decision**：`bulk_columns` 保留自己的「怎麼轉型一個儲存格」詞彙（`Integer` / `Float` / …），
另外用 `_WIDGET_COERCION` 把設定列的控制項名稱翻過來；CSV 欄位改名 `disaster_types`，
以逗號分隔，匯出時 join、匯入時 split。

➕ 兩者本來就是不同的問題：`FieldDataType` 只有一個 `number`，
但 bulk 必須知道 `level` 是 int4 而 `latitude` 不是。
➕ 逗號分隔讓兩種災害型別的通報單能原樣往返；沿用單數欄位會在匯入時靜默掉第二種。
◾ `number` 對應到 `Integer`：兩張 EAV 值表也只能存到這個精度，小數會在自己那一列帶著可讀訊息失敗。

## Review round three（ADR-277~279）

### ADR-277 三張設定表的 `disaster_types` 也沿用 ADR-266 的 `keep`

**Context**：ADR-266 只改了通報單與 `project_settings`，三張設定表維持「整份檢查」，理由是
「更新是部分的，不送 `disasterTypes` 就不會檢查」。但從管理介面走過來就踩得到：

```
停用 landslide
upsertStationPropertyConfig(stationType:"shelter",
    input:{propertyName:"probe_ls", dataType:number, disasterTypes:["landslide"]})
  → 未知或已停用的災害型別：landslide
upsertStationPropertyConfig(... input:{propertyName:"probe_ls", label:"改標籤"})
  → 200，disasterTypes 仍是 ["landslide"]
```

同一列可以改標籤，卻不能帶著自己**沒有變動**的 scope 存回去。一個送出整個物件的表單拿到
422，而唯一的解法是把這個欄位本來就該有的災害型別刪掉。

**Decision**：`disasterTypes` 有送進來時，先讀出既有列，把它現有的 `disaster_types` 當成
`keep` 傳進 `validate_disaster_types`。三個 repository 各補一個 `get_by_key`，`upsert` 內部原本
的 `lookup()` 改為呼叫它 —— 鍵的查詢只寫一次。

➕ 與通報單、`project_settings` 三邊語意一致：`keep` 讓既成事實通過，新加的標籤照樣要 `is_active`。
➕ 停用仍然擋得住擴散：`probe_fresh` 這種本來沒有 `landslide` 的欄位還是被拒絕。
➖ 送了 `disasterTypes` 的寫入多一次 SELECT。這是後台管理的寫入，而且 `upsert` 本來就要查同一列
決定 insert/update。沒送的話完全不查。
◾ 沒帶 `disasterTypes` 的部分更新行為不變（ADR-228/099）—— `None` 仍然代表「不動」，不重新檢查。

### ADR-278 `multi_select` 的 CSV 儲存格保留多值

**Context**：ADR-272 的 `_WIDGET_COERCION` 把 `multi_select` 對到 `Enum`，而 `Enum` 是單值的：

```
'gas_odor'            → 通過
'gas_odor,power_out'  → 「gas_odor,power_out」不是允許的值
```

匯出端寫的就是這個逗號字串，所以匯出再匯入會整列失敗。改名成 `multi_select` 之前，
`Array` 是原樣通過、完全不驗證。

**Decision**：新增 `MULTI_ENUM` 這個轉型方式：以逗號（半形或全形）切開，每一段都對
`enum_options` 檢查，再用半形逗號接回成**一個字串**。

➕ 兩件事同時成立：多值可以往返，而且每個值仍受 `enum_options` 約束 —— 直接對到既有的
`LIST` 只有前者，會把值的檢查整個丟掉。
➕ 回傳字串而不是 list 是必要的：`task_properties.property_value` 只有一個文字欄位，
`bulk_import._write_task_properties` 存的是 `str(value)`，list 會變成
`"['gas_odor', 'power_out']"` 這種 Python repr 進資料庫。
◾ 目前還踩不到：`task_property_config` 只有 `number` / `single_select` / `text`，
而 bulk 從不碰 `ticket_property_config`。要等某個操作員建出第一個 multi_select 任務欄位才會發生。

### ADR-279 `disasterDetails` 的鍵不受設定表限制，而且是公開讀取

**Context**：ADR-092 不驗證值，ADR-267 加上了量的上限，但「鍵可以是任何字串」與
「匿名可讀」這個組合一直沒有被寫下來。實際行為是：任何通報者都能存下沒有任何設定列定義的
`propertyName`，匿名呼叫端讀得回來。

**Decision**：維持現狀，並在此記錄成決定而不是疏漏。不限制鍵的來源，`disasterDetails`
維持公開讀取。

➕ **公開是目的，不是尚未關上的洞。** 水深、土砂堆積深度、瓦斯味、電線裸露 ——
這些就是民眾需要知道的危險狀況。哪裡淹到腰、哪條路有瓦斯味，知道的人愈多愈安全；
把它鎖在登入後面，等於讓最需要避開的人看不到。這是本欄位存在的理由，
不是 ADR-254 順手放行的結果。
➕ ADR-092 的理由沒有變：表單載入到送出之間欄位被 retire，答案還是要存下來 ——
以設定表當白名單就是把「弄丟受困者的答案」重新裝回去。
➕ 量已經由 ADR-267 封住：單張通報單上限約 100 欄 × 50 值 × 500 字，不再是無上限的儲存空間。
➕ 個人資訊不在這裡：那些在 `secondaryLocation` 與兩個檢傷欄位，三者都由 `ticket.view_pii`
把關（ADR-254/268）。危險狀況公開、個人身分不公開，是兩條分開的線。
➖ 代價要講清楚：日後若有人用 `upsertTicketPropertyConfig` 建出一個自由文字欄位，
它的內容預設就是公開的。要改的話該改的是那個欄位的分級，不是這裡的鍵檢查。
