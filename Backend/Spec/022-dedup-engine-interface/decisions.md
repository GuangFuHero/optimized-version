# 去重引擎介面 — ADR 全集（ADR-295~299、301~307、313~323、396~397、433~436）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號接續 `Spec/008-rbac-authorization/decisions.md`（ADR-285 為 2026-09-28 全 repo 各分支掃描的最大值）。

**改號（2026-10-13，PR #73 審查）**：本檔原本用 ADR-286~307。其中 ADR-300 已被 main 的 `Spec/008`（#57）使用，
ADR-286~294 也與其他尚未合併的 PR（#63 的 `Spec/008`、`Spec/019-role-requests`、`Spec/020-volunteer-claim`）撞號，
因此這 10 條改到全 repo 各分支都還沒用過的號碼。內容不變，條目維持原本的先後順序：

| 原號 | 286 | 287 | 288 | 289 | 290 | 291 | 292 | 293 | 294 | 300 |
|---|---|---|---|---|---|---|---|---|---|---|
| 新號 | 314 | 315 | 316 | 317 | 318 | 319 | 320 | 321 | 322 | 323 |

2026-10-13 之前的 commit 訊息引用的是原號。

**Spec 改號（2026-10-14）**：這份 Spec 原本是 `Spec/020-dedup-engine-interface/`，Chi 的快層是 `Spec/019-dedup-fast-layer/`。
019、020 跟 Dennis 的 `Spec/019-role-requests`、`Spec/020-volunteer-claim`（#61 等五個分支）撞號，改成 **021**（快層）與 **022**（本 Spec）。
2026-10-14 之前的 commit 訊息與 PR 說明寫的是 019／020。

**背景**：Spec 021（PR #46 / #59，作者 Chi）交付了去重快層。本功能由後端接手包裝，
而演算法會由 Chi 持續迭代。以下每條決策都在回答同一個問題：**演算法改了，後端要不要跟著改？**

---

### ADR-314 去重是內部能力，不開獨立 GraphQL API

**白話**：拿掉 `ticketDedupCandidates`、`stationDedupCandidates`、`recordDedupHintOutcome`。
去重由需要它的業務流程（建單、登記據點、之後的慢層）在內部呼叫。

**Context**：Spec 021 把去重開成兩支 query 加一支 mutation，前端在 `createTicket` 前先查、
事後再回報結果。這讓演算法內部的東西成了對外合約：

- `DedupScoreComponent{name, score, weight, passed}` 直接出現在 SDL；前端 #47 有 select，
  實際只用到 `relatedTicketUuid`。
- 權限閘是 `ticket.add`，所有登入角色都有，任何人都能拿任意座標與文字探查附近未結案工單。
- 每多一種實體就多一支 query；#59 為站點加的 `entityKind` 參數讓 `*TicketUuid` 欄位裝站點 uuid。
- 「照樣建立」要前端先 `createTicket` 再 `recordDedupHintOutcome`，兩步不是 atomic，
  第二步失敗紀錄就遺失；後端還得額外驗「只有建單者能回報」並在伺服器端重算分數。

**Decision**：`app/graphql/dedup/` 整個移除。提示改由 `createTicket` / `createStation`
的回傳帶出（ADR-296）。

➕ 演算法的輸出形狀不再是 API 合約，Chi 改結構不會破壞前端。
➕ 對外面縮小：沒有可以任意探查的端點。
➕ 記錄與建單在同一個 transaction。
➖ `createTicket` / `createStation` 的回傳型別要改（見 ADR-296）。

**否決「保留 query、只縮小回傳欄位」**：解決了演算法外洩，但 atomic 與探查兩個問題還在。

---

### ADR-315 分成 algorithm core / repository / service / model 四層，core 不做 I/O

> **被 ADR-304 取代（2026-09-29）**：候選查詢改歸 engine，engine 可唯讀查 DB。

**白話**：Chi 的程式碼放在 `app/dedup_engine/`，不能 import SQLAlchemy、FastAPI、strawberry，
不能碰 DB 或網路。

**Context**：Spec 021 的演算法散在三處：`services/dedup_scoring.py`（公式）、
`repositories/dedup_repository.py`（在 SQL 裡算文字相似度、換算 `age_min`）、
`services/dedup.py`（由公式反推檢索半徑、截斷文字、#59 的 `_Kind.parameters`）。
Chi 要加一個訊號，三個檔案都可能要動。

**Decision**：

| 層 | 擁有者 | 職責 |
|---|---|---|
| algorithm core `app/dedup_engine/` | Chi | 訊號、分數、門檻、各種類參數、檢索範圍、`evidence` 內容 |
| snapshot builder | 後端 | ORM row / 建單 input → 快照（ADR-317） |
| repository | 後端 | 依 core 給的檢索範圍撈「未結案」候選，回傳快照＋關係事實 |
| service | 後端 | 組快照、呼叫 engine、fail-open、寫配對卡與 audit |
| model | 後端 | `duplicate_pairs`、`dedup_audit_events` |

**判斷規則**：Chi 迭代時可能會改的 → core；不管演算法怎麼改都成立的事實 → 後端。

➕ 演算法迭代只動 core 一個目錄。
➕ core 是純函式，可以單獨測試、在離線 harness 直接跑。
➖ 需要預先計算並儲存的東西（向量）、或需要外部服務的訊號，放不進這個模型（見 spec「接縫之外」）。

---

### ADR-316 文字相似度移到 core，用 Python 計算，不用 pg_trgm

> **被 ADR-304 取代（2026-09-29）**：文字比對方法完全歸 engine。

**白話**：repository 只給原始文字，相似度怎麼算由 Chi 決定。

**Context**：Spec 021 在 SQL 裡算 `similarity(concat_ws(' ', title, description), query)`。
pg_trgm 天生是 DB 函式，寫起來自然落在 repository，等於 repository 在做演算法的工作。
依 ADR-315 的規則，比對方法、比哪些欄位、要不要截斷都會隨迭代改變，屬於 core。

**Decision**：core 用 Python 計算文字相似度。

➕ Chi 可以換方法、改欄位、做正規化，並與離線 harness 共用同一份程式碼
（`dedup_scoring.py` docstring 已說明「formula matches the offline tuning harness」）。
◾ 效能不是問題：候選只用半徑篩（現行約 160 m），文字不參與 SQL 篩選，不需要 DB 索引加速。
➖ Python 實作與 pg_trgm 的分數會有細微差異，**現行門檻 0.80 要用新實作重跑回測**。

**例外**：若日後要「先用文字在 DB 端篩」（擴大半徑、跨區比對），那是檢索策略改變，
由 core 在 `RetrievalSpec` 宣告需求、repository 實作。

---

### ADR-317 送事實不送特徵：型別化的白名單快照，送出與候選同型

> **被 ADR-304 取代（2026-09-29）**：後端只送驗證過的草稿，候選由 engine 自己查。「白名單、只加不改」的原則保留給草稿型別。

**白話**：後端送整份實體的欄位原值，不送算好的分數；送出中那筆和候選是同一種型別。

**Context**：Spec 021 的 `DedupCandidate(distance_m, age_min, task_type, text_similarity)`
已經是特徵。Chi 想用 `priority` 或 `disaster_types` 就得改後端。

**Decision**：

1. 每種實體一個 frozen dataclass（`TicketSnapshot`、`StationSnapshot`），包含所有描述事件本身的欄位，
   不只是演算法「現在」用到的。個資與內部管理欄位不進快照（清單見 spec）。
