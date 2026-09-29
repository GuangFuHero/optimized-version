# 去重引擎介面 — ADR 全集（ADR-286~304）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
編號接續 `Spec/008-rbac-authorization/decisions.md`（ADR-285 為 2026-09-28 全 repo 各分支掃描的最大值）。

**背景**：Spec 019（PR #46 / #59，作者 Chi）交付了去重快層。本功能由後端接手包裝，
而演算法會由 Chi 持續迭代。以下每條決策都在回答同一個問題：**演算法改了，後端要不要跟著改？**

---

### ADR-286 去重是內部能力，不開獨立 GraphQL API

**白話**：拿掉 `ticketDedupCandidates`、`stationDedupCandidates`、`recordDedupHintOutcome`。
去重由需要它的業務流程（建單、登記據點、之後的慢層）在內部呼叫。

**Context**：Spec 019 把去重開成兩支 query 加一支 mutation，前端在 `createTicket` 前先查、
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

### ADR-287 分成 algorithm core / repository / service / model 四層，core 不做 I/O

> **被 ADR-304 取代（2026-09-29）**：候選查詢改歸 engine，engine 可唯讀查 DB。

**白話**：Chi 的程式碼放在 `app/dedup_engine/`，不能 import SQLAlchemy、FastAPI、strawberry，
不能碰 DB 或網路。

**Context**：Spec 019 的演算法散在三處：`services/dedup_scoring.py`（公式）、
`repositories/dedup_repository.py`（在 SQL 裡算文字相似度、換算 `age_min`）、
`services/dedup.py`（由公式反推檢索半徑、截斷文字、#59 的 `_Kind.parameters`）。
Chi 要加一個訊號，三個檔案都可能要動。

**Decision**：

| 層 | 擁有者 | 職責 |
|---|---|---|
| algorithm core `app/dedup_engine/` | Chi | 訊號、分數、門檻、各種類參數、檢索範圍、`evidence` 內容 |
| snapshot builder | 後端 | ORM row / 建單 input → 快照（ADR-289） |
| repository | 後端 | 依 core 給的檢索範圍撈「未結案」候選，回傳快照＋關係事實 |
| service | 後端 | 組快照、呼叫 engine、fail-open、寫配對卡與 audit |
| model | 後端 | `duplicate_pairs`、`dedup_audit_events` |

**判斷規則**：Chi 迭代時可能會改的 → core；不管演算法怎麼改都成立的事實 → 後端。

➕ 演算法迭代只動 core 一個目錄。
➕ core 是純函式，可以單獨測試、在離線 harness 直接跑。
➖ 需要預先計算並儲存的東西（向量）、或需要外部服務的訊號，放不進這個模型（見 spec「接縫之外」）。

---

### ADR-288 文字相似度移到 core，用 Python 計算，不用 pg_trgm

> **被 ADR-304 取代（2026-09-29）**：文字比對方法完全歸 engine。

**白話**：repository 只給原始文字，相似度怎麼算由 Chi 決定。

**Context**：Spec 019 在 SQL 裡算 `similarity(concat_ws(' ', title, description), query)`。
pg_trgm 天生是 DB 函式，寫起來自然落在 repository，等於 repository 在做演算法的工作。
依 ADR-287 的規則，比對方法、比哪些欄位、要不要截斷都會隨迭代改變，屬於 core。

**Decision**：core 用 Python 計算文字相似度。

➕ Chi 可以換方法、改欄位、做正規化，並與離線 harness 共用同一份程式碼
（`dedup_scoring.py` docstring 已說明「formula matches the offline tuning harness」）。
◾ 效能不是問題：候選只用半徑篩（現行約 160 m），文字不參與 SQL 篩選，不需要 DB 索引加速。
➖ Python 實作與 pg_trgm 的分數會有細微差異，**現行門檻 0.80 要用新實作重跑回測**。

**例外**：若日後要「先用文字在 DB 端篩」（擴大半徑、跨區比對），那是檢索策略改變，
由 core 在 `RetrievalSpec` 宣告需求、repository 實作。

---

### ADR-289 送事實不送特徵：型別化的白名單快照，送出與候選同型

> **被 ADR-304 取代（2026-09-29）**：後端只送驗證過的草稿，候選由 engine 自己查。「白名單、只加不改」的原則保留給草稿型別。

**白話**：後端送整份實體的欄位原值，不送算好的分數；送出中那筆和候選是同一種型別。

**Context**：Spec 019 的 `DedupCandidate(distance_m, age_min, task_type, text_similarity)`
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

### ADR-290 時間由外部傳入，engine 是純函式

