# 批量匯入匯出 — Implementation Plan

**Goal:** 後台能把 station / ticket 按單一 type 匯出成 CSV/XLSX，改完之後匯回去——比對得中就更新、比對不中就新增，錯的列列出來給人改。

**Architecture:** REST 兩端點、伺服器零狀態。欄位表頭由 013 的 `list_by_type` 產生，寫入一律複用既有的 `create_*` / `update_*` service（連同 authz、驗證、狀態機一起），本票不新寫任何一條寫入邏輯。

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/PostGIS, openpyxl（新增）, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/015-bulk-import-export/spec.md`（ADR-106~125）

**Branch:** `feat/bulk-import-export-backend`（off `feat/project-settings-backend`，**不是 off main**，ADR-125）

---

## Global Constraints

- **不新寫寫入邏輯。** 每一列最終都要走 `create_station` / `update_station` / `create_station_property` / `update_station_property` / `create_ticket` / `update_ticket` / `create_ticket_task` / `update_ticket_task` / `create_task_property` / `update_task_property`。這些函式已經各自處理 authz + 驗證 + 持久化（ADR-014）。如果你發現需要繞過其中一個，那是設計理解錯了。
- **不動 schema。** 本票零 migration（ADR-118 / ADR-124）。
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

- [ ] `Perm` 新增三個 key（`ticket.export` 已存在，不動）

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

- [ ] `seed_rbac.py` 依 ADR-111 的矩陣加 grant：super_admin 四個都 `all`；`data_auditor` 加 `STATION_EXPORT: "all"` 與 `TICKET_EXPORT: "all"`；team `admin` 加 `*_EXPORT: "zone"` 與 `*_IMPORT: "all"`；`member` 與 `user` 不動
- [ ] 更新 `seed_rbac.py:10` 的檔頭註解——`ticket.export` 不再是「尚未被任何角色使用」
- [ ] 測試：四個 key 的 `resolve_scope` 對五個角色各自回傳預期值；`member` / `user` 拿到 `Scope.NONE`
- [ ] **跑一次全套件**，確認 seed 改動沒有打到既有 RBAC 測試

## Task 2: 稽核接線

**Files:** Modify `app/db/triggers.py`；Create `tests/test_bulk_audit.py`

- [ ] `AUDITED_TABLES` 加入 `station_properties`、`task_properties`

```python
    # Feature 015: dynamic-field values were never audited — a station's quantity or a
    # task's property could be changed with no trail at all. Bulk import writes them in
    # batches, which makes the gap much easier to hit (ADR-124).
    "station_properties",
    "task_properties",