2. 送出中那筆與候選同型；送出中那筆 `uuid=None`、`status=None`、`created_at` = 請求時間。
3. 兩筆之間的關係事實（距離、是否同一支電話）放在 `Candidate` 上，不放進快照。
4. **只加不改**：新增欄位一律給預設值；改名、刪欄位、改語意要遞增 `SNAPSHOT_SCHEMA_VERSION` 並雙方同意。
5. 快照型別同時是 Chi 離線 harness 的輸入格式。

➕ 用現有資料做的任何演算法改動都不需要後端。
➕ 線上與離線輸入一致：harness 上驗過的版本，上線時看到的輸入完全一樣。
➕ 事後重算分數直接重用同一個 builder。
➖ 快照比演算法實際用到的欄位多，builder 要維護欄位對映。

**否決 `dict`**：彈性較大，但欄位不是明確合約、沒有型別檢查；新增欄位在兩種做法下都要改 builder，
彈性沒有換到東西。

---

### ADR-318 時間由外部傳入，engine 是純函式

**白話**：engine 不呼叫 `datetime.now()`，由 service 傳 `now`。

**Decision**：`rank` / `score` 都接收 `now` 參數；同樣輸入永遠同樣輸出。

➕ 可測試、可在離線資料上重播、golden test（ADR-297）才成立。

---

### ADR-319 engine 輸出：依分數排序的清單；只有 uuid 與 similarity 有語意

**白話**：後端只讀 `candidate_uuid` 和 `similarity`，其餘放不透明的 `evidence`，後端只存不讀。

**Context**：Spec 021 的 `top_hint` 只回一筆，`CandidateScore.components` 的結構被 API 與 DB 綁住。

**Decision**：

- `rank()` 回**達門檻**的候選，依分數遞減；回幾筆由 engine 決定，後端目前只用第一筆。
- `score()` 不套門檻，給確認後寫配對卡時算 evidence。
- `Match = (candidate_uuid, similarity ∈ [0,1], evidence: JSON)`。
- `evidence` 不得含快照文字欄位的原文（ADR-295 的連帶要求）。

➕ 將來要提示多筆、換分數明細結構都不必改合約。

---

### ADR-320 檢索半徑由 engine 宣告；後端硬上限 1000 m

> **被 ADR-304 取代（2026-09-29）**：半徑歸 engine 自己的查詢；後端改以逾時保護。

**白話**：撈多遠的候選由 engine 說了算，後端不再用公式反推；後端只保留一個防呆上限。

**Context**：Spec 021 的 `_retrieval_radius_m` 呼叫 `max_hint_distance_m`，
是用「指數衰減＋加權平均」這組公式解出來的。Chi 一換公式形式，半徑就算錯，候選會被靜默漏掉。

**Decision**：engine 實作 `retrieval(kind) -> RetrievalSpec(radius_m)`，並保證半徑外的候選不可能達門檻。
後端以 `MAX_CANDIDATE_RADIUS_M = 1000`（公尺）截斷，超過時記 warning。
`RetrievalSpec` 日後可加有預設值的欄位（例：`max_age`）。

➕ 公式怎麼改，半徑都跟著正確。
◾ 1000 m 沿用 Spec 021 的值，2026-09-28 決定維持。

---

### ADR-321 電話以 pair 層級布林 `same_contact_phone` 送入，不雜湊、不進快照

> **被 ADR-304 取代（2026-09-29）**：電話怎麼比歸 engine；草稿帶正規化後的電話。

**白話**：後端比對兩筆的電話是否相同，只把結果（true / false / None）交給 engine。

**Context**：同一報案人重複報案是強訊號，但 engine 只需要「相不相等」。考慮過三種做法：

- **HMAC(normalize_phone)** 放進快照：要管理金鑰。
- **SHA(normalize_phone)** 放進快照：台灣手機號碼只有 10⁸ 種，GPU 幾秒就能建完對照表，SHA 值等同明文。
- **布林**：後端比對，只送結果。

評估時確認：電話原值本來就在 `tickets.contact_phone`，engine 跑在同一個 process，程式碼也開源。
雜湊在線上防不到任何人，只在資料離開 process（log、匯出的資料集）時有意義；
而 #46 的回測資料集本來就含原始個資、報案描述裡也常直接寫電話，只雜湊這一欄保護很薄。

**Decision**：`Candidate.same_contact_phone: bool | None`。兩邊以 `normalize_phone`
（`app/core/normalize.py`）正規化後直接比對；任一邊沒電話或正規化失敗 → `None`（訊號不可用，不是「不相等」）。
`contact_phone` 不進快照。離線資料集同格式，存 pair 層級布林。

➕ 不需要金鑰；engine 完全看不到電話。
➕ 與 `distance_m` 同一類（兩筆之間的關係事實），不違反 ADR-317。
➖ 模糊比對（例如只比後 8 碼）要後端改，依 ADR-317 第 4 點以新增欄位處理。

**否決 HMAC**：成本真實（金鑰管理），防護很薄。
**否決 SHA**：可被暴力還原，等同把電話放進快照與 log。

---

### ADR-322 資料表：`score_components` 改為不透明 `evidence`；新增 `engine_version`；新增 `hint_shown` 事件

**白話**：資料表不再綁定現行公式的分數結構，並記錄每筆判斷是哪一版引擎做的。

**Context**：Spec 021 的 migration `d4c8b1e07a92` 尚未合併，現在改成本最低。

**Decision**：

| 表 | 改動 |
|---|---|
| `duplicate_pairs` | `score_components` 改名 `evidence`（JSONB，內容由 engine 決定）；新增 `engine_version text`，並以 CHECK `method = 'manual' OR engine_version IS NOT NULL` 約束；`similarity`、`method` 保留 |
| `dedup_audit_events` | 新增 `engine_version`；`evidence` 直接存 engine 的 `evidence` |
| `AUDIT_EVENT_TYPES` | 新增 `hint_shown` |

- `engine_version` 允許 null，但只限 `method = 'manual'`（admin 手動建的卡沒有經過任何 engine）。engine 產生的卡一律要有版本。
  原本寫 NOT NULL，實作 Task 5 時發現會讓日後的手動建卡寫不進去，2026-09-28 改為現行寫法。
- `engine_version` 不塞進 `method`：`method` 有 CHECK（`PAIR_METHODS`），表示「哪一層、哪一類方法」，語意不同。
- `hint_shown`：兩段式（ADR-296）下，使用者看到提示後選擇「去看既有的單」不會再呼叫任何 API；
  要靠這筆事件才量得到接受率。取代 Spec 021 以 mutation 主動回報的 `accepted_hint`。

➕ Chi 迭代後，每筆判斷都能追到版本，新舊版可比較。

---

### ADR-295 audit 不存重播用的輸入快照

**白話**：`hint_shown` 只存 uuid、`similarity`、`engine_version`、`evidence`，不存當時送出的快照。

**Context**：存下送出快照，Chi 就能拿真實流量重播新版 engine；代價是 audit 表多存一份描述文字，涉及個資範圍。

**Decision**：不存。

➖ Chi 評估新版 engine 只能用離線資料集。`hint_shown` 後沒有建單的案例，輸入完全不會留下。
◾ 連帶要求：`evidence` 不得夾帶快照文字欄位原文，否則等於換個欄位存了快照。列入 contract test。

---

### ADR-296 建單兩段式：`createTicket` / `createStation` 回傳 union

