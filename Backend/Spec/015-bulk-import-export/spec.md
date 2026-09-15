# Design: 批量匯入匯出（欄位比對）

**Date**: 2026-08-21
**Feature**: 015-bulk-import-export
**Status**: 已實作；PR #42 兩輪 review 修正完成（ADR-208~214、238~242）。實作對照見 §13
**PRD**: `prd.md`（使用者故事、驗收條件、前端契約）
**Notion**: 補齊功能 →「後台 - Ticket/Resource Station 批量匯入匯出（欄位比對）」（backend-Popo，08-18~08-22）
**Depends on**: `feat/project-settings-backend`（PR #36，2026-09-06 已合併進 `main`；本 PR 已改接 `main`）。匯入驗證直接建在 013 的 `list_by_type` 上——它已經處理好 `is_active`、`disaster_types` 過濾、`'all'` bucket 與穩定排序（`app/repositories/config_repository.py:44`）。基於 `main` 會拿不到這些，且本票的 ADR-117 是明確推翻 013 的 ADR-092，接在它後面才講得通。

---

## 1. 概述

### 現況

資源站點管理列表右上角的「匯入」「匯出」是前端 stub，後端沒有任何對應端點。Station 與 Ticket 的 CRUD 全在 GraphQL，REST 只有 auth / admin / rbac / map（`app/api/v1/api.py`）。

`ticket.export` 這個 capability key 已經存在，但**零 grant、零 enforcement**——`scripts/seed_rbac.py:10` 的註解明說它是預留給未來功能的空殼。本票就是那個功能。

### 目標

- 後台能把 station / ticket 匯出成 CSV 或 XLSX，含動態欄位。
- 能把改過的檔匯回去：比對得中就更新，比對不中就新增。
- 匯入前有一個映射與驗證的預覽步驟，讓欄位錯位在寫入之前就被擋下來。

### 非目標

- **AI dedup**。`is_duplicate` / `dedup_group_id` 只存在於 `stations` 與 `ticket_tasks`（`tickets` 表沒有），而且全 codebase 沒有任何程式會寫它們。丟進去等於丟進黑洞（ADR-113）。
- **修好 station 動態欄位存不下值這件事**（ADR-118）。
- **非同步 / 背景匯入**。專案沒有 celery/arq，本票不引入（ADR-114）。
- **匯入歷史頁面 / 整批回退**（ADR-124 留了地基，功能不做）。
- **.md / .json 格式**（ADR-115）。

---

## 2. 核心流程

```
匯出                                        匯入
GET  /bulk/{stations|tickets}/export        POST /bulk/{...}/import/preview   (檔案)
  ?type=shelter&format=xlsx                   → 偵測到的欄位、建議映射、前 20 列、
  → 串流一份檔                                   全檔驗證錯誤、被略過的欄位與原因
                                            POST /bulk/{...}/import/commit    (同一份檔 + 確認過的 mapping)
                                              → 逐筆寫入，回成功/失敗筆數 + 逐列錯誤報告
```

**伺服器零狀態**：檔案傳兩次，兩個端點之間不存任何東西（ADR-114）。

### 一列代表什麼

| 實體 | 一列 = |
|---|---|
| station | 一個站點（`base_geometries` + `stations` + 選填 `secondary_locations` + 動態欄位 `station_properties`） |
| ticket | 一張單 + 一個任務（`base_geometries` + `tickets` + `ticket_tasks` + 動態欄位 `task_properties`），ADR-120 |

---

## 3. 比對鍵

匯入靠自然欄位判定「這一列是不是現有的那一筆」（ADR-107）：

| 實體 | 比對鍵 |
|---|---|
| station | `stations.name` + `secondary_locations.county` + `secondary_locations.city` |
| ticket | `tickets.title` + `tickets.contact_phone` |
| ticket 的 task 層 | 配到的 ticket + `ticket_tasks.task_type` + `ticket_tasks.task_name` |