**白話**：engine 不呼叫 `datetime.now()`，由 service 傳 `now`。

**Decision**：`rank` / `score` 都接收 `now` 參數；同樣輸入永遠同樣輸出。

➕ 可測試、可在離線資料上重播、golden test（ADR-297）才成立。

---

### ADR-291 engine 輸出：依分數排序的清單；只有 uuid 與 similarity 有語意

**白話**：後端只讀 `candidate_uuid` 和 `similarity`，其餘放不透明的 `evidence`，後端只存不讀。

**Context**：Spec 019 的 `top_hint` 只回一筆，`CandidateScore.components` 的結構被 API 與 DB 綁住。

**Decision**：

- `rank()` 回**達門檻**的候選，依分數遞減；回幾筆由 engine 決定，後端目前只用第一筆。
- `score()` 不套門檻，給確認後寫配對卡時算 evidence。
- `Match = (candidate_uuid, similarity ∈ [0,1], evidence: JSON)`。
- `evidence` 不得含快照文字欄位的原文（ADR-295 的連帶要求）。

➕ 將來要提示多筆、換分數明細結構都不必改合約。

---

### ADR-292 檢索半徑由 engine 宣告；後端硬上限 1000 m

> **被 ADR-304 取代（2026-09-29）**：半徑歸 engine 自己的查詢；後端改以逾時保護。

**白話**：撈多遠的候選由 engine 說了算，後端不再用公式反推；後端只保留一個防呆上限。

**Context**：Spec 019 的 `_retrieval_radius_m` 呼叫 `max_hint_distance_m`，
是用「指數衰減＋加權平均」這組公式解出來的。Chi 一換公式形式，半徑就算錯，候選會被靜默漏掉。

**Decision**：engine 實作 `retrieval(kind) -> RetrievalSpec(radius_m)`，並保證半徑外的候選不可能達門檻。
後端以 `MAX_CANDIDATE_RADIUS_M = 1000`（公尺）截斷，超過時記 warning。
`RetrievalSpec` 日後可加有預設值的欄位（例：`max_age`）。

➕ 公式怎麼改，半徑都跟著正確。
◾ 1000 m 沿用 Spec 019 的值，2026-09-28 決定維持。

---

### ADR-293 電話以 pair 層級布林 `same_contact_phone` 送入，不雜湊、不進快照

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
➕ 與 `distance_m` 同一類（兩筆之間的關係事實），不違反 ADR-289。
➖ 模糊比對（例如只比後 8 碼）要後端改，依 ADR-289 第 4 點以新增欄位處理。

**否決 HMAC**：成本真實（金鑰管理），防護很薄。
**否決 SHA**：可被暴力還原，等同把電話放進快照與 log。

---

### ADR-294 資料表：`score_components` 改為不透明 `evidence`；新增 `engine_version`；新增 `hint_shown` 事件

**白話**：資料表不再綁定現行公式的分數結構，並記錄每筆判斷是哪一版引擎做的。

**Context**：Spec 019 的 migration `d4c8b1e07a92` 尚未合併，現在改成本最低。

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
  要靠這筆事件才量得到接受率。取代 Spec 019 以 mutation 主動回報的 `accepted_hint`。

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

**白話**：第一次送出如果疑似重複，就不建單，回傳疑似重複的那一筆；使用者確認後再送一次才建單。

**Context**：ADR-286 拿掉了獨立 API，「建單前提示使用者」要改由建單流程本身帶出。考慮過三種：

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
- **Changelog**：`app/dedup_engine/CHANGELOG.md`，每版記錄改了什麼、參數表、回測結果（資料集名稱與指標）。
- **Golden test**：固定輸入 → 輸出存成 golden file，檔案內記錄產生時的版本號。
  輸出變了但 `version` 沒變 → 失敗；升版時重新產生。
- 第一版：搬進 core 並改用 Python 文字相似度（ADR-288）之後的版本定為 `fast-v1`。

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

Chi 在 2026-09-29 把 Spec 019 的比對單位從工單改成任務（commit `0d186dedb`、`cf0e51c3e`、`7e28d72e3`，
已合進本分支）。以下 ADR 把任務層級接到 Spec 020 的架構上。ADR-296 的「以工單為單位的 createTicket 兩段式」
被 ADR-301／302 取代；ADR-289 的 `TicketSnapshot` 被 ADR-300 的 `TaskSnapshot` 取代。

---

### ADR-300 求助單這邊的比對單位是任務；快照改為 `TaskSnapshot`

> **被 ADR-304 取代（2026-09-29）**：比對單位由 engine 決定；不再有 `TaskSnapshot`。

