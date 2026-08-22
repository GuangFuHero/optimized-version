# 批量匯入匯出 — Implementation Plan

**Goal:** 後台能把 station / ticket 按單一 type 匯出成 CSV/XLSX，改完之後匯回去——比對得中就更新、比對不中就新增，錯的列列出來給人改。

**Architecture:** REST 兩端點、伺服器零狀態。欄位表頭由 013 的 `list_by_type` 產生，寫入一律複用既有的 `create_*` / `update_*` service（連同 authz、驗證、狀態機一起），本票不新寫任何一條寫入邏輯。

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/PostGIS, openpyxl（新增）, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/015-bulk-import-export/spec.md`（ADR-106~125）

**Branch:** `feat/bulk-import-export-backend`（off `feat/project-settings-backend`，**不是 off main**，ADR-125）

---

## Global Constraints

- **不新寫寫入邏輯。** 每一列最終都要走 `create_station` / `update_station` / `create_station_property` / `update_station_property` / `create_ticket` / `update_ticket` / `create_ticket_task` / `update_ticket_task` / `create_task_property` / `update_task_property`。這些函式已經各自處理 authz + 驗證 + 持久化（ADR-014）。如果你發現需要繞過其中一個，那是設計理解錯了。
- **不動 schema。** 零新表、零新欄位（ADR-118 / ADR-124）。唯一的 migration 是 Task 2 那支——它只掛 audit trigger，不改任何結構。
- **不動單筆 GraphQL 寫入路徑。** ADR-092 在那邊仍然有效（ADR-117）。
- **不動 `station_properties` / `task_properties` 的資料模型。** station 只支援 `Integer` 是刻意的（ADR-118）。
- **PR 依賴 #36。** #36 未合併前本票不能合。

## 範圍

| 納入 | 排除（明確不做） |
|---|---|
| station / ticket 匯出（CSV + XLSX，單一 type） | `.md` / `.json` 格式（ADR-115 否決） |
| station / ticket 匯入（upsert + 欄位映射 + 驗證） | 非同步匯入 / `import_jobs` 表（ADR-114 否決） |
| 自然鍵比對、配到多筆即失敗 | AI dedup、`is_duplicate` 標記（ADR-113 否決） |
| 逐筆進 + 逐列錯誤報告 | 整批 atomic、失敗列進審核佇列（ADR-112 否決） |
| 4 個 capability key + seed 更新 | 匯入沿用 add/edit 不另立 key（ADR-110 否決） |
| ticket 匯出逐筆套 PII scope | 匯出一律明碼（ADR-109 否決） |
| `station_properties` / `task_properties` 進稽核 | 批次追溯、`import_batches` 表、匯入歷史頁、整批回退（ADR-124 否決） |
| 座標 `latitude` / `longitude` 兩欄 | 給 `station_properties` 補 `property_value`（ADR-118，另開一張票） |
| — | geocoding（ADR-123 否決） |

---

## Task 順序的關鍵

**匯出（Task 3~5）必須排在匯入（Task 6~10）之前。** 兩個理由：

1. 匯出檔就是合法的匯入範本（ADR-119），所以匯入的測試可以直接餵匯出產出的檔——不必手工維護一堆測試用 CSV，也不會出現「測試用的表頭跟真實表頭長得不一樣」這種假綠燈。
2. 表頭產生（Task 3）是兩邊共用的，先讓匯出把它逼出來，匯入直接拿去用。

**Task 1（權限）要排在最前面。** 端點一寫出來就會需要它，而 seed 改動會影響所有既有 RBAC 測試的預期值——先做完、跑一次全套件確認沒有連帶紅燈，之後的紅燈才有診斷價值。

---

## Task 1: capability key 與 seed grant

**Files:** Modify `app/core/permissions.py`, `scripts/seed_rbac.py`, `RBAC_RESOURCE_ROLE_MATRIX.md`；Create `tests/test_bulk_permissions.py`

- [x] `Perm` 新增三個 key（`ticket.export` 已存在，不動）

實際落地的樣子（key 依模組分組，不是擠成一塊）：

```python
    TICKET_EXPORT = "ticket.export"  # registered since RBAC v1; first enforced by feature 015
    TICKET_IMPORT = "ticket.import"  # see the bulk note under Resource Station below
    ...
    # Bulk export/import (feature 015, ADR-110). Import is deliberately NOT a reuse of
    # add/edit: one file can rewrite hundreds of rows, so the batch capability is separable
    # from the single-row one. It is not a replacement either — every imported row still
    # runs the *.add / *.edit checkpoints it would have run had it been typed in by hand,
    # so import alone is a dead grant (asserted in tests/test_bulk_permissions.py).
    STATION_EXPORT = "station.export"
    STATION_IMPORT = "station.import"