```

- [ ] 測試：`station_properties` 的 INSERT / UPDATE 現在會產生 audit 列（這條在本 task 之前是紅的）
- [ ] 測試：`task_properties` 同上

> **本票不做批次追溯**（ADR-124）。batch uuid 只出現在 HTTP 回應與錯誤報告裡，不進資料庫——`audit_logs.context` 與 `app.active_identity` 都是 feature 010（PR #37）帶進來的，這個基底拿不到。不要為了它去改 `audit_trigger_func`：010 也在改同一支 function。

## Task 3: 欄位表頭模型

**Files:** Create `app/services/bulk_columns.py`, `tests/test_bulk_columns.py`

一份表頭 = 固定欄位（寫死，見 spec §5）+ 動態欄位（來自 config）。**兩邊共用，匯出與匯入用的是同一份定義。**

- [ ] `ColumnSpec`：`name` / `header` / `writable_on_create` / `writable_on_update` / `data_type`
- [ ] `station_columns(db, station_type, disaster_types)`：固定欄位 + `list_by_type` 回傳中 `data_type == "Integer"` 的 `prop.<name>`
- [ ] `ticket_columns(db, task_type, disaster_types)`：固定欄位 + `list_by_type` 全部型別的 `prop.<name>`
- [ ] `skipped_station_columns(...)`：回傳被略過的欄位與原因，給 `preview` 顯示（ADR-118）

```python
# ADR-118: station_properties can only store a number (`quantity`), so a config row of any
# other data_type has nowhere to put its value — those fields are skipped rather than
# emitted as columns that would fail on the way back in. 32 of the 37 seeded station configs
# fall here; that is an existing schema gap, not something this feature introduced.
UNSTORABLE_ON_STATION = "station_properties cannot store a {data_type} value"
```

- [ ] 測試：`shelter` 得到 3 個 `prop.` 欄位（`capacity_total` / `beds_available` / `price`，皆為 `Integer`），`water` 得到 0 個
- [ ] 測試：`is_active=false` 的 config 不出現在表頭（免費得到的，因為走 `list_by_type`）
- [ ] 測試：不屬於本部署 `disaster_types` 的 config 不出現
- [ ] 測試：`skipped_station_columns` 對 `water` 回傳 `is_potable`(Boolean)、`water_level`(Enum) 與 `crowd_level`(Enum，來自 `'all'` bucket) 各帶原因
- [ ] 測試：ticket 的 `rescue` 型別四個 `prop.` 欄位全在（含 String 型）

## Task 4: 表格讀寫層

**Files:** Modify `pyproject.toml`；Create `app/core/tabular.py`, `tests/test_tabular.py`

**純格式層，零業務邏輯**——它只認識「一列 = dict[str, str]」。

- [ ] `uv add openpyxl`
- [ ] `read_table(raw: bytes, filename: str) -> list[dict[str, str]]`，依副檔名分派；空表頭 / 重複表頭 → `ValueError`
- [ ] `write_csv(headers, rows) -> bytes`：**帶 UTF-8 BOM**
- [ ] `write_xlsx(headers, rows, text_columns) -> bytes`：`text_columns` 內的欄位寫成文字格式儲存格

```python
# ADR-115: Excel infers types on open. Without this, 0912345678 comes back as 912345678 —
# and contact_phone is a ticket's match key (ADR-107), so a silent leading-zero loss turns
# an entire round-trip into "nothing matched, everything is new".
TEXT_COLUMNS = frozenset({"contact_phone", "contact_name", "no", "floor", "room", "uuid"})
```

- [ ] 測試：`write_csv` 的輸出以 BOM 開頭，中文欄位讀回來不亂碼
- [ ] 測試：`0912345678` 寫進 XLSX 再讀回來仍然是 `"0912345678"`（前導 0 在）
- [ ] 測試：CSV 往返同上
- [ ] 測試：`.txt` 之類的副檔名 → `ValueError`

## Task 5: 匯出

**Files:** Create `app/services/bulk_export.py`, `app/api/v1/endpoints/bulk.py`, `app/schemas/bulk.py`, `tests/test_bulk_export.py`；Modify `app/api/v1/api.py`

- [ ] `GET /api/v1/bulk/stations/export?station_type=&format=`：檢 `station.export`，依 scope 取資料
- [ ] `GET /api/v1/bulk/tickets/export?task_type=&format=`：檢 `ticket.export`
- [ ] ticket 的三個 contact 欄逐筆套 PII scope

```python
# ADR-109: the same per-row ticket.view_pii decision the GraphQL field resolvers make
# (app/graphql/tickets/types.py:375). Export is a second read path onto the same data — if
# it skipped this, the own/zone tiers would guard the screen and not the export button.
```

- [ ] 空結果也要回一份只有表頭的檔（ADR-119 的空範本）
- [ ] 註冊 router 到 `api.py`
- [ ] 測試：`super_admin` 匯出 shelter，表頭 = 固定欄位 + 3 個 `prop.`，順序穩定
- [ ] 測試：team admin（zone scope）匯出，只拿到自己 WorkZone 內的站點
- [ ] 測試：`member` 匯出 → 403
- [ ] 測試：zone scope 的人匯出 ticket，**在 zone 內的列是明碼、zone 外的列是遮罩**（同一份檔裡兩種都有）
- [ ] 測試：空庫匯出得到只有表頭的檔，且該檔的表頭與有資料時完全相同
- [ ] 測試：CSV 與 XLSX 兩種格式的內容一致

## Task 6: 比對引擎

**Files:** Create `app/services/bulk_match.py`, `tests/test_bulk_match.py`

- [ ] `match_stations(db, rows)`：名稱正規化後 join `secondary_locations` 比 `county` + `city`
- [ ] `match_tickets(db, rows)`：`title` + `contact_phone`（電話先過 `app/core/normalize.py` 的正規化）
- [ ] `match_task(db, ticket_uuid, task_type, task_name)`
- [ ] 三種結果：`Matched(uuid)` / `NoMatch` / `Ambiguous(uuids)`
- [ ] 檔內同鍵偵測：先掃一遍整份，同鍵的列全部標成失敗並互相指出列號（ADR-113）
- [ ] 測試：恰好一筆 → `Matched`
- [ ] 測試：同名不同縣市 → 兩筆都不會被誤配
- [ ] 測試：同名同縣市兩筆 → `Ambiguous`，且錯誤訊息含兩個 uuid
- [ ] 測試：檔內兩列同鍵 → 兩列都失敗，訊息互指列號（**不是後蓋前**）
- [ ] 測試：`name` 為 NULL 的既有 station 不會被空白名稱的列配中

## Task 7: 列驗證

**Files:** Create `app/services/bulk_validate.py`, `tests/test_bulk_validate.py`

- [ ] 固定欄位：型別、enum（`priority` / `visibility` / `status`）、必填
- [ ] 座標：新增列必填且過 `validate_point`；更新列空白 → 不動（ADR-123）
- [ ] 動態欄位：照 `list_by_type` 的定義驗（ADR-117）——未定義的 `prop.` 欄位、`Enum` 值不在 `enum_options`、型別轉不動，三者都是該列失敗
- [ ] 遮罩偵測：含 `◯` 或符合 `mask_phone` 樣式的電話 → 該列失敗（ADR-109）

```python
# ADR-109: a masked phone means the caller could not see this row's PII on the way out, so
# they must not be able to write it back in. Failing loudly beats the alternative — a masked
# value never matches (ADR-107), so a silent pass would quietly create a duplicate ticket.
```

- [ ] 測試：`prop.capacity_total` 填 `"abc"` → 失敗，訊息點名該欄位
- [ ] 測試：`prop.crowd_level` 填 `"extreme"`（不在 `enum_options`）→ 失敗
- [ ] 測試：config 沒定義的 `prop.foo` → 失敗
- [ ] 測試：`is_active=false` 的欄位出現在檔裡 → 失敗（因為不在 `list_by_type` 的結果裡）
- [ ] 測試：遮罩電話 `09*****678` → 失敗，訊息提到 PII 權限
- [ ] 測試：更新列座標空白 → 通過；新增列座標空白 → 失敗
- [ ] 測試：單筆 GraphQL 寫入仍然不驗證型別（**確認 ADR-092 沒有被順手改掉**）

## Task 8: preview 端點

**Files:** Modify `app/api/v1/endpoints/bulk.py`, `app/schemas/bulk.py`；Create `tests/test_bulk_preview.py`

- [ ] `POST /api/v1/bulk/{stations|tickets}/import/preview`（multipart）：檢 `*.import`
- [ ] 上限檢查在最前面：> 500 列或 > 2 MB → 400（ADR-116）
- [ ] 回傳：偵測到的欄位、建議映射（表頭同名自動配對）、前 20 列預覽、**所有**錯誤列、被略過的欄位與原因
- [ ] 測試：沒有 `*.import` → 403（**探測防護**，ADR-110）
- [ ] 測試：501 列 → 400，且錯誤訊息說得出上限
- [ ] 測試：一份有 3 個不同錯誤的檔，`preview` 一次回三個（不是碰到第一個就停）
- [ ] 測試：`preview` 完全不寫資料庫（前後 `audit_logs` 筆數不變）
- [ ] 測試：Task 5 匯出的檔直接丟進 `preview` → 零錯誤（**往返對稱的守門測試**）

## Task 9: station 匯入 commit

**Files:** Create `app/services/bulk_import.py`；Modify `app/api/v1/endpoints/bulk.py`；Create `tests/test_bulk_import_station.py`

- [ ] `POST /api/v1/bulk/stations/import/commit`（multipart：檔 + mapping）
- [ ] 逐列：比對 → 驗證 → 新增（`create_station` + 選填 `secondary_location`）或更新（`update_station`）
- [ ] 動態欄位：`create_station_property` / `update_station_property`
- [ ] 空白 = 不動（ADR-121）；比對鍵欄位在更新列上忽略（ADR-108）
- [ ] 失敗列跳過並收集，回成功/失敗筆數 + 逐列錯誤報告（ADR-112）
- [ ] 整個請求產一個 batch uuid，放進回應與錯誤報告（**不進資料庫**，ADR-124）
- [ ] 測試：比對不中 + 有座標 → 新增，且 `created_by` 是匯入者
- [ ] 測試：比對中 → 更新，且 `uuid` 不變（**沒有偷偷新增**）
- [ ] 測試：更新列改了 `county` → 該欄位被忽略，DB 裡的地址不變（ADR-108）
- [ ] 測試：更新列某欄空白 → DB 該欄保持原值（ADR-121）
- [ ] 測試：一份 5 列的檔中 2 列有錯 → 3 列進了、2 列在報告裡，且報告帶列號與原因
- [ ] 測試：team admin 匯入自己 zone 外的既有站點 → 該列因 checkpoint 2 失敗（**匯入沒有繞過 scope**）
- [ ] 測試：只有 `station.import` 沒有 `station.add` → 新增列全失敗（ADR-110）
- [ ] 測試：同一份檔連匯兩次 → 第二次全部走更新，總筆數不變（**冪等**）

## Task 10: ticket 匯入 commit

**Files:** Modify `app/services/bulk_import.py`；Create `tests/test_bulk_import_ticket.py`

- [ ] 一列 = 一張單 + 一個 task（ADR-120）：`create_ticket` → `create_ticket_task` → `create_task_property`
- [ ] status 先跟 DB 現值 diff，相同就不放進 `changes`（ADR-122）
- [ ] 新增列忽略 status 欄——`create_ticket` 一律寫 `"pending"`
- [ ] 測試：新增列建出 ticket + task + 動態欄位三層都在
- [ ] 測試：**匯出一批 `completed` 的單，原封不動匯回 → 零錯誤**（ADR-122 的核心回歸測試）
- [ ] 測試：`completed` → `pending` → 該列失敗，訊息提到狀態轉換
- [ ] 測試：`pending` → `in_progress` → 成功
- [ ] 測試：同一張單有兩個 task → 匯出兩列，匯回後仍是兩個 task（沒有互相覆蓋）
- [ ] 測試：更新列改了 `contact_phone` → 忽略（ADR-108），且比對仍以原電話進行
- [ ] 測試：zone scope 的人匯出 100 列、改完匯回 → zone 外的列全部失敗於遮罩偵測，zone 內的成功（ADR-109 的整條路徑）

## Task 11: 錯誤報告下載

**Files:** Modify `app/api/v1/endpoints/bulk.py`, `app/services/bulk_import.py`；Modify `tests/test_bulk_import_station.py`

- [ ] `commit` 的回應同時帶 JSON 錯誤陣列與一份可下載的錯誤檔（原列內容 + 一欄 `error`），格式與上傳格式相同
- [ ] 測試：錯誤檔的表頭 = 原表頭 + `error`，且修好 `error` 指出的問題後可以直接再匯一次

## Task 12: docker 完整驗證

**Files:** —

- [ ] `alembic upgrade head` 之後確認 `station_properties` / `task_properties` 真的掛上 audit trigger（本票零 migration，trigger 靠既有流程套上）
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