> **求助單部分被 ADR-301／302 取代（2026-09-29）**：比對單位改為任務，`createTicket` 帶任務清單、`createTicketTask` 也兩段式。站點部分與「第一段不建立、第二段帶確認」的原則不變。
>
> **確認的意思由 ADR-400 細化（2026-10-27）**：確認必須正是這次比對給那一項的那一筆才算，指別筆的照樣比。

**白話**：第一次送出如果疑似重複，就不建單，回傳疑似重複的那一筆；使用者確認後再送一次才建單。

**Context**：ADR-314 拿掉了獨立 API，「建單前提示使用者」要改由建單流程本身帶出。考慮過三種：

- **A. 兩段式**：回 union，確認後再送一次。
- **B. 照常建單，回傳附帶疑似重複**：非破壞性，但重複單已經建立。
- **C. 快層不提示使用者**：只寫配對卡給 admin／慢層。

**Decision**：選 A。

```graphql
union CreateTicketResult = TicketCreated | DuplicateSuspected
type DuplicateSuspected { relatedTicketUuid: String! }
createTicket(input: CreateTicketInput!, acknowledgedDuplicateOf: String = null): CreateTicketResult!
```

`createStation` 比照（`StationCreated | DuplicateStationSuspected`）。流程：

- **`acknowledgedDuplicateOf` 為 null**：驗證 → 跑 dedup（fail-open）→ 命中則寫 `hint_shown`、
  回 `DuplicateSuspected`、不建單；未命中則建單。
- **`acknowledgedDuplicateOf` 有值**：驗證 → **不再跑 dedup** → 建單 → `engine.score()` 算 evidence →
  寫配對卡（`dup_ignored`、`rescan_needed=true`）與 audit `ignored_by_submitter`，全部同一個 transaction。
  指向的實體找不到或已刪：照常建單、不寫配對卡、記 log。

➕ 保留「建單前攔下」的效果。
➕ 記錄 atomic；不再需要「只有建單者能回報」與伺服器端重算的檢查。
➖ `createTicket` / `createStation` 回傳型別改變，所有呼叫端要處理 union；#47 的 `useDedupSubmitFlow` 要改。
➖ `accepted_hint` 不再是主動事件，改由「`hint_shown` 後沒有建單」推得。

**確認後不再跑 dedup 的理由**：避免使用者陷入「又跳出另一筆提示」的迴圈。

---

### ADR-297 引擎版本號 `<層>-v<遞增整數>`，以 golden test 強制升版

**白話**：`fast-v1`、`fast-v2`…；改了分數行為卻忘了升版，CI 會擋下來。

**Context**：考慮過遞增整數、日期（CalVer）、SemVer、git commit hash。
SemVer 的 major/minor 對演算法很難定義；commit hash 讀不懂且改註解也會變。

**Decision**：

- **格式**：`^[a-z]+-v[1-9][0-9]*$`，例 `fast-v1`。
- **何時升版**：同樣的輸入（快照＋`now`）會得到不同的 `rank` / `score` 結果時。
  包括改參數、門檻、公式、文字比對方法、回傳筆數。只改註解、重構、效能且輸出不變時不升版。
- **版本紀錄**：`spec.md` §11，每版記錄改了什麼、參數表、回測結果（資料集名稱與指標）。（原本放 `app/dedup_engine/CHANGELOG.md`，2026-10-15 併入 spec。）
- **Golden test**：固定輸入 → 輸出存成 golden file，檔案內記錄產生時的版本號。
  輸出變了但 `version` 沒變 → 失敗；升版時重新產生。
- 第一版：搬進 core 並改用 Python 文字相似度（ADR-316）之後的版本定為 `fast-v1`。

➕ 「改行為必升版」由 CI 保證，不靠人記得。

---

### ADR-298 站點快照的 `location` 一律是點

> **被 ADR-304 取代（2026-09-29）**：站點位置怎麼算歸 engine。

**白話**：`stations.geometry` 型別是泛用 `GEOMETRY`，但經 app 建立的站點一定是點，快照直接用點。

**Context**：`create_station` / `update_station` 寫入前都呼叫 `validate_point`
（`app/services/station.py`）。只有直接改 DB 或批次匯入可能寫進 polygon。
若站點是區域，「距離」有中心點、邊界、重疊為 0 等多種定義。

**Decision**：`StationSnapshot.location: GeoPoint`。repository 保留 #59 的 `ST_Centroid` 當防呆（對 Point 是恆等）。
日後要支援區域型站點時，距離定義另開 ADR。

---

### ADR-299 兩段式只在互動建單走；批次匯入不跑去重；`create_*` 拆成「驗證／寫入／commit」

> **部分被 ADR-398 取代（2026-10-27，`Spec/015-bulk-import-export/decisions.md`）**：批次匯入改跑快層，預覽列出
> 疑似重複，送出時逐列確認。兩段式在 `dedup_submission`、`create_*` 拆成驗證和寫入，這兩點不變。

**白話**：去重放在一個獨立的編排函式裡，只有 GraphQL 的 `createTicket` / `createStation` 呼叫它。
批次匯入照舊直接呼叫 `create_ticket` / `create_station`，行為完全不變。

**Context**：寫實作計畫時發現兩件 ADR-296 沒涵蓋的事：

1. `app/services/bulk_import.py` 也呼叫 `create_ticket` / `create_station`。批次匯入只有後台管理者能用
   （`station.import` / `ticket.import` 只發給 `super_admin` 與 team `admin`，`scripts/seed_rbac.py`），
   資料多半是外部清冊。把兩段式放進 `create_*` 本身，匯入遇到疑似重複就會不建單，也沒有人能逐筆確認。
2. `create_ticket` / `create_station` 在函式內 commit。ADR-296 要求建單、配對卡、audit 在同一個 transaction。

**Decision**：

- `services/ticket.py` 拆出 `validate_ticket(...) -> TicketFields`（權限＋驗證＋正規化，不寫入）與
  `insert_ticket(db, fields) -> Tickets`（寫入並 flush，不 commit）。`create_ticket` = 兩者＋commit，
  對外簽章與行為不變。`services/station.py` 比照。
- 新增 `services/dedup_submission.py` 的 `submit_ticket` / `submit_station`，實作 ADR-296 的流程；
  GraphQL resolver 改呼叫它。
- 批次匯入不跑去重。匯入造成的重複留給慢層。

➕ 批次匯入零改動。
➕ `create_*` 的既有呼叫端與測試不受影響。
➖ 匯入的資料不會在快層被比對。

---

## 任務層級（2026-09-29 追加）

Chi 在 2026-09-29 把 Spec 021 的比對單位從工單改成任務（commit `0d186dedb`、`cf0e51c3e`、`7e28d72e3`，
已合進本分支）。以下 ADR 把任務層級接到 Spec 022 的架構上。ADR-296 的「以工單為單位的 createTicket 兩段式」
被 ADR-301／302 取代；ADR-317 的 `TicketSnapshot` 被 ADR-323 的 `TaskSnapshot` 取代。

---

### ADR-323 求助單這邊的比對單位是任務；快照改為 `TaskSnapshot`

> **被 ADR-304 取代（2026-09-29）**：比對單位由 engine 決定；不再有 `TaskSnapshot`。

**白話**：比的不是「這張單像不像那張單」，而是「這個任務像不像附近另一個還開著的任務」。

**Context**：021 的三個決定（Chi 註明「user 定案」）：每個任務寫入前都比對；每個任務最多一個提示；
替既有的單加任務時排除同一張單自己的任務。候選是「還開著」的任務：任務 status 不是 `fulfilled`／`canceled`、
未軟刪，所屬工單未軟刪、不是 `cancelled`（`completed` 的單仍算，它可以再加任務）。

