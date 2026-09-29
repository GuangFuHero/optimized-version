# Spec 020 去重引擎介面 — 驗證與延遲報告

**日期**：2026-09-29
**分支**：`feat/dedup-engine-interface`（疊在 #59 → #46 上，PR 尚未開）
**範圍**：plan Task 16~25（ADR-304：engine 自己撈資料、任務層級兩段式），以及驗證中定案的 ADR-305~307。
**讀者**：後端、Chi。§2 的分工、§4 的 index 規則、§6 的待辦是給 Chi 的重點。

---

## 1. 摘要

- Chi 的 fast layer 已包成後端服務，現在是 **fast-v2**（任務層級、engine 自己撈候選）。後端只透過 `app/dedup_engine/contract.py` 跟它溝通。
- **全套件**：本機、Docker 容器內都是 **1612 passed、0 failed**。dedup 相關程式碼覆蓋率 **98%**。
- **實際打 API**：在全新的 Docker 環境上，**34 項情境全部通過**；engine 故障的三種情況（拋錯、逾時、偷寫 DB）也都通過。
- **發現並修正**：候選查詢**從 #46 起就沒用到空間 index**。2 萬筆資料時，密集地點送一筆要約 2 秒，剛好碰到逾時。
  修正後同一地點約 40 ms，算出來的距離不變，golden 也沒動（ADR-305）。
- **延遲**：dedup 讓使用者多等的時間，跟「半徑內候選數 × 送出的任務數」成正比。最差實測（2000 筆、5 個任務）p99 約 245 ms，離 2 秒逾時很遠。
  據此定了效能門檻，逾時維持 2 秒（ADR-307）。
- **待 Chi**：看合約夠不夠用、離線 harness 要怎麼接 DB、補 `CHANGELOG.md` 的回測欄位（§6）。

---

## 2. 分工：Chi 改什麼、後端改什麼（ADR-304、306）

| 東西 | 歸誰 | 說明 |
|---|---|---|
| `candidates.py`、`fast.py`、`text.py` | Chi | 撈哪些候選（只能讀 DB）、比對單位、訊號、分數、門檻、`evidence` 內容 |
| 演算法測試：`test_fast.py`、`test_fast_engine.py`、`test_text.py`、golden；`CHANGELOG.md` | Chi | 輸出改變就升 `version`、重產 golden（見 §7） |
| `contract.py` | 雙方 | 改欄位要雙方同意，並遞增 `CONTRACT_VERSION` |
| `registry.py` | 後端 | 決定線上用哪個 engine。Chi 可以新增 engine class，要不要上線、切到哪一個由後端改 |
| 守門測試：`test_contract.py`、`test_core_isolation.py`、`test_candidates.py` 的兩條 index 測試 | 後端擁有，Chi 可以改 | Chi 的改動讓它們紅了，可以在自己的 PR 裡調整，後端會 review 這部分 |
| model、migration、index | 後端 | Chi 改了查詢寫法、需要新的 index，跟後端說，或讓 index 測試紅了由後端補 |
| 效能門檻、逾時秒數 | 後端拍板，Chi 提意見 | 目前的數字見 §5 |

engine 不能做的事（`test_core_isolation.py` 會擋）：
- 寫 DB、commit。
- import `app.services`、`app.graphql`、`app.api`、`app.repositories`。

後端呼叫 engine 時有三道保護，所以就算 engine 出錯，也不會擋住使用者建單：
- 包在一個 SAVEPOINT 裡，結束後一律 rollback。
- 用 `asyncio.wait_for` 設 2 秒逾時。
- 用 `pg_current_xact_id_if_assigned()` 偵測 engine 有沒有偷寫 DB。

---

## 3. 驗證結果（Task 24）

### 3.1 全套件、覆蓋率、lint

| 環境 | passed | failed |
|---|---|---|
| 本機（h3 測試 DB、專用 redis） | 1612 | 0 |
| Docker 容器內（stack 自己的 db、redis） | 1612 | 0 |

