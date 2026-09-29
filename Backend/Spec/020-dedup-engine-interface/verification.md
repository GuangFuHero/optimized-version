# Spec 020 dedup engine 介面：驗證與速度報告

**日期**：2026-09-29
**branch**：`feat/dedup-engine-interface`（base 在 #59 → #46 上，PR 尚未開）
**範圍**：plan Task 16~25（ADR-304：engine 自己去 DB 撈資料、以任務為單位比對），以及驗證過程中定下的 ADR-305~307。
**讀者**：後端、Chi。給 Chi 的重點在 §2（誰負責什麼）、§4（index 問題）、§6（需要 Chi 回覆的事）。

**本文用到的幾個詞**
- **candidates**：新送出一張單或一個站點時，engine 會去 DB 撈「附近、還開著的任務或站點」來跟它比對，這些就是 candidates。
- **先檢查再建立**：送出時先跑 dedup。有疑似重複就先不建立，回傳 `DuplicatesSuspected` 讓使用者看；使用者確認後帶 `acknowledgedDuplicateOf` 再送一次，才真的建立。
- **`duplicate_pairs`**：使用者看到提示後仍選擇建立時，後端記一筆「這兩筆疑似重複」的紀錄。
- **golden test**：用一組固定的測試資料跑 engine，把結果（誰被判重複、分數多少）存成 `tests/dedup_engine/golden/fast.json`。之後每次跑測試都拿現在的結果跟它比，不一樣就失敗。故意改了演算法時，把 engine 的 `version` 加 1（例如 `fast-v2` → `fast-v3`）、寫進 CHANGELOG，再重新產生這個檔案。這樣分數就不會在沒人知道的情況下悄悄改變。

---

## 1. 摘要

- Chi 的 dedup 快層已包成後端服務，目前版本是 **fast-v2**（以任務為單位比對、engine 自己撈 candidates）。後端只透過 `app/dedup_engine/contract.py` 跟它溝通。
- **全部測試**：本機、Docker 容器內都是 **1612 passed、0 failed**。dedup 相關程式碼的 test coverage **98%**。
- **實際呼叫 API**：在全新的 Docker 環境上，**34 個情境全部通過**。engine 出問題的三種情況（丟出錯誤、太慢、偷寫 DB）也都通過。
- **發現並修好一個問題**：撈 candidates 的查詢**從 #46 開始就沒用到空間 index**。DB 有 2 萬筆時，在資料密集的地點送一張單要約 2 秒，剛好碰到 timeout。
  修好後同一地點約 40 ms，算出來的距離不變，golden test 的結果也沒變（ADR-305）。
- **速度**：dedup 讓使用者多等的時間，跟「附近的 candidates 數量 × 送出的任務數」成正比。實測最慢的情況（附近 2000 筆、5 個任務），最慢的 1%（p99）約 245 ms，離 2 秒的 timeout 很遠。
  依此定了速度標準，timeout 維持 2 秒（ADR-307）。
- **等 Chi 回覆**：`contract.py` 夠不夠用、離線調參數的工具要怎麼接 DB、補 `CHANGELOG.md` 的驗證數字（§6）。

---

## 2. 誰負責什麼（ADR-304、306）