**Decision**：

- contract 以 `TaskSnapshot` 取代 `TicketSnapshot`，`SNAPSHOT_SCHEMA_VERSION` 升為 2（改名＝破壞性，依 ADR-317 第 4 點）。
  欄位：`uuid`、`ticket_uuid`、`location`（所屬工單的點）、`created_at`、`task_type`、`task_name`、`task_description`、
  `quantity`、`status`。`EntityKind` 改為 `"ticket_task" | "station"`。
- engine 的文字訊號比 `task_name + task_description`，類別比 `task_type`，距離是兩個任務所屬工單之間。
- repository 的候選條件照 021；新增「排除某張工單的任務」參數。
- `same_contact_phone` 比的是兩個任務**所屬工單**的電話（ADR-321 不變）。
- 分數行為改變（單位、文字欄位都換了），engine 升為 **`fast-v2`**，重產 golden，寫 CHANGELOG。

➖ 工單本身不再去重：兩張單的任務都不像，就不會提示。這是 021 的產品決定，照做。

---

### ADR-301 新開單：`createTicket` 帶任務清單，兩段式以任務為單位

> **部分被 ADR-304 修訂（2026-09-29）**：API 與流程保留；回傳的疑似重複改為通用形狀，比對單位由 engine 決定。

**白話**：開新單時連同任務一起送。任一任務疑似重複，整筆都不建，回傳每個被懷疑的任務對到誰；
沒有命中就一次建好。

**Context**：前端（#47）的流程是「存檔前先查所有草稿任務、逐一審閱、全部放棄就不建單」。後端目前新開單是
`createTicket`（不帶任務）再逐個 `createTicketTask`，第一段若在 `createTicketTask` 才判斷，工單已經建好，
使用者放棄所有任務時會留下空單。使用者 2026-09-29 定案：第一段回報「已經存在的」、什麼都不建；
改好後送第二次，或確認不是重複後直接建立；沒碰到就一段建立。

**Decision**：

```graphql
input CreateTicketTaskDraft {
  taskType: String!  taskName: String!  taskDescription: String  quantity: Int
  source: String = "user"  visibility: Visibility = public  routeUuid: String
  acknowledgedDuplicateOf: String = null   # 使用者已確認「這不是那個任務的重複」
}
# CreateTicketInput 新增 tasks: [CreateTicketTaskDraft!]! = []

union CreateTicketResult = TicketCreated | DuplicatesSuspected
type TicketCreated { ticket: TicketType!  tasks: [TicketTaskType!]! }
type DuplicatesSuspected { suspects: [TaskSuspect!]! }
type TaskSuspect { draftIndex: Int!  relatedTicketUuid: String!  relatedTaskUuid: String! }
```

- 第一段：驗證工單與每個任務草稿 → 對**沒有** `acknowledgedDuplicateOf` 的草稿逐一跑去重（草稿之間不互相比，
  它們屬於同一張新單）→ 任一命中：寫 `hint_shown`（每個命中一筆），回 `DuplicatesSuspected`，**工單與任務都不建**。
- 全部未命中（或都已確認）：工單＋所有任務同一個 transaction 建立；帶確認的任務各寫一張 `dup_ignored` 配對卡與
  `ignored_by_submitter`。
- 確認綁在**每個任務草稿上**，不綁草稿順序：使用者刪掉或重排任務，確認仍跟著對的任務。
- `tasks` 預設空清單：不帶任務的建單照舊（沒有可比的東西，直接建立），既有呼叫端不受影響。
- 去重出錯照樣 fail-open，整筆照常建立。

➕ 不會留下空單；工單與任務原子地一起出現。
➖ `createTicket` 的 input 與回傳都改，前端要改成一次送出（交接說明見 plan）。

---

### ADR-302 替既有的單加任務：`createTicketTask` 兩段式

> **部分被 ADR-304 修訂（2026-09-29）**：API 與流程保留；回傳的疑似重複改為通用形狀，比對單位由 engine 決定。

**Decision**：`createTicketTask(input, acknowledgedDuplicateOf: String = null): CreateTicketTaskResult!`，
回 `TicketTaskCreated { task }` 或 `DuplicatesSuspected`（`draftIndex` 固定 0）。位置取所屬工單的座標，
候選排除同一張工單自己的任務（021 決定 3）。流程與 ADR-301 相同。

---

### ADR-303 `accepted_hint` 仍由第二段推得，以任務計

**Decision**：每個命中的草稿任務在第一段各寫一筆 `hint_shown`（`primary_uuid` = 被比中的任務）。第二段該任務帶著
確認送出 → `ignored_by_submitter`；沒有再出現 → 視為接受提示（去看舊單）。沿用 ADR-296 的推得方式，不另開 API。

---

### ADR-304 撈資料也歸 engine：後端只送「送出的東西」，engine 自己組候選、自己決定比什麼

**白話**：Chi 可以自己寫查詢、自己組資料，要比工單、比任務、比什麼都行。後端只管什麼時候問、問完怎麼記。

**Context**：ADR-315 的接縫只隔離了「怎麼算分數」；「比什麼」（快照型別、repository 撈哪張表、比對單位）寫死在後端。
2026-09-29 Chi 把比對單位從工單改成任務（ADR-323），後端的 contract、builder、repository、API 都得跟著改。
使用者 2026-09-29 定案：讓 Chi 自己改 repository、自己組資料，以後改比對單位不用動後端。

**Decision**：

| 歸 engine（Chi，`app/dedup_engine/`） | 歸後端 |
|---|---|
| 撈候選（自己寫查詢，**唯讀**）、比對單位、訊號、分數、門檻、`evidence` | 觸發點（固定：新開單、替既有的單加任務、登記站點）、權限與輸入驗證、transaction、fail-open（含逾時）、寫 `hint_shown`／配對卡／audit、GraphQL |

**介面**：

```python
# 後端送進去的：驗證過的「送出的東西」，不是快照
TicketDraft(location, title, description, task_type, priority, disaster_types, contact_phone, ...)
TaskDraft(task_type, task_name, task_description, quantity, ...)
StationDraft(location, name, description, type, operational_status, contact_phone, ...)

NewTicket(ticket: TicketDraft, tasks: tuple[TaskDraft, ...])   # 新開單
NewTask(ticket_uuid: str, task: TaskDraft)                      # 替既有的單加任務
NewStation(station: StationDraft)                               # 登記站點
Submission = NewTicket | NewTask | NewStation

# engine 回來的：每個疑似重複指向「送出的哪一部分」與「既有的哪個東西」
Suspect(draft_ref: str,            # "ticket"｜"task:0"、"task:1"…｜"station"
        related_kind: str,         # "ticket"｜"ticket_task"｜"station"，與 draft_ref 的種類相同
        related_uuid: str,
        related_ticket_uuid: str | None,   # 對到任務時附上它的工單，給前端顯示
        similarity: float, evidence: Mapping)

class DedupEngine(Protocol):
    version: str
    async def check(self, db, submission: Submission, now) -> Sequence[Suspect]: ...
    async def score(self, db, submission: Submission, draft_ref: str,
                    related_kind: str, related_uuid: str, now) -> Suspect | None: ...
```