ADR-305 修正前兩邊都是 1610，多出的 2 條是 §4 的 index 測試。

覆蓋率（`COVERAGE_CORE=sysmon`）：

| 模組 | 行數 | 未覆蓋 | 覆蓋率 |
|---|---|---|---|
| `app/dedup_engine/*`（6 個檔） | 258 | 2（`fast.py:178-179`） | 99% |
| `app/services/dedup.py` | 81 | 6（`166-171`） | 93% |
| `app/services/dedup_snapshot.py` | 22 | 0 | 100% |
| `app/services/dedup_submission.py` | 95 | 0 | 100% |
| **合計** | **456** | **8** | **98%** |

Lint（`ruff==0.11.0`）：本票改動的檔案沒有新增問題。
- migration `d4c8b1e07a92` 的 `I001` 在分支起點 `af2ca1d95` 就有，其他 4 個 migration 也有同樣問題。
- 9 個檔的 `ruff format` 問題在分支起點就有，本票沒有增加。

### 3.2 Docker 從零建立

隔離的 stack：image 用 `DOCKER_BUILDKIT=0 docker build` 建，DB 用 `disaster-postgres-h3:16-3.4`、全新 volume。

| 項目 | 結果 |
|---|---|
| `alembic upgrade head` → `downgrade -1` → `upgrade head` | 三步皆成功，停在 `d4c8b1e07a92 (head)` |
| downgrade 後 | 兩個 geography index 都不存在 |
| 再 upgrade 後 | `ix_base_geometries_geography ... gist (((geometry)::geography))`、`ix_base_geometries_centroid_geography ... gist (((st_centroid(geometry))::geography))` |
| `scripts/seed_rbac.py` | 成功 |

### 3.3 實際打 GraphQL（34 項）

每個情境用自己的地點（相隔 2 km），互不干擾。

**新開單（`createTicket` 帶 `tasks`）**

| 情境 | 結果 |
|---|---|
| 工單 A 有任務 a1；旁邊送工單 B，任務 [b0＝同 a1, b1＝無關] | `DuplicatesSuspected`，只有一筆：`draftRef="task:0"`、`relatedKind="ticket_task"`、指向 a1 與 A。**整張單都沒建**，只多一筆 `hint_shown`（`ticket_task`、`fast-v2`） |
| 同一份 input，b0 帶 `acknowledgedDuplicateOf=a1` | 建立工單和兩個任務；配對卡 `ticket_task／dup_ignored／fast-v2／similarity 1.0000`；audit `ignored_by_submitter` |
| 第一次 [PUMP, WATER] 在 `task:0` 被擋；第二次換成 [WATER, PUMP(確認)] | 照樣建立，配對卡在 PUMP（這時是 `task:1`）與原任務之間，確認跟著草稿走 |
| 第二次送出時拿掉疑似重複的那個草稿 | 只建工單和剩下的任務，無配對卡 |
| `tasks=[]`，旁邊有一模一樣的工單 | 直接建立，無 dedup 資料（engine 不比工單本身） |

**替既有的單加任務（`createTicketTask`）**

| 情境 | 結果 |
|---|---|
| 對工單 C 加一個跟 A 的 a1 相同的任務 | `DuplicatesSuspected`（`task:0` → a1），沒建任務 |
| 帶 `acknowledgedDuplicateOf=a1` 再送 | `TicketTaskCreated`＋配對卡 |
| 對工單 A 自己加同樣的任務 | 回傳結果裡沒有 A 自己的任務（同單排除） |
| 附近沒有別的單，只有同單的相同任務 | 直接建立 |

**候選條件（019 的規則）**

| 既有的那筆 | 同內容送出 |
|---|---|
| 任務 fulfilled／canceled／軟刪 | 不是候選，直接建立 |
| 工單 cancelled／軟刪 | 不是候選，直接建立 |
| 工單 completed、任務還開著 | **仍是候選**，`DuplicatesSuspected` |

