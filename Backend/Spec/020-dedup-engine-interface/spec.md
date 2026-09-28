# Design: 去重引擎介面 — Dedup Engine Interface

**Date**: 2026-09-28
**Feature**: 020-dedup-engine-interface
**Status**: Draft — 決策已定，待與演算法方（Chi）確認 §3、§4 欄位後實作
**Depends on**: `Spec/019-dedup-fast-layer/spec.md`（PR #46 / #59，未合併）
**Stacked on**: `feat/dedup-station-fast-layer`（#59）→ `feat/dedup-fast-layer`（#46）→ `main`
**Decisions**: `decisions.md`（ADR-286~299）

## 概述

Spec 019 交付了去重快層：送單前跟附近未結案的單比一次，最像的一筆過門檻就提示。
本功能由後端接手包裝，演算法由 Chi 持續迭代。

019 的演算法細節散在 SQL、service、GraphQL 與資料表裡，Chi 每改一次都可能要動後端。
本 Spec 畫出一條接縫：

- Chi 改演算法（訊號、參數、門檻、公式、文字比對方法、回幾筆）→ **只動 `app/dedup_engine/`**。
- 後端改外部（權限、查詢、資料表、呼叫端）→ **不影響演算法**。
- 去重是**內部能力**，由業務流程呼叫，不開獨立 API（ADR-286）。

## 目標

- 定義 engine 的輸入（快照）、輸出（`Match`）與 Protocol，雙方只依賴 `contract.py`。
- 用現有資料做的任何演算法改動，都不需要改後端的 SQL、API、migration。
- 每筆判斷都記錄引擎版本；改分數行為卻沒升版時 CI 失敗。
- 建單流程在同一個 transaction 內完成「建單＋記錄提示結果」。

## 非目標（YAGNI，明確排除）

- **不改演算法本身。** 權重、門檻、公式照 019，唯一行為差異是文字相似度改用 Python（ADR-288）。
- **不做慢層**（背景掃描、向量、admin 審核）。
- **不存重播用的輸入快照**（ADR-295）。
- **不定義「未結案」的新規則**，延後討論（§9）。
- **不支援區域型站點**（ADR-298）。

---

## 1. 分層（ADR-287）

| 層 | 位置 | 擁有者 | 職責 | 不做的事 |
|---|---|---|---|---|
| algorithm core | `app/dedup_engine/` | Chi | 訊號、分數、門檻、各種類參數、檢索範圍、`evidence` 內容 | 不 import SQLAlchemy / FastAPI / strawberry；不做 I/O |
| contract | `app/dedup_engine/contract.py` | 雙方 | 快照、`Candidate`、`Match`、`RetrievalSpec`、`DedupEngine` Protocol | 改動需雙方同意 |
| snapshot builder | `app/services/dedup_snapshot.py` | 後端 | ORM row / 建單 input → 快照；計算 pair 層級事實 | 不做判斷 |
| repository | `app/repositories/dedup_repository.py` | 後端 | 依 `RetrievalSpec` 撈「未結案」候選，回傳 `Candidate` | 不算相似度 |
| service | `app/services/dedup.py` | 後端 | 呼叫 engine、fail-open、寫配對卡與 audit | 不含公式或參數 |
| model | `app/models/dedup.py` | 後端 | `duplicate_pairs`、`dedup_audit_events` | — |
| 編排 | `app/services/dedup_submission.py::submit_ticket`、`submit_station` | 後端 | 兩段式流程（§5），只給 GraphQL 建單用（ADR-299） | 批次匯入不經過這裡 |

**判斷規則**：Chi 迭代時可能會改的 → core；不管演算法怎麼改都成立的事實 → 後端。

| 項目 | 放哪 |
|---|---|
| 兩點距離、是否同一支電話 | repository / builder（關係事實） |
| 欄位原值、建立時間、狀態 | builder |
| 「未結案」定義 | repository |
| 文字相似度、比哪些文字、截斷 | core（ADR-288） |
| 權重、門檻、衰減、回幾筆 | core |
| 檢索半徑 | core 宣告，repository 照用（ADR-292） |

---

## 2. 送值原則（ADR-289~291）