| 東西 | 誰負責 | 說明 |
|---|---|---|
| `candidates.py`、`fast.py`、`text.py` | Chi | 撈哪些 candidates（只能讀 DB）、比對的對象是工單還是任務、用哪些 signals、分數怎麼算、threshold、`evidence` 放什麼 |
| 演算法的測試：`test_fast.py`、`test_fast_engine.py`、`test_text.py`、golden test；`CHANGELOG.md` | Chi | 結果改變就把 `version` 加 1、重新產生 golden 檔（見 §7） |
| `contract.py`（engine 收什麼、回什麼） | 兩邊一起 | 改欄位要兩邊都同意，並把 `CONTRACT_VERSION` 加 1 |
| `registry.py` | 後端 | 決定線上實際用哪一版 engine。Chi 可以寫新的 engine class，要不要上線、切到哪一版由後端改 |
| 後端寫的檢查測試：`test_contract.py`、`test_core_isolation.py`、`test_candidates.py` 裡檢查 index 的兩條 | 後端，Chi 可以改 | Chi 的改動讓它們失敗的話，可以在自己的 PR 裡一起調整，後端會 review 這部分 |
| model、migration、index | 後端 | Chi 改了查詢寫法、需要新的 index，跟後端說；或者檢查 index 的測試失敗了，由後端補 |
| 速度標準、timeout 秒數 | 後端決定，Chi 可以提意見 | 目前的數字見 §5 |

engine 不能做的事（`test_core_isolation.py` 會擋下來）：
- 寫 DB、commit。
- import `app.services`、`app.graphql`、`app.api`、`app.repositories`。

後端呼叫 engine 時有三道保護。就算 engine 出錯，也不會擋住使用者建單：
- 包在一個 SAVEPOINT 裡，跑完一律 rollback，engine 寫進去的東西都會被撤銷。
- 用 `asyncio.wait_for` 設 2 秒 timeout，超過就當作沒有重複、照常建立。
- 用 `pg_current_xact_id_if_assigned()` 檢查 engine 有沒有偷寫 DB，有的話就不採用它的結果。

---

## 3. 驗證結果（Task 24）

### 3.1 全部測試、test coverage、lint

| 環境 | passed | failed |
|---|---|---|
| 本機（有 h3 的測試 DB、專用 redis） | 1612 | 0 |
| Docker 容器內（stack 自己的 db、redis） | 1612 | 0 |

ADR-305 修好之前兩邊都是 1610，多出的 2 條是 §4 檢查 index 的測試。

test coverage（`COVERAGE_CORE=sysmon`）：

| 模組 | 行數 | 沒跑到的行 | coverage |
|---|---|---|---|
| `app/dedup_engine/*`（6 個檔） | 258 | 2（`fast.py:178-179`） | 99% |
| `app/services/dedup.py` | 81 | 6（`166-171`） | 93% |
| `app/services/dedup_snapshot.py` | 22 | 0 | 100% |
| `app/services/dedup_submission.py` | 95 | 0 | 100% |
| **合計** | **456** | **8** | **98%** |

lint（`ruff==0.11.0`）：這次改到的檔案沒有新增問題。
- migration `d4c8b1e07a92` 的 `I001`（import 排序）在 branch 的起點 `af2ca1d95` 就有，另外 4 個 migration 也有同樣問題。
- 9 個檔的 `ruff format` 問題在 branch 起點就有，這次沒有增加。

### 3.2 Docker 從零建起來

獨立的 stack：image 用 `DOCKER_BUILDKIT=0 docker build` 建，DB 用 `disaster-postgres-h3:16-3.4`，全新的 volume。

| 項目 | 結果 |
|---|---|
| `alembic upgrade head` → `downgrade -1` → `upgrade head` | 三步都成功，停在 `d4c8b1e07a92 (head)` |
| downgrade 之後 | 兩個 geography index 都不存在 |
| 再 upgrade 之後 | `ix_base_geometries_geography ... gist (((geometry)::geography))`、`ix_base_geometries_centroid_geography ... gist (((st_centroid(geometry))::geography))` |
| `scripts/seed_rbac.py` | 成功 |

### 3.3 實際呼叫 GraphQL（34 個情境）

每個情境用自己的地點（彼此相隔 2 km），互不干擾。

**新開單（`createTicket` 帶 `tasks`）**

