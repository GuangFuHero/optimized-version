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

**白話**：不是每個欄位建一個索引，而是把該表所有可搜欄位串成一欄，只建一個索引。長描述超過 500 字的部分不進索引。

**Context**：兩個選項：
- **A**：每欄一個 GIN 索引 → 約 16 個索引（`secondary_locations` 自己就佔 8 個）。查詢為 `name ILIKE %q% OR description ILIKE %q%`，靠 planner 做 BitmapOr。
- **B**：每表一個 `search_text` generated column + 單一 GIN 索引 → 6 個索引。查詢為 `search_text ILIKE %q%`。

寫入成本兩者大致打平：A 只重建被改欄位的索引（1~2 個小更新），B 重算整個 `search_text`（1 個大更新）。**B 的優勢不在寫入。**

`description` 是無長度限制的 `text`（`app/models/geo.py:49`、`app/models/request.py:15`）。GIN 索引條目數 ≈ 資料列數 × 字元數，單列貼進 5 萬字即產生 5 萬個條目，等同 250 列的索引空間。

**Decision**：採 B。長文字欄位在 generated column 內以 `left(..., 500)` 截斷。

**Consequences**：
➕ **跨欄位命中**：搜「光復鄉中正巷」在 A 是一個都搜不到（每個欄位各自比對，沒有任何單一欄位包含完整字串），在 B 因為欄位已串接而能命中。這是 B 最實質的優勢。
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