- **唯讀由後端強制**：engine 在 SAVEPOINT 內執行，結束後一律 rollback；contract test 另驗證呼叫後 session 沒有新增／修改／刪除的物件。
- **逾時取代半徑上限**：後端以 `asyncio.wait_for` 包住 `check`（預設 2 秒），逾時＝fail-open。ADR-320 的 1000 m 上限改由 engine 自律（contract test 驗效能）。
- **確認（acknowledgement）**：每個草稿（工單、每個任務、站點）可帶 `acknowledgedDuplicateOf`；已確認的草稿，其疑似重複由後端濾掉，不再回報（避免迴圈），並在建立後寫配對卡（用 `engine.score` 算 evidence）。
- **配對卡**：`entity_kind` 取 `related_kind`；送出方是對應 `draft_ref` 建出來的那筆，兩邊同種類。
- **比對單位由 engine 決定**：比工單就回 `draft_ref="ticket"`，比任務就回 `"task:i"`，兩種都比就都回。後端不需要知道。

**被取代**：ADR-315 的「core 不做 I/O」（engine 可唯讀查 DB）、ADR-316（文字比對方法歸 engine，用 pg_trgm 或 Python 都行）、
ADR-317 的快照型別（改為送出草稿；「白名單、只加不改」原則保留給草稿）、ADR-320 的半徑上限（改逾時）、
ADR-321（電話怎麼比歸 engine；草稿帶正規化後的 `contact_phone`）、ADR-298（站點位置的算法歸 engine）、ADR-323 的 `TaskSnapshot`。
ADR-301／302 的 API 保留，但回傳的疑似重複改為通用形狀（見 spec §5）。

➕ 比對單位、候選條件、文字方法以後都只動 `app/dedup_engine/`。
➕ Chi 可以直接沿用 021 的查詢寫法，不必把資料塞進後端定義的快照。
➖ engine 能讀 DB：離線 harness 需要一個 DB（或 Chi 自己的替身），golden test 改為在測試 DB 上跑。
➖ 送出的草稿含正規化後的電話（engine 本來就能讀 DB 裡的電話，隔離已無意義）。

### ADR-305 候選查詢必須用得到空間 index：任務查詢改 cast、站點補 centroid 的 expression index

**白話**：原本的候選查詢一次都沒用到為它建的 index，資料一多，每次送出都要掃整張表，慢到會碰到 2 秒逾時、讓提示整個失效。

**Context**：Task 24 Docker 驗證（2026-09-29）在 2 萬筆工單＋任務的資料上實測：

- `ix_base_geometries_geography` 建在 `(geometry::geography)`，但 geoalchemy2 的 `cast(x, Geography)` 產生 `CAST(x AS geography(GEOMETRY,-1))`，
  Postgres 不把它當成同一個表達式，**index 永遠用不到**（強制關掉 seqscan 仍是 Seq Scan）。
  #46 migration 的註解說兩者「parse to the same expression」是錯的；Phase 1 Task 14 的 EXPLAIN 用手寫 SQL，所以沒抓到。
- 站點以 centroid 量距離（`ST_Centroid(geometry)::geography`），根本沒有對應的 index。
- 影響：任務查詢在密集地點（半徑內 500 筆）2127 ms，`createTicket` 實測 1988 ms，貼著 `ENGINE_TIMEOUT_S = 2` 的邊；稀疏地點 55 ms，隨全表筆數線性成長。
  contract test 的效能項（500 筆）測不出來，因為測試 DB 只有那 500 筆。
- 兩種寫法都從 #46／#59 繼承；ADR-304 之後候選查詢歸 engine（`candidates.py`），在本票修。

**Decision**：

1. `candidates.py` 一律 cast 成不帶 typmod 的 `geography`（`Geography(geometry_type=None)`），與 index 表達式一致。
   同一份資料上：密集 2127 → 3.7 ms、稀疏 55 → 0.12 ms。距離值不變（golden 未變動，不需升版，ADR-297）。
2. `base_geometries` 新增 `ix_base_geometries_centroid_geography`：`GIST ((ST_Centroid(geometry)::geography))`，給站點查詢用。
   加在 #46 的 migration `d4c8b1e07a92`（本分支本來就在改它，Task 5），model 同步宣告。
3. 測試：`tests/dedup_engine/test_candidates.py` 抓下兩條候選查詢實際送出的 SQL，在關掉 seqscan 下 EXPLAIN，斷言用到各自的 index
   （突變測試：cast 改回預設 `Geography()` 兩條都會失敗）。

➕ 候選查詢成本只跟半徑內的筆數有關，不再跟全表大小有關。
➖ 多一個 GIST expression index：`base_geometries` 每次寫入多算一次 centroid（工單也會建，因為 index 建在父表）。
◾ **index 與所有 DB schema 歸後端管**（使用者 2026-09-29 定案）：engine 只寫唯讀查詢。Chi 換了查詢的距離表達式或篩選條件，
  這兩條測試會紅，由後端補或調整 index／migration；Chi 不需要動 migration 或 model。

### ADR-306 `app/dedup_engine/` 裡屬於後端的三件事：registry、守門測試、時限

**白話**：目錄歸 Chi，但「線上用哪個 engine」「等多久」由後端決定；後端寫的守門測試 Chi 可以改，後端要審。

**Context**：ADR-304 把 `app/dedup_engine/` 整個歸 Chi，但目錄裡有三樣東西的性質不是演算法。使用者 2026-09-29 定案：

**Decision**：

| 東西 | 歸屬 | 規則 |
|---|---|---|
| `registry.py`（線上用哪個 engine） | 後端 | Chi 可以新增 engine class；要不要上線、切到哪個，由後端改 registry |
| 守門測試：`tests/dedup_engine/test_contract.py`、`test_core_isolation.py`、`test_candidates.py` 的 index 測試 | 後端擁有，Chi 可改 | Chi 的改動讓它們紅了，可以在自己的 PR 裡調整，但後端要 review 那部分 |
| `ENGINE_TIMEOUT_S`、contract test 的效能門檻 | 後端 | Chi 提意見（Task 0 時問他能否達到），後端拍板 |

演算法測試（`test_fast.py`、`test_fast_engine.py`、`test_text.py`、golden）與 `CHANGELOG.md` 仍歸 Chi。

➕ 上線時機與逾時綁在一起，由負責線上穩定的一方決定。
➖ 守門測試可以被 Chi 改，靠後端 review 把關，不是靠測試本身擋。

### ADR-307 效能門檻改為「全表 2 萬筆、半徑內 500 筆、5 個任務、200 ms」；`ENGINE_TIMEOUT_S` 維持 2 秒

**白話**：用實測決定使用者最多該等多久。正常情況 dedup 只讓人多等幾十毫秒；2 秒只是 engine 壞掉時的上限。

**Context**：ADR-306 定了由後端拍板、Chi 提意見。2026-09-29 在隔離的 Docker stack 上實測 `createTicket` 整個請求，
與「完全跳過 dedup」的對照組相減：

- 全表 2 萬筆與 10 萬筆幾乎沒差（ADR-305 之後成本只看半徑內的候選數）。
- 多等的時間 ∝ 半徑內候選數 × 送出的任務數（候選只查一次，但 engine 每個任務都要跟全部候選各算一次分數）。半徑內 500 筆：1 個任務多等 p50 約 18 ms，5 個任務約 38 ms；
  2000 筆＋5 個任務：p50 約 145 ms、p99 約 245 ms。
- 原本的效能項只放 500 筆、全表也只有 500 筆、1 個任務：測不出 ADR-305 的 index 問題，也測不出多任務的疊加。

**Decision**：