**站點（`createStation`）**

| 情境 | 結果 |
|---|---|
| 同站點再登記 | `DuplicatesSuspected`（`draftRef="station"`、`relatedKind="station"`）；只多一筆 `hint_shown` |
| 帶確認再送 | `StationCreated`；配對卡 `station／dup_ignored／fast-v2` |
| 通知 | 兩段式建立的站點照樣發 `resource_station_updated` 給 gov 團隊成員 |

**權限、批次匯入、個資、並發**

| 情境 | 結果 |
|---|---|
| 無 `ticket.add` 的帳號送 `createTicket`／`createTicketTask` | `403: Permission Denied.`，回應裡沒有任何 `Suspect`，無資料變動 |
| 批次匯入（工單、站點各兩列幾乎相同） | 全部建立，不跑去重（ADR-299）；對照組：同地點互動式送出會被擋 |
| 所有配對卡與 audit 的 `evidence` | 不含送出的標題、任務名稱、描述原文（ADR-295） |
| 同地點 20 個請求同時建單（各帶任務） | 全部 HTTP 200、無錯誤、無 SQL 外洩；1 張建立、19 張 `DuplicatesSuspected` |

### 3.4 engine 出問題時

另起一台只換掉 engine 的伺服器。每條都先用真的 engine 確認「這筆會被擋」，再送到故障的 engine。

| 故障 | 結果 | 耗時 | log |
|---|---|---|---|
| `check` 拋錯 | 照常建立、不寫 dedup 資料 | 187 ms | `dedup check failed or timed out; creating without a hint (fail-open)` |
| `check` 睡 3 秒 | 2 秒逾時後照常建立 | 2176 ms | 同上＋`TimeoutError` |
| `check` 偷寫一筆資料 | 照常建立；那筆資料**不存在**（被 rollback） | 228 ms | `dedup engine fast-v2 wrote to the database during check; ignoring its answer` |

三條的 log 都沒有 `MissingGreenlet`。

---

## 4. 發現並修正：候選查詢用不到空間 index（ADR-305）

**問題**：
- `ix_base_geometries_geography` 建在 `(geometry::geography)` 上。
- 但 geoalchemy2 的 `cast(x, Geography)` 產生的是 `CAST(x AS geography(GEOMETRY,-1))`，Postgres 不認為兩者是同一個表達式。
- 結果是 index 永遠用不到，每次送出都掃整張 `base_geometries`。
- 站點用 centroid 量距離（`ST_Centroid(geometry)::geography`），本來就沒有對應的 index。

**證據**（`base_geometries` 上、關掉 seqscan 強迫找 index）：

```
CAST(geometry AS geography)                 → Index Scan using ix_base_geometries_geography
CAST(geometry AS geography(GEOMETRY,-1))    → Seq Scan (cost=10000000000...)   ← 沒有 index 可用
```

**影響**（同一份 2 萬筆資料，`ANALYZE` 後）：

| | 修正前 | 修正後 |
|---|---|---|
| 任務候選查詢，密集地點（半徑內 500 筆） | 2127 ms | 2.8 ms |
| 任務候選查詢，稀疏地點 | 55 ms（隨全表筆數成長） | 0.06 ms |
| `createTicket` 整個請求，密集地點 | **1988 ms**（逾時是 2 秒） | **39 ms** |
| `createTicket` 整個請求，稀疏地點 | 317 ms | 37 ms |

**為什麼之前沒抓到**：
- Phase 1 Task 14 的 EXPLAIN 用的是手寫 SQL，不是程式實際送出的 SQL，所以那次的「用到 index」是假的。
- 舊的效能測試全表只有 500 筆，seq scan 一樣快。