比對結果只有三種：

- **恰好一筆** → 更新那一筆。
- **零筆** → 新增；此時 `latitude` / `longitude` 必填（ADR-123）。
- **兩筆以上** → 該列失敗（ADR-113）。錯誤訊息只說比對到幾筆，**不列 uuid**（ADR-210 推翻了原本「列出配到的 uuid」的設計，理由見 §9）。

檔案內部若有兩列同鍵，那幾列**全部**失敗（不是後蓋前）。

### 比對鍵欄位在更新列上是唯讀的

**結構性的理由**：比對鍵是從這一列自己的值算出來的。等到某列被判定為「更新」，它的比對鍵欄位在檔案裡的值**必然已經等於**資料庫那筆的值——寫回去保證是空操作。所以 `name` / `title` 就算既有服務收得下，在匯入路徑上也標成僅新增，而不是留著讓它看起來可編輯。

**外加既有服務的限制**（ADR-108）：

- `UpdateStationInput` 沒有 `secondary_location`，也沒有 `source`（`app/graphql/geo/types.py:214`）。
- `UpdateTicketInput` 沒有任何 `contact_*`，**也沒有 geometry**（`app/graphql/tickets/types.py:491`）。
- `UpdateTicketTaskInput` 沒有 `task_description` / `quantity`（`app/graphql/tickets/types.py:244`）。

**代價要講明**：打錯的聯絡電話、打錯的縣市區、放錯位置的求助單，匯入都修不了，只能去 UI 改。反過來說也代表匯入永遠不會把一筆資料「改成別人」。

---

## 4. 檔案格式

CSV 與 XLSX 雙向（ADR-115）。CSV 匯出帶 UTF-8 BOM，XLSX 把電話、名稱、`no`/`floor` 這類欄位寫成文字格式儲存格。

**為什麼在意這個**：Excel 開 UTF-8 無 BOM 的 CSV 中文會亂碼，而且會把 `0912345678` 推斷成數字、吃掉前導 0 變成 `912345678`。`contact_phone` 正是 ticket 的比對鍵——不處理的話，「匯出→用 Excel 改→匯回」會整批比對失敗、全部變成新增。

### 匯出的值不可被當成公式執行（ADR-208）

試算表會**執行**以 `=` `+` `-` `@` 開頭的儲存格。站點名稱來自 `station.contribute` 這個刻意開放的投稿管道，而匯出檔會被持有 `station.export` 的人打開——寫的人和開的人不是同一個人。

- **XLSX**：每個非空儲存格強制寫成字串型別，值一個字元都不改。
- **CSV**：以那些字元開頭、且不是合法數字的值前綴一個 `'`（`-121.5` 這種座標不受影響）。
- 已知落差：CSV 這一半的來回不對稱——`=` 開頭的站名匯出後再匯回是新的名稱。理由見 ADR-208。

### 上限

單次 **500 列 / 2 MB**，而且**在解析之前**就擋（ADR-116 / ADR-209）。

> **未實作（2026-09-13 核對）**：ADR-116 決定「commit 端點加 rate limit（專案已有 `fastapi-limiter`）」，
> 但 `app/api/v1/endpoints/bulk.py` 的六個端點都沒有掛任何 limiter（#42、#43、`main` 皆同）。
> 目前能逐 route 使用的是 auth 端點在用的 `get_rate_limiter(times, seconds)`（`app/api/v1/endpoints/auth/deps.py`）。
> ADR-209 記錄的「`app/main.py` 建的 `pyrate_limiter` 沒掛到任何 route」是全站基礎設施問題，與此處不同。
> 處理方式待決，見 `prd.md` §8。

**匯出上限 10,000 列**（`bulk_export.py` 的 `MAX_EXPORT_ROWS`）。查詢取 `MAX_EXPORT_ROWS + 1` 列，超過就回 400 並說明要縮小範圍，**不給截斷的檔案**——這份檔同時是匯入範本，截斷的版本會被當成完整的匯回來（ADR-239）。剛好等於上限屬於成功。代價：單一型別超過一萬列就匯不出來，而型別是唯一的篩選條件；分頁或更多篩選需要另開票。

