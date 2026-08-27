# Resource Search — ADR 全集（ADR-077~084、146~150）

**Date**: 2026-08-16（ADR-146 於 2026-08-23 追加）
**Feature**: 011-resource-search
**Status**: 已實作（PR #35）；ADR-146~150 為 review 後的修正
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/010-multi-team-membership/decisions.md`（ADR-068~076）。

---

### ADR-077 搜尋以既有列表查詢的 `q` 參數實作，不新增獨立搜尋端點

**白話**：不做一個「全站搜尋框」的新 API，而是讓現有的「列出站點」「列出工單」多吃一個關鍵字參數。

**Context**：搜尋有兩種形態——(1) 現有列表查詢加 `q`；(2) 獨立 `search(q, types: [...])` 回傳跨型別混合結果。現有列表查詢已具備完整骨架：scope 過濾（`extra_filters=scope_filter(...)`）、bbox、分頁、排序（`app/graphql/geo/queries.py:32-70`、`app/graphql/tickets/queries.py:38-72`）。

**Decision**：在 `stations` / `tickets` / `ticketTasks` 三個既有 GraphQL 查詢新增 `q: String` 參數。不新增搜尋專用端點。

**Consequences**：
➕ 免費繼承 scope 過濾、bbox、分頁、既有排序；搜尋與篩選天然可組合（「這個地圖範圍內、狀態為進行中、且含『光復』的工單」）。
➕ 前端不需要學新 API，也不需要維護第二條資料路徑。
➖ 沒有跨型別的統一搜尋。若日後前端需要全站搜尋框，得另外設計——但跨表分頁（`total_count` 怎麼算、翻頁時兩張表的游標怎麼對齊）本來就是難題，值得單獨決策。

**佐證**：Notion 上此票分類為「系統性」而非「後台」；UIUX 規劃的是「Tickets Management」與「Resource Stations Table」兩張獨立表格，非全站搜尋框。

---

### ADR-078 中文搜尋採 `pg_trgm` + `ILIKE`，不引入斷詞擴充

**白話**：用「字元片段比對」而不是「把句子切成詞」來搜中文。搜「光復」找得到「花蓮縣光復鄉」。

**Context**：PostgreSQL 內建全文檢索（`to_tsvector`）**不做中文斷詞**，「花蓮縣光復鄉」會被當成單一 token，搜「光復」找不到。三個選項：
1. `pg_trgm` + `ILIKE '%q%'`：字元級三元組，不需斷詞，官方 contrib 模組。
2. `zhparser` / `pgroonga`：真正的中文斷詞 + `ts_rank` 相關性。
3. 純 `ILIKE` 不裝擴充：無索引，全表掃描。

現況只裝了 postgis（`alembic/versions/60fa7227481a_initial_schema.py:24`）。

**Decision**：採用 `pg_trgm`。相關性以 `similarity()` 計算。

**Consequences**：
➕ `CREATE EXTENSION pg_trgm` 一行，與現有 postgis 同級，不需編譯第三方套件、不需改 `Dockerfile` 或部署環境（`docker-compose.yml` / `docker-compose.staging.yml` 兩套環境皆不受影響）。
➕ 對地名與機構名（「光復國小」「慈濟」「中正路」）穩定——這類專有名詞正是斷詞器最容易切錯的。
➖ 相關性排序品質不如真正的詞彙級 `ts_rank`。
➖ 2 字以下的查詢選擇性差（見 ADR-082）。

**否決理由（選項 3）**：功能上找得到，但無索引全表掃描——這是「今天沒問題、上線後才會出事」的決定。

---

### ADR-079 可搜欄位正向表列；PII 與備註類欄位永不可搜

> **部分被 ADR-146 取代**：`secondary_locations` 的可搜性從「整張表」收斂為「只在掛於 station 下時」。

> **範圍擴充（2026-08-27）**：本 ADR 原本只談 `tickets` 的 `contact_*`，因為當時那是唯一持有這組欄位的表。`stations` 在 `b8f4d2a6e1c3`（station photos and contact fields）也加上了 `contact_name` / `contact_email` / `contact_phone`，所以「排除全部 `contact_*`」現在同時適用於兩張表。正向表列本來就把它們擋在外面——已驗證 `stations.search_text` 的 generation 運算式只含 `name` 與 `description`，用站點聯絡電話反查回傳 0 筆——這裡只是把文字補齊，不是行為變更。

**白話**：明列哪些欄位可以被搜到，其餘一律不可搜。個資欄位與操作備註都排除。

**Context**：`tickets` 的 `contact_name` / `contact_email` / `contact_phone`（`app/models/request.py:16-18`）在正常 API 是逐欄位遮蔽的（`app/graphql/tickets/types.py` 的 async field resolver + `app/graphql/masking.py`）。若這些欄位可搜，**用電話號碼就能反查工單**，遮蔽形同虛設。

備註類欄位（`comment` / `progress_note` / `pole_note`）是自由文字，實務上會累積聯絡方式、人名、臨時協調事項（「物資已交接，聯絡人王小姐 0912-345-678」），可搜等於讓 PII 從後門回來。

**Decision**：可搜欄位以**正向表列**定義（見 `spec.md` §3）。排除全部 `contact_*` 與全部備註類欄位。排除規則不因呼叫者 scope 而放寬——即使持 `all` scope 也搜不到。

**Consequences**：
➕ PII 反查路徑封死，且封死的方式是「資料根本不進索引」，不依賴查詢時的條件判斷（不會因為某個 code path 忘記加條件而洩漏）。
➕ 索引體積下降。
➖ 搜不到「只寫在備註裡」的資訊，使用者可能回報「明明有卻搜不到」。
➖ 新增可搜欄位需要改 migration（generated column 的組成），不是改一行設定。這是刻意的——讓「開放一個欄位可搜」成為需要審視的動作。

**日後若需要**：「用電話找工單」做成獨立功能，掛專屬 capability，與一般搜尋分離。

---

### ADR-080 1:N 關聯以 `EXISTS` 子查詢納入搜尋，不用 `JOIN`

**白話**：搜尋要涵蓋「站點底下的物資項目」和「地址」，但不能用 JOIN，否則一個站點會在結果裡出現很多次。

**Context**：動態欄位（`station_properties` / `task_properties`）與地址（`secondary_locations`）都是 1:N。一個站點有 3 筆命中的 property，`JOIN` 會讓它在結果中出現 3 次 → `count_active` 算出膨脹的總數、分頁跳號、前端看到重複項目。

**Decision**：全部以 `EXISTS` 相關子查詢納入，與主表條件以 `OR` 串接。沿用既有模式——zone scope 已經是這樣寫的（`app/core/rbac_scopes.py:141-147`）。

**Consequences**：
➕ 結果集不膨脹，`count_active` 與分頁維持正確，且與既有 scope 過濾的寫法一致。
➕ 每個 `EXISTS` 可獨立走各自表的 GIN 索引。
➖ 子查詢數量隨可搜關聯表增加而增加（`stations` 有 2 個，`tickets` 有 3 個），查詢計畫較複雜。

---

### ADR-081 每張表一個 `search_text` generated column + 單一 GIN 索引；長欄位截斷 500 字元

> **本 ADR 宣稱的跨欄位命中，實作上被分隔符擋掉了，已由 ADR-155 修正。** 下方「➕ 跨欄位命中」那條在 ADR-155 之前是不成立的。

**白話**：不是每個欄位建一個索引，而是把該表所有可搜欄位串成一欄，只建一個索引。長描述超過 500 字的部分不進索引。

**Context**：兩個選項：
- **A**：每欄一個 GIN 索引 → 約 16 個索引（`secondary_locations` 自己就佔 8 個）。查詢為 `name ILIKE %q% OR description ILIKE %q%`，靠 planner 做 BitmapOr。
- **B**：每表一個 `search_text` generated column + 單一 GIN 索引 → 6 個索引。查詢為 `search_text ILIKE %q%`。

寫入成本兩者大致打平：A 只重建被改欄位的索引（1~2 個小更新），B 重算整個 `search_text`（1 個大更新）。**B 的優勢不在寫入。**

`description` 是無長度限制的 `text`（`app/models/geo.py:49`、`app/models/request.py:15`）。GIN 索引條目數 ≈ 資料列數 × 字元數，單列貼進 5 萬字即產生 5 萬個條目，等同 250 列的索引空間。

**Decision**：採 B。長文字欄位在 generated column 內以 `left(..., 500)` 截斷。

**Consequences**：
➕ **跨欄位命中**：搜「光復鄉中正巷」在 A 是一個都搜不到（每個欄位各自比對，沒有任何單一欄位包含完整字串），在 B 因為欄位已串接而能命中。這是 B 最實質的優勢。（**前提是串接時不放分隔符——見 ADR-155**。）
➕ 查詢計畫可預測（單一索引掃描），不隨資料分布飄移。
➕ 索引數 16 → 6。GIN 索引本身的體積大於複製一份文字，B 反而更省磁碟。
➕ 截斷讓索引成本有硬性上界，不隨使用者輸入失控。
➖ 文字在磁碟上存兩份。
➖ 新增可搜欄位要改 migration（同時也是 ADR-079 想要的效果）。
➖ 超過 500 字之後的內容搜不到。以災防場景的描述長度判斷，這個上限遠高於實際需求。

---

### ADR-082 查詢字串長度限制 2~50 字元

> **下限的理由被 ADR-150 更正**：實測 2 字的行為與本 ADR 描述的 1 字相同。下限維持 2，但不再宣稱 2 字能取得索引選擇性。上限（50 字）不受影響。

**白話**：太短的關鍵字搜了沒意義又很慢，太長的是攻擊。兩邊都擋掉。

**Context**：
- **下限**：中文 1 個字（「水」）的 trigram 選擇性極差，索引形同失效退化為全表掃描，且結果對使用者無意義。
- **上限**：API 公開，塞 10KB 進來會產生上萬個 trigram 的查詢，是一個免費的 DoS 缺口。實際使用情境中查詢長度預期為 2~6 字。

**Decision**：`q` 長度限制 2~50 字元，超出範圍回 400 並附說明訊息。`q` 為 `None` 或空字串時不套用搜尋條件，行為與現況完全一致。使用者輸入的 `%` / `_` 在進入 `ILIKE` 前 escape。

**Consequences**：
➕ 慢查詢與 DoS 面同時收斂。
➕ escape 讓使用者無法用萬用字元改變查詢語意。
➖ 前端需對應顯示「至少 2 個字」的提示。
➖ 單字搜尋（少數情境下可能有意義，例如搜「水」找供水站）被擋。判斷是這類需求應該用 `station_type` 篩選解決，不是文字搜尋。

---

### ADR-083 `q` 有值時以相關性優先排序，既有排序降為 tiebreaker

> **排序鍵被 ADR-147 取代**：`similarity()` 對中文常為 0，改為「自身命中」布林優先、`similarity()` 降為組內排序。本 ADR 的其餘部分（分支處理、`priority_score` 為 no-op tiebreaker）仍成立。

**白話**：有關鍵字時，最像的排前面；沒關鍵字時，維持原本的排序。

**Context**：`stations` 現行排序為 `priority_score DESC NULLS LAST, created_at DESC`（`app/repositories/geo_repository.py:43`）。搜尋通常期待「最相關的在前」，兩者看似衝突。

查證後發現衝突是理論性的：**`priority_score` 從未被寫入**。欄位定義、migration、`ORDER BY`、GraphQL 曝露全都存在，但整個 codebase 沒有任何一行賦值，恆為 NULL。`desc().nulls_last()` 在全 NULL 下等於無作用，實際排序只有 `created_at DESC` 生效。

**Decision**：
```
q 有值：similarity(search_text, :q) DESC, priority_score DESC NULLS LAST, created_at DESC
q 無值：priority_score DESC NULLS LAST, created_at DESC        （維持現狀）
```

**Consequences**：
➕ 不需要在「相關性」與「既有排序」之間取捨，分支處理即可。
➕ `priority_score` 今天是 no-op tiebreaker；等它被實作後排序會自動變好，不需回頭改搜尋邏輯。
➖ `similarity()` 需對每一筆命中列計算，但命中集已被索引收斂，成本可忽略。

**衍生問題（本票不處理）**：`priority_score` 是半實作且對外曝露一個恆為 `null` 的欄位，前端可能已在讀取。建議另開票處理——要嘛實作寫入邏輯，要嘛從 API 移除。

---

### ADR-084 過短查詢維持拋錯，接受其在日誌留下 stack trace；由前端負責事前攔截

**白話**：使用者只打一個字時，後端會回一個明確的錯誤訊息，代價是伺服器日誌會留下一整段例外堆疊。我們接受這個噪音，改由前端在送出前就擋掉。

**Context**：Phase 1 在 docker 環境端到端驗證時才發現——`SearchQueryError` 從 resolver 傳播出去後，Strawberry 會以 ERROR 等級連同完整 traceback 記錄：

```
backend-1 | 搜尋關鍵字至少 2 個字
backend-1 | GraphQL request:1:8
backend-1 |   File "/app/app/repositories/geo_repository.py", line 76, in count_active
backend-1 |   File "/app/app/core/search.py", line 74, in build_search_condition
```

這是既有慣例的必然結果（ADR-077 的「沿用既有 domain error → `raise ValueError`」），不是本功能引入的新模式。但搜尋是**公開且高頻**的端點，使用者逐字輸入時必然頻繁觸發 1 字查詢，噪音量遠大於既有的「找不到公告」之類案例——使用者輸入驗證失敗看起來會像伺服器錯誤，干擾真實錯誤的排查。

三個選項：維持拋錯／過短時回空結果不報錯／新增 Strawberry error 處理區分使用者輸入錯誤與伺服器錯誤。

**Decision**：維持拋錯（選項一）。前端在送出前擋掉不足 2 字的查詢。

**Consequences**：
➕ 與既有 domain error 慣例一致，不引入第二套錯誤處理模式。
➕ 後端驗證維持為**防線**而非主要 UX 路徑——正常前端本就不該送出 1 字查詢。
➕ 使用者若真的送出，仍會得到可讀的「搜尋關鍵字至少 2 個字」而非空結果。
➖ 日誌會有噪音。若前端改為逐字即時搜尋（typeahead），噪音量會顯著上升，屆時應重新評估。

**否決「回空結果」的理由**：使用者得不到任何說明，只看到「查不到」，無從得知是關鍵字太短還是真的沒有資料。

**否決「新增 error 處理」的理由**：正確但會改變**全站**既有錯誤的記錄行為，超出本票範圍。真要做應獨立開票，一次處理所有 domain error 的分類與記錄等級。

---

### ADR-146 `secondary_locations` 只在掛於 station 下時可搜；掛在 ticket 下永不可搜

**白話**：同一張地址表，站點的地址可以搜，工單的地址不行。

**Context**：ADR-079 的正向表列把 `secondary_locations` 整張表列為可搜，`tickets_repository._search_condition()` 因此 OR 了一支打到該表的 `EXISTS`。Review（2026-08-23）指出這條路徑是個 oracle：

- `Perm.TICKET_VIEW` 在 `PUBLIC_PERMS` 裡（`app/core/permissions.py:115`），未登入者經 `app/graphql/context.py:69-71` 直接拿到 `Scope.ALL`，而 `scope_filter()` 對 `Scope.ALL` 回傳空 list（`app/core/rbac_scopes.py:111-112`）——不做任何過濾。
- `TicketType` 沒有任何地址欄位（`secondary_location` 這個 resolver 掛在 `StationType` 上，`app/graphql/geo/types.py:147`）。
- `SecondaryLocation.search_text` 含 `county/city/lane/alley/no/floor/room/pole_id`，是完整門牌。

三者合起來：未登入者送 `tickets(q:"中正路12巷3號")`，有回傳就等於確認了那張工單的門牌、樓層、房號——一個 API 本身不會回傳的值。而且可以逐段逼近試出來。

**這正是 ADR-079 拿 `contact_*` 舉例拒絕的同一種攻擊**，只是換成住址。ADR-079 當時把「地址」與「PII」當成兩件事，漏掉了「地址在 ticket 語境下就是報案人住家」。

**這張表是什麼**：`secondary_locations` 是 geometry 的補充定位表，`location_type` 分兩種——`address`（`county/city/lane/alley/no/floor/room`，補經緯度說不出的「四樓 A 室」）與 `pole`（`pole_id/pole_type/pole_photo_uuid/pole_note`，災區沒門牌時的電桿定位）。

**它的 FK 指向 `base_geometries.uuid` 而非 `stations.uuid`**（`alembic/versions/a2a8e4d8c51d_...py:93`）。`base_geometries` 是 polymorphic 基底，底下有 `base` / `closure_area` / `station` / `request`(=ticket)。**schema 層本來就設計成任何 geometry 都能掛地址**——所以那支 ticket 分支不是筆誤，是照著 schema 的意圖寫的。

**但實際只接了 station 一邊**：寫入只有 `CreateStationInput.secondary_location` → `app/graphql/geo/mutations.py:43-58` → `app/services/station.py:67-70`；讀取只有 `StationType.secondary_location`（`app/graphql/geo/types.py:147`）。ticket 建立與讀取都沒接，`CreateTicketInput` 沒有地址欄位，PR 自己的測試也只覆蓋 station 那一支。

因此這條路徑今天**比對不到任何資料**，拿掉是零功能損失。**但「今天沒資料」不是主要理由**——恰恰相反：schema 意圖涵蓋 ticket，代表「有人把 ticket 地址接上」不是假想而是遲早的事。那天一到，搜尋會**自動生效並無聲變成洩漏**，而做接線那件事的人不會想到要回頭檢查搜尋路徑。這才是必須現在拿掉、而非留註解提醒的原因。

**Decision**：`tickets_repository._search_condition()` 移除 `secondary_locations` 分支。`geo_repository`（station）那支保留不動。可搜性的判斷單位從「表」改成「**(entity, 表)**」。

否決「用 `TICKET_VIEW_PII` 把關」：要把 scope 從 resolver 穿到 repository，破壞 repository 層不碰 RBAC 的分界，且 `list_active` / `count_active` 兩邊都得傳、漏一邊就 `totalCount` 對不上（正是 `_active_conditions()` docstring 警告的那個坑）——而這一切是為了一條今天沒有資料、也沒有使用者的路徑。

否決「保留並寫進已知限制」：文件提醒在「加一個地址欄位」的 PR 裡幾乎不會被讀到，而洩漏是無聲生效的。

**Consequences**：
➕ 封死方式是「資料根本不進查詢」，不依賴 runtime 條件判斷——與 ADR-079 選擇正向表列的理由一致。
➕ 順帶少一層 `EXISTS`，工單搜尋的查詢計畫變淺。
➕ 新增測試 `test_ticket_search_cannot_find_by_address` 用手工建的 ticket + 地址列把守，未來有人讓工單帶地址時會紅。
➖ 日後若工單真的要帶地址且需要可搜，得同時設計 PII 閘門，不會自動生效。這是刻意的。
➖ station 與 ticket 的搜尋行為不對稱，讀 `spec.md` §3 表格時需要額外一句說明（已補）。

**與 Spec/016 ADR-142 的關係**：016 把詳細地址一律歸 PII 層，實作時改成 `FIELD_TIERS` 以 `(entity, table)` 為鍵，理由與本 ADR 相同——同一張表在兩個 entity 下語意不同。兩者結論一致，本 ADR 是同一個原則在搜尋路徑上的套用。016 的 `decisions.md` 尚未同步該修正。

**另案**：`StationType.secondary_location` 這個 resolver 完全沒有 PII 閘門（016 的 ADR-142 已記錄）。站點地址本來就該公開，所以那不是洩漏，但兩邊的規則需要在同一個地方寫清楚。

---

### ADR-147 相關性排序改為「自身命中」布林優先，`similarity()` 降為組內排序

**白話**：先分成「站名自己就含關鍵字」和「靠關聯表才找到」兩組，前者整組排在前面；`similarity()` 只負責組內誰前誰後。

**Context**：ADR-083 只用 `similarity()` 排序，`_order_by()` 的 docstring 據此宣稱「只透過 property 或地址命中的列得分為 0，排在命中集最後」。Review（2026-08-23）實測發現這個保證在中文上不成立。

`pg_trgm` 為查詢字串補上前後 padding 才組出 trigram（`show_trgm('光復')` = `{"  光", " 光復", "光復 "}`），所以**關鍵字必須位於文字開頭**才有交集：

| 自身 `search_text` | `ILIKE '%光復%'` | `similarity(t, '光復')` |
|---|---|---|
| `光復鄉物資站` | ✅ | 0.25 |
| `花蓮縣光復鄉救災站` | ✅ | **0** |
| `大進國小光復收容所` | ✅ | **0** |
| `光復國中 物資發放與住宿登記…` | ✅ | 0.051 |

「花蓮縣光復鄉救災站」自身名稱就含關鍵字，卻與「只靠 property 命中」同樣得 0，排序整個退化成 `created_at DESC`。而台灣地名幾乎都帶縣市前綴，這是常態而非邊角案例。

原本的守衛測試 `test_name_match_outranks_property_only_match` 看不出來，因為它把**完整站名**當查詢字串（`similarity` = 1.0）。順帶一提，該測試裡的落敗列得 0.18 而非 docstring 說的 0——`similarity()` 是重疊度不是命中指示器，這一點 docstring 從一開始就寫錯了。

**Decision**：`_order_by()` 改為三層（station）／三層（ticket）：

```
q 有值：(search_text ILIKE :pattern) DESC, similarity(search_text, :q) DESC, <既有排序>
q 無值：<既有排序>                                                （維持現狀）
```

布林用的是 `matches()`（與 `_search_condition` 同一支），確保「排序認定的命中」與「查詢認定的命中」定義完全一致。

**Consequences**：
➕ ADR-083 想要的語意（名稱命中 > 關聯命中）現在真的成立，且不受 CJK padding 影響。
➕ `similarity()` 仍保留為第二鍵，命中組內部依然有相關性梯度。
➕ 新增 `test_mid_string_name_match_outranks_property_only_match` 守住這個案例——fixture 刻意分兩個 transaction 建立（`now()` 是 transaction-scoped，同一個 transaction 會讓兩列 `created_at` 相同、tiebreaker 變成隨機），並讓時間序把**錯的**那列排前面，所以舊排序必紅。
➖ `ORDER BY` 多一個運算式。命中集已被索引收斂，成本可忽略。
➖ 沒有解決「`similarity()` 對中文本來就不準」這件事本身。真正的詞彙級相關性需要 ADR-078 否決過的斷詞擴充，不在本票範圍。

---

### ADR-148 為搜尋 `EXISTS` 相關的四個外鍵欄位建索引

**白話**：關聯表上「指回母表」的那個欄位一直沒有索引，平常看不出來，但在最壞情況會讓查詢從 0.7 秒變成 54.8 秒。

**Context**：ADR-080 讓每個關聯表以 `EXISTS` 加入、與主表條件 `OR` 串接。PostgreSQL 只有在 `EXISTS` 是 top-level conjunct 時才能 flatten 成 semi-join；在 `OR` 底下它維持 `SubPlan`。

實測（20k 母表 / 60k 子表，PostgreSQL 16）：預設 `work_mem` 下 planner 會把 SubPlan **hash** 起來只跑一次（`hashed SubPlan`，0.69 秒）；但 hash 塞不進 `work_mem` 時退化成真正的相關子查詢，`loops=20000`、**54.8 秒**。而且退化時的計畫長這樣：

```
SubPlan 1
  ->  Bitmap Heap Scan on child c (actual rows=1 loops=20000)
        Filter: ((delete_at IS NULL) AND (parent_uuid = p.uuid))
                                          ^^^ 出現在 Filter 而非 Index Cond