**修正**（後端已處理）：
- `app/dedup_engine/candidates.py:32-53` 的 cast 一律用 `_GEOGRAPHY = Geography(geometry_type=None)`，編譯成單純的 `geography`。
- 新增 `ix_base_geometries_centroid_geography`：`GIST ((ST_Centroid(geometry)::geography))`。
  加在 #46 的 migration `d4c8b1e07a92`，model（`app/models/geo.py:17-32`）同步宣告，downgrade 一併 drop。
- 測試（`tests/dedup_engine/test_candidates.py:196-228`）：抓下兩條候選查詢**實際送出的 SQL**，關掉 seqscan 後 EXPLAIN，斷言用到各自的 index。
  把 cast 改回 `Geography()` 時，兩條都會失敗。

**對 Chi 的影響**：
- 距離值不變，golden 沒動，不需要升版。
- 以後在 `candidates.py` 寫距離條件時，cast 請沿用 `_GEOGRAPHY`。
- 如果換了表達式，`test_candidates.py` 的兩條 index 測試會紅，這時跟後端說一聲，由後端補 index。

---

## 5. 延遲實測：dedup 讓使用者多等多久（ADR-307）

### 5.1 測法

- **對照組**：同一個容器另起一台伺服器，把 `dedup_service.check_submission` 直接換成回傳空清單。建單流程一樣，只是沒有 dedup（連 SAVEPOINT 都沒有）。
- **量的是**：`createTicket` 整個 HTTP 請求的耗時（client 與伺服器在同一個容器，不含網路）。有 dedup 的減掉對照組，就是多等的時間。
- **資料**：
  - 背景：台灣範圍內均勻分布的開著的工單，每張 1 個任務，先 2 萬筆、再加到 10 萬筆。
  - 叢集：四個地點，各在 ±60 m 內放 0／50／500／2000 筆開著的任務。每個地點半徑（162.1 m）內的實際數量另外查過。
  - 每次灌完都跑過有 commit 的 `ANALYZE`。
- **送出內容**：
  - 一般情境：1 或 5 個跟候選內容不相干的任務，所以不會被擋。
  - 照樣建立：送一個跟候選相同的任務，被擋後帶確認再送一次。
- **次數**：每組先暖機 3 次，再量 50 次（照樣建立量 20 次）。每次建出的單在計時之外改成 cancelled，讓候選數保持固定。

### 5.2 結論

| 半徑內候選數 | 帶 1 個任務，多等（p50／p95） | 帶 5 個任務，多等（p50／p95） |
|---|---|---|
| 0 | 0~3 ms／約 2 ms | 3~8 ms／5~9 ms |
| 50 | 6 ms／6~13 ms | 7 ms／7 ms |
| 500 | 17~19 ms／60~76 ms | 36~39 ms／41~94 ms |
| 2000 | 61~65 ms／128 ms | 142~148 ms／208 ms |

（每格是 2 萬筆與 10 萬筆兩輪的範圍）

- **全表大小不影響**：2 萬和 10 萬幾乎一樣，因為 ADR-305 之後只看半徑內的候選數。
- **成本 ∝ 半徑內候選數 × 任務數**：`fast.py:147` 的 `check` 只查一次候選（`fast.py:159`），但每個任務草稿都要跟全部候選各算一次分數（`fast.py:162`）。
  所以任務數的影響來自計分，帶 5 個任務大約是 1 個任務的 2 倍多。
- **照樣建立的使用者要送兩趟**：半徑內 500 筆時兩趟合計 p50 約 55~64 ms，2000 筆時約 170 ms。
- 用這組數字線性外推，大約要半徑 160 m 內有 2 萬筆以上開著的任務，才會碰到 2 秒。這只是推算，沒有實測過。

**因此定案（ADR-307）**：
- **contract test 效能項**（`test_contract.py::test_fast_enough`）：全表 20,000 筆、半徑內 500 筆、送出帶 5 個任務的新開單，`check` 三次取最快，要小於 **200 ms**。
  - 用修正前的 cast 跑是 670 ms，測試會失敗。
  - 舊版的效能項（全表只有 500 筆、1 個任務）抓不到 index 問題，所以改成這樣。