**不支援的匯出格式**在任何查詢之前就回 400，比權限檢查還早（ADR-238）。

理由是逐筆 upsert 不便宜：每一列要跑比對查詢 + `require_scope`，而 zone scope 是 PostGIS 的點在多邊形內查詢。同步端點撐不了幾千列。

**「之前」是重點**（ADR-209）：上限若跑在解析之後，限制的只是「匯進來多少」，不是「處理了多少」——一個 1.41 MB 的 xlsx 可以解壓成 364 MB 的 sheet XML，燒掉 220 秒 CPU 才被列數擋下。三道關卡由便宜到貴：檔案大小 → xlsx 解壓宣告大小（32 MB，讀 zip 目錄，不解壓）→ 讀到 501 列就停手。代價是超量的錯誤訊息不再報實際列數。

---

## 5. 欄位集合

匯出**必須指定單一 type**（station 的 `station_type` / ticket 的 `task_type`），欄位順序固定（ADR-119）。已設定但還沒有資料的型別也能匯出只有表頭的空範本，直接拿去填。

那兩個參數是自由字串（`Station.type` 是 `String(50)`，沒有 enum），而且會進到 `Content-Disposition`。所以匯出先對照**既有詞彙**（資料裡出現過的 type ∪ 欄位設定宣告的 type，扣掉萬用值 `all`），不在裡面回 400；檔名再照 RFC 6266 編碼，中文型別才不會變成 latin-1 編碼錯誤（ADR-214）。**完全空的資料庫——沒資料也沒欄位設定——匯不出任何模板**，這是接受的取捨。

### 固定欄位

| station | 讀寫 |
|---|---|
| `uuid` | 唯讀（參考用，不參與比對） |
| `type`, `description`, `op_hour`, `level`, `comment`, `visibility` | 新增 + 更新 |
| `latitude`, `longitude` | 新增必填；更新時空白 = 保留原座標 |
| `name` | 僅新增（比對鍵，ADR-108） |
| `county`, `city` | 僅新增（比對鍵，且 `UpdateStationInput` 沒有 `secondary_location`） |
| `lane`, `alley`, `no`, `floor`, `room` | 僅新增（同上，地址整組只在建立時可寫） |
| `source` | 僅新增（不在 `UpdateStationInput` 裡） |
| `verification_status`, `is_official`, `confidence_score`, `created_at`, `updated_at` | 唯讀 |

| ticket | 讀寫 |
|---|---|
| `uuid` | 唯讀 |
| `description`, `priority`, `disaster_type` | 新增 + 更新（`priority` 不驗值——ADR-126） |
| `status` | 更新（走狀態機，ADR-122）；新增時忽略——`create_ticket` 一律寫 `"pending"`（`app/services/ticket.py:99`） |
| `title` | 僅新增（比對鍵，ADR-108） |
| `contact_name`, `contact_email`, `contact_phone` | 僅新增；`contact_phone` 同時是比對鍵。匯出時逐筆遮罩（ADR-109） |
| `latitude`, `longitude` | 僅新增，且新增時必填——**`UpdateTicketInput` 沒有 geometry**，求助單的位置建立後就固定了 |
| `visibility`, `task_type` | 僅新增 |
| `task_name` | 僅新增（task 層的比對鍵） |
| `task_description`, `task_quantity` | 僅新增——**`UpdateTicketTaskInput` 沒有這兩個欄位**（它只收 status / progress_note / review_note / moderation_status / visibility） |
| `verification_status`, `review_note`, `created_at` | 唯讀 |

### 動態欄位

欄名前綴 `prop.`，來源是 013 的 `list_by_type`——**已停用（`is_active=false`）與不屬於本部署災害型別的欄位自動不出現**，不必另外寫過濾。