| 情境 | 結果 |
|---|---|
| 工單 A 有任務 a1；在旁邊送工單 B，帶兩個任務：b0（跟 a1 一樣）、b1（不相干） | 回 `DuplicatesSuspected`，只有一筆：`draftRef="task:0"`、`relatedKind="ticket_task"`、指向 a1 和 A。**整張單都沒有建立**，只多一筆 `hint_shown`（`ticket_task`、`fast-v2`） |
| 同一份 input，b0 帶 `acknowledgedDuplicateOf=a1` 再送 | 建立工單和兩個任務；`duplicate_pairs` 多一筆：`ticket_task／dup_ignored／fast-v2／similarity 1.0000`；audit log 多一筆 `ignored_by_submitter` |
| 第一次送 [PUMP, WATER]，在 `task:0` 被擋；第二次換成 [WATER, PUMP（帶確認）] | 照樣建立，`duplicate_pairs` 記在 PUMP（這時是 `task:1`）和原任務之間。確認是跟著那個任務走的，順序變了也沒關係 |
| 第二次送出時，把疑似重複的那個任務拿掉 | 只建立工單和剩下的任務，沒有 `duplicate_pairs` |
| `tasks=[]`，旁邊有一張一模一樣的工單 | 直接建立，沒有任何 dedup 紀錄（engine 不比工單本身，只比任務） |

**替已經存在的單加任務（`createTicketTask`）**

| 情境 | 結果 |
|---|---|
| 對工單 C 加一個跟 A 的 a1 一樣的任務 | 回 `DuplicatesSuspected`（`task:0` → a1），任務沒有建立 |
| 帶 `acknowledgedDuplicateOf=a1` 再送 | 回 `TicketTaskCreated`，並記一筆 `duplicate_pairs` |
| 對工單 A 自己加一個一樣的任務 | 回傳結果裡不會有 A 自己的任務（同一張單的任務不算重複） |
| 附近沒有別的單，只有同一張單裡有一樣的任務 | 直接建立 |

**哪些資料會被當成 candidates（019 定的規則）**

| 已存在的那筆 | 送出一樣的內容 |
|---|---|
| 任務已 fulfilled／canceled，或已 soft delete | 不是 candidate，直接建立 |
| 工單已 cancelled，或已 soft delete | 不是 candidate，直接建立 |
| 工單 completed，但任務還開著 | **仍是 candidate**，回 `DuplicatesSuspected` |

**站點（`createStation`）**

| 情境 | 結果 |
|---|---|
| 同一個站點再登記一次 | 回 `DuplicatesSuspected`（`draftRef="station"`、`relatedKind="station"`）；只多一筆 `hint_shown` |
| 帶確認再送 | 回 `StationCreated`；`duplicate_pairs` 多一筆 `station／dup_ignored／fast-v2` |
| 通知 | 經過「先檢查再建立」建出來的站點，照樣發 `resource_station_updated` 給 gov 團隊成員 |

**權限、批次匯入、個資、同時送出**

| 情境 | 結果 |
|---|---|
| 沒有 `ticket.add` 權限的帳號送 `createTicket`／`createTicketTask` | `403: Permission Denied.`，回應裡看不到任何疑似重複的資訊，DB 沒變動 |
| 批次匯入（工單、站點各兩列幾乎一樣） | 全部建立，批次匯入不跑 dedup（ADR-299）。另外確認過：在同一個地點用 API 送一樣的內容會被擋 |
| 所有 `duplicate_pairs` 與 audit log 的 `evidence` | 沒有存送出的標題、任務名稱、描述原文（ADR-295） |
| 同一個地點 20 個 request 同時建單（各帶任務） | 全部 HTTP 200、沒有錯誤、沒有洩漏 SQL；1 張建立、19 張回 `DuplicatesSuspected` |

### 3.4 engine 出問題時

另外起一台只換掉 engine 的伺服器。每個情境都先用正常的 engine 確認「這筆會被擋」，再送到有問題的 engine。