**白話**：比的不是「這張單像不像那張單」，而是「這個任務像不像附近另一個還開著的任務」。

**Context**：019 的三個決定（Chi 註明「user 定案」）：每個任務寫入前都比對；每個任務最多一個提示；
替既有的單加任務時排除同一張單自己的任務。候選是「還開著」的任務：任務 status 不是 `fulfilled`／`canceled`、
未軟刪，所屬工單未軟刪、不是 `cancelled`（`completed` 的單仍算，它可以再加任務）。

**Decision**：

- contract 以 `TaskSnapshot` 取代 `TicketSnapshot`，`SNAPSHOT_SCHEMA_VERSION` 升為 2（改名＝破壞性，依 ADR-289 第 4 點）。
  欄位：`uuid`、`ticket_uuid`、`location`（所屬工單的點）、`created_at`、`task_type`、`task_name`、`task_description`、
  `quantity`、`status`。`EntityKind` 改為 `"ticket_task" | "station"`。
- engine 的文字訊號比 `task_name + task_description`，類別比 `task_type`，距離是兩個任務所屬工單之間。
- repository 的候選條件照 019；新增「排除某張工單的任務」參數。
- `same_contact_phone` 比的是兩個任務**所屬工單**的電話（ADR-293 不變）。
- 分數行為改變（單位、文字欄位都換了），engine 升為 **`fast-v2`**，重產 golden，寫 CHANGELOG。

➖ 工單本身不再去重：兩張單的任務都不像，就不會提示。這是 019 的產品決定，照做。

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
候選排除同一張工單自己的任務（019 決定 3）。流程與 ADR-301 相同。

---

### ADR-303 `accepted_hint` 仍由第二段推得，以任務計

**Decision**：每個命中的草稿任務在第一段各寫一筆 `hint_shown`（`primary_uuid` = 被比中的任務）。第二段該任務帶著
確認送出 → `ignored_by_submitter`；沒有再出現 → 視為接受提示（去看舊單）。沿用 ADR-296 的推得方式，不另開 API。

---

### ADR-304 撈資料也歸 engine：後端只送「送出的東西」，engine 自己組候選、自己決定比什麼

**白話**：Chi 可以自己寫查詢、自己組資料，要比工單、比任務、比什麼都行。後端只管什麼時候問、問完怎麼記。

**Context**：ADR-287 的接縫只隔離了「怎麼算分數」；「比什麼」（快照型別、repository 撈哪張表、比對單位）寫死在後端。
2026-09-29 Chi 把比對單位從工單改成任務（ADR-300），後端的 contract、builder、repository、API 都得跟著改。
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
- **逾時取代半徑上限**：後端以 `asyncio.wait_for` 包住 `check`（預設 2 秒），逾時＝fail-open。ADR-292 的 1000 m 上限改由 engine 自律（contract test 驗效能）。
- **確認（acknowledgement）**：每個草稿（工單、每個任務、站點）可帶 `acknowledgedDuplicateOf`；已確認的草稿，其疑似重複由後端濾掉，不再回報（避免迴圈），並在建立後寫配對卡（用 `engine.score` 算 evidence）。
- **配對卡**：`entity_kind` 取 `related_kind`；送出方是對應 `draft_ref` 建出來的那筆，兩邊同種類。
- **比對單位由 engine 決定**：比工單就回 `draft_ref="ticket"`，比任務就回 `"task:i"`，兩種都比就都回。後端不需要知道。

**被取代**：ADR-287 的「core 不做 I/O」（engine 可唯讀查 DB）、ADR-288（文字比對方法歸 engine，用 pg_trgm 或 Python 都行）、
ADR-289 的快照型別（改為送出草稿；「白名單、只加不改」原則保留給草稿）、ADR-292 的半徑上限（改逾時）、
ADR-293（電話怎麼比歸 engine；草稿帶正規化後的 `contact_phone`）、ADR-298（站點位置的算法歸 engine）、ADR-300 的 `TaskSnapshot`。
ADR-301／302 的 API 保留，但回傳的疑似重複改為通用形狀（見 spec §5）。

➕ 比對單位、候選條件、文字方法以後都只動 `app/dedup_engine/`。
➕ Chi 可以直接沿用 019 的查詢寫法，不必把資料塞進後端定義的快照。
➖ engine 能讀 DB：離線 harness 需要一個 DB（或 Chi 自己的替身），golden test 改為在測試 DB 上跑。
➖ 送出的草稿含正規化後的電話（engine 本來就能讀 DB 裡的電話，隔離已無意義）。
