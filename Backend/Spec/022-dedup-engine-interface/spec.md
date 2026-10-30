# Design: 去重引擎介面 — Dedup Engine Interface

**Date**: 2026-09-28（2026-09-29 改寫：engine 自己撈資料，ADR-304；同日補 ADR-305~307）
**Feature**: 022-dedup-engine-interface
**Status**：已實作，在 PR #73 審查中。待辦：Chi 補版本紀錄的驗證數字（§11）。
**Depends on**: `Spec/021-dedup-fast-layer/spec.md`（PR #46 / #59，未合併）
**Stacked on**: `feat/dedup-station-fast-layer`（#59，已合進 `3f97468f8`，含 main 的站點指派 #58）→ `feat/dedup-fast-layer`（#46）→ `main`
**Decisions**: `decisions.md`（ADR-295~299、301~307、313~323；現行架構以 ADR-304 為準）

## 概述

Spec 021 交付了去重快層（2026-09-29 起比對單位是任務）。本功能由後端接手包裝，演算法由 Chi 持續迭代。

接縫的原則（ADR-304）：**凡是 Chi 可能會改的，都歸 `app/dedup_engine/`**——撈哪些候選、比對單位（工單、任務、或兩者）、
訊號、分數、門檻。後端只管不會隨演算法改變的部分：**什麼時候問、送什麼、問完怎麼記**。

- Chi 改比對單位、候選條件、文字方法、公式、參數 → 只動 `app/dedup_engine/`。
- 後端改權限、API、資料表、呼叫端 → 不影響演算法。
- 去重是內部能力，由建立流程呼叫，不開獨立 API（ADR-314）。

## 目標

- engine 只依賴 `contract.py` 的輸入輸出型別，後端只依賴 `DedupEngine` Protocol。
- 比對單位的改變不需要改後端（本次的教訓，ADR-304）。
- 每筆判斷記錄 engine 版本；改分數行為卻沒升版時 CI 失敗（ADR-297）。
- 建立與記錄在同一個 transaction；去重出錯或逾時不擋建立。

## 非目標

- **不改演算法本身。** Phase 2 的 fast-v2 只做 021 已定的任務層級。
- **不做慢層**（背景掃描、向量、admin 審核）。admin 審核清單、判定與撤銷後來由 `Spec/025-dedup-review-queue/` 交付（ADR-336～345）。
- **不存重播用的輸入**（ADR-295）。
- **不管批次匯入的流程**：它也跑快層（預覽列出疑似重複、送出逐列確認），寫在 `Spec/015` 的 ADR-398；
  ADR-299 原本的「批次匯入不去重」被它取代。
- **不處理前端**：交接說明見 plan「交給前端的 API 變更」。

---

## 1. 分工（ADR-304）

| 層 | 位置 | 擁有者 | 職責 | 不做的事 |
|---|---|---|---|---|
| engine | `app/dedup_engine/`（`registry.py` 除外） | Chi | 候選查詢（唯讀）、比對單位、訊號、分數、門檻、`evidence`；演算法測試、golden、版本紀錄（§11） | 不寫 DB、不 commit；不 import `app.services`／`app.graphql`／`app.api` |
| registry | `app/dedup_engine/registry.py` | 後端 | 線上用哪個 engine（ADR-306） | Chi 可新增 engine class，不切換上線 |
| 守門測試 | `tests/dedup_engine/test_contract.py`、`test_core_isolation.py`、`test_candidates.py` 的 index 測試 | 後端（Chi 可改） | 合約、隔離、唯讀、效能、index（ADR-306） | Chi 改動需後端 review |
| contract | `app/dedup_engine/contract.py` | 雙方 | 草稿與 `Submission`、`Suspect`、`DedupEngine` Protocol | 改動需雙方同意 |
| service | `app/services/dedup.py` | 後端 | 呼叫 engine（SAVEPOINT＋rollback、逾時、fail-open）、寫 `hint_shown`／配對卡／audit；`ENGINE_TIMEOUT_S` 與效能門檻由後端拍板、Chi 提意見（ADR-306） | 不含任何比對邏輯 |
| 編排 | `app/services/dedup_submission.py` | 後端 | 三個觸發點的兩段式（§5），只給 GraphQL 用 | 批次匯入不經過這裡，走 `app/services/bulk_dedup.py`（ADR-398） |
| model／schema | `app/models/`、`alembic/versions/` | 後端 | `duplicate_pairs`、`dedup_audit_events`，以及候選查詢要用的 index（ADR-305） | engine 不改 model、migration、index |

