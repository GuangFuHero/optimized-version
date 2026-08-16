# Resource Search — ADR 全集（ADR-077~084）

**Date**: 2026-08-16
**Feature**: 011-resource-search
**Status**: Phase 1 已實作；Phase 2 待實作
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