| 問題 | 結果 | 花費時間 | log |
|---|---|---|---|
| `check` 丟出錯誤 | 照常建立、沒有寫 dedup 紀錄 | 187 ms | `dedup check failed or timed out; creating without a hint (fail-open)` |
| `check` 睡 3 秒 | 等到 2 秒 timeout 後照常建立 | 2176 ms | 同上，另有 `TimeoutError` |
| `check` 偷寫一筆資料 | 照常建立；那筆資料**不存在**（被 rollback 掉了） | 228 ms | `dedup engine fast-v2 wrote to the database during check; ignoring its answer` |

三種情況的 log 都沒有 `MissingGreenlet`。

---

## 4. 發現並修好：撈 candidates 的查詢沒用到空間 index（ADR-305）

**問題**：
- `ix_base_geometries_geography` 這個 index 建在 `(geometry::geography)` 上。
- 但 geoalchemy2 的 `cast(x, Geography)` 產生的 SQL 是 `CAST(x AS geography(GEOMETRY,-1))`，跟建 index 時的寫法不一樣，Postgres 就不會用那個 index。
- 結果每次送出都要掃過整張 `base_geometries`。
- 站點是用中心點（centroid）算距離（`ST_Centroid(geometry)::geography`），本來就沒有對應的 index。

**證據**（在 `base_geometries` 上，把 seq scan 關掉，逼 Postgres 找 index 用）：

```
CAST(geometry AS geography)                 → Index Scan using ix_base_geometries_geography
CAST(geometry AS geography(GEOMETRY,-1))    → Seq Scan (cost=10000000000...)   ← 找不到能用的 index
```

**影響**（同一份 2 萬筆的資料，跑過 `ANALYZE` 之後）：

| | 修之前 | 修之後 |
|---|---|---|
| 撈任務 candidates 的查詢，資料密集的地點（附近 500 筆） | 2127 ms | 2.8 ms |
| 撈任務 candidates 的查詢，資料稀疏的地點 | 55 ms（整張表越大越慢） | 0.06 ms |
| `createTicket` 整個 request，資料密集的地點 | **1988 ms**（timeout 是 2 秒） | **39 ms** |
| `createTicket` 整個 request，資料稀疏的地點 | 317 ms | 37 ms |

**為什麼之前沒發現**：
- Phase 1 Task 14 檢查 index 時，用的是手寫的 SQL，不是程式實際送出的 SQL，所以那次「有用到 index」的結論是錯的。
- 舊的速度測試整張表只有 500 筆，沒用 index 也一樣快。

**怎麼修的**（後端已處理）：
- `app/dedup_engine/candidates.py:32-53` 的 cast 一律用 `_GEOGRAPHY = Geography(geometry_type=None)`，產生的 SQL 是單純的 `geography`，跟 index 對得上。
- 新增 `ix_base_geometries_centroid_geography`：`GIST ((ST_Centroid(geometry)::geography))`。
  加在 #46 的 migration `d4c8b1e07a92`，model（`app/models/geo.py:17-32`）也同步宣告，downgrade 時一起刪掉。
- 測試（`tests/dedup_engine/test_candidates.py:196-228`）：抓下兩個查詢**實際送出的 SQL**，關掉 seq scan 後跑 EXPLAIN，確認各自用到對應的 index。
  把 cast 改回 `Geography()` 的話，這兩條測試都會失敗。

**對 Chi 的影響**：
- 距離的數值不變，golden test 的結果沒變，不需要升 `version`。
- 以後在 `candidates.py` 寫距離條件時，cast 請用檔案裡的 `_GEOGRAPHY`。
- 如果改成別的寫法，`test_candidates.py` 那兩條 index 測試會失敗，這時跟後端說，由後端補 index。

---

## 5. 速度實測：dedup 讓使用者多等多久（ADR-307）

### 5.1 怎麼測的