**觸發點固定三個**：新開單（工單連同任務）、替既有的單加任務、登記站點。所有會被去重的東西都經過其中之一，
所以觸發時機不隨演算法改變。

| 觸發點 | GraphQL 入口 | 誰在用 |
|---|---|---|
| 新開單 | `createTicket`（§5.1） | 管理平台 |
| 新開單 | `createHelpRequest`（§5.1，ADR-397） | 前台「請求協助」 |
| 替既有的單加任務 | `createTicketTask`（§5.2） | 前台「再加一件」、管理平台 |
| 登記站點 | `createStation`（§5.3） | 前台、管理平台 |

---

## 2. 輸入：送出的草稿（ADR-304，沿用 ADR-317 的白名單與只加不改）

後端送進 engine 的是**驗證過的送出內容**，不是快照；候選由 engine 自己查。

```python
# app/dedup_engine/contract.py
CONTRACT_VERSION = 2

@dataclass(frozen=True)
class GeoPoint:
    lon: float
    lat: float

@dataclass(frozen=True)
class TicketDraft:
    location: GeoPoint
    title: str
    description: str | None = None
    task_type: str | None = None
    priority: str | None = None
    disaster_types: tuple[str, ...] = ()
    person_trapped_reported: str | None = None
    immediate_danger_reported: str | None = None
    contact_phone: str | None = None      # E.164 正規化後；engine 自己決定怎麼比

@dataclass(frozen=True)
class TaskDraft:
    task_type: str
    task_name: str
    task_description: str | None = None
    quantity: int | None = None

@dataclass(frozen=True)
class StationDraft:
    location: GeoPoint
    name: str | None = None
    description: str | None = None
    type: str | None = None
    operational_status: str | None = None
    op_hour: str | None = None
    level: int = 0
    source: str | None = None
    contact_phone: str | None = None

@dataclass(frozen=True)
class NewTicket:                           # 新開單
    ticket: TicketDraft
    tasks: tuple[TaskDraft, ...] = ()

@dataclass(frozen=True)
class NewTask:                             # 替既有的單加任務
    ticket_uuid: str
    task: TaskDraft

@dataclass(frozen=True)
class NewStation:
    station: StationDraft

Submission = NewTicket | NewTask | NewStation
```

- 草稿欄位是白名單：不含 `contact_name`、`contact_email`、`review_note`。新增欄位一律給預設值；
  改名、刪欄位、改語意要遞增 `CONTRACT_VERSION` 並雙方同意。
- `draft_ref` 的寫法：`NewTicket` 的工單是 `"ticket"`、第 i 個任務是 `"task:i"`；`NewTask` 的任務是 `"task:0"`；站點是 `"station"`。

---

## 3. 輸出：疑似重複

```python
@dataclass(frozen=True)
class Suspect:
    draft_ref: str                         # 送出的哪一部分
    related_kind: str                      # "ticket"｜"ticket_task"｜"station"，須與 draft_ref 同種類
    related_uuid: str
    related_ticket_uuid: str | None        # 對到任務時，它所屬的工單（給前端顯示）
    similarity: float                      # 0–1
    evidence: Mapping[str, Any]            # 不透明、可 JSON 序列化、不含送出的文字原文
```

- 每個 `draft_ref` 最多一個 `Suspect`（021 決定 2）。回幾個、比哪一層，都是 engine 的事。
- 後端只讀 `draft_ref`、`related_*`、`similarity`；`evidence` 只存不讀（ADR-319）。

---

## 4. Engine 介面（ADR-318、297、304）

```python
class DedupEngine(Protocol):
    version: str                           # "fast-v2"…

    async def check(self, db: AsyncSession, submission: Submission, now: datetime) -> Sequence[Suspect]: ...

    async def score(self, db: AsyncSession, submission: Submission, draft_ref: str,
                    related_kind: str, related_uuid: str, now: datetime) -> Suspect | None: ...
```