1. contract test 第 7 項（`tests/dedup_engine/test_contract.py::test_fast_enough`）：全表 **20,000** 筆開著的任務（遠處）、HERE 半徑內 **500** 筆、
   送出帶 **5** 個任務的新開單，`check` 三次取最快 **< 200 ms**。
   突變驗證：cast 改回 geoalchemy2 預設的 `Geography()` 時實測 670 ms，測試失敗。
2. `ENGINE_TIMEOUT_S` 維持 **2 秒**：正常情況（實測最差 p99 約 245 ms）碰不到，它是 engine 故障時使用者最多多等的時間。

➕ 門檻同時守住「用得到 index」與「多任務不會疊加爆掉」兩件事。
➖ 測試多灌 2 萬筆（純 SQL，約 1~2 秒）。
◾ 實測時 DB 是 amd64 模擬，數字偏悲觀；Chi 仍可在 Task 0 提意見，改門檻照 ADR-306 由後端拍板。

### ADR-313 `engine.score` 跟 `check` 一樣受保護，並在建立任何東西之前呼叫；失敗時後端自己確認對方存在才寫卡

> **第 1 點被 ADR-400 取代（2026-10-27）**：確認不再用 `score` 打分，改看 `check` 給那一項的是不是同一筆，分數用 `check` 的。
> 第 2～4 點不變。

**白話**：使用者按「不是重複，照樣建立」時，後端要請 engine 替那一對算分數。這一步以前沒有保護，engine 出錯會讓整筆建立失敗；
現在跟第一次送出時的檢查一樣：出錯、太慢、偷寫，都照常建立，只是那張配對卡沒有分數。

**Context**（PR #73 審查，2026-10-13，都在測試 DB 上實測重現）：

1. `score` 直接在建單的 transaction 裡、新單已 flush 之後呼叫，沒有 SAVEPOINT 也沒有逾時。engine 的 SQL 出錯時 Postgres 會把整個
   transaction 標成失敗，後面寫卡、commit 全被拒（`InFailedSQLTransactionError`），工單沒建成；engine 很慢時使用者一直等（實測 5 秒）。
2. 直接套用 `check` 的保護不夠：逾時會在查詢中途切斷連線，已 flush 的新單跟著消失（實測 `PendingRollbackError`）。
   `check` 沒這個問題，是因為它在寫入任何東西之前呼叫，失敗時整個 rollback 也不會掉東西。
3. 舊規則「`score` 失敗也照常寫卡（分數 null）」沒有確認對方存在。fast-v3 只比任務，`score` 收到工單層級的確認（`draft_ref="ticket"`）
   會丟例外，於是任何人送一個隨機 uuid 就會留下一張指向不存在東西的 `entity_kind='ticket'` 配對卡。
4. 配對卡用 Python 字串排序決定 `low_uuid`／`high_uuid`，資料庫比的是 uuid 本身；確認的 uuid 是大寫時順序會反，違反 CHECK → 500（實測 12 次 4~5 次）。

**Decision**（只動後端，engine 不用改）：

1. `score` 改在**建立之前**呼叫（它本來就不需要新單的 uuid）：`dedup.score_acknowledged` 先算分，建單後 `dedup.record_pair_ignored` 再寫卡。
2. `check` 與 `score` 共用 `_guarded`：SAVEPOINT 一律 rollback、`ENGINE_TIMEOUT_S`、寫入偵測（兩者都在寫入前呼叫，所以偵測一定有效）。
   任何失敗 → 整個 transaction rollback、reload actor，然後照常建立。
3. `score` 失敗時，後端用 `duplicate_pair_repository.entity_exists` 依 `related_kind` 查對方是否存在（未刪除）；存在才寫沒分數的卡，不存在就不寫。
   engine 正常回 `None`（找不到）時照舊不寫卡。
4. 確認的值先用 `uuid.UUID` 轉成 Postgres 的寫法；不是 uuid 就不呼叫 engine、不寫卡、照常建立。

這條細化 spec §5.1 原本「`score` 失敗：照常建立、卡的分數為 null」的寫法（加上「對方存在」的條件），不推翻 ADR-296／303。

➕ 「dedup 出錯絕不擋建立」在兩段都成立，而且不依賴 engine 怎麼實作。
➕ 不會再出現指向不存在東西的配對卡。
➖ 確認那一段多一個查詢（只在 `score` 失敗時）。
◾ 測試：`tests/test_dedup_check.py`（score 的 SQL 出錯、逾時、偷寫、對方不存在、不是 uuid、大寫 uuid）、`tests/test_dedup_submission.py`（真 engine 的工單層級確認、建單時 score 逾時）。

---

### ADR-396 同一區域的送出依地點排隊：查詢前取 advisory lock，最多等 500 ms，等不到照常建立

> **部分被取代（2026-10-29，PR #140 review）**：前台請求協助也要鎖（ADR-433）；500 ms 改成全部 key 合計的期限（ADR-434，取代第 3 點的「每個 key 各等」）；
> 放棄時 log 只寫約 250 m 的位置（ADR-435）；站點與工單分開排隊（ADR-436，取代第 2 點的「同一組 key」）。其餘不變。

**白話**：兩個人幾乎同時在同一個地方送出一樣的東西，以前兩筆都會建立、也都不會跳提示。
現在同一區域的送出會排隊，後面那筆查得到前面那筆，就會被提示。排隊最多等 0.5 秒，等不到就照以前的方式建立，不會比以前差。

**Context**（PR #132 回報，2026-10-27 實測，證據在 PR #132 的審查附件）：

1. 三個進入點（`submit_new_ticket`、`submit_new_task`、`submit_new_station`）都是「先問 engine → 寫入 → commit」，中間沒有鎖。
   兩筆在彼此 commit 之前都查不到對方。用兩條連線重現：先後送出時第二筆被擋；第一筆在寫入後、commit 前暫停時，兩筆都建立。三條路徑都一樣。
2. 漏掉的重複沒有配對卡（配對卡只在使用者確認時寫），所以 admin 審核清單也看不到。
3. 20 筆一樣的單同時送出、共用預設連線池（15 條）：
   - 現況：15 筆建立。
   - 不設上限的鎖：只建立 1 筆，但 engine 一筆 1.5 秒時，最慢一筆要等 32.6 秒，其他區域的請求也被拖到 8.3 秒（排隊的請求佔住連線）。
   - 上限 300 ms：engine 比上限快時只建立 1 筆；比上限慢時退回現況（15 筆），最慢一筆只比現況多約 0.6 秒，其他區域跟現況差不多。
4. 漏洞在後端的流程，不在 engine（ADR-304／306），所以由後端修，engine 不用改。

**Decision**：

1. 三個進入點在驗證完、問 engine（`score` 與 `check`）之前，先鎖住送出位置所在的區域。
   位置：新開單、站點用草稿的 `location`；替既有的單加任務用所屬工單的位置（後端自己查，算法與 `app/db/h3.py` 相同，用 `ST_PointOnSurface`）。
2. 區域 = 該點的 h3 第 8 級格子加周圍一圈（共 7 格）。依 h3 index 由小到大逐一 `pg_advisory_xact_lock(<h3 index 轉 bigint>)`，順序固定避免互相卡死。
   鎖在 commit 或 rollback 時自動放掉；被提示的那筆會先 commit `hint_shown`，鎖也跟著放掉。
3. 等待上限 `AREA_LOCK_TIMEOUT_MS = 500`：在 SAVEPOINT 裡 `SET LOCAL lock_timeout`，逾時就 rollback 這個 SAVEPOINT、記 warning，不帶鎖照常往下走（fail-open）。
   500 ms 是 engine 最差 p99 約 245 ms（ADR-307）的兩倍。上限要比「前一筆從拿到鎖到 commit」長，後面那筆才查得到它。