- **對照組**：在同一個容器裡另起一台伺服器，把 `dedup_service.check_submission` 換成直接回傳空清單。建單流程完全一樣，只是不跑 dedup（連 SAVEPOINT 都沒有）。
- **量什麼**：`createTicket` 整個 HTTP request 花的時間（client 和伺服器在同一個容器，不含網路）。有 dedup 的減掉對照組，就是 dedup 讓使用者多等的時間。
- **資料**：
  - 背景資料：在台灣範圍內隨機分布的、還開著的工單，每張 1 個任務。先 2 萬筆，再加到 10 萬筆。
  - 密集地點：選四個地點，各在 ±60 m 內放 0、50、500、2000 筆還開著的任務。每個地點半徑（162.1 m）內實際有幾筆，另外查過。
  - 每次灌完資料都跑過 `ANALYZE`（有 commit）。
- **送出的內容**：
  - 一般情況：1 個或 5 個跟附近資料不相干的任務，所以不會被擋。
  - 看到提示後仍選擇建立：送一個跟附近資料一樣的任務，被擋之後帶確認再送一次。
- **次數**：每組先跑 3 次 warm-up（不計），再量 50 次（看到提示後仍建立的情境量 20 次）。每次建出來的單，都在計時之外改成 cancelled，讓附近的 candidates 數量保持不變。

### 5.2 結論

| 附近的 candidates | 帶 1 個任務，多等（p50／p95） | 帶 5 個任務，多等（p50／p95） |
|---|---|---|
| 0 | 0~3 ms／約 2 ms | 3~8 ms／5~9 ms |
| 50 | 6 ms／6~13 ms | 7 ms／7 ms |
| 500 | 17~19 ms／60~76 ms | 36~39 ms／41~94 ms |
| 2000 | 61~65 ms／128 ms | 142~148 ms／208 ms |

（p50 是一半的 request 比這快；p95 是 95% 的 request 比這快。每格是 2 萬筆和 10 萬筆兩輪的範圍。）

- **整張表多大沒有影響**：2 萬和 10 萬幾乎一樣。ADR-305 修好之後，只跟附近有幾筆有關。
- **多等的時間 ∝ 附近的 candidates 數量 × 任務數**：`fast.py:147` 的 `check` 只撈一次 candidates（`fast.py:159`），但每個任務都要跟每一筆 candidate 算一次分數（`fast.py:162`）。
  所以任務越多越慢，是因為要算的分數變多，帶 5 個任務大約是 1 個任務的 2 倍多。
- **看到提示後仍選擇建立的使用者要送兩次**：附近 500 筆時，兩次加起來 p50 約 55~64 ms；2000 筆時約 170 ms。
- 用這組數字直線推算，大約要半徑 160 m 內有 2 萬筆以上還開著的任務，才會碰到 2 秒。這只是推算，沒有實際測過。

**因此決定（ADR-307）**：
- **速度標準**（`test_contract.py::test_fast_enough`）：整張表 20,000 筆、附近 500 筆，送一張帶 5 個任務的新單，`check` 跑三次取最快的一次，要在 **200 ms** 內。
  - 用修好之前的 cast 跑是 670 ms，測試會失敗。
  - 舊的速度測試（整張表只有 500 筆、1 個任務）抓不到 index 的問題，所以改成這樣。
- **timeout 維持 2 秒**：正常情況碰不到，它只是 engine 出問題時，使用者最多會多等的時間。

### 5.3 原始數字（ms）

**整張表約 2 萬筆（22,550 個任務）**