1. **給事實，不給特徵。** 送欄位原值，不送算好的分數。
2. **給整份白名單快照**，不是演算法「現在」用到的欄位。
3. **送出中那筆與候選同型。**
4. **時間從外面傳入**，engine 是純函式。
5. **線上與離線同一格式**：快照型別就是 Chi 離線 harness 的輸入格式。
6. **只加不改**：新增欄位給預設值；改名、刪欄位、改語意要遞增 `SNAPSHOT_SCHEMA_VERSION`。
7. **輸出只有 `candidate_uuid` 與 `similarity` 有語意**，其餘是不透明的 `evidence`。

---

## 3. 快照（ADR-289、293、298）

```python
# app/dedup_engine/contract.py

SNAPSHOT_SCHEMA_VERSION = 1
EntityKind = Literal["ticket", "station"]

@dataclass(frozen=True)
class GeoPoint:
    lon: float
    lat: float

@dataclass(frozen=True)
class TicketSnapshot:
    uuid: str | None                     # None = 送出中、還沒建立
    location: GeoPoint
    created_at: datetime                 # 送出中那筆 = 請求時間
    title: str
    description: str | None = None
    task_type: str | None = None
    priority: str | None = None
    status: str | None = None            # 送出中那筆為 None
    disaster_types: tuple[str, ...] = ()
    person_trapped_reported: str | None = None
    immediate_danger_reported: str | None = None
    verification_status: str | None = None

@dataclass(frozen=True)
class StationSnapshot:
    uuid: str | None
    location: GeoPoint                   # 一律是點（ADR-298）
    created_at: datetime
    name: str | None = None
    description: str | None = None
    type: str | None = None
    operational_status: str | None = None
    is_temporary: bool = False
    expires_at: datetime | None = None
    is_official: bool = False
    op_hour: str | None = None
    level: int = 0
    source: str | None = None

Snapshot = TicketSnapshot | StationSnapshot

@dataclass(frozen=True)
class Candidate:
    snapshot: Snapshot
    distance_m: float                    # PostGIS geography 距離
    same_contact_phone: bool | None      # normalize_phone 後比對；任一邊沒電話 → None（ADR-293）
```

欄位來源：`app/models/request.py`（`Tickets`）、`app/models/geo.py`（`Station`）。

### 不進快照的欄位

| 欄位 | 理由 |
|---|---|
| `contact_name`、`contact_email` | 個資，對去重幫助小 |
| `contact_phone` | 以 `Candidate.same_contact_phone` 代替（ADR-293） |
| `review_note`、`visibility`、`team_uuid`、`updated_by`、`search_text` | 內部管理或衍生欄位，不描述事件本身 |

---

## 4. Engine 介面（ADR-290~292、297）

```python
@dataclass(frozen=True)
class RetrievalSpec:
    radius_m: float                      # 之後可加有預設值的欄位

@dataclass(frozen=True)
class Match:
    candidate_uuid: str
    similarity: float                    # 0–1
    evidence: Mapping[str, Any]          # 不透明、可 JSON 序列化、不含快照文字原文

class DedupEngine(Protocol):
    version: str                         # "fast-v1"、"fast-v2"…

    def retrieval(self, kind: EntityKind) -> RetrievalSpec: ...
    def rank(self, submission: Snapshot, candidates: Sequence[Candidate], now: datetime) -> Sequence[Match]: ...
    def score(self, submission: Snapshot, candidate: Candidate, now: datetime) -> Match: ...
```

- `rank`：回達門檻的候選，依 `similarity` 遞減；後端目前只用第一筆。
- `score`：不套門檻，給確認後寫配對卡時算 evidence。
- `retrieval`：engine 保證半徑外不可能達門檻；後端以 `MAX_CANDIDATE_RADIUS_M = 1000` 截斷。
- 現行演算法為 Chi 的實作（`app/dedup_engine/fast.py`），service 透過 `get_engine()` 取得。

### 版本號（ADR-297）

- 格式 `^[a-z]+-v[1-9][0-9]*$`。
- 同樣輸入（快照＋`now`）會得到不同的輸出時就升版；只改註解、重構、效能不升版。
- 每版在 `app/dedup_engine/CHANGELOG.md` 記錄改動、參數表、回測結果。
- Golden test 強制「改行為必升版」（§8）。

---

## 5. 呼叫端流程：建單兩段式（ADR-296）

