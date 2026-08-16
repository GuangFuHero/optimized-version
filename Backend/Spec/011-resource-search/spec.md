# Design: Resource Search（Ticket / Resource Station 搜尋系統）

**Date**: 2026-08-16
**Feature**: 011-resource-search
**Status**: Approved design, pending implementation
**Notion**: 補齊功能 → 「系統性 - Ticket/Resource Station 搜尋系統」（backend-Popo，08-13~08-17）
**Depends on**: 既有列表查詢（`app/graphql/geo/queries.py:32`、`app/graphql/tickets/queries.py:38`）、scope 引擎（`app/core/rbac_scopes.py`）
**Blocked by**: 無

---

## 1. 概述

讓使用者能用**中文關鍵字**找到 Ticket、Resource Station 與 Ticket Task。

目前系統**完全沒有文字搜尋能力**：`stations` 只能用 `bounds` + `station_type` 篩選（`app/repositories/geo_repository.py:27-46`），`tickets` 只能用 `bounds` + `status` + `priority`（`app/repositories/tickets_repository.py:18-40`）。全 codebase 找不到任何 `ILIKE` / `to_tsvector` / 搜尋索引。現場人員要找「光復國小」或「有發電機的站點」，只能自己在地圖上翻。

### 目標
- 既有列表查詢新增 `q` 參數，關鍵字與現有篩選（bbox / status / type）**可自由組合**。
- 中文可用：搜「光復」要找得到「花蓮縣光復鄉」，不依賴中文斷詞擴充。
- 搜得到**動態欄位**：搜「發電機」要找出擁有該項物資的站點。
- 搜尋結果自動套用呼叫者的 RBAC scope，與現有列表行為一致。
- 成本可預測：索引體積與查詢延遲有明確上界，不隨自由文字長度失控。

### 非目標（YAGNI，明確排除）
- **跨型別的全站搜尋端點**：不做 `search(q, types: [...])` 回傳混合結果（ADR-077）。跨表分頁與排序做不對，且 UIUX 規劃的是 Tickets / Resource Stations 兩張獨立表格。
- **中文斷詞**：不引入 `zhparser` / `pgroonga`（ADR-078）。
- **以 PII 反查**：`contact_name` / `contact_email` / `contact_phone` 永不可搜（ADR-079）。若日後需要「用電話找工單」，做成獨立且需專屬 capability 的功能，不混進一般搜尋。
- **搜尋備註欄位**：`comment` / `progress_note` / `pole_note` 排除（ADR-079）。
- **相關性調權**：不做欄位加權（標題命中 > 描述命中）、不做同義詞、不做拼音／注音容錯。
- **搜尋歷程 / 熱門關鍵字統計**。

---

## 2. 關鍵決策

1. **不開新端點**，在既有 `stations` / `tickets` / `ticketTasks` 查詢加 `q` 參數 → 免費繼承 scope 過濾、bbox、分頁、既有排序。
2. **`pg_trgm` + `ILIKE '%q%'`** 做中文模糊比對，不做斷詞。
3. **可搜欄位正向表列**，排除 PII 與備註。
4. **1:N 關聯用 `EXISTS` 子查詢**，不用 `JOIN`，避免列數膨脹讓 `count_active` 與分頁算錯。
5. **每張表一個 `search_text` generated column + 單一 GIN 索引**，長欄位截斷 500 字元。
6. **查詢字串限制 2~50 字元**。
7. **`q` 有值時相關性優先排序**，既有排序降為 tiebreaker。

---

## 3. 可搜欄位（正向表列）

| 表 | 可搜欄位 |
|---|---|
| `stations` | `name`、`description` |
| `tickets` | `title`、`description` |
| `ticket_tasks` | `task_name`、`task_description` |
| `station_properties` | `property_name` |
| `task_properties` | `property_name`、`property_value` |
| `secondary_locations` | `county`、`city`、`lane`、`alley`、`no`、`floor`、`room`、`pole_id` |

**明確排除**

| 欄位 | 理由 |
|---|---|
| `tickets.contact_name` / `contact_email` / `contact_phone` | PII。可搜等於讓遮蔽（`app/graphql/tickets/types.py` 的 field resolver）形同虛設 |
| `stations.comment`、`station_properties.comment`、`task_properties.comment` | 操作備註，自由文字，雜訊高 |
| `ticket_tasks.progress_note` | 同上 |
| `secondary_locations.pole_note` | 同上 |