- `check`：第一段用。回傳疑似重複，沒有就是空序列。
- `score`：使用者確認「不是重複」後建立時，替那一對算 evidence；找不到對方回 None。**後端從 ADR-400 起不再呼叫**：
  確認只認 `check` 給那個草稿的那一筆，分數直接用 `check` 的。留在 contract 裡，要不要拿掉另議。
- `now` 由後端傳入（ADR-318）。
- engine 可以用 `db` 做任何**唯讀**查詢；不得寫入、flush、commit。
- 版本號、版本紀錄（§11）、golden test 沿用 ADR-297；golden 改在測試 DB 上以固定資料執行。

### 後端怎麼呼叫（保護措施）

1. 在 SAVEPOINT 內呼叫，結束後一律 rollback 該 SAVEPOINT（engine 就算誤寫也不會留下）；呼叫後若 `pg_current_xact_id_if_assigned()` 從無變有（表示 engine 寫過），記 error 並當作沒有疑似重複。
2. `asyncio.wait_for(..., ENGINE_TIMEOUT_S)`（2 秒，ADR-307）；逾時或任何例外 → 記 log、當作沒有疑似重複（fail-open）、reload actor。
3. 丟掉 `related_kind` 與 `draft_ref` 種類不符的結果（記 warning），避免寫出錯誤的配對卡。
4. 丟掉確認成立的草稿上的結果（ADR-296：確認後不再提示）。確認成立＝`acknowledgedDuplicateOf` 正是 `check`
   給那個草稿的那一筆（ADR-400）；指別筆、不存在、不是 uuid 都當成沒帶。
5. 每份送出只問一次 `check`（不排除任何草稿），成立的確認和還要擋的都從這一次的答案來（ADR-400）。跟其他呼叫一樣在
   **建立任何東西之前**、走 1、2 兩項（ADR-313）：逾時可能在查詢中途切斷連線，這時要整個 transaction rollback，只有
   還沒寫入時這麼做才不會弄丟新單。
6. 問 engine 之前，先依送出位置鎖住所在區域（h3 第 8 級格子加周圍一圈），同一區域的送出排隊，後面那筆才查得到前面那筆（ADR-396）。
   四個進入點都要鎖，包含前台的請求協助（ADR-433）。站點與工單用不同的 key，彼此不排隊（ADR-436）。
   全部 key 合計最多等 `AREA_LOCK_TIMEOUT_MS`（500 ms，ADR-434），等不到就不帶鎖照常往下走（fail-open），log 只寫約 250 m 的位置（ADR-435）。
   engine 的半徑不能超過 `AREA_LOCK_MAX_RADIUS_M`（500 m），由守門測試把關。

---

## 5. 呼叫端流程：兩段式（ADR-296、299、301~304）

**原則**：第一段有疑似重複 → 回報「已經存在的是哪些」，**什麼都不建立**；使用者修改後再送，或確認不是重複後帶著確認再送。
沒有疑似重複 → 第一段就建立。

```graphql
type DuplicatesSuspected { suspects: [DuplicateSuspect!]! }
type DuplicateSuspect {
  draftRef: String!          # "task:0"…｜"station"
  relatedKind: String!       # "ticket_task"｜"station"
  relatedUuid: String!
  relatedTicketUuid: String  # 對到任務時它所屬的工單
}
```

### 5.1 新開單

```graphql
input CreateTicketTaskDraft {
  taskType: String!  taskName: String!  taskDescription: String  quantity: Int
  source: String = "user"  routeUuid: UUID
  acknowledgedDuplicateOf: String = null
}
# CreateTicketInput 新增：tasks: [CreateTicketTaskDraft!]! = []

union CreateTicketResult = TicketCreated | DuplicatesSuspected
type TicketCreated { ticket: TicketType!  tasks: [TicketTaskType!]! }
```