4. 鎖得住的前提：engine 的比對半徑不能超過 `AREA_LOCK_MAX_RADIUS_M = 500`（公尺）。
   相距小於這個距離的兩點，h3 第 8 級格子的距離 ≤ 2，兩邊的 7 格一定有重疊。現行 fast-v4 半徑：任務 291 m、站點 137 m。
   守門測試（後端擁有，ADR-306）：(a) 台灣範圍內隨機取相距 `AREA_LOCK_MAX_RADIUS_M` 的點對，格子距離都 ≤ 2；(b) registry 的 engine 半徑 ≤ `AREA_LOCK_MAX_RADIUS_M`。
   Chi 把半徑調大時 (b) 會紅，由後端改格子層級或範圍。
5. engine 出錯時 `check`／`score` 會整個 transaction rollback（ADR-313），鎖跟著放掉，這一筆就不帶鎖建立。這跟現況相同，接受。

這條取代 PR #132 在 spec §9 想加的「同時送出可能漏提示，目前接受」。

➕ 一般情況下（engine 比 500 ms 快），同一區域爆量時只會建立一筆，其他的都會被提示。
➕ 最差就是退回現況；不同區域互不影響；engine 不用改。
➖ 同一區域爆量時，每筆最多多等約 0.5 秒。
➖ 每次送出多一次查詢（取 7 個鎖）。
◾ 實測時 DB 是 amd64 模擬，數字偏悲觀。上限之後要改，依 ADR-306 由後端拍板。
◾ 測試：`tests/test_dedup_area_lock.py`（三條路徑的兩連線確定性重現、逾時照常建立、鎖在 commit／hold 後放掉、守門 (a)(b)）。

### ADR-397 前台的請求協助 `createHelpRequest` 也走兩段式

**白話**：民眾從前台「請求協助」送出的單，現在也會先比對附近有沒有一樣的需求。有的話先不建，讓民眾確認；
確認不是同一件再送一次才建立，跟管理平台的 `createTicket` 一樣。

**Date**：2026-10-27。Carol 在 Discord #frontend-only 要求所有前後台的輸入都要先過快層（台灣日期 2026-10-27，
UTC 10-26 19:29）；Dan 10-27 定了做法和部署方式。

**Context**：

- `createHelpRequest` 是 2026-09-27 加的（`a64a93c1`），一次寫入單、地址、需求、照片。兩段式（ADR-296、299、301）
  之後才接上，只接了 `createTicket`／`createTicketTask`／`createStation`，這支漏了：它直接呼叫
  `ticket.create_help_request`，完全不比對。
- ADR-304 定的觸發點是「新開單、替既有的單加任務、登記站點」。請求協助就是新開單，所以這條是補上漏列的入口，
  不推翻 ADR-299（「兩段式只在互動建單走」本來就涵蓋它）。

**Decision**：

- `ticket.create_help_request` 拆成 `validate_help_request`（民眾的所有檢查，不寫入）與 `insert_help_request`
  （寫入並 flush，不 commit），跟 ADR-299 拆 `create_ticket` 的方式一樣。民眾的規則一條都不改。
- 拆完拿掉 `create_help_request`：`app/` 裡沒人再叫它，留著就是一條不比對就建單的公開函式，之後新的入口
  拿它來用也不會有測試發現（popo #142 review）。
- `dedup_submission.submit_help_request` 照 `submit_new_ticket` 的流程：`NewTicket`，每件需求是 `task:i`。
- GraphQL：
  - `HelpRequestTaskInput` 加 `acknowledgedDuplicateOf: String = null`，跟 `CreateTicketTaskDraft` 的同名欄位同義；
  - `createHelpRequest` 的回傳從 `TicketType` 改成 `CreateTicketResult`（`TicketCreated | DuplicatesSuspected`）。
- 權限不變（`ticket.add`），不用 migration。

**部署**：回傳型別改變是 breaking change。前台原本的查詢直接在 `createHelpRequest` 上選 `TicketType` 的欄位，
union 上不合法，每一次請求協助都會失敗。所以後端和前台的 PR 同一天接連合併、同一次部署，只合一支的那天不部署
（Dan 10-27 選定）。

➕ 民眾送的單（最大宗的輸入）也會被快層攔下，疑似重複進審核佇列。
➕ API 跟 `createTicket` 完全一致：同一個 union、同一個確認欄位。
➖ 後端和前台要綁在一起上線。
➖ 被擋時什麼都沒寫，民眾要再送一次。前台要保留表單內容（草稿機制已經會保留）。
◾ 測試：`tests/test_graphql/test_create_dedup.py`（真 engine：被擋、帶確認建立）、`tests/test_dedup_submission.py`
（沒有疑似整份建立、確認只蓋自己那件、確認指向不存在的東西、engine 失敗、驗證不過時不問 engine）；
`tests/test_help_request.py` 的民眾規則改走 `submit_help_request`。

---

### ADR-400 「仍要建立」只認那一項這次比對到的那一筆

**白話**：使用者按「不是同一件，仍要建立」時帶的 uuid，必須正是系統剛剛對這一項提示的那一筆。帶別的都不算：
照樣比、照樣擋，也不寫配對卡。

**Date**：2026-10-27。HC 在 #142（請求協助）和 #148（批次匯入）的 review 提出；Dan 10-27 決定在共用的去重函式一次
改，所有入口一致。HC 2026-10-29 在 #148 建議再送時用同一次 `check` 決定擋不擋，Dan 2026-10-29 決定（第 2、4 點和後果）。

**Context**：

- ADR-296、313 的做法：帶了 `acknowledgedDuplicateOf` 的項目先用 `engine.score` 替那一對另外打分，再整項不比。
  那一對不一定是使用者剛看到的提示，配對卡也就不一定配到真正很像的那一筆。
- 請求協助把這個欄位開給每個民眾；批次匯入的確認是依列號對應，檔案一換就可能對到別列。
- `createTicket`、`createTicketTask`、`createStation`、請求協助都經過 `dedup_submission`（現在是
  `dedup.settle_submission`），批次匯入經過 `bulk_dedup.compare`，同一套。

**Decision**：

1. 確認只在「它指的正是引擎這次給那一項的那一筆」時成立。快層每一項最多回一筆（`FastEngine.check`），所以就是比
   uuid 是否相同（轉成 Postgres 的寫法後）。
2. 不再呼叫 `engine.score`。每份送出只問一次 `check`、不排除任何項（`dedup.settle_submission`）：成立的那對直接用
   `check` 給的分數寫卡，其餘疑似的項照樣擋。單筆和批次都一樣，帶不帶確認都只問一次：再問一次也是同一份送出、
   同一個 `now`、同一個交易，得到的只會是第一次的答案扣掉成立的項。
3. 不成立的確認（指別筆、不存在、不是 uuid）當成沒帶：照樣比，疑似就擋，不寫配對卡，記 warning。
4. 引擎沒回答（失敗、逾時、偷寫）時沒有比對可依，沿用 ADR-313 第 3 點：對方存在就寫一張沒分數的卡，照常建立。
   不再重問，其他項也不擋，跟批次匯入引擎失敗後不再問一樣（ADR-398）。
5. `engine.score` 留在 contract；要不要從 contract 和 fast engine 拿掉另議。測試用的假引擎被呼叫 `score` 會直接失敗，
   後端若又開始呼叫它，測試會發現。