| 實體 | 涵蓋的 data_type |
|---|---|
| ticket（`task_properties`） | 全部（`property_value: str` 存得下任何型別） |
| station（`station_properties`） | **只有 `Integer`**（ADR-118） |

## 6. station 動態欄位只有 5/36 可用

`station_properties` 唯一能存值的欄位是 `quantity: int`（`app/models/station_property.py:9-22`；`CreateStationPropertyInput` 也只收 `quantity`，`status` 是 pending/verified/rejected 的審核狀態不是值）。

而 seed 的 36 筆 station config（`alembic/versions/a2a8e4d8c51d_...py:186-222`）分佈是：

| data_type | 筆數 |
|---|---|
| Boolean | 17 |
| Enum | 5 |
| Array | 4 |
| String | 3 |
| Text | 2 |
| **Integer** | **5** |

按 station type 拆（分母含 `'all'` bucket 的 `crowd_level`，`list_by_type` 會把它併給每一種 type）：

| station_type | 可用 / 全部 |
|---|---|
| shelter | 3 / 9 |
| medical | 1 / 6 |
| charge | 1 / 3 |
| water、shower、toilet、power | 0 / 3 |
| transport、gas_station、supply | 0 / 4 |
| cellular | 0 / 5 |

12 個 station type 裡有 **8 個一個可用的動態欄位都沒有**。

**這是既有的 schema 缺陷，不是匯入匯出造成的**——那些值今天就寫不進資料庫。本票的選擇是不修（ADR-118）：匯出表頭只列該 type 的 `Integer` 欄位，其餘在 `preview` 回報裡列出「已略過，原因：station_properties 目前無法儲存 <data_type> 型別的值」。station 這半邊的主要價值因此落在固定欄位（名稱、型別、座標、地址、營業時間、可見度）。

修這件事另開一張票。

---

## 7. PII

ticket 匯出逐筆套用與 GraphQL 完全相同的 `ticket.view_pii` own/zone/all 判斷（`app/graphql/tickets/types.py:375`）：在 scope 內給明碼，不在就給遮罩值（ADR-109）。

匯入時偵測到遮罩格式的電話（含 `◯`，或符合 `mask_phone` 產出的樣式）→ **該列失敗**，訊息明說「你沒有這筆的 PII 權限，不能匯回」。不靜默轉成新增——那會憑空長出一堆重複單。

**實務上的意思**：zone scope 的團隊成員匯出 100 列，能改回去的只有落在自己 WorkZone 內的那些。這是正確的，但使用者要知道。

---

## 8. 權限

新增三個 capability key，並啟用既有的 `ticket.export`（ADR-110）：

```
station.export   station.import   ticket.export（既有，本票啟用）   ticket.import
```

匯入需要**同時**持有 `*.import` **和**：新增列 → `*.add`；更新列 → `*.edit`（逐筆再過 own/zone 的 checkpoint 2）。

grant 矩陣（ADR-111）：

| 角色 | station.export | station.import | ticket.export | ticket.import |
|---|---|---|---|---|
| super_admin (platform) | all | all | all | all |
| data_auditor (platform) | all | — | all | — |
| admin (team) | zone | all | zone | all |
| member (team) | — | — | — | — |
| user (platform) | — | — | — | — |

`preview` 端點本身也檢 `*.import`——否則沒權限的人可以拿它探測資料。

---

## 9. 失敗語意

逐筆進，失敗列跳過，回一份可下載的錯誤報告（列號 + 原內容 + 原因），ADR-112。

`preview` 一次吐出**所有**錯誤列，不是碰到第一個就停。所以正常使用流程是：preview 看到問題 → 改檔 → 再 preview → 乾淨了才 commit。commit 階段仍可能有新錯誤（別人同時改了資料），此時走同一份錯誤報告格式。