1. 權限、工單與每個任務草稿的輸入驗證（失敗就在比對前結束，不透露任何疑似重複）。
2. 有草稿帶確認時，先問一次 `engine.check(NewTicket(...))`（§4 第 5 項），看哪些確認成立（ADR-400）。
3. `engine.check(NewTicket(...))`，依 §4 的保護措施，丟掉確認成立的草稿。有疑似重複：每個寫一筆 `hint_shown`，
   回 `DuplicatesSuspected`，**工單與任務都不建**。
4. 沒有：工單＋所有任務同一個 transaction 建立，確認成立的草稿寫 `dup_ignored` 配對卡＋`ignored_by_submitter`，
   分數用第 2 步那次比對的（ADR-313、400）：
   - 確認的值不是 uuid、或指的不是那一筆：當成沒帶確認，第 3 步照樣會擋。
   - 第 2 步的 `check` 失敗（例外、逾時、偷寫）：沒有比對可依；後端自己查對方存在才寫卡，分數為 null，不存在就不寫。
   - uuid 一律轉成 Postgres 的寫法（小寫、有連字號）再用，配對卡的 `low_uuid < high_uuid` 才會跟資料庫一致。

前台的請求協助 `createHelpRequest` 也是新開單，流程同上（ADR-397）：回 `CreateTicketResult`，每件需求
（`HelpRequestTaskInput`）各自可帶 `acknowledgedDuplicateOf`，`draftRef` 的 `task:i` 是第 i 件需求。
民眾那邊的檢查（需求件數、照片連結等，`validate_help_request`）在第 1 步，所以被擋時單、地址、需求、照片都不寫。

### 5.2 替既有的單加任務

`createTicketTask(input, acknowledgedDuplicateOf: String = null): CreateTicketTaskResult!`，
回 `TicketTaskCreated { task }` 或 `DuplicatesSuspected`。送 `NewTask(ticket_uuid, task)`；要不要排除同一張單的任務由 engine 決定（021 決定 3 在 fast-v2 內實作）。

### 5.3 登記站點

`createStation(input, acknowledgedDuplicateOf)` 回 `StationCreated` 或 `DuplicatesSuspected`（Phase 1 的 `DuplicateStationSuspected` 併入通用型別）。

### 5.4 使用者的選擇怎麼記（ADR-303）

- 照樣建立：第二段帶確認 → `ignored_by_submitter`＋`dup_ignored` 配對卡。
- 去看舊的（放棄某個任務或整筆）：前端不再送它，後端停在 `hint_shown`，由此推得接受。

---

## 6. Schema（ADR-322，Phase 1 已完成）

| 表 / 常數 | 內容 |
|---|---|
| `duplicate_pairs.evidence` | engine 的 evidence（JSONB） |
| `duplicate_pairs.engine_version` | CHECK `method = 'manual' OR engine_version IS NOT NULL` |
| `dedup_audit_events.engine_version`、`evidence` | 後端外層 `{"similarity", "engine"}` |
| `AUDIT_EVENT_TYPES` | 含 `hint_shown` |

| `base_geometries` 的 GIST index | `(geometry::geography)` 給任務候選、`(ST_Centroid(geometry)::geography)` 給站點候選（ADR-305）；查詢必須 cast 成不帶 typmod 的 `geography` 才對得上 |

配對卡與事件的 `entity_kind` 取 `related_kind`（`ticket`／`ticket_task`／`station`，CHECK 本來就都含）。
不需要新 migration：centroid index 加在 #46 的 `d4c8b1e07a92`（ADR-305）。

---

## 7. 逐檔改動（Phase 2）

| 檔案 | 改動 |
|---|---|
| `app/dedup_engine/contract.py` | 改為 §2~§4 的草稿、`Submission`、`Suspect`、async `DedupEngine` |
| `app/dedup_engine/fast.py`、`candidates.py`（新） | fast-v2：任務層級候選查詢（由 021／`app/repositories/dedup_repository.py` 移入）、站點候選、計分；版本紀錄、golden |
| `app/repositories/dedup_repository.py` | 候選查詢移出；只留配對卡與 audit 的 repository |
| `app/services/dedup_snapshot.py` | 改為「驗證過的 input → 草稿」；不再建候選 |
| `app/services/dedup.py` | 保護措施（SAVEPOINT、逾時、種類檢查、確認過濾）＋寫入 |
| `app/services/ticket.py` | 任務的 `validate_*`／`insert_*`；`create_ticket_task` 行為不變 |
| `app/services/dedup_submission.py` | `submit_ticket`（帶任務）、`submit_ticket_task`、`submit_station` 改走 `check` |
| `app/graphql/tickets/`、`geo/` | `CreateTicketTaskDraft`、`CreateTicketInput.tasks`、通用 `DuplicatesSuspected`、`createTicketTask` union |

