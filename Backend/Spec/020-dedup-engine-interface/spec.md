# Design: 去重引擎介面 — Dedup Engine Interface

**Date**: 2026-09-28（2026-09-29 改寫：engine 自己撈資料，ADR-304）
**Feature**: 020-dedup-engine-interface
**Status**: Phase 1（Task 1~14）已實作並通過 Docker 驗證，但接縫只到「怎麼算分數」。本文件描述 ADR-304 的目標架構，
由 plan Phase 2 實作；Phase 1 的程式在 Phase 2 期間逐步改寫。§4 介面仍待與 Chi 確認（plan Task 0）。
**Depends on**: `Spec/019-dedup-fast-layer/spec.md`（PR #46 / #59，未合併）
**Stacked on**: `feat/dedup-station-fast-layer`（#59，已合進 `3f97468f8`，含 main 的站點指派 #58）→ `feat/dedup-fast-layer`（#46）→ `main`
**Decisions**: `decisions.md`（ADR-286~305；現行架構以 ADR-304 為準）

## 概述

Spec 019 交付了去重快層（2026-09-29 起比對單位是任務）。本功能由後端接手包裝，演算法由 Chi 持續迭代。

接縫的原則（ADR-304）：**凡是 Chi 可能會改的，都歸 `app/dedup_engine/`**——撈哪些候選、比對單位（工單、任務、或兩者）、
訊號、分數、門檻。後端只管不會隨演算法改變的部分：**什麼時候問、送什麼、問完怎麼記**。

- Chi 改比對單位、候選條件、文字方法、公式、參數 → 只動 `app/dedup_engine/`。
- 後端改權限、API、資料表、呼叫端 → 不影響演算法。
- 去重是內部能力，由建立流程呼叫，不開獨立 API（ADR-286）。

## 目標

- engine 只依賴 `contract.py` 的輸入輸出型別，後端只依賴 `DedupEngine` Protocol。
- 比對單位的改變不需要改後端（本次的教訓，ADR-304）。
- 每筆判斷記錄 engine 版本；改分數行為卻沒升版時 CI 失敗（ADR-297）。
- 建立與記錄在同一個 transaction；去重出錯或逾時不擋建立。

## 非目標

- **不改演算法本身。** Phase 2 的 fast-v2 只做 019 已定的任務層級。
- **不做慢層**（背景掃描、向量、admin 審核）。
- **不存重播用的輸入**（ADR-295）。
- **批次匯入不去重**（ADR-299）。
- **不處理前端**：交接說明見 plan「交給前端的 API 變更」。

---

## 1. 分工（ADR-304）

| 層 | 位置 | 擁有者 | 職責 | 不做的事 |
|---|---|---|---|---|
| engine | `app/dedup_engine/` | Chi | 候選查詢（唯讀）、比對單位、訊號、分數、門檻、`evidence` | 不寫 DB、不 commit；不 import `app.services`／`app.graphql`／`app.api` |
| contract | `app/dedup_engine/contract.py` | 雙方 | 草稿與 `Submission`、`Suspect`、`DedupEngine` Protocol | 改動需雙方同意 |
| service | `app/services/dedup.py` | 後端 | 呼叫 engine（SAVEPOINT＋rollback、逾時、fail-open）、寫 `hint_shown`／配對卡／audit | 不含任何比對邏輯 |
| 編排 | `app/services/dedup_submission.py` | 後端 | 三個觸發點的兩段式（§5），只給 GraphQL 用 | 批次匯入不經過這裡 |
| model | `app/models/dedup.py` | 後端 | `duplicate_pairs`、`dedup_audit_events` | — |

**觸發點固定三個**：新開單（工單連同任務）、替既有的單加任務、登記站點。所有會被去重的東西都經過其中之一，
所以觸發時機不隨演算法改變。

---

## 2. 輸入：送出的草稿（ADR-304，沿用 ADR-289 的白名單與只加不改）

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

- 草稿欄位是白名單：不含 `contact_name`、`contact_email`、`review_note`、`visibility`。新增欄位一律給預設值；
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

- 每個 `draft_ref` 最多一個 `Suspect`（019 決定 2）。回幾個、比哪一層，都是 engine 的事。
- 後端只讀 `draft_ref`、`related_*`、`similarity`；`evidence` 只存不讀（ADR-291）。

---

## 4. Engine 介面（ADR-290、297、304）

```python
class DedupEngine(Protocol):
    version: str                           # "fast-v2"…

    async def check(self, db: AsyncSession, submission: Submission, now: datetime) -> Sequence[Suspect]: ...

    async def score(self, db: AsyncSession, submission: Submission, draft_ref: str,
                    related_kind: str, related_uuid: str, now: datetime) -> Suspect | None: ...
```

- `check`：第一段用。回傳疑似重複，沒有就是空序列。
- `score`：使用者確認「不是重複」後建立時，替那一對算 evidence；找不到對方回 None。
- `now` 由後端傳入（ADR-290）。
- engine 可以用 `db` 做任何**唯讀**查詢；不得寫入、flush、commit。
- 版本號、CHANGELOG、golden test 沿用 ADR-297；golden 改在測試 DB 上以固定資料執行。

### 後端怎麼呼叫（保護措施）