**一列失敗只失敗那一列**（ADR-213）。逐列失敗會 `rollback`，而 `rollback` 會 expire 掉 identity map 裡的每一個物件——包含 `require_scope` 每列都要讀的 `actor`，而且**不管 `expire_on_commit`**。所以失敗處理是 `rollback` + 把 actor 重新載入；少了後半，第一列失敗會讓後面每一列都 `MissingGreenlet`，整份檔 500。

**比對到多筆時只說「幾筆」，不說是哪幾筆**（ADR-210）。`preview` 只驗 `*.import`，比對用的 index 又是全表，回報 uuid 等於讓沒有讀取權限的人用匯入權限探測資料。比對本身仍對全表做——依權限過濾 index 會把看不到的既有資料判成新建、匯出重複列。

**`partial_rows` 的意思是「這一列真的留下了半筆資料」**（ADR-212），依「這列有沒有已經 commit 過東西」判定，不依例外的型別。一列在第一個 service 呼叫就被權限擋掉，什麼都沒寫，不算 partial；父層已寫入、相依寫入才失敗的，算。

**檔內同鍵的後續列，只在領頭列真的會寫入時才算「更新」**（ADR-211）。ADR-120 讓一張 ticket 佔好幾列，靠檔內已見過的比對鍵認出後續列；若領頭列沒進去，後續列被當成更新規劃（丟掉所有僅新增欄位）卻被當成新增寫入，會產生沒有標題、沒有座標的 `create`。

**「求助單是更新」不等於「任務是更新」**（ADR-240）。一列把**新**任務掛到已比對到的求助單上時，任務走建立分支，`task_description` / `task_quantity` 要帶檔案裡的值（`bulk_validate.values_for()`）；比對到的既有任務仍然不寫這兩個欄位（ADR-108）。

**超長或超出範圍的儲存格只讓那一列失敗**（ADR-241）。20 個有寬度上限的欄位在 Python 端檢查長度，Integer 檢查 int4 範圍；逐列迴圈另外接住 `SQLAlchemyError` 當作防線，任何未預期的資料庫錯誤最多毀掉一列。

### 錯誤報表格式

preview 與 commit 的回應都帶逐列錯誤，commit 另外附上可以直接下載的報表：

| 欄位 | 內容 |
|---|---|
| `errors[]` | `{ line, column, message }`。`line` 是試算表列號（表頭是第 1 列）；`column` 是出問題的欄位，`-` 代表整列層級的問題 |
| `error_report` | `{ filename, media_type, content_base64 }`，沒有失敗列時為 `null`。內容是**失敗的原始列 + 最後一欄錯誤原因**，格式與上傳的檔相同 |
| `partial_rows[]` | 主資料已寫入、後續步驟才失敗的列號（ADR-212） |
| `batch_id` | 這次匯入的識別碼，只出現在回應裡（ADR-124） |

報表內嵌在回應裡而不是給下載網址：端點是無狀態的（ADR-114），而且 commit 之後用同一份檔重算，得到的答案不會一樣。

錯誤原因那一欄預設叫 `error`；原檔已經有 `error` 欄時改用 `error_1`、`error_2`⋯⋯，報表才能直接重新上傳（ADR-242）。解析報表的工具應該讀最後一欄，不要寫死欄名。

Schema 在 `app/schemas/bulk.py` 的 `BulkPreviewResponse` / `BulkImportResponse` / `RowErrorResponse` / `ErrorReportResponse`。

---

## 10. 動態欄位驗證：本票在匯入路徑推翻 ADR-092

013 的 ADR-092 定的是「config 只是給前端 render 的定義，後端從不驗證寫入的值」。**本票只在匯入路徑推翻它**（ADR-117）：

- 匯入：未在 config 定義的 `prop.` 欄位 → 該列失敗；`Enum` 值不在 `enum_options` → 失敗；型別轉不動 → 失敗。
- 單筆 GraphQL 寫入：**維持不驗證**，ADR-092 原封不動。