---

## 8. 測試計畫

### Contract test（後端擁有；任何 engine 都要通過）

1. `similarity ∈ [0,1]`；每個 `draft_ref` 最多一個 `Suspect`；`related_kind` 與 `draft_ref` 同種類。
2. 同輸入（含 DB 資料與 `now`）→ 同輸出。
3. DB 無候選 → `check` 回空。
4. **唯讀**：呼叫前後 `pg_current_xact_id_if_assigned()` 都是 NULL（Postgres 只在第一次寫入時配 transaction id，能抓到被 autoflush 寫出、之後又被 rollback 的寫入）；session 無 new／dirty／deleted；SAVEPOINT rollback 後各表筆數不變。
5. `evidence` 可 `json.dumps`，不含送出的文字原文。
6. 草稿選填欄位全空不拋錯。
7. 效能（ADR-307）：全表 20,000 筆開著的任務、半徑內 500 筆，送出帶 5 個任務的新開單，`check` 三次取最快 < 200 ms。
8. `version` 格式；golden：固定 DB 資料的輸出與 golden 一致且版本相符。

### 後端整合測試

- 保護措施：逾時、例外、engine 誤寫（以會寫入的 stub 驗證被 rollback）、種類不符的結果被丟棄，都 fail-open 且照常建立。
- 兩段式：多任務中任一疑似重複整筆不建、每個一筆 `hint_shown`；確認綁在草稿上（刪除或重排仍正確）；atomic；無權限在比對前失敗。
- fast-v2 行為（Chi 的決定 1~3）：completed 工單的開著任務仍是候選、cancelled 工單的不是；替既有的單加任務時排除同單任務。
- 候選查詢用得到空間 index：抓下實際送出的 SQL，關掉 seqscan 後 EXPLAIN 必須出現對應的 index（ADR-305）。

---

## 9. 延後討論

- ~~contract test 的效能門檻與 `ENGINE_TIMEOUT_S`~~：已依實測定案（ADR-307）；Chi 在 Task 0 仍可提意見。
- **離線 harness**：engine 需要 DB 後，Chi 的離線回測要有對應的資料庫或替身，由 Chi 決定。
- ~~任務的 visibility~~：`visibility` 已在 #84 移除，這條不再適用。
- ~~同時送出可能漏提示~~：PR #132 回報，已改由後端依地點排隊（ADR-396）。

---

## 10. 演進紀錄

- **Phase 1（2026-09-28，Task 1~14）**：以工單為單位；後端送快照（`TicketSnapshot`）、後端撈候選、engine 為純函式。已實作、Docker 驗證通過。
- **ADR-323、301~303（2026-09-29）**：Chi 把單位改成任務；原計畫把後端的快照與 repository 改成任務層級。
- **ADR-304（2026-09-29）**：為避免每次改單位都要改後端，候選查詢與比對單位整個歸 engine；本文件以此為準。
- **ADR-305（2026-09-29，Task 24 Docker 驗證）**：發現候選查詢從未用到空間 index（cast 的 typmod 對不上、站點無 centroid index），在本票修正。
- **ADR-306／307（2026-09-29）**：`app/dedup_engine/` 裡歸後端的部分（registry、守門測試、時限）；依延遲實測定效能門檻、逾時維持 2 秒。
- **ADR-313（2026-10-13，PR #73 審查）**：`engine.score` 補上跟 `check` 一樣的保護並移到建立之前；score 失敗時後端自己確認對方存在才寫卡；確認的 uuid 先正規化。
- **Spec 改號（2026-10-14）**：本 Spec 由 020 改為 022、Chi 的快層由 019 改為 021，避開 Dennis 的 `019-role-requests`、`020-volunteer-claim`。
- **ADR-396（2026-10-27，PR #132 回報）**：同一區域幾乎同時送出時兩筆都會建立且不提示；改為查詢前依地點取 advisory lock，最多等 500 ms，等不到照常建立。
- **ADR-400（2026-10-27，#142／#148 審查）**：確認只認 `check` 給那個草稿的那一筆，後端不再呼叫 `engine.score`；所有入口與批次匯入同一條規則。
- **ADR-433~436（2026-10-29，PR #140 review）**：請求協助也鎖；500 ms 改成合計期限；log 位置四捨五入到約 250 m；站點與工單分開排隊。