- **`ENGINE_TIMEOUT_S` 維持 2 秒**：正常情況碰不到，它是 engine 故障時使用者最多多等的時間。

### 5.3 原始數字（ms）

**全表約 2 萬筆（22,550 個任務）**

| 半徑內 | 任務數 | dedup p50／p95／p99 | 無 dedup p50／p95／p99 | 多等 p50／p95 |
|---|---|---|---|---|
| 0 | 1 | 12.9／15.9／18.5 | 12.8／29.9／34.1 | 0.1／−14.0 |
| 0 | 5 | 18.5／25.9／85.5 | 15.8／21.0／85.9 | 2.7／4.9 |
| 50 | 1 | 18.3／26.6／35.2 | 11.9／13.7／15.3 | 6.4／12.9 |
| 50 | 5 | 22.6／26.8／28.8 | 16.1／19.9／23.4 | 6.5／6.9 |
| 500 | 1 | 29.1／75.9／112.3 | 11.8／16.4／21.2 | 17.3／59.5 |
| 500 | 5 | 52.5／114.0／118.3 | 16.1／20.2／31.5 | 36.4／93.8 |
| 2000 | 1 | 72.2／142.7／153.2 | 11.5／14.3／17.1 | 60.7／128.4 |
| 2000 | 5 | 163.3／228.5／236.6 | 15.7／19.9／23.5 | 147.6／208.6 |

照樣建立（兩趟合計）p50／p95：50 筆 33.1／51.9、500 筆 55.6／117.8、2000 筆 174.7／216.2。

**全表約 10 萬筆（102,550 個任務）**

| 半徑內 | 任務數 | dedup p50／p95／p99 | 無 dedup p50／p95／p99 | 多等 p50／p95 |
|---|---|---|---|---|
| 0 | 1 | 14.7／26.4／46.4 | 11.5／24.5／38.7 | 3.2／1.9 |
| 0 | 5 | 23.7／28.9／40.6 | 15.6／19.8／23.2 | 8.1／9.1 |
| 51 | 1 | 17.4／19.4／21.8 | 11.5／13.4／28.4 | 5.9／6.0 |
| 51 | 5 | 25.0／30.7／58.7 | 17.5／23.0／27.4 | 7.5／7.7 |
| 500 | 1 | 31.2／90.8／111.7 | 11.8／15.2／28.7 | 19.4／75.6 |
| 500 | 5 | 55.3／60.4／119.0 | 16.0／19.2／21.8 | 39.3／41.2 |
| 2000 | 1 | 75.5／141.0／146.2 | 10.2／13.1／16.1 | 65.3／127.9 |
| 2000 | 5 | 154.8／222.8／245.6 | 12.7／15.2／42.5 | 142.1／207.6 |

照樣建立（兩趟合計）p50／p95：51 筆 37.7／41.5、500 筆 63.5／130.7、2000 筆 168.9／213.6。

### 5.4 解讀時要注意

- **DB 跑在模擬環境**：DB 的 image 是 amd64，在 arm64 的 Mac 上靠模擬執行；backend 是原生 arm64。DB 那一段比正式環境慢，數字偏悲觀。
- **每組 50 次**，p99 其實就是最大值，偶發的尖峰（例如 0 筆那組的 85 ms）會直接反映在 p99 上。p50 和 p95 比較可信。
- **只量單一使用者、依序送出**，沒有量多人同時送出時的排隊。§3.3 的 20 併發只驗了正確性，沒量延遲。
- 2000 筆以上沒有實測；「約 2 萬筆才會碰到 2 秒」是線性外推。

---

## 6. 需要 Chi 回覆或處理的（plan Task 0）

