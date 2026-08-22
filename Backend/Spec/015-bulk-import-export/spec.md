# Design: 批量匯入匯出（欄位比對）

**Date**: 2026-08-21
**Feature**: 015-bulk-import-export
**Status**: 定案，待實作
**Notion**: 補齊功能 →「後台 - Ticket/Resource Station 批量匯入匯出（欄位比對）」（backend-Popo，08-18~08-22）
**Depends on**: `feat/project-settings-backend`（PR #36）。匯入驗證直接建在 013 的 `list_by_type` 上——它已經處理好 `is_active`、`disaster_types` 過濾、`'all'` bucket 與穩定排序（`app/repositories/config_repository.py:44`）。基於 `main` 會拿不到這些，且本票的 ADR-117 是明確推翻 013 的 ADR-092，接在它後面才講得通。

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
- **兩筆以上** → 該列失敗，錯誤訊息列出配到的 uuid（ADR-113）。

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

### 上限

單次 **500 列 / 2 MB**，`preview` 階段就擋（ADR-116）。commit 端點加 rate limit（專案已有 `fastapi-limiter`）。

理由是逐筆 upsert 不便宜：每一列要跑比對查詢 + `require_scope`，而 zone scope 是 PostGIS 的點在多邊形內查詢。同步端點撐不了幾千列。

---

## 5. 欄位集合

匯出**必須指定單一 type**（station 的 `station_type` / ticket 的 `task_type`），欄位順序固定（ADR-119）。空庫也能匯出只有表頭的空範本，直接拿去填。

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
| `description`, `priority`, `disaster_type` | 新增 + 更新 |
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
- **station 動態欄位 32/37 不可用**（§6）。