---

## 11. Engine 版本紀錄

升版規則見 ADR-297：同樣的輸入（DB 內容＋送出的東西＋`now`）會得到不同的 `check`／`score` 結果，就升 `version`、
在這裡記一版、重新產生 golden 檔（`DEDUP_REGEN_GOLDEN=1 uv run pytest tests/dedup_engine/test_golden.py`；
結果變了但版本沒升，重產會被拒絕）。只改註解、重構或加速而輸出不變，不升版。每版記：改了什麼、參數、回測結果。

### 現行參數（fast-v3 起沒變）

| 參數 | 任務 | 站點 | 來源 |
|---|---|---|---|
| `distance_half_m` | 200 | 200 | 13 筆手寫案例 grid search 第一名 |
| `time_half_min` | 360 | 360 | 同上 |
| `distance_weight` | 2.0 | 2.0 | 同上 |
| `time_weight` | 0.5 | **0.0** | 同上；站點的年齡跟重不重複無關 |
| `task_type_weight` | 0.5 | 0.5 | 同上 |
| `text_weight` | 1.0 | 1.0 | 判斷值，沒跑過 grid |
| `hint_threshold` | 0.8 | 0.8 | grid search 第一名 |
| `component_baseline` | 0.5 | 0.5 | 判斷值，只影響每個成分的 `passed` 燈號 |
| `phone_bonus` | **0.10** | **0.0** | fast-v3 的回測；站點沒研究過 |
| 檢索半徑 | 290.8 m | 136.7 m | 由 `hint_threshold − phone_bonus` 反解，× 1.1 |

5-fold 參數掃描沒有推翻這組值；它們仍是暫定值，不是建議值。

### 回測資料（每版共用）

2025 光復舊平台 `human_resources` 備份（2026-02-08）：355 筆乾淨紀錄，其中 292 筆座標可信。每筆當成一張只有一個任務的單
（角色名稱當 `task_name`、備註當 `task_description`），拿去跟所有更早的紀錄比，共 42,486 對。人工裁決 100 對
（80 對來自早期提示、20 對來自漏抓抽樣），2026-10-03 重新標註：54 對重複、46 對不同。只算送單者看得到的第一名提示。
重跑用 `tools/dedup_eval/`；資料不進 repo。

讀數字時要注意：

1. **recall 天生偏低**：54 對重複裡有 45 對，舊紀錄在新紀錄進來前就已完成（舊平台人滿就關單）。線上只比還開著的任務，
   本來就不該提示這些。真正測到漏抓的只有 9 對，0.80 時提示了 4 對，只能看方向。
2. **提示率高估線上**：沒有只挑舊紀錄仍開著的配對；只算那些，提示率是 8/292（fast-v2）。
3. **一單一任務**：多任務的單、替既有的單加任務，這份資料都沒測到。
4. **座標是事後用原始地址 Google 定位**（只收 rooftop 或 range-interpolated），不是使用者點的位置；
   標註的配對偏向距離、時間都近。所以檢索半徑和 `distance_half_m` 不靠這份資料調。
5. **標註問的是「是不是同一個需求」**，不管舊紀錄狀態；配對來自提示與可疑抽樣，數字不是母體比例。

### fast-v4（2026-10-13）

**第一個上線版本。** 電話加分（+0.10）已在團隊會議報告並同意，不再待確認。

1. **後端 E.164 parser 不收的電話當作沒填。** fast-v3 會退回比純數字，兩張都填 `0000000000` 之類假號碼的單會拿到加分。
   只有「替既有的單加任務」會遇到：新單的電話進 engine 前已是 E.164 或被丟掉，但既有單的 `contact_phone` 照使用者輸入存。
   實測：A、B 兩單相距 200 m、都填 `0000000000`，在 B 加跟 A 一樣的抽水任務，fast-v3 0.8499 被擋，fast-v4 0.7499 直接建立。