> **`secondary_locations` 欄位語意警告**：`lane` 實際存的是**路／街（road）**、`alley` 實際存的是**巷弄**，與欄位字面意思不符，且 model 沒有任何註解說明（`app/models/secondary_location.py:17-18`）。本 spec 順手補上 `COMMENT ON COLUMN`（見 §7），改名另案處理。

---

## 4. Schema 變更

每張可搜的表新增一個 `search_text` generated column 與一個 GIN 索引。以 `stations` 為例：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE stations ADD COLUMN search_text text
  GENERATED ALWAYS AS (
    coalesce(name, '') || ' ' || left(coalesce(description, ''), 500)
  ) STORED;

CREATE INDEX ix_stations_search_text_trgm
  ON stations USING gin (search_text gin_trgm_ops);
```

五張表的 `search_text` 組成：

| 表 | 組成 |
|---|---|
| `stations` | `name` + `left(description, 500)` |
| `tickets` | `title` + `left(description, 500)` |
| `ticket_tasks` | `task_name` + `left(task_description, 500)` |
| `station_properties` | `property_name` |
| `task_properties` | `property_name` + `left(property_value, 500)` |
| `secondary_locations` | `county` + `city` + `lane` + `alley` + `no` + `floor` + `room` + `pole_id` |

共 **6 個 generated column + 6 個 GIN 索引**。

---

## 5. 查詢形狀

以 `stations` 為例，`q` 有值時追加的 WHERE 條件：

```sql
(
  stations.search_text ILIKE '%' || :q || '%'
  OR EXISTS (
    SELECT 1 FROM station_properties sp
    WHERE sp.station_uuid = stations.uuid
      AND sp.delete_at IS NULL
      AND sp.search_text ILIKE '%' || :q || '%'
  )
  OR EXISTS (
    SELECT 1 FROM secondary_locations sl
    WHERE sl.geometry_uuid = stations.uuid
      AND sl.search_text ILIKE '%' || :q || '%'
  )
)
```

**必須是 `EXISTS` 不是 `JOIN`**：一個站點有 N 筆 property，`JOIN` 會讓它在結果中出現 N 次，`count_active` 算出膨脹的總數、分頁跳號。既有的 zone scope 已經是這個模式（`app/core/rbac_scopes.py:141-147`），照抄即可。

`tickets` 同理，關聯的是 `ticket_tasks` → `task_properties` 與 `secondary_locations`。

### 排序

```
q 有值：similarity(search_text, :q) DESC, priority_score DESC NULLS LAST, created_at DESC
q 無值：priority_score DESC NULLS LAST, created_at DESC        （維持現狀）
```

`similarity()` 由 `pg_trgm` 提供。相關性優先、既有規則降為 tiebreaker——因為 `priority_score` 目前恆為 NULL（見 §8），這個 tiebreaker 今天是 no-op，等它被實作後排序會自動變好，不需回頭改搜尋。

### 輸入驗證

| 規則 | 行為 |
|---|---|
| `len(q) < 2` | 400，訊息「搜尋關鍵字至少 2 個字」 |
| `len(q) > 50` | 400，訊息「搜尋關鍵字過長」 |
| `q` 為 `None` 或空字串 | 不套用搜尋條件，行為與現況完全一致 |
| `q` 含 `%` / `_` | escape 後才進 `ILIKE`，避免使用者輸入的萬用字元改變查詢語意 |

---

## 6. 效能特性

**成本模型**：GIN 索引條目數 ≈ 資料列數 × 每列可搜文字字元數。欄位數量只是間接影響——10 個各 20 字的欄位與 1 個 200 字的欄位成本相同。

| 規模 | 索引條目 | 評估 |
|---|---|---|
| 10 萬列 × 200 字 | 約 2000 萬 | 無虞 |
| 100 萬列 × 200 字 | 約 2 億 | 可行，需盯 autovacuum |
| 100 萬列 × 2000 字 | 約 20 億 | 寫入延遲明顯，應避免 |

`description` 是無長度限制的 `text`（`app/models/geo.py:49`、`app/models/request.py:15`），單列貼進 5 萬字就會產生 5 萬個 trigram 條目，等同 250 列的索引空間。**generated column 內截斷 500 字元把上界鎖死**，這是本設計唯一的硬性成本防線。

**已知效能特性（設計上接受，不在本票處理）**

- **2 字查詢選擇性差**：「光復」在花蓮為主的資料集可能命中八成的列，索引掃完仍要逐列 recheck。靠 bbox / status 等既有篩選一起收斂，不另做機制。實際查詢長度預期為 2~6 字，6 字查詢選擇性良好。
- **`q` + `bounds` 只能用一個索引**：trigram GIN 與 PostGIS GiST 二選一，另一個降級為 recheck filter。哪個較快取決於資料分布，需上線後以 `EXPLAIN ANALYZE` 實測調整，設計階段不預先決定。

---

## 7. 逐檔改動

| 檔案 | 改動 |
|---|---|
| `alembic/versions/<new>.py` | `CREATE EXTENSION pg_trgm`；6 張表加 `search_text` generated column + GIN 索引；`COMMENT ON COLUMN secondary_locations.lane/alley` 註明實際語意 |
| `app/models/geo.py` | `Station` 加 `search_text`（`Mapped[str]`，唯讀） |
| `app/models/request.py` | `Tickets` 同上 |
| `app/models/ticket_task.py` | `TicketTask` / `TaskProperty` 同上 |
| `app/models/station_property.py` | `StationProperty` 同上 |
| `app/models/secondary_location.py` | `SecondaryLocation` 同上；`lane` / `alley` 加 `comment=` |
| `app/repositories/geo_repository.py` | `StationRepository.list_active` / `count_active` 加 `q` 參數與 EXISTS 條件；排序分支 |
| `app/repositories/tickets_repository.py` | `TicketRepository` 同上 |
| `app/graphql/geo/queries.py` | `stations(q: str \| None = None, ...)` |
| `app/graphql/tickets/queries.py` | `tickets(q: ...)`、`ticketTasks(q: ...)` |
| `app/graphql/shared.py`（或新 `app/core/search.py`） | `build_search_filter()`：長度驗證、`%`/`_` escape、產生 ILIKE 條件 |

---

## 8. 已知問題（本票不處理，建議另開）

**`priority_score` 是半實作**——欄位定義（`app/models/geo.py:64`）、migration（`alembic/versions/a2a8e4d8c51d_ticket_tasks_and_property_configs.py:42`）、`ORDER BY`（`app/repositories/geo_repository.py:43`）、GraphQL 曝露（`app/graphql/geo/types.py:139`）全都有，但**整個 codebase 沒有任何一行寫入它**，恆為 NULL。目前 `desc().nulls_last()` 在全 NULL 下等於無作用，實際排序只有 `created_at DESC` 生效。前端可能已經在讀這個永遠是 `null` 的欄位。

**`secondary_locations` 欄位命名與實際語意不符**（`lane` = 路、`alley` = 巷弄）。本票只加註解，改名（`lane → road`、`alley → lane`）牽涉 migration、GraphQL type、前端表單，應另案處理。

---

## 9. 測試計畫

| 類型 | 案例 |
|---|---|
| 單元 | `build_search_filter()`：1 字元 400、51 字元 400、含 `%` 的 escape、`None` 不套條件 |
| 整合 | 主表命中（搜站名）、動態欄位命中（搜「發電機」找到擁有該 property 的站點）、地址命中（搜「光復鄉」） |
| 整合 | **1:N 不重複**：一個站點有 3 筆 property 皆命中時，結果只出現 1 次且 `total_count` 為 1 |
| 整合 | **PII 不可搜**：以 `contact_phone` 的值搜尋，回傳空結果（即使呼叫者持 `all` scope） |
| 整合 | **備註不可搜**：以 `comment` 內文搜尋，回傳空結果 |
| 整合 | **scope 疊加**：`q` 與 scope 過濾同時生效，跨 zone 的命中不出現在結果中 |
| 整合 | `q` + `bounds` + `status` 三者組合 |
| 整合 | 排序：`q` 有值時相關性高者在前 |
| 索引 | migration 後 `EXPLAIN` 確認走 GIN 索引而非 Seq Scan |