```

- [x] `seed_rbac.py` 依 ADR-111 的矩陣加 grant：super_admin 四個都 `all`；`data_auditor` 加 `STATION_EXPORT: "all"` 與 `TICKET_EXPORT: "all"`；team `admin` 加 `*_EXPORT: "zone"` 與 `*_IMPORT: "all"`；`member` 與 `user` 不動
- [x] 更新 `seed_rbac.py:10` 的檔頭註解——`ticket.export` 不再是「尚未被任何角色使用」
- [x] 測試：四個 key 的 `resolve_scope` 對五個角色各自回傳預期值；`member` / `user` 拿到 `Scope.NONE`
- [x] **跑一次全套件**，確認 seed 改動沒有打到既有 RBAC 測試 —— **523 passed, 0 failed**

> **完成 2026-08-22**：`tests/test_bulk_permissions.py` 14 passed，全套件 523 passed / 0 failed，ruff 乾淨。
>
> 順手補的：`station.contribute` 一直被 `seed_rbac.py` 授予卻從未列進 `RBAC_RESOURCE_ROLE_MATRIX.md`（既有落差，與本票無關），一併補上該列。
>
> **跑測試的環境變數**：本機 5432 被另一個專案佔用，本專案的 Postgres 在 5433。`TEST_DB_URL` 與 `TEST_ADMIN_DB_URL` **兩個都要設**——後者是 conftest 用來 `CREATE DATABASE` 的維護連線，有自己的預設值 5432。
>
> ```
> export TEST_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5433/disaster_rescue_test"
> export TEST_ADMIN_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5433/postgres"
> ```

## Task 2: 稽核接線

**Files:** Modify `app/db/triggers.py`；Create `alembic/versions/b3f1c07d2a95_audit_dynamic_field_tables.py`, `tests/test_bulk_audit.py`

- [x] `AUDITED_TABLES` 加入 `station_properties`、`task_properties`
- [x] **加一支 migration 真的把 trigger 掛上去**——見下方「清單本身不會生效」
- [x] 測試：`station_properties` 的 INSERT / UPDATE / DELETE 會產生 audit 列（本 task 之前是紅的）
- [x] 測試：`task_properties` 的 INSERT / UPDATE 同上，且 `property_value` 前後值都在
- [x] 測試：守門——`AUDITED_TABLES` 裡每一張表都要有某支 migration 真的掛過它的 trigger
- [x] 實跑 `alembic upgrade head` / `downgrade -1` 驗證 trigger 掛上與移除

> **清單本身不會生效。** `AUDITED_TABLES` 只是 Python list；真正掛 trigger 的是 migration，而
> `71bd05e07df3` 迭代的是**凍結的快照清單**（`_AUDITED_TABLES_AT_THIS_REVISION`）。所以往
> `AUDITED_TABLES` 追加表名，對已經 migrate 過的資料庫**完全沒有作用**。既有慣例是每次追加就
> 補一支自帶凍結清單的 migration（`c219aac56556` 補 RBAC v1 的表、013 補 `project_settings`），
> 本票沿用同一形狀。
>
> 這個失敗模式是**無聲的**：清單說有稽核、測試套件也同意（因為 fixture 在 runtime 自己掛
> trigger），只有正式環境一筆 audit 都不會寫。所以測試裡放了一條靜態守門，比對
> `AUDITED_TABLES` 與所有 migration 實際掛過的表。

> **本票不做批次追溯**（ADR-124）。batch uuid 只出現在 HTTP 回應與錯誤報告裡，不進資料庫——`audit_logs.context` 與 `app.active_identity` 都是 feature 010（PR #37）帶進來的，這個基底拿不到。不要為了它去改 `audit_trigger_func`：010 也在改同一支 function。

> **完成 2026-08-22**：`tests/test_bulk_audit.py` 9 passed，全套件 532 passed / 0 failed，ruff 乾淨。

## Task 3: 欄位表頭模型

**Files:** Create `app/services/bulk_columns.py`, `tests/test_bulk_columns.py`

一份表頭 = 固定欄位（寫死，見 spec §5）+ 動態欄位（來自 config）。**兩邊共用，匯出與匯入用的是同一份定義。**

- [x] `ColumnSpec`（frozen dataclass）：`header` / `field` / `data_type` / `enum_options` / `is_dynamic` / `writable_on_create` / `writable_on_update` / `required_on_create`
- [x] `station_columns(db, station_type)`：固定欄位 + `list_by_type` 中 `data_type == "Integer"` 的 `prop.<name>`
- [x] `ticket_columns(db, task_type)`：固定欄位 + `list_by_type` 全部型別的 `prop.<name>`
- [x] `dynamic_columns_skipped_for_station(db, station_type)`：回傳被略過的欄位與原因，給 `preview` 顯示（ADR-118）
- [x] 測試：`shelter` 只拿到 Integer 欄位，`water` 拿到 0 個動態欄位
- [x] 測試：`is_active=false` 的 config 不出現在表頭（免費得到的，因為走 `list_by_type`）
- [x] 測試：不屬於本部署 `disaster_types` 的 config 不出現；未設定的部署則不過濾
- [x] 測試：`'all'` bucket 的欄位會併進每一種 station type
- [x] 測試：略過的欄位帶得出 `property_name` / `data_type` / 原因
- [x] 測試：ticket 的動態欄位全型別都在（含 String）
- [x] 測試：比對鍵欄位、唯讀欄位、`status`、座標必填的 writability 都符合 spec §5
- [x] 測試：欄位順序穩定，動態欄位照 `(sort_order, property_name)`

> **與原規劃的兩點差異**
>
> 1. `disaster_types` 不由呼叫端傳入，`bulk_columns` 自己讀 `project_settings_repository.get_current_disaster_types`（跟 013 的 GraphQL resolver 同一條路）。少一個參數可以傳錯。
> 2. 函式名是 `dynamic_columns_skipped_for_station`，不是 `skipped_station_columns`——它回的不是欄位，是「沒能變成欄位的東西」。
>
> **逐欄核對出來的 spec 修正**（spec §5 與 ADR-108 已同步）：`name` / `title` 是比對鍵，寫回去必然是空操作，所以標成僅新增；`UpdateTicketInput` 沒有 geometry，所以求助單座標僅新增；`UpdateTicketTaskInput` 沒有 `task_description` / `quantity`，所以那兩欄也僅新增。
>
> **`priority` 暫時當純字串**：`low/medium/high/critical` 這組字彙在 codebase 裡只存在於 GraphQL 的 description 文字，沒有任何 enum 或常數，單筆寫入也不驗。Task 7 要驗它的話等於由本票發明一組正式字彙——待決定，見 Task 7。
>
> **完成 2026-08-22**：`tests/test_bulk_columns.py` 16 passed，全套件 548 passed / 0 failed，ruff 乾淨。

## Task 4: 表格讀寫層

**Files:** Modify `pyproject.toml`；Create `app/core/tabular.py`, `tests/test_tabular.py`

**純格式層，零業務邏輯**——它只認識「一列 = dict[str, str]」。

- [x] `uv add openpyxl`
- [x] `read_table(raw: bytes, filename: str) -> Table`，依副檔名分派（大小寫不敏感）
- [x] 空表頭 / 重複表頭 / 空檔 / 不支援的副檔名 → `TableFormatError`
- [x] 非 UTF-8 的 CSV → 專屬錯誤訊息（本地 Big5 匯出很常見）
- [x] `write_csv(headers, rows) -> bytes`：**帶 UTF-8 BOM**
- [x] `write_xlsx(headers, rows, *, text_columns) -> bytes`：`text_columns` 內的欄位寫成文字格式儲存格
- [x] 讀取時的資料清理：整數不帶小數尾巴、空白格變空字串、全空的列丟掉

```python
# ADR-115: Excel infers a type for every cell it opens. Left alone it reads 0912345678 as
# the number 912345678, and `contact_phone` is a ticket's match key (ADR-107) — a silently
# dropped leading zero turns a whole round-trip into "nothing matched, everything is new".
TEXT_COLUMNS = frozenset(
    {"uuid", "contact_phone", "contact_name", "name", "title", "no", "floor", "room"}
)
```

- [x] 測試：`write_csv` 的輸出以 BOM 開頭，中文與前導 0 往返不變
- [x] 測試：沒有 BOM 的外部 CSV 也讀得進來
- [x] 測試：Big5 檔 → 錯誤訊息點名 UTF-8
- [x] 測試：XLSX 的 `contact_phone` 儲存格 `number_format == "@"`
- [x] 測試：試算表存的整數 `200` 讀回來是 `"200"` 不是 `"200.0"`
- [x] 測試：空白格 → `""`；結尾的空列被丟掉
- [x] 測試：只有表頭的檔仍然報得出表頭（空範本，ADR-119）
- [x] 測試：重複表頭 / 空白表頭 / 空檔 / `.txt` `.json` `.md` 都被拒絕

> **與原規劃的三點差異**
>
> 1. `read_table` 回的是 `Table(headers, rows)` 而不是 `list[dict]`。**只有表頭的空範本沒有第一列可以推導表頭**，而那正是 ADR-119 要的東西。
> 2. 錯誤型別是 `TableFormatError(ValueError)`，不是裸的 `ValueError`——沿用 repo 既有的 `ContactError` 形狀，端點可以只攔這一種來回 400。
> 3. `TEXT_COLUMNS` 多收了 `name` 與 `title`：它們是比對鍵，而「12345 號站」這種名稱一樣會被 Excel 當成數字。
>
> **CSV 的 BOM 不能阻止 Excel 重新推斷型別**——CSV 裡沒有任何東西可以。那是 XLSX 的工作；CSV 留著是因為外部來源很多只給 CSV。程式註解與測試都照這個講法寫，沒有誇大。
>
> **完成 2026-08-22**：`tests/test_tabular.py` 20 passed，全套件 568 passed / 0 failed，ruff 乾淨。

## Task 5: 匯出 ✅

**Files:** Create `app/services/bulk_export.py`, `app/api/v1/endpoints/bulk.py`, `app/schemas/bulk.py`, `tests/test_bulk_export.py`；Modify `app/api/v1/api.py`

- [x] `GET /api/v1/bulk/stations/export?station_type=&format=`：檢 `station.export`，依 scope 取資料
- [x] `GET /api/v1/bulk/tickets/export?task_type=&format=`：檢 `ticket.export`
- [x] ticket 的三個 contact 欄逐筆套 PII scope（`all` / `none` 不再查 DB，只有 own/zone 逐筆判斷）
- [x] 空結果也回一份只有表頭的檔（ADR-119 的空範本）
- [x] 關聯資料兩次查詢取完，不是 2N 次
- [x] 12 個測試：表頭佈局、座標欄、zone 範圍、403、空範本、CSV/XLSX 一致、格式拒絕、XLSX 文字格式、一列一 task、動態值、**同一份檔裡逐列遮罩**、無 view_pii 全遮罩

## Task 6: 比對引擎 ✅

**Files:** Create `app/services/bulk_match.py`, `tests/test_bulk_match.py`

- [x] `build_station_index` / `build_ticket_index`：**整份檔比對一次索引查詢**，不是每列一次查詢
- [x] `match_task`：在已比對到的 ticket 底下比對
- [x] `Match(kind=matched/no_match/ambiguous)`
- [x] `duplicate_key_rows`：檔內同鍵的列互指列號，全部失敗
- [x] 正規化：NFKC（全半形）+ 空白收斂 + casefold；電話先試 E.164，失敗退回純數字
- [x] 14 個測試，含 soft-delete 不可比中、無地址的舊資料可比中

> **為什麼是索引而不是逐列 SQL**：正規化（NFKC、casefold、電話形狀）在 SQL 裡做不乾淨，做了就會有兩套實作。索引把正規化留在 Python 一份，代價是把該表的比對欄位讀進記憶體——以本專案的資料量可接受。

## Task 7: 列驗證 ✅

**Files:** Create `app/services/bulk_validate.py`, `tests/test_bulk_validate.py`

- [x] 型別轉換（Integer / Float / Boolean / Enum）+ 可讀錯誤訊息
- [x] 座標：新增必填、更新可空、範圍檢查（ADR-123）
- [x] 動態欄位照 `list_by_type` 驗（ADR-117）；未定義的 `prop.` 欄位**有值才失敗**
- [x] 遮罩偵測：`◯` 或 `*` 出現在 contact 欄 → 該列失敗（ADR-109）
- [x] `writable_values`：空白不進、依方向濾掉不可寫的欄位（ADR-108/121）
- [x] 錯誤列號照試算表（表頭是第 1 列）
- [x] 20 個測試，含「一列三個問題一次全回」

> **`priority` 仍是純字串。** `low/medium/high/critical` 在 codebase 裡只存在於 GraphQL description，沒有 enum、沒有常數、單筆寫入也不驗。驗它等於由本票發明正式字彙，且 ADR-117 授權的不對稱只涵蓋動態欄位。**待使用者裁決**；`visibility`（真的 `Visibility` enum）與 ticket `status`（`VALID_TRANSITIONS` 的 keys）都接既有來源，沒有發明東西。

## Task 8: preview 端點 ✅

**Files:** Modify `app/api/v1/endpoints/bulk.py`；Create `app/schemas/bulk.py`

- [x] `POST /api/v1/bulk/{stations|tickets}/import/preview`（multipart）：檢 `*.import`（**探測防護**）
- [x] 上限在最前面：> 500 列或 > 2 MB → 400（ADR-116）
- [x] 回傳偵測欄位、建議映射、配不到的欄位、前 20 列、**所有**錯誤、被略過的動態欄位
- [x] 測試：preview 零寫入、403、一次回三個錯、映射建議、略過欄位說明、超量拒絕

## Task 9: station 匯入 commit ✅

**Files:** Create `app/services/bulk_import.py`, `tests/test_bulk_import_station.py`

- [x] 逐列：比對 → 驗證 → `create_station`(+`secondary_location`) 或 `update_station`
- [x] 動態欄位走 `create_station_property` / `update_station_property`
- [x] 失敗列跳過並收集，回成功/失敗筆數 + 錯誤報告（ADR-112）
- [x] 20 個測試，含**冪等**、**匯出→匯回零錯誤**、zone 越界失敗、只有 import 沒有 add 全失敗、檔內同鍵全失敗、型別不符拒絕

> **新建站點的 `source` 寫成 `"import"`**：`create_station` 要求這個參數，而「這筆是從檔案進來的」本來就值得留下。

## Task 10: ticket 匯入 commit ✅

**Files:** Modify `app/services/bulk_import.py`；Create `tests/test_bulk_import_ticket.py`

- [x] 一列 = 一張單 + 一個 task（ADR-120）
- [x] status 先跟 DB 現值 diff，相同就不送（ADR-122）；新增列忽略 status
- [x] 13 個測試，含 **completed 原封匯回零錯誤**、非法轉換失敗、合法轉換成功、遮罩電話擋下、**zone scope 匯出 100 列只改得回區內那些**

> **實作時抓到的真 bug**：同一份檔裡兩列共用同一張單（不同任務）時，第二列又建了一張新單——比對索引是開檔時建的，不知道第一列剛建了什麼。修法是讓索引在匯入過程中登記新建的 uuid，並且**在寫入當下**重新解析比對結果，而不是沿用規劃階段的判斷。

## Task 11: 錯誤報告 ✅

**Files:** Modify `app/services/bulk_import.py`, `app/schemas/bulk.py`

- [x] `commit` 回應同時帶 JSON 錯誤陣列與一份可下載的錯誤檔（原列 + `error` 欄），格式與上傳相同
- [x] 測試：錯誤檔表頭 = 原表頭 + `error`，只含失敗的列

> **報告為什麼內嵌 base64 而不是給下載網址**：端點是無狀態的（ADR-114），而且報告描述的是**這一次**執行——commit 之後有些列已經存在了，拿同一份檔重跑不會得到同一份報告。

> **完成 2026-08-22**：全套件 **647 passed / 0 failed**，ruff 對本票新增的檔案全綠（repo 既有的 7 個錯誤不變）。

## Task 12: docker 完整驗證

**Files:** —

- [ ] `alembic upgrade head` 之後確認 `station_properties` / `task_properties` 真的掛上 audit trigger（Task 2 的 `b3f1c07d2a95`）
- [ ] `python scripts/seed_rbac.py` 冪等重跑，確認 4 個 key 的 grant 正確落地
- [ ] 用真實 seed 資料手動走一次完整往返：匯出 shelter → Excel 開起來改兩個值 → 存檔 → preview → commit → 再匯出比對
- [ ] 用 LibreOffice/Excel 實際開一次 CSV，確認中文不亂碼、電話前導 0 還在
- [ ] `COVERAGE_CORE=sysmon uv run pytest --cov=app --cov-report=term-missing`，確認新模組 ≥ 80%
- [ ] `uv run ruff check`

> **coverage 提醒**：`pytest --cov` 的預設 tracer 量不到 ASGI client 走的路徑，會把 service / endpoint 的覆蓋率誤報成偏低。一定要帶 `COVERAGE_CORE=sysmon`。

---

## 驗收

- [ ] 匯出的檔直接匯回去零錯誤（station 與 ticket 各一次）
- [ ] 同一份檔連匯兩次，第二次全部走更新、總筆數不變
- [ ] 一份含錯誤的檔：好的列進了、壞的列在報告裡且訊息可診斷
- [ ] zone scope 的人匯不到、也改不到自己負責區以外的資料
- [ ] `member` 與 `user` 對四個端點全部 403
- [ ] `station_properties` / `task_properties` 的變更會出現在 `audit_logs` 裡
- [ ] 全套件綠燈，新模組覆蓋率 ≥ 80%