```graphql
union CreateTicketResult = TicketCreated | DuplicateSuspected
type TicketCreated { ticket: TicketType! }
type DuplicateSuspected { relatedTicketUuid: String! }

createTicket(input: CreateTicketInput!, acknowledgedDuplicateOf: String = null): CreateTicketResult!
```

`createStation` 比照（`StationCreated | DuplicateStationSuspected`，欄位 `relatedStationUuid`）。

流程由 `submit_ticket` / `submit_station` 實作；`create_ticket` / `create_station` 拆成
`validate_*`（權限＋驗證＋正規化）與 `insert_*`（寫入不 commit），本身行為不變，批次匯入照舊呼叫（ADR-299）。

**第一次送出（`acknowledgedDuplicateOf` 為 null）**

1. 權限、輸入驗證（同現行）。
2. builder 組送出快照 → `engine.retrieval()` → repository 撈候選 → `engine.rank()`。
   **fail-open**：這段任何例外都記 log、rollback，當作沒有命中。
3. 有命中：寫 audit `hint_shown`（`engine_version`、`similarity`、`evidence`），回 `DuplicateSuspected`，**不建單**。
4. 沒命中：建單，回 `TicketCreated`。

**確認後送出（`acknowledgedDuplicateOf` 有值）**

1. 權限、輸入驗證。
2. **不再跑 dedup。**
3. 建單 → 取被確認的那筆組 `Candidate` → `engine.score()` →
   寫配對卡（`dup_ignored`、`rescan_needed=true`）與 audit `ignored_by_submitter`。同一個 transaction。
   `engine.score()` 失敗：照常建單，配對卡 `similarity`／`evidence` 為 null，記 log。
4. 被確認的那筆找不到或已刪：照常建單，不寫配對卡，記 log。

**使用者選「去看既有的單」**：不呼叫任何 API，停在 `hint_shown`。

---

## 6. Schema（ADR-294）

改在 019 的 migration `d4c8b1e07a92`（未合併）上，不另開 migration。

| 表 / 常數 | 改動 |
|---|---|
| `duplicate_pairs.score_components` | 改名 `evidence`（JSONB） |
| `duplicate_pairs.engine_version` | 新增 `text`；CHECK `method = 'manual' OR engine_version IS NOT NULL`（手動建卡沒有 engine） |
| `dedup_audit_events.engine_version` | 新增 `text`（非 engine 產生的事件，如 `manual_note`，可為 null） |
| `dedup_audit_events.evidence` | 後端外層 `{"similarity": …, "engine": <engine 的 evidence>}`；engine 內容不拆 |
| `AUDIT_EVENT_TYPES` / CHECK | 新增 `hint_shown` |

`method`、`similarity`、`hint_outcome`、`status` 保留。
`duplicate_pairs.hint_outcome` 在兩段式下只會寫 `ignored_hint`；`accepted_hint` 值保留給慢層與 admin。

---

## 7. 逐檔改動

| 檔案 | 改動 |
|---|---|
| `app/dedup_engine/contract.py` | 新增：§3、§4 的型別與 Protocol |
| `app/dedup_engine/fast.py` | 新增：由 `services/dedup_scoring.py` 搬入；#59 的 `STATION_FAST_LAYER_PARAMETERS`、`services/dedup.py` 的 `_retrieval_radius_m`／`RETRIEVAL_RADIUS_SAFETY_FACTOR`／`TITLE_MAX_CHARS`／`DESCRIPTION_MAX_CHARS`／`_query_text` 一併搬入；文字相似度改 Python |
| `app/dedup_engine/CHANGELOG.md` | 新增：`fast-v1` |
| `app/services/dedup_scoring.py` | 刪除 |
| `app/services/dedup_snapshot.py` | 新增：`Tickets` / `Station` row → 快照、建單 input → 快照、`same_contact_phone` |
| `app/repositories/dedup_repository.py` | 移除 `func.similarity`、`has_text`、`age_min`；`list_nearby_open` 回 `list[Candidate]`；`ST_DWithin`、`ST_Distance`、未結案過濾、`DEDUP_ENTITIES` 保留 |
| `app/services/dedup.py` | 改為呼叫 engine；移除 `record_hint_outcome` 的 mutation 路徑與 `_rescore_pair`；新增兩段式用的 `check`／`record_acknowledged` |
| `app/services/ticket.py`、`app/services/station.py` | 拆出 `validate_*`／`insert_*`；`create_*` 行為不變（ADR-299） |
| `app/services/dedup_submission.py` | 新增：`submit_ticket`／`submit_station`，實作 §5 |
| `app/graphql/tickets/`、`app/graphql/geo/` | `createTicket`／`createStation` 回傳 union、新參數 |
| `app/graphql/dedup/` | 刪除 |
| `app/graphql/schema.py` | 移除 `DedupQuery`／`DedupMutation` |
| `app/models/dedup.py`、`alembic/versions/d4c8b1e07a92_*.py` | §6 |
| `Spec/019-dedup-fast-layer/spec.md` | 加註 §1 GraphQL、§3 計分位置已被本 Spec 取代 |