```

`parent_uuid = p.uuid` 落在 `Filter:` 而不是 `Index Cond:`，就是外鍵沒有索引的直接後果——PostgreSQL **不會**自動為外鍵建索引。查證確認四個欄位在 model（無 `index=True`）與全部 migration 中都沒有索引。

**Decision**：新增 migration `b7e4c1a90d52`，為下列四欄各建一個 btree 索引，並在 model 上同步加 `index=True`（兩邊都改，理由見 ADR-149）：

| 欄位 | 用於 |
|---|---|
| `station_properties.station_uuid` | `geo_repository._search_condition` |
| `secondary_locations.geometry_uuid` | 同上（僅 station；ticket 那支已依 ADR-146 移除）|
| `ticket_tasks.ticket_uuid` | `tickets_repository._search_condition` |
| `task_properties.task_uuid` | 同上（巢狀第二層）|

**Consequences**：
➕ 擋掉退化情境的最壞成本，也讓所有「載入某列的子項目」路徑受惠——這四欄本來就該有索引，搜尋只是讓缺漏變成負載相關。
➕ 四個 btree 索引，寫入成本與空間都可忽略。
➖ 不解決主表 trigram 索引失效（見下方「本票不處理」）。

**本票不處理（另開票）**：`OR` 會讓**主表自己的** trigram 索引無法使用，強制 Seq Scan。實測 2 萬列、子查詢命中 0 列的最便宜情況：不含 `OR` 走索引 3.2ms，含 `OR` 走 Seq Scan **663ms**（205 倍）。也就是說 ADR-081 為主表建的 `ix_*_search_text_trgm`，在真正的搜尋路徑上用不到。

要根治得把 `OR` 拆成 `UNION`（各分支各走各的索引，再合併去重）。**否決在本票做的理由**：`_active_conditions()` 的「`list_active` 與 `count_active` 必須從同一組條件建 WHERE」是這個 PR 刻意建立的不變式，其 docstring 明寫破壞它「no existing test would go red」；拆成 `UNION` 要同時重寫兩條路徑的條件組裝與排序，風險與這一票的範圍不對稱。

---

### ADR-149 migration 的 DDL 必須與 `create_all` 產出的 DDL 逐字相符

**白話**：測試資料庫是用 model 建的，正式環境是用 migration 建的。兩邊寫得不一樣，測試就等於在驗一個永遠不會上線的東西。

**Context**：`f2b7c9d4e0a3` 原本產出 `search_text text GENERATED ALWAYS AS (...) STORED`（`text`、可為 NULL）；而 model 是 `Mapped[str]` + `String` + `Computed(persisted=True)`，實際 compile 出來是：

```sql
search_text VARCHAR GENERATED ALWAYS AS (coalesce(title,'')) STORED NOT NULL
```

型別與 nullability 都不同。`tests/conftest.py:91,104` 用 `Base.metadata.create_all` 建測試庫、完全不跑 migration，所以 `tests/test_search_schema.py`（自陳目的是守住「API 層看不見的東西」）驗的是一個不會上線的 schema。另一個症狀是 `alembic revision --autogenerate` 會在六張表上永久回報幽靈 diff。

**Decision**：改 migration 側，讓它與 `create_all` 一致：`varchar` + `NOT NULL`。`NOT NULL` 是安全的——`search_text_expression()` 的每個 part 都有 `coalesce` 包住，結果不可能是 NULL。

同時確立通則：**新增 migration 時，DDL 必須與 model 在 `create_all` 下的產出逐字相符**，兩邊都要改。ADR-148 的四個索引因此同時加了 `index=True`，索引命名也沿用 SQLAlchemy 的 `ix_<table>_<column>` 慣例。

**Consequences**：
➕ `test_search_schema.py` 開始驗到真正會上線的 schema。
➕ `autogenerate` 的幽靈 diff 消失。
➖ 兩份 DDL 仍是手動維持一致，沒有自動守衛。真正的解法是加一支「跑 migration 建庫、與 `create_all` 建的庫做 schema diff」的測試——值得做，但屬於測試基礎建設，另開票。

---

### ADR-150 `MIN_QUERY_LENGTH` 維持 2，但更正 ADR-082 的錯誤前提

**白話**：兩個中文字的搜尋其實跟一個字一樣慢，ADR-082 當初以為兩個字就沒問題了。我們還是維持兩個字，因為那是使用者真正會打的長度，但要把代價寫清楚，不要假裝索引有在生效。

**Context**：ADR-082 的下限理由是「中文 1 個字的 trigram 選擇性極差，索引形同失效退化為全表掃描」，據此把下限設在 2。實測顯示 **2 個字的行為與它描述的 1 個字完全相同**。

`pg_trgm` 從 `%…%` LIKE pattern 抽索引鍵時**不做 padding**（前後文未知），所以 2 個字元湊不出完整 trigram，`extractQuery` 產不出鍵，退回 `GIN_SEARCH_MODE_ALL`——掃整個 GIN 索引再逐列 recheck。20 萬列雜訊 + 3 列命中，`enable_seqscan = off`：

| 查詢 | Bitmap Index Scan 吐回 | Recheck 刷掉 | Buffers | 時間 |
|---|---|---|---|---|
| `%信義%`（2 字）| **200,003 列（全表）** | 200,000 | 2475 | 111.5 ms |
| `%信義路%`（3 字）| 3 列 | 0 | 4 | 0.04 ms |

**2780 倍**。注意 `show_trgm('光復')` 會回 3 個 trigram，那是對**欄位值**做的 padding，與 LIKE pattern 的抽鍵路徑不同——這正是原本判斷失準的地方。

**Decision**：`MIN_QUERY_LENGTH` 維持 2。ADR-082 的下限理由以本 ADR 更正（依 ADR 相撞後續者勝）。

**否決提高到 3 的理由**：中文 2 字（「光復」「花蓮」「志工」）是核心使用情境，ADR-078 自己舉的例子就是「光復」，ADR-082 自己也寫「實際使用情境中查詢長度預期為 2~6 字」。為了索引選擇性砍掉最常見的查詢長度，是拿功能換一個沒有使用者在抱怨的效能數字。

**Consequences**：
➕ 使用者行為不變。
➕ 代價從「以為有索引」變成「知道沒有索引」，日後若真的出現效能問題，第一個要看的地方已經寫在這裡。
➖ 2 字查詢的成本隨資料列數線性成長。以目前的資料規模（單一縣市的災防站點與工單，數千列量級）可接受；若成長到十萬列量級需要重新評估。
➖ ADR-082 的上限（50 字）不受影響，仍然成立。

**新增守衛**：`test_two_character_query_gets_no_selectivity_from_the_trigram_index` 用 2000 列實際資料跑 `EXPLAIN (ANALYZE)`，斷言 2 字查詢的 Bitmap Index Scan 吐回全表、3 字查詢吐回 1 列。它**不是**回歸測試而是事實釘樁——若日後 pg_trgm 或 planner 改變讓 2 字變得有選擇性，它會紅，屆時本 ADR 應重新評估。這也兌現了 `test_station_search_index_is_usable_by_the_planner` docstring 裡「Actual query performance is validated separately against realistic data volumes」那句先前沒有對應實作的承諾。

---

### ADR-151 `stations.name` 必須 `truncated()`；「無長度上限就要截斷」升格為結構性規則

**白話**：ADR-081 為了鎖住索引成本把長文字截在 500 字，但這條規則是手動套的，`stations.name` 漏掉了。它是沒有長度上限的欄位，貼一份文件進去就會在索引裡塞進等量的條目。

**Context**：本 PR 裡所有用 `plain()`（不截斷）的欄位都有 VARCHAR 長度上限——`tickets.title` 200、`ticket_tasks.task_name` 200、`station_properties.property_name` 100、`secondary_locations` 各段 20/50。實測 `information_schema.columns` 確認：

| 欄位 | `character_maximum_length` | 生成片段 |
|---|---|---|
| `stations.name` | **NULL（無上限）** | **`plain()`** ← 唯一的例外 |
| `stations.description` | NULL | `truncated()` |
| `tickets.description` | NULL | `truncated()` |
| `ticket_tasks.task_description` | NULL | `truncated()` |
| `task_properties.property_value` | NULL | `truncated()` |
| 其餘 | 100–200 | `plain()` |

`Station.name` 宣告為 `mapped_column(String)`（`app/models/geo.py:51`），且 `CreateStationInput.name`（`app/graphql/geo/types.py:191`）沒有任何長度驗證。有 `station.add` 權限者送一個 5 MB 名稱，就會為那一列在 `ix_stations_search_text_trgm` 產生約 500 萬個 trigram 條目——正是 `app/models/search.py` 註解裡「單列貼進 5 萬字就會產生 5 萬個條目」要防的事。

**Decision**：`Station.search_text` 的 `name` 改用 `truncated()`，migration `f2b7c9d4e0a3` 同步（依 ADR-149）。同時把規則升格：**任何進入 `search_text` 且沒有 VARCHAR 長度上限的欄位都必須 `truncated()`**。

**否決「改為 `String(200)` + input 驗證」的理由**：那是欄位型別變更，會連動 GraphQL 型別與前端表單，且對已存在的長名稱需要資料清理；截斷是 ADR-081 已經確立的手段，一致套用即可，成本一個字。欄位長度該不該收斂是另一張票。

**Consequences**：
➕ 索引成本回到 ADR-081 承諾的定值上限。
➕ 規則從「記得要做」變成測試守住的結構性不變式。
➖ 超過 500 字的站名，超出部分不可搜——與 `description` 相同取捨。

**新增守衛**：`tests/test_search_schema.py::test_unbounded_columns_are_truncated`。對 `EXPECTED_SOURCE_COLUMNS` 的每一欄查 `information_schema.columns.character_maximum_length`，為 NULL 者就斷言生成運算式中該欄被 `left(...)` 包住。**結構性斷言而非列舉已知長欄位**——日後任何人往任何 `search_text` 加一個無上限 `String`，不必記得這張 ADR 也會被擋下。已驗證：還原成 `plain("name")` 後此測試轉紅（`AssertionError: stations.name has no length limit and is not truncated in search_text`），修好後轉綠。

---

### ADR-152 搜尋路徑加上 per-statement timeout；rate limit 另案

**白話**：兩個中文字的搜尋本來就沒有索引可用（ADR-150 已經量過），而搜尋端點匿名就能打、又沒有速率限制。我們不能讓一次查詢無限期佔住連線，所以給它一個 3 秒上限。

**Context**：三件事疊在一起才構成問題，單獨看每一件都已被既有 ADR 接受：

1. ADR-150 實測 2 字查詢會走完整個 GIN 索引再逐列 recheck，且 2 字是核心使用情境。
2. `stations(q:)` / `tickets(q:)` 是 `PUBLIC_PERMS`，匿名 Guest 可呼叫（ADR-025/027）——`test_ticket_search_cannot_find_by_address` 就是刻意不帶 auth header 打的。
3. `/graphql` 掛在 `app/main.py:66`，沒有掛任何 rate limiter；`get_rate_limiter` 目前只用在 auth endpoints。

ADR-150 推理的是「單次查詢的成本」，沒有涵蓋「未驗證的重複呼叫者」。ADR-148 的 header 量到 `OR` + EXISTS SubPlan hash 溢出磁碟時單次 54.8 秒——那個數字乘上不受限的呼叫次數就是可用的資源耗盡原語。

**Decision**：在搜尋路徑上加 per-statement timeout（`SEARCH_STATEMENT_TIMEOUT_MS = 3000`），實作為 `app/core/search.py::search_timeout()` async context manager，`term is None` 時完全 no-op，由兩個 repository 的 `list_active` / `count_active` 包住 execute。

> **補正（2026-08-24，PR #35 審查）**：漏了 `TicketTaskRepository.list_by_ticket`（GraphQL `ticketTasks(q:)`）。它跑的是同一形狀的述詞——`ticket_tasks.search_text` 上的 trigram ILIKE，OR 一個對 `task_properties` 的關聯 EXISTS——卻沒有包 `search_timeout`。`ticket.view` 同樣在 `PUBLIC_PERMS`，匿名 Guest 一樣打得到，所以上述威脅模型原封不動適用；唯一擋著的只是「一張 ticket 的 task 數量不多」，那是資料形狀的假設，不是界線。已補上，並把守衛改成**遍歷全部三條搜尋路徑**（`test_every_public_search_path_sets_the_timeout`），讓日後新增第四條時漏包會直接紅。逾時的 SQLSTATE 57014 轉成 `SearchTimeoutError(ValueError)`，與 `SearchQueryError` 同一套契約，讓 Strawberry 把可讀訊息當成 `errors[0].message` 吐出，而不是把 driver 錯誤原樣外洩。

用 `SELECT set_config('statement_timeout', :ms, true)` 而非 `SET LOCAL`：值本身與使用者無關但仍走參數綁定，並且沿用 `app/db/session.py:18` 稽核變數已經在用的同一種寫法。`is_local => true` 使它隨 commit/rollback 自動還原，因此沒有洩漏到下一個請求的路徑。

兩個刻意的副作用：
- ~~同一請求後續的 resolver 也會被這個上限涵蓋（graphql-core 讓同層 root field 共用一個 AsyncSession，見 `app/graphql/context.py`）。公開讀取路徑被端到端地綁上限是目的，不是意外。~~ **已由 ADR-156 推翻**：範圍本身可以爭論，但「錯誤轉譯沒有跟著擴大範圍」不是設計選擇，那讓沒要求搜尋的欄位拿到原始 driver 錯誤。
- Mutation 走不到這段程式碼，寫入路徑維持伺服器預設。

**否決 `/graphql` 全域 rate limit 的理由（本票）**：它擋的是頻率而不是單次成本，54.8 秒的查詢仍會發生；而且要同時決定一個對前端夠寬的速率上限，並確認 `fastapi_limiter` 在 GraphQL 路徑上的行為（目前只驗證過 auth endpoints）。這是營運層決策，範圍與這一票不對稱。**timeout 綁單次成本，rate limit 綁頻率，兩者不互相取代**——rate limit 仍應在正式對外前補上，另開票。

**Consequences**：
➕ 單一連線可被佔用的時間從無上限變成 3 秒。
➕ 使用者得到可讀訊息而非 driver 錯誤。
➖ 只擋單次成本，不擋高頻重複呼叫（見上）。
➖ 若資料量成長到合法搜尋逼近 3 秒，使用者會看到逾時而不是慢——屆時該處理的是查詢計畫（ADR-148 未處理的 `OR` → `UNION`），不是調高這個數字。

**新增守衛**：`tests/test_search_timeout.py`——逾時真的會取消（`pg_sleep(3)` 對 100ms 上限）、`term=None` 完全不動 `statement_timeout`、設定隨 rollback 還原、以及**只有 57014 會被改標成 `SearchTimeoutError`**（`SELECT 1/0` 必須原樣往上拋，否則搜尋路徑上任何查詢 bug 都會被偽裝成「你的搜尋太慢」而掩蓋真正的錯誤）。

---

### ADR-153 排序尾端必須是唯一鍵（主鍵）

**白話**：分頁是靠 OFFSET/LIMIT 切的，如果排序有一整段分不出先後，資料庫每次執行的順序可以不一樣，翻頁就會同一筆看到兩次、另一筆永遠看不到。

**Context**：`_order_by` 原本的尾端是 `created_at DESC`（tickets）與 `priority_score DESC NULLS LAST, created_at DESC`（stations），沒有一個是唯一的。搜尋讓「打平」從例外變成常態：

- 只透過關聯表命中的列，兩個新的 relevance 前導鍵會**同時**打平——ILIKE 布林是 `false`，`similarity()` 是 `0.0`（ADR-147 已說明 CJK 中段命中剛好是 0）。
- `priority_score` 多數為 NULL。
- `created_at` 是 `server_default=func.now()`，而 `now()` 是 **transaction-scoped**——一次批次匯入就讓整批列共用同一個時間戳。這點 PR 自己在 `test_mid_string_name_match_outranks_property_only_match` 的說明裡已經承認。

**Decision**：兩個 repository 的 `_order_by` 尾端都補 `uuid.desc()`，**含 `term is None` 的分支**——非搜尋路徑的 `created_at` 一樣不唯一，同一個 bug。

> **補正（2026-08-24，PR #35 審查）**：漏了第三條分頁路徑。`TicketTaskRepository.list_by_ticket`（GraphQL `ticketTasks`）當時仍是 `order_by(created_at.desc())`，是同一個 bug 的第三個實例。它沒有 `_order_by()` 方法（clause 直接寫在 execute 那一行），所以上述結構性測試的 `_cases()` 掃不到它——**守衛的形狀決定了它守得到什麼**。已補 `uuid.desc()`，並新增 `test_list_by_ticket_also_ends_on_the_primary_key`，改為斷言 repository 實際交給 session 的 statement（`tests/fakes.py::CapturingSession`），不依賴 repository 是否剛好長出 `_order_by()`。

**Consequences**：
➕ 排序成為全序，OFFSET/LIMIT 分頁在任何資料形狀下都不重不漏。
➕ 順帶修好非搜尋的列表分頁。
➖ 多一個排序鍵；由於前面的鍵已經幾乎決定順序，實務成本可忽略。

**新增守衛**：`tests/test_search_ordering.py`，**結構性**斷言 `_order_by()` 在兩個 repository、`term` 有無兩種分支下，最後一個 clause 都是主鍵，且搜尋只在 standing order 前面「加」兩個 relevance 鍵而非取代它。

刻意記下的一點：先寫的行為測試（`test_paging_a_run_of_tied_rows_loses_no_row`，六列全打平後翻兩頁）**拿掉修正也照樣綠**——PostgreSQL 對六列在單一計畫下剛好是決定性的。它因此不是這個修正的守衛，只是端到端 smoke；真正守住的是上述結構性測試。已驗證：拿掉 `uuid.desc()` 後結構性測試轉紅（`ends on 'base_geometries.created_at DESC', which is not unique`）。

---

### ADR-154 GraphQL 搜尋測試明確指定 `limit`，並在斷言前先檢查是否撞到頁面上限

**白話**：測試庫的資料會跨整個 session 累積，而 resolver 預設一頁只回 50 筆。等測試多到超過 50 筆，那些「總數要等於回傳筆數」的斷言就會因為跟測試意圖無關的理由變紅。

**Context**：`seeded_stations` 的 docstring 自己寫了「The GraphQL suite creates its schema once per session (`_ensure_db`), so rows from other tests accumulate in the same tables」，並據此改用 membership 而非精確筆數。但三處 `totalCount == len(items)`（`test_total_count_reflects_the_filter`、`test_ticket_total_count_reflects_the_filter`、`test_station_matched_through_a_property_appears_once`）仍隱含「這一頁裝得下全部」。membership 斷言其實有同一個問題——被擠出前 50 筆的 seeded row 也會讓斷言失敗。

**Decision**：五份 query document 都改為接受 `$limit: Int!`，由 `_stations()` / `_tickets()` 統一填入 `PAGE_LIMIT = 500`（單一常數來源，不在 document 裡寫死數字）。三處斷言改走 `_assert_total_count_matches_items()`，它**先**斷言 `len(items) < PAGE_LIMIT`，訊息明講「撞到 PAGE_LIMIT，請調高而不是放寬斷言」。

**否決改成 `totalCount >= len(items)` 的理由**：那會讓斷言恆真，等於刪掉這三個測試真正在測的東西（`count_active` 與 `list_active` 必須套用同一組條件——這是 `_active_conditions` docstring 明寫「no existing test would go red」的那個不變式）。

**Consequences**：
➕ 斷言與資料累積解耦；membership 斷言一併受惠。
➕ 若真的成長到 500 筆，失敗訊息直接說明原因與做法。
➖ 每次查詢回傳更多列，測試略慢；以目前規模不可量測。

---

### ADR-155 地址欄位的 `search_text` 以無分隔符串接

**白話**：`search_text` 原本把每個欄位用空白串起來，可是中文地址沒人打空白，所以「光復鄉中正路」反而一筆都搜不到。地址那張表改成直接黏在一起。

**Context**：`search_text_expression()` 用 `" || ' ' || "` 串接，`secondary_locations` 因此存成 `'花蓮縣 光復鄉 中正路 12巷 3號'`。而查詢述詞是單一**連續**的 `ILIKE '%<term>%'`（`app/core/search.py:like_pattern`），使用者打的 `光復鄉中正路` 不含空白，這個連續子字串在存起來的值裡不存在。

實測（PostgreSQL）：

```sql
'花蓮縣 光復鄉 中正路 12巷 3號' ILIKE '%光復鄉中正路%'  -- false ← 使用者的實際打法
'花蓮縣 光復鄉 中正路 12巷 3號' ILIKE '%光復鄉 中正路%'  -- true  ← 要剛好在對的位置打空白
'花蓮縣光復鄉中正路12巷3號'     ILIKE '%光復鄉中正路%'  -- true  ← 拿掉分隔符
```

也就是說，ADR-081 稱為「B 最實質的優勢」的跨欄位命中，只在使用者猜中我們內部的分隔方式時才成立。ADR-081 與 `app/models/search.py` 註解舉的例子 `光復鄉中正巷` 本身就是不含空白寫的——文件舉的例子在自己的實作下是失敗的。既有測試 `test_station_search_reaches_into_its_address` 只搜單一欄位詞 `中正路`，抓不到這件事。

**Decision**：`search_text_expression()` 加上 `separator` 參數（預設仍為 `" "`），`secondary_locations` 傳 `separator=""`。migration `f2b7c9d4e0a3` 的 `_expr()` 同步改（ADR-149：兩邊 DDL 必須逐字相符，已比對確認）。

其餘四張表維持空白分隔：`stations` 的 `name` + `description`、`tickets` 的 `title` + `description` 之類，是使用者不會連著打的兩件事，中間留空白反而讓「光復國小 收容所」這種自然打法可以命中，同時避免跨欄位邊界的假命中。

**判準**：**欄位在來源領域裡是否構成一個連續字串**。中文地址是（花蓮縣光復鄉中正路），標題與描述不是。

**Consequences**：
➕ ADR-081 宣稱的跨欄位命中真的成立了；新增端到端測試 `test_station_search_spans_two_address_fields` 與 schema 測試 `test_address_search_text_concatenates_without_a_separator` 釘住。
➖ 相鄰地址欄位會在邊界黏出假的子字串（`no='3號'` + `floor='4樓'` → `3號4樓`，搜 `號4` 會中）。地址情境下影響遠小於「完全搜不到」。
➖ 判準是人工套用的，沒有自動守衛能判斷「這兩個欄位算不算連續」。`search_text_expression()` 的 docstring 是這個判準的唯一落點。
◾ 無 backfill 問題：`search_text` 是 generated column，改運算式即全表重算；本 migration 尚未合併，直接改在原地而非新增一支 drop/re-add 的 migration。

---

### ADR-156 `search_timeout` 離開時把 `statement_timeout` 設回原值

**白話**：搜尋設的 3 秒上限，設下去之後不會在搜尋結束時收回，會一路套用到同一個請求裡後面所有的 SQL——包括根本沒要求搜尋的欄位。改成離開搜尋窗口時把它設回去。

**Context**：ADR-152 把「同一請求後續的 resolver 也被涵蓋」列為刻意的副作用。範圍本身可以爭論，但有一件它沒考慮到的事：**錯誤轉譯並沒有跟著擴大到同樣的範圍**。

- `set_config(..., is_local => true)` 的作用域是 **transaction**，不是 `async with` 區塊。
- 一個 GraphQL 請求是一個 transaction、一個共用的 `AsyncSession`（`app/graphql/context.py:30` 的註解自己就寫了同層 root field 並行解析且共用 session）。
- 但 57014 → `SearchTimeoutError` 的轉譯只包在 `async with` 裡面。

於是 `{ stations(q:"光復"){…} someHeavyField{…} }` 這種查詢，`someHeavyField` 會憑空吃到一個它沒同意的 3 秒上限；踩到的時候拋的是原始 `DBAPIError`（SQLSTATE 57014），driver 原文進 `errors[0].message`，而且 PostgreSQL 砍掉 statement 之後整個 transaction abort，**該請求剩下的欄位全部一起失敗**。

實測（`SELECT current_setting('statement_timeout')` 在離開 `async with` 之後仍是 `'3s'`；接著 `SELECT pg_sleep(5)` 在 3 秒被砍，拋 `DBAPIError sqlstate=57014`，訊息 `canceling statement due to statement timeout`）。

> **還原的機制已由 ADR-157 取代**：「進場讀原值、離場寫回」在並行的 sibling 搜尋下會把上限反而留在 transaction 裡。本 ADR 的目標不變，實作改為巢狀感知 + `RESET`。逾時之後的收尾另見 ADR-158。

**Decision**：`search_timeout()` 進場時先讀 `current_setting('statement_timeout')`，離開時在 `finally` 設回去。**搜尋本身的 3 秒上限完全不變**——ADR-152 真正要保護的是「單次搜尋不能無限期佔住連線」，那一點不受影響。

reset 用 `_restore_statement_timeout()` 包住並吞掉 `DBAPIError`：搜尋若是被資料庫錯誤中斷（含逾時本身），PostgreSQL 已經 abort transaction、拒絕後續任何 statement，reset 必然失敗；而那條路徑本來就不需要 reset（rollback 會丟掉 transaction-local 設定）。吞掉是為了**不讓 reset 的失敗蓋掉它正在收尾的那個原始錯誤**——否則使用者看到的會是「current transaction is aborted」而不是「搜尋耗時過長」。

**否決的替代方案**：保留範圍、把 57014 的轉譯提到 GraphQL 層（Strawberry extension）。它能修好訊息，但修不掉「沒要求搜尋的欄位被砍、整個請求連坐」。而且 reset 之後那層集中轉譯幾乎碰不到，多一層要維護的東西。

**Consequences**：
➕ 上限只綁在它該綁的東西上；sibling field 不再被連坐。
➕ 「被砍卻拿到原始 driver 錯誤」的路徑消失——會被砍的只剩搜尋自己，而那一條有轉譯。
➖ 每次搜尋多兩個 round-trip（讀原值、寫回原值）。相對於它保護的那個 3 秒可忽略。
➖ 若之後真的想要「公開讀取路徑端到端有界」，那要另外做，而且要連錯誤轉譯一起做。

**新增守衛**：`tests/test_search_timeout.py` 三項——離開窗口後設定回到原值、**搜尋後的 statement 不再被搜尋的上限砍掉**（行為，不只是設定值）、以及逾時仍回報 `SearchTimeoutError` 而不是 reset 失敗的錯誤。

---

### ADR-157 `statement_timeout` 的還原改為巢狀感知 + `RESET`，不再讀回原值

**白話**：ADR-156 的「進場讀原值、離場寫回去」在兩個搜尋欄位同時進行時會壞掉——後進來的那個把前一個設的 3 秒當成「原值」，離場時再把 3 秒寫回去，於是上限反而永久留在整個 transaction 裡，正好是 ADR-156 要防的事。改成只有最外層的搜尋窗口動這個設定，而且用 `RESET` 而不是寫回讀到的值。

**Context**：ADR-156 自己引用的 `app/graphql/context.py:30` 就寫著同層 root field 是**並行**解析、共用一個 `AsyncSession`。而 `set_config(..., is_local => true)` 寫的是一個 **transaction 層級的單一值**，不是每個呼叫者各有一份。兩者相加就是典型的 read-modify-write 競態：

- A 讀到 `previous='0'`，設成 `3s`。
- B（`{ stations(q:) tickets(q:) }` 的另一半）接著讀到 `previous='3s'`——A 的值，不是預設值。
- A 還原成 `'0'`；B 之後還原成 `'3s'`。
- 該 transaction 剩下的每一條語句都帶著 3 秒上限，而且被砍時拋的是未轉譯的 57014。

實測（`tests/test_search_timeout.py::test_interleaved_sibling_searches_do_not_leave_the_ceiling_behind`，把上限 patch 成 100ms）：修正前 `SHOW statement_timeout` 在兩個窗口都關閉後仍是 `'100ms'`，預期 `'0'`。原有的 `test_the_ceiling_does_not_outlive_the_search_window` 是單一序列呼叫，抓不到這條路徑。

**Decision**：兩件事一起做，缺一不可。

1. **巢狀計數**：深度存在 session 物件上（`_search_timeout_depth`），因為 session 正是這些窗口共用的東西。只有最外層設定與還原；內層的進出完全不碰設定，所以內層離場不會把還在跑的外層搜尋的上限拆掉。
2. **`RESET statement_timeout` 取代寫回讀到的值**：不需要先讀，就沒有 read-modify-write 可以被競態破壞。`RESET` 回到 session 預設值，而全 codebase 只有這裡設過 `statement_timeout`（已 grep 確認），所以 session 預設就是 server 預設。順帶把 ADR-156 那個「每次搜尋多兩個 round-trip」的代價砍成一個。

**否決的替代方案**：
- 用 `asyncio.Lock` 序列化搜尋窗口。會把並行的 sibling 搜尋變成序列化，付出的是延遲，換到的東西計數器就能給。
- 改成 per-statement 層級的 timeout（`options` / `execution_options`）。asyncpg 的 timeout 走的是 client 端取消，錯誤形狀跟 57014 不同，等於要重寫 ADR-152 的轉譯與它的測試。範圍過大。

**Consequences**：
➕ ADR-156 的保證在它原本就宣稱要處理的並行情境下真的成立。
➕ 少一個 round-trip。
➖ 深度計數靠在 session 物件上動態掛屬性；換掉 session 型別時要記得它存在（測試的 `CapturingSession` fake 已涵蓋）。
➖ `RESET` 是回到 session 預設，不是「進場當下的值」。若未來有人在搜尋之外設 transaction-local 的 `statement_timeout`，這裡會把它清掉——目前沒有這種呼叫者，真的出現時這條要重審。

**新增守衛**：`tests/test_search_timeout.py` 兩項——重疊的 sibling 搜尋窗口關閉後設定必須回到預設值、以及內層窗口離場不得把外層搜尋的上限拆掉。

---

### ADR-158 搜尋被 timeout 砍掉時主動 rollback，讓同請求其餘欄位還能拿到資料

**白話**：搜尋真的跑滿 3 秒被 PostgreSQL 砍掉之後，整個 transaction 就是廢的，同一個請求後面的欄位全部拿到「current transaction is aborted」。在拋出 `SearchTimeoutError` 之前先 rollback，後面的欄位就會開一個新 transaction 正常運作。

**Context**：ADR-156 處理掉了「沒要求搜尋的欄位被上限砍掉」，但沒處理「搜尋自己真的被砍掉之後」。PostgreSQL 取消 statement 會 abort transaction，而 session 是整個請求共用的。`{ stations(q:"光復"){…} announcements{…} }` 在搜尋逾時的情況下，`stations` 拿到正確的中文逾時訊息，`announcements` 拿到的卻是第二個完全沒有解釋的 `25P02` raw `DBAPIError`——它本來是可以正常回資料的。

`test_a_cancelled_search_still_reports_the_timeout_not_the_reset_failure` 裡那句手動的 `await db.rollback()`，正是 production 路徑缺的那一步。

實測（`tests/test_search_timeout.py::test_a_field_resolved_after_a_cancelled_search_still_gets_its_data`）：修正前逾時後的 `SELECT 1` 拋 `InFailedSQLTransactionError`。

**Decision**：在 57014 分支裡、拋 `SearchTimeoutError` 之前呼叫 `await db.rollback()`。搜尋路徑是唯讀的（mutation 不會走到這裡，ADR-152），所以沒有任何未 commit 的工作會被丟掉；而 transaction 當下已經是廢的，rollback 不會讓任何原本能成功的事情失敗。

rollback 成功時就跳過還原 `statement_timeout`——rollback 本來就會丟掉 transaction-local 設定，再送一條 `RESET` 只會憑空開一個新的空 transaction。rollback 自己失敗時（包成 `_rollback_aborted_transaction()` 回傳 bool）維持 ADR-156 的行為：吞掉、照常還原、原始錯誤不被蓋掉。

**否決的替代方案**：讓 GraphQL 層在請求收尾時 rollback。那時候 sibling 欄位早就失敗了，救不到它們。

**Consequences**：
➕ 逾時只讓搜尋那個欄位變 null，不再連坐整個請求。
➕ 呼叫者不會再看到第二個無法解讀的內部錯誤。
➖ rollback 會結束當下的 transaction，所以同請求中在搜尋**之前**已讀取的資料不會被重讀一次的欄位共用同一個快照。唯讀路徑，且本來就沒有跨欄位的快照一致性保證。
➖ 與 ADR-157 的並行前提相同：rollback 發生時若有 sibling 語句正在飛，它會失敗——但它在 transaction 已 abort 的當下本來就注定失敗。

**新增守衛**：`tests/test_search_timeout.py::test_a_field_resolved_after_a_cancelled_search_still_gets_its_data`。