| 附近 | 任務數 | 有 dedup p50／p95／p99 | 沒 dedup p50／p95／p99 | 多等 p50／p95 |
|---|---|---|---|---|
| 0 | 1 | 12.9／15.9／18.5 | 12.8／29.9／34.1 | 0.1／−14.0 |
| 0 | 5 | 18.5／25.9／85.5 | 15.8／21.0／85.9 | 2.7／4.9 |
| 50 | 1 | 18.3／26.6／35.2 | 11.9／13.7／15.3 | 6.4／12.9 |
| 50 | 5 | 22.6／26.8／28.8 | 16.1／19.9／23.4 | 6.5／6.9 |
| 500 | 1 | 29.1／75.9／112.3 | 11.8／16.4／21.2 | 17.3／59.5 |
| 500 | 5 | 52.5／114.0／118.3 | 16.1／20.2／31.5 | 36.4／93.8 |
| 2000 | 1 | 72.2／142.7／153.2 | 11.5／14.3／17.1 | 60.7／128.4 |
| 2000 | 5 | 163.3／228.5／236.6 | 15.7／19.9／23.5 | 147.6／208.6 |

看到提示後仍建立（兩次加起來）p50／p95：50 筆 33.1／51.9、500 筆 55.6／117.8、2000 筆 174.7／216.2。

**整張表約 10 萬筆（102,550 個任務）**

| 附近 | 任務數 | 有 dedup p50／p95／p99 | 沒 dedup p50／p95／p99 | 多等 p50／p95 |
|---|---|---|---|---|
| 0 | 1 | 14.7／26.4／46.4 | 11.5／24.5／38.7 | 3.2／1.9 |
| 0 | 5 | 23.7／28.9／40.6 | 15.6／19.8／23.2 | 8.1／9.1 |
| 51 | 1 | 17.4／19.4／21.8 | 11.5／13.4／28.4 | 5.9／6.0 |
| 51 | 5 | 25.0／30.7／58.7 | 17.5／23.0／27.4 | 7.5／7.7 |
| 500 | 1 | 31.2／90.8／111.7 | 11.8／15.2／28.7 | 19.4／75.6 |
| 500 | 5 | 55.3／60.4／119.0 | 16.0／19.2／21.8 | 39.3／41.2 |
| 2000 | 1 | 75.5／141.0／146.2 | 10.2／13.1／16.1 | 65.3／127.9 |
| 2000 | 5 | 154.8／222.8／245.6 | 12.7／15.2／42.5 | 142.1／207.6 |

看到提示後仍建立（兩次加起來）p50／p95：51 筆 37.7／41.5、500 筆 63.5／130.7、2000 筆 168.9／213.6。

### 5.4 看數字時要注意

- **DB 是在模擬環境裡跑的**：DB 的 image 是 amd64，在 arm64 的 Mac 上要靠模擬執行；backend 是原生 arm64。所以 DB 那段比正式環境慢，數字偏保守（實際應該更快）。
- **每組只量 50 次**，p99 其實就等於最大值。偶爾一次特別慢（例如 0 筆那組的 85 ms）會直接反映在 p99 上，所以 p50 和 p95 比較可信。
- **只量了一個人依序送出**，沒有量很多人同時送出時要排隊多久。§3.3 的 20 個同時送出只確認了結果正確，沒有量時間。
- 2000 筆以上沒有實際測過，「約 2 萬筆才會碰到 2 秒」是推算的。

---

## 6. 需要 Chi 回覆或處理的（plan Task 0）

1. **`contract.py`**：`TicketDraft`、`TaskDraft`、`StationDraft`、`Suspect` 這幾個型別，以及 `check`（`contract.py:143`）、`score`（`contract.py:147`）兩個 method，夠不夠用？
2. **離線調參數的工具**：以前 engine 只要餵「新送出的單＋一串附近的資料」就能算分數，不需要 DB。現在 engine 會自己去 DB 撈，所以要跑完整的 engine，得準備一個有同樣資料表的 Postgres（含 PostGIS），把那批標好的資料灌進去。
   如果只想調分數公式，也可以直接呼叫 `fast.py` 裡算分數的部分（`Signals`、`combine`），不用 DB，但這樣就測不到「撈哪些資料」那一段。這對調參數的流程有影響嗎？打算用哪種方式？