前端（#47）另行調整：`useDedupSubmitFlow` 改依 `createTicket` 回傳型別切換狀態，移除 `dedup.graphql`。

---

## 8. 測試計畫

### Contract test（後端擁有；任何 engine 實作都要通過）

1. `similarity` 在 `[0, 1]`；`rank` 結果依分數遞減。
2. 同樣輸入（含 `now`）→ 同樣輸出。
3. 空候選 → `rank` 回空序列。
4. `retrieval().radius_m` 是有限正數；距離大於它的候選，`score().similarity` 不達門檻。
5. `evidence` 可 `json.dumps`，且不含快照文字欄位原文（用帶特殊標記字串的快照驗證）。
6. 選填欄位為 `None`、空字串、空 tuple，`same_contact_phone=None` 時不拋錯。
7. 送出快照 `uuid=None`、`status=None` 時可正常計分。
8. 效能：N=500 筆候選在 X ms 內（X 待定）。
9. `version` 符合 `^[a-z]+-v[1-9][0-9]*$`。
10. Golden test：固定輸入的輸出與 golden file 一致，且 golden file 記錄的版本號等於目前 `version`。重新產生 golden 的腳本在「輸出改變但版本號沒變」時拒絕寫入，所以要更新 golden 只能先升版。

演算法本身的正確性由 Chi 的測試負責。

### 後端整合測試

- builder：ORM row 與建單 input 產生的快照欄位一致；白名單外欄位不出現。
- `same_contact_phone`：同號不同格式 → true；一邊空 → None。
- repository：半徑外、已結案、軟刪不出現；超過 1000 m 的 `RetrievalSpec` 被截斷並記 warning。
- 兩段式：命中不建單並寫 `hint_shown`；確認後建單＋配對卡＋audit 在同一 transaction；engine 拋錯時照常建單（fail-open）；確認的 uuid 不存在時照常建單不寫卡。
- migration：`test_migrations_match_models` 通過；`alembic heads` 單一 head。

---

## 9. 接縫之外（需要後端配合的改動）

| 演算法想做的事 | 需要什麼 | 規模 |
|---|---|---|
| 用快照裡沒有的欄位（`ticket_tasks`、照片、新欄位） | builder 加欄位（只加不改） | 小 |
| 換候選範圍（不看半徑、跨區、先用文字篩） | repository 新檢索方式；`RetrievalSpec` 加欄位 | 中 |
| 向量相似度（019 合約已預留 `slow_vector`） | 預先計算並儲存 embedding、向量索引 | 架構改動，屬慢層 |
| 呼叫外部服務（LLM、geocoding） | engine 不再是純函式 | 架構改動 |
| 從過去的判斷學習 | 回饋資料管道 | 離線流程 |

## 10. 延後討論

- **未結案定義**：只影響 repository 的篩選條件，engine 介面、資料表、API 都不受影響。
  現行 `tickets.status NOT IN ('completed','cancelled')`；`update_ticket_task` 不更新父單 status，
  完成的單可能仍被當候選，影響是多出不該出現的提示。
- **contract test 的效能門檻 X**。

## 11. 實作順序

1. 與 Chi 確認 §3、§4；建 `contract.py`。
2. builder＋repository 改回傳 `Candidate`。
3. 演算法搬進 core，文字相似度改 Python；Chi 重跑回測、確認門檻，定為 `fast-v1`，寫 CHANGELOG。
4. contract test，以 `fast-v1` 產生第一份 golden file。
5. §6 schema 改動。
6. `create_ticket`／`create_station` 兩段式，移除 `app/graphql/dedup/`。
7. #47 前端跟進。