2. **`score` 遇到工單層級的確認（`draft_ref="ticket"`）回 `None`**，照 contract。fast-v3 丟 `ValueError`（後端有接住，但每次記 error）。
3. **每個候選的電話在一次 `check` 只 parse 一次**（輸出不變）。密集區 benchmark（舊半徑內約 2000 個候選、5 個任務）
   fast-v3 的 p50 是 834 ms，約一半花在重複 parse 電話。

參數沒變，回測沒重跑。下次重跑注意：fast-v3 的回測比的是純數字，線上比 E.164（`+886912345678` 和 `0912-345-678` 線上算同號），
所以線上加分率可能略高於 30/292；舊資料裡有沒有假號碼還沒查。golden 已重產，fast-v3 的案例結果都不變。

### fast-v3（2026-10-05）

1. **同一支聯絡電話 +0.10**（`phone_bonus`）：兩邊所屬的單都有電話且相同時，similarity = `min(1, 加權平均 + 0.10)`；
   不同或沒填不扣分。加在挑第一名、比門檻之前，`score` 也加。evidence 多一個 `phone` 成分（score 1.0、weight＝加分），不含號碼。
2. **電話來源**：新單用草稿的 `contact_phone`；加任務用既有單的；候選用它所屬單的。
3. **站點不加分**：只研究過工單。
4. **檢索半徑變大**：加分後較遠的候選也可能過門檻，所以改用 `hint_threshold − phone_bonus` 反解，任務 162.1 m → 290.8 m。

「同一個建立者」加分延後：要改 contract 和後端，舊資料也沒有 operator id 可驗證。

回測（5-fold，電話只比數字）：

| 門檻 | precision | recall | 提示率 | 舊紀錄仍開著的提示率 |
|---|---|---|---|---|
| **0.80** | 16/19 | 16/54 | 30/292 | 13/292 |
| fast-v2，0.80 | 9/10 | 9/54 | 16/292 | 8/292 |

多抓到重複，precision 略降。

### fast-v2（2026-09-29）

比對單位改成任務（ADR-323），候選查詢移進 engine（ADR-304）。

1. 每個任務草稿跟附近開著的任務比，最多一個疑似重複；工單本身不比。候選：任務未完成、未取消、未刪除，
   所屬的單未刪除、未取消（已完成的單仍算）。
2. 訊號讀任務欄位：兩任務所屬單的距離、候選任務的年齡、`task_type`、`task_name`＋`task_description` 的 trigram（截 200／2000 字）。
3. 替既有的單加任務：從那張單的位置搜尋，跳過它自己的任務。

公式、參數、檢索半徑同 fast-v1。golden 改成在測試 DB 上用固定資料跑（`tests/dedup_engine/golden.py`）。

回測：

| 門檻 | precision | recall | 提示率 |
|---|---|---|---|
| **0.80（上線）** | 9/10 | 9/54 | 16/292 |
| 0.70 | 19/27 | 19/54 | 46/292 |
| 0.65 | 25/40 | 25/54 | 70/292 |

### fast-v1（2026-09-28）

Spec 021 的快層搬到本 spec 的 contract 後面，公式不變（4 萬組隨機訊號，021 的 `score_candidate` 和 fast-v1 的 `combine` 算出來完全相同）。
跟 021 的差別：

1. 文字相似度改在 Python 算（ADR-316），`tests/test_dedup_trgm_parity.py` 驗證跟 DB 的 `similarity()` 相同。
2. 候選的文字也截短（標題 200、描述 2000 字）；021 只截送出的那一邊。
3. 有 `same_contact_phone` 但不使用。

任務檢索半徑 162.1 m、站點 136.7 m。這份資料每張單只有一個任務，所以 fast-v1 和 fast-v2 的分數完全相同，回測同 fast-v2。
PR #46 較早的數字（0.80 時 8 個提示對 7 個、26 對重複抓到 7 對）用的是重新標註前的標籤，已作廢。