3. **`CHANGELOG.md`**：每一版都要記「用哪批資料驗證、準確度多少」。fast-v2 這格（資料集、threshold 0.80 時的 precision／recall、跳出提示的比例）請補上，fast-v1 那格也還空著。
4. **速度標準／timeout**：§5 的數字，有意見再提。

---

## 7. 自己跑測試

測試需要有 **h3 擴充**的 Postgres（`docker/postgres-h3/Dockerfile`，image `disaster-postgres-h3:16-3.4`）和一個 redis。
測試的預設設定是 `localhost:5432` 和 `redis://localhost:6379/15`，而且每條測試都會清空（`flushdb`）那個 redis db，**請指向一個專門給測試用的 redis**，不要用到別的專案的。

```bash
# 在 Backend/ 底下
export TEST_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:<port>/disaster_rescue_test"
export TEST_ADMIN_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:<port>/postgres"
export TEST_REDIS_URL="redis://localhost:<redis-port>/15"

uv run pytest tests/dedup_engine -q                          # engine 的全部測試（約 30 秒）
uv run pytest tests/test_graphql/test_create_dedup.py -q     # 用真的 engine 呼叫 GraphQL
DEDUP_REGEN_GOLDEN=1 uv run pytest tests/dedup_engine/test_golden.py   # 升 version 之後重新產生 golden 檔
```

- **golden 檔的規則**：結果變了但 `version` 沒升，重新產生會被拒絕（ADR-297）。
- **GraphQL 的測試預設用一個「永遠說沒有重複」的假 engine**，加了 `@pytest.mark.real_dedup` 的測試才用真的 engine（`tests/test_graphql/conftest.py:164`）。

---

## 8. 附錄

### 8.1 Commit 清單（Phase 2 之後）

| Commit | Task | 內容 |
|---|---|---|
| `3030754cb`、`5e1bb3705`、`6c6594cce` | — | 以任務為單位的設計（ADR-300~303）→ 改成 engine 自己撈資料（ADR-304） |
| `19fb9881e` | 16 | ADR-304 的 contract（draft、`Suspect`、async engine） |
| `7e21f3a59` | 17 | fast-v2：以任務為單位、自己撈 candidates |
| `f08b9644a` | 18 | contract 的測試（真的 DB，含「engine 不能寫 DB」的檢查） |
| `a514ea426` | 19 | 後端呼叫 engine 時的三道保護 |
| `e25c1e8cb` | 20 | `create_ticket_task` 拆成驗證、寫入、commit 三步 |
| `af360d7d0` | 21 | 先檢查再建立：新開單、加任務、站點 |
| `daa807d88` | 22 | GraphQL：以任務為單位的先檢查再建立、共用的 `DuplicatesSuspected`（**BREAKING**） |
| `4f53a3c89` | 23 | 移除 Phase 1 的 snapshot 型別 |
| `350027c0e`、`6359af3fc` | — | plan 進度、Task 24 步驟 |
| `8747320b2`、`dd138ffdf` | 24 | ADR-305：撈 candidates 的查詢用得到空間 index；文件同步 |
| `40d7298e3`、`3f6516c3d` | — | index 歸後端；`app/dedup_engine/` 裡哪些歸後端（ADR-306） |
| `e004c50b2`、`87dd4c934` | 25 | 速度標準改用實際規模（ADR-307）；ADR-307 措辭更正 |

### 8.2 Phase 1（Task 1~14，2026-09-28）摘要

- 演算法搬進 `app/dedup_engine/`。分數跟 019 完全一樣（4 萬組隨機輸入，差距 0）；Python 算的文字相似度跟 Postgres 的 pg_trgm 一致（誤差 < 1e-6）。
- 本機 1531 passed、容器內 1531 passed、API 22 個情境全通過（當時以工單為單位，`fast-v1`）。
- **更正**：當時回報的「撈 candidates 的查詢有用到 `ix_base_geometries_geography`」是錯的（用的是手寫 SQL，見 §4）。