理由是批量匯入是唯一一條「沒有前端表單擋著、沒有人逐筆看、一次寫幾百列」的寫入路徑。一個型別錯誤在單筆寫入是一筆髒資料，在這裡是一整張表。

---

## 11. 稽核

稽核是 DB trigger 自動做的（`app/db/triggers.py`），匯入 500 列會自然產生上千筆 `audit_logs`，不必另外寫程式。

本票只補一件事：把 `station_properties` 與 `task_properties` 加進 `AUDITED_TABLES`——它們現在不在裡面，**動態欄位的變更完全不留痕跡**。

這需要一支只掛 trigger、不改結構的 migration：`AUDITED_TABLES` 只是 Python list，`71bd05e07df3` 迭代的是凍結的快照清單，往清單追加表名對已 migrate 的資料庫沒有作用（既有慣例見 `c219aac56556`）。

**批量的批次追溯本票不做**（ADR-124）。原本的設計是把一個 batch uuid 塞進 `audit_logs.context`，但那個欄位與它依賴的 `app.active_identity` 都是 feature 010（PR #37）帶進來的，本票的基底 #36 從 `main` 開，拿不到。batch uuid 仍會產生，但只出現在 HTTP 回應與錯誤報告裡。

**代價**：匯入造成的變更在 `audit_logs` 裡跟一筆一筆手改長得一模一樣，出事時圈不出「那一次匯入」。010 合進 `main` 之後另開小票補。

---

## 12. 已知風險

- **station 的比對鍵依賴 `secondary_location`，而它是選填的**。既有 station 若沒填縣市區，匯入永遠比不中，只會不斷新增重複站點。上線前要確認既有資料的覆蓋率，或接受「舊資料只能人工補」。
- **`contact_phone` 當比對鍵等於把 PII 放進主鍵路徑**。ADR-109 擋掉了外洩，代價是 zone scope 的人只能更新自己 zone 內的單子（見 §7）。
- **station 動態欄位 31/36 不可用**（§6：36 筆 config 中只有 5 筆是 Integer）。
- **commit 端點沒有 rate limit**（§4 的「未實作」）。

---

## 13. 實作對照（2026-09-13 回填）

落點指函式名，不指行號。

### 13.1 設計 → 程式碼落點