**取代**：ADR-313 第 1 點（確認的那對在建立前用 `score` 打分）。ADR-296 的「帶了確認就不再跑 dedup」細化為「確認
成立才不再提示」。ADR-313 第 2～4 點（保護措施、失敗時查對方存在、uuid 正規化）不變。

➕ 確認欄不能拿來跳過比對；配對卡一定配到使用者真的看到的那一筆。
➕ 單筆四個入口和批次匯入同一條規則，改在同一處（`services/dedup.py`）。
➕ 帶確認的再送也只問一次 `check`，拿著 ADR-396（#140）區域鎖的時間跟沒帶確認時一樣，500 ms 的等待上限照原本的
   推論成立，不用重量、不用調（Chi 2026-10-28 在 #148 提醒過問兩次的問題）。
➖ 兩次送出之間附近多了一筆更像的，引擎改提示新的那筆，原本的確認不再成立，使用者會再被擋一次、看到新的那筆。
   結果是對的，但前台再被擋時要把那一項的確認換成新的那一筆。
➖ 再送那次引擎沒回答就不再問：確認寫沒分數的卡，其他項照常建立。它們第一次送出被擋時比過；這次若改了內容就沒比到。
◾ 測試：`tests/test_dedup_check.py`（成立才寫卡、分數來自 `check`、指的是別項的那筆不成立、`check` 失敗時查對方存在、
  不是 uuid 不成立、一次 `check` 同時決定寫卡和擋、`check` 的 SQL 出錯／逾時／偷寫、大寫 uuid）、
  `tests/test_dedup_submission.py`（工單、站點與請求協助的確認指別筆仍被擋、真引擎確認 15 km 外的任務仍被擋、帶確認時
  `check` 逾時、四個入口帶確認再送都只問一次、再送時引擎失敗照常建立不重問）、
  `tests/test_bulk_import_dedup.py`（匯入的確認指別筆、不存在、不是 uuid 都被擋）。

### ADR-433 前台的請求協助 `submit_help_request` 也依地點排隊

**白話**：民眾從前台「請求協助」送出的單，跟管理平台新開單一樣要排隊。兩位民眾同時送出一樣的求助時，後面那筆會被提示，不會兩筆都建立。

**Date**：2026-10-29。HC Bot 在 PR #140 review 提出（blocking，2026-10-28）。

**Context**：ADR-396 寫的時候只有三個進入點。之後 main 合進 ADR-397，`submit_help_request` 成為第四個進入點，
一樣是「先問 engine → 寫入 → commit」，但沒有加鎖。rebase 後用兩條連線重現：第二筆不用等，兩筆都建立。

**Decision**：`submit_help_request` 在驗證完、`_score_acknowledged`（ADR-400 之後是 `dedup.settle_submission`）之前呼叫 `lock_area_at(db, 草稿位置, kind="ticket")`，跟 `submit_new_ticket` 一樣。
以後新增的兩段式進入點都要加鎖，`dedup_submission.py` 的模組說明已寫明。

➕ 最大宗的輸入（民眾求助）也不會同時送出漏提示。
➖ 沒有新的取捨，代價同 ADR-396。
◾ 測試：`tests/test_dedup_area_lock.py::test_racing_help_requests_create_one`。

### ADR-434 等鎖上限是全部 key 合計 500 ms，不是每個 key 各 500 ms

**白話**：一筆送出要拿 7 個鎖。以前每個鎖各等最多 0.5 秒，最壞要等約 3.5 秒。現在從開始等算起，全部合計最多 0.5 秒。

**Date**：2026-10-29。HC Bot 在 PR #140 review 提出（should-fix）：7 個鎖每隔 450 ms 放掉一個，`lock_area_at` 等了 3.15 秒也沒放棄。

**Context**：Postgres 的 `lock_timeout` 是每一次取鎖各自計時。ADR-396 第 3 點只設一次 `lock_timeout = 500ms`，
所以 7 個鎖分別被不同鄰居握住時，每個都能再等 500 ms。這違反 ADR-396「最多多等約 0.5 秒」的承諾。

**Decision**：

1. 開始取鎖時算一個期限（`time.monotonic()` + `AREA_LOCK_TIMEOUT_MS`）。
2. 每取一個鎖前，把 `lock_timeout` 設成剩下的時間。最少設 1 ms，因為設成 0 等於關掉逾時。
3. 超過期限的處理不變：rollback SAVEPOINT、記 warning、不帶鎖照常建立。

➕ 「最多多等約 0.5 秒」現在對任何鄰居分布都成立。
➖ 每個鎖前多一次 `set_config`，共多 6 次很小的查詢。
◾ PR #148（Dan）讓「仍要建立」的那筆在鎖裡問兩次 engine，會拉長前一筆握鎖的時間。ADR-396 要求上限長於「前一筆拿到鎖到 commit」。
  #140 先合（2026-10-29 決定），由 #148 依本條重算。
◾ 測試：`test_the_whole_wait_is_capped_not_each_key`。7 個鎖每 250 ms 放一個，每個都比上限短，合計超過上限，必須放棄。

### ADR-435 放棄等鎖的 log 只寫約 250 m 的位置

**白話**：等不到鎖時寫的 warning，以前會寫出送出的精確座標。現在經緯度都四捨五入到 1/400 度（約 250 m）。看得出哪一區塞車，看不出是哪一戶。

**Date**：2026-10-29。HC Bot 在 PR #140 review 提出（should-fix）。

**Context**：API 不給沒有詳細權限的人看工單的精確位置，但 log 的讀者不受這個限制。本機爆量測試時，約一半的送出會放棄等鎖並寫 log。

**Decision**：log 的經緯度用 `round(x * 400) / 400`。只影響 log，鎖仍用精確位置算格子。

➕ log 不再留下求助者的精確位置。
➖ 要追某一筆時，log 對不到確切地點，要用時間去對 DB。
◾ 測試：`test_the_give_up_log_names_the_area_not_the_point`。

### ADR-436 站點與工單分開排隊：站點用負號的 key

**白話**：同一區有很多人在報需求單時，登記站點的人不用跟著排隊。因為站點只會跟站點比，需求單只會跟需求單比。

**Date**：2026-10-29。HC Bot 在 PR #140 review 提問；使用者決定「先查 engine 會不會跨類型比，只比同類就分開」。

**Context**（查證）：

1. 介面規定比對結果的 `related_kind` 要和草稿同一類，因為配對卡只連同類的兩筆（`app/dedup_engine/contract.py` 的 `Suspect` 說明，後端也會丟掉不符的結果，spec §4 第 3 點）。
2. 快層實作也是如此：站點只查 `open_stations_near`，工單與任務只查 `open_tasks_near`（`app/dedup_engine/fast.py::FastEngine.check`）。
3. 所以站點等工單的鎖，或工單等站點的鎖，都換不到任何提示，只是白等。

**Decision**：

1. `area_keys`／`lock_area_at` 加必填的 `kind`：`"ticket"`（新開單、請求協助、加任務，都是跟任務比）或 `"station"`。
2. 工單用格子的 H3 index（轉 bigint 必為正數）；站點用它的負數，兩組永遠不會相同。
3. 站點的 key 一樣由小到大取，順序固定，不會互相卡死。

➕ 站點與工單的爆量互不拖累。
➖ 如果之後 engine 改成跨類型比對，這裡要改回共用 key。前提寫在本條，介面的同類規定也有後端的丟棄邏輯把關。
◾ 測試：`test_station_and_ticket_keys_never_overlap`、`test_a_station_does_not_wait_behind_tickets_in_its_area`（突變：站點改回 `kind="ticket"` 會紅）。