1. 在 SAVEPOINT 內呼叫，結束後一律 rollback 該 SAVEPOINT（engine 就算誤寫也不會留下）；呼叫後若 `pg_current_xact_id_if_assigned()` 從無變有（表示 engine 寫過），記 error 並當作沒有疑似重複。
2. `asyncio.wait_for(..., ENGINE_TIMEOUT_S)`（預設 2 秒）；逾時或任何例外 → 記 log、當作沒有疑似重複（fail-open）、reload actor。
3. 丟掉 `related_kind` 與 `draft_ref` 種類不符的結果（記 warning），避免寫出錯誤的配對卡。
4. 丟掉已確認（帶 `acknowledgedDuplicateOf`）的草稿上的結果（ADR-296：確認後不再提示）。

---

## 5. 呼叫端流程：兩段式（ADR-296、299、301~304）

**原則**：第一段有疑似重複 → 回報「已經存在的是哪些」，**什麼都不建立**；使用者修改後再送，或確認不是重複後帶著確認再送。
沒有疑似重複 → 第一段就建立。

```graphql
type DuplicatesSuspected { suspects: [DuplicateSuspect!]! }
type DuplicateSuspect {
  draftRef: String!          # "ticket"｜"task:0"…｜"station"
  relatedKind: String!       # "ticket"｜"ticket_task"｜"station"
  relatedUuid: String!
  relatedTicketUuid: String  # 對到任務時它所屬的工單
}
```

### 5.1 新開單

```graphql
input CreateTicketTaskDraft {
  taskType: String!  taskName: String!  taskDescription: String  quantity: Int
  source: String = "user"  visibility: Visibility = public  routeUuid: String
  acknowledgedDuplicateOf: String = null
}
# CreateTicketInput 新增：tasks: [CreateTicketTaskDraft!]! = []、acknowledgedDuplicateOf: String = null（工單本身的確認）

union CreateTicketResult = TicketCreated | DuplicatesSuspected
type TicketCreated { ticket: TicketType!  tasks: [TicketTaskType!]! }
```

1. 權限、工單與每個任務草稿的輸入驗證（失敗就在比對前結束，不透露任何疑似重複）。
2. `engine.check(NewTicket(...))`，依 §4 的保護措施。
3. 有疑似重複：每個寫一筆 `hint_shown`，回 `DuplicatesSuspected`，**工單與任務都不建**。
4. 沒有：工單＋所有任務同一個 transaction 建立；帶確認的草稿，建好後各用 `engine.score` 寫 `dup_ignored` 配對卡＋`ignored_by_submitter`
   （對方找不到或已刪：照常建立、不寫卡；`score` 失敗：照常建立、卡的分數為 null）。

### 5.2 替既有的單加任務

`createTicketTask(input, acknowledgedDuplicateOf: String = null): CreateTicketTaskResult!`，
回 `TicketTaskCreated { task }` 或 `DuplicatesSuspected`。送 `NewTask(ticket_uuid, task)`；要不要排除同一張單的任務由 engine 決定（019 決定 3 在 fast-v2 內實作）。

### 5.3 登記站點

`createStation(input, acknowledgedDuplicateOf)` 回 `StationCreated` 或 `DuplicatesSuspected`（Phase 1 的 `DuplicateStationSuspected` 併入通用型別）。

### 5.4 使用者的選擇怎麼記（ADR-303）

- 照樣建立：第二段帶確認 → `ignored_by_submitter`＋`dup_ignored` 配對卡。
- 去看舊的（放棄某個任務或整筆）：前端不再送它，後端停在 `hint_shown`，由此推得接受。

---

## 6. Schema（ADR-294，Phase 1 已完成）

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
| `app/dedup_engine/fast.py`、`candidates.py`（新） | fast-v2：任務層級候選查詢（由 019／`app/repositories/dedup_repository.py` 移入）、站點候選、計分；CHANGELOG、golden |
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
7. 效能：在測試 DB 放 500 筆鄰近候選，`check` 在時限內（暫定 200 ms，待 Task 0）。
8. `version` 格式；golden：固定 DB 資料的輸出與 golden 一致且版本相符。

### 後端整合測試

- 保護措施：逾時、例外、engine 誤寫（以會寫入的 stub 驗證被 rollback）、種類不符的結果被丟棄，都 fail-open 且照常建立。
- 兩段式：多任務中任一疑似重複整筆不建、每個一筆 `hint_shown`；確認綁在草稿上（刪除或重排仍正確）；atomic；無權限在比對前失敗。
- fast-v2 行為（Chi 的決定 1~3）：completed 工單的開著任務仍是候選、cancelled 工單的不是；替既有的單加任務時排除同單任務。
- 候選查詢用得到空間 index：抓下實際送出的 SQL，關掉 seqscan 後 EXPLAIN 必須出現對應的 index（ADR-305）。

---

## 9. 延後討論

- **contract test 的效能門檻與 `ENGINE_TIMEOUT_S`**（Task 0 與 Chi 確認）。
- **離線 harness**：engine 需要 DB 後，Chi 的離線回測要有對應的資料庫或替身，由 Chi 決定。

---

## 10. 演進紀錄

- **Phase 1（2026-09-28，Task 1~14）**：以工單為單位；後端送快照（`TicketSnapshot`）、後端撈候選、engine 為純函式。已實作、Docker 驗證通過。
- **ADR-300~303（2026-09-29）**：Chi 把單位改成任務；原計畫把後端的快照與 repository 改成任務層級。
- **ADR-304（2026-09-29）**：為避免每次改單位都要改後端，候選查詢與比對單位整個歸 engine；本文件以此為準。
- **ADR-305（2026-09-29，Task 24 Docker 驗證）**：發現候選查詢從未用到空間 index（cast 的 typmod 對不上、站點無 centroid index），在本票修正。