1. **合約**：`contract.py` 的 `TicketDraft`、`TaskDraft`、`StationDraft`、`Suspect`，以及 `check`（`contract.py:143`）、`score`（`contract.py:147`），夠不夠用？
2. **離線 harness**：engine 現在會自己查 DB，回測需要一個 DB（或自己的替身）。這樣可以嗎？
3. **`CHANGELOG.md`**：fast-v2 的回測欄位（資料集、門檻 0.80 下的 precision／recall、提示率）請補上。fast-v1 那格也還空著。
4. **效能門檻／逾時**：§5 的數字，有意見再提。

---

## 7. 自己跑測試

測試需要有 **h3 擴充**的 Postgres（`docker/postgres-h3/Dockerfile`，image `disaster-postgres-h3:16-3.4`）和一個 redis。
conftest 的預設是 `localhost:5432` 和 `redis://localhost:6379/15`，每個測試都會 `flushdb` 那個 redis 的 db，**請指向專用的 redis**，不要用別的專案的。

```bash
# 在 Backend/ 底下
export TEST_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:<port>/disaster_rescue_test"
export TEST_ADMIN_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:<port>/postgres"
export TEST_REDIS_URL="redis://localhost:<redis-port>/15"

uv run pytest tests/dedup_engine -q                          # engine 的全部測試（約 30 秒）
uv run pytest tests/test_graphql/test_create_dedup.py -q     # 用真 engine 打 GraphQL
DEDUP_REGEN_GOLDEN=1 uv run pytest tests/dedup_engine/test_golden.py   # 升版後重產 golden
```

- **golden 的規則**：輸出變了但 `version` 沒升，重產會被拒絕（ADR-297）。
- **GraphQL 測試預設用「永遠不擋」的 stub engine**，標了 `@pytest.mark.real_dedup` 的才用真 engine（`tests/test_graphql/conftest.py:164`）。

---

## 8. 附錄

### 8.1 Commit 清單（Phase 2 之後）

| Commit | Task | 內容 |
|---|---|---|
| `3030754cb`、`5e1bb3705`、`6c6594cce` | — | 任務層級設計（ADR-300~303）→ 改為 engine 自己撈資料（ADR-304） |
| `19fb9881e` | 16 | ADR-304 的 contract（草稿／`Suspect`／async engine） |
| `7e21f3a59` | 17 | fast-v2：任務層級、自己撈候選 |
| `f08b9644a` | 18 | contract test（真 DB，含唯讀驗證） |
| `a514ea426` | 19 | 後端呼叫 engine 的保護措施 |
| `e25c1e8cb` | 20 | `create_ticket_task` 拆 validate／insert／commit |
| `af360d7d0` | 21 | 兩段式編排：新開單、加任務、站點 |
| `daa807d88` | 22 | GraphQL：任務層級兩段式、通用 `DuplicatesSuspected`（**BREAKING**） |
| `4f53a3c89` | 23 | 移除 Phase 1 的快照合約 |
| `350027c0e`、`6359af3fc` | — | plan 進度、Task 24 步驟 |
| `8747320b2`、`dd138ffdf` | 24 | ADR-305：候選查詢用得到空間 index；文件同步 |
| `40d7298e3`、`3f6516c3d` | — | index 歸後端；`app/dedup_engine/` 裡歸後端的部分（ADR-306） |
| `e004c50b2`、`87dd4c934` | 25 | 效能門檻改用實際規模（ADR-307）；ADR-307 措辭更正 |

### 8.2 Phase 1（Task 1~14，2026-09-28）摘要

- 演算法搬進 `app/dedup_engine/`；分數與 019 完全相同（4 萬組隨機輸入差 0）；Python trigram 與 pg_trgm 一致（誤差 < 1e-6）。
- 本機 1531 passed、容器內 1531 passed、API 22 項全通過（當時以工單為單位，`fast-v1`）。
- **更正**：當時回報的「EXPLAIN 候選查詢用到 `ix_base_geometries_geography`」是假的（手寫 SQL，見 §4）。