| 設計條目 | ADR | 落點 |
|---|---|---|
| 兩個 REST 匯出端點 + 四個匯入端點（preview / commit × station / ticket） | 114 | `app/api/v1/endpoints/bulk.py`；router 掛在 `app/api/v1/api.py` 的 `/bulk` |
| 固定欄位、讀寫規則、動態欄位（station 只取 Integer） | 108、118、119 | `app/services/bulk_columns.py` `station_columns()` / `ticket_columns()` / `dynamic_columns_skipped_for_station()` |
| CSV BOM、XLSX 文字格式、公式防護 | 115、208 | `app/core/tabular.py` `write_csv()` / `write_xlsx()` / `_csv_safe()` / `_looks_like_formula()` |
| 上限在解析之前生效 | 116、209 | `bulk_import.py` `_check_size()` / `_check_rows()`；`tabular.py` `_check_uncompressed_size()` |
| 匯出型別對照既有詞彙、檔名 RFC 6266 | 214 | `bulk_export.py` `_require_known_type()`；`bulk.py` `_content_disposition()` |
| 匯出格式最先檢查 | 238 | `bulk_export.py` `_require_supported_format()` |
| 匯出達上限時拒絕 | 239 | `bulk_export.py` `_require_not_truncated()` |
| 比對鍵與正規化（全形、大小寫、電話格式） | 107 | `app/services/bulk_match.py` `station_key()` / `ticket_key()` / `task_key()` / `normalize_text()` / `normalize_phone_key()` |
| 檔內同鍵全部失敗 | 113 | `bulk_match.py` `duplicate_key_rows()`；`bulk_import.py` `_collision_error()` |
| 比對到多筆只報筆數 | 210 | `bulk_import.py` `_ambiguous_error()` |
| 動態欄位依 config 驗證 | 117 | `app/services/bulk_validate.py` `coerce()` / `validate_row()` |
| 遮蔽過的聯絡資料不能匯回 | 109 | `bulk_validate.py` `_check_masked_contact()` |
| 匯出逐列 PII 遮蔽 | 109 | `bulk_export.py` `_pii_decider()` / `_contact_fields()` |
| 更新列丟掉比對鍵與僅新增欄位 | 108 | `bulk_validate.py` `writable_values()` |
| 新任務掛在既有求助單下仍帶檔案的值 | 240 | `bulk_validate.py` `values_for()`；`bulk_import.py` `_write_ticket()` → `_write_task()` |
| 有寬度上限的欄位與 int4 範圍 | 241 | `bulk_validate.py` `coerce()` / `_to_integer()`；`bulk_import.py` `_write_all()` 的 `SQLAlchemyError` 防線 |
| 一列失敗只失敗那一列 | 213 | `bulk_import.py` `_write_all()` / `_recover()` |
| 領頭列真的會寫入才把後續列當更新 | 211 | `bulk_import.py` `_plan_tickets()` |
| `partial_rows` 依事實判定 | 212 | `bulk_import.py` `_write_all()`（`RowProgress`） |
| 錯誤報表內嵌、欄名不衝突 | 112、242 | `bulk_import.py` `_as_report()` / `_error_column_name()`；`app/schemas/bulk.py` |
| 權限：`*.import` + `*.add` / `*.edit` | 110、111 | `*.import` 由 `bulk_import.py` 的 `preview_*` / `commit_*` 呼叫 `require_scope` 檢查；`*.add` / `*.edit` 與 own/zone 範圍由 `_write_station()` / `_write_ticket()` 呼叫的既有 station/ticket service 檢查（`test_importing_without_the_add_capability_fails_every_new_row`、`test_a_zone_scoped_importer_cannot_update_outside_its_area`）；grant 矩陣由 `test_seed_matrix_matches_adr_111` 釘住 |
| 動態欄位表納入稽核 | 124 | `alembic/versions/b3f1c07d2a95_audit_dynamic_field_tables.py` |
| commit 端點 rate limit | 116 | **未實作**（見 §4） |

### 13.2 測試

9 個檔案、142 支測試：

| 檔案 | 涵蓋 |
|---|---|
| `tests/test_bulk_columns.py` | 欄位集合、讀寫規則、動態欄位篩選、欄位順序 |
| `tests/test_bulk_match.py` | 比對鍵正規化、單筆/多筆/零筆比對、檔內同鍵 |
| `tests/test_bulk_validate.py` | 型別轉換、Enum、座標、遮蔽聯絡資料、列號、更新列丟欄位 |
| `tests/test_bulk_export.py` | 欄位配置、zone 範圍、空範本、CSV/XLSX 一致、PII 逐列遮蔽、格式先檢查、上限拒絕（ADR-238/239） |
| `tests/test_bulk_import_station.py` | 預覽不寫入、全部錯誤一次回報、新增/更新、重複匯入不變、zone 限制、錯誤報表、單列失敗不拖垮整份、`partial_rows`、多筆比對不透露 uuid |
| `tests/test_bulk_import_ticket.py` | 三層寫入、新單一律 pending、狀態機、同單多任務、遮蔽電話不能匯回、ADR-211 的兩種情境、ADR-240/241/242 |
| `tests/test_bulk_endpoints.py` | HTTP 層：下載標頭、中文型別、400/403、mapping 解析、報表 base64 解碼 |
| `tests/test_bulk_permissions.py` | capability 命名、grant 矩陣符合 ADR-111、import 必搭 add/edit |
| `tests/test_bulk_audit.py` | 動態欄位表的 insert/update/delete 都有稽核，且每張稽核表都有 migration 掛 trigger |
