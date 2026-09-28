# 去重快層（Dedup Fast Layer）

**Status**: Draft — 參數暫定，等真實資料重跑

比對單位是 **task**：每個要送出的 task，先跟附近「還開著」的 task 比一次，最像的一筆過門檻就提示使用者；
提示裡寫的是那張單（ticket），並指出比對到它底下的哪個 task。不硬擋、不自動合併；系統出錯就跳過提示、照常送出。

一張單＝1 個 ticket（帶位置）＋1 個以上 task（帶需求：`task_type`、`task_name`、`task_description`）。

**三個決定**（user 定案）：

1. **觸發時機**：每個 task 要被存下之前。也就是使用者按送出之後、`createTicketTask` 寫入之前。新開單、
   替既有的單加 task（包括已完成的單）都一樣。
2. **每個要送出的 task 最多一個提示**。一張單帶 3 個 task，最多 3 個提示，一個 task 一個；提示寫出是哪張單、
   比對到它的哪個 task。
3. **排除同一張單自己的 task**。替既有的單加 task 時，同一張單底下其他 task 不是候選；這個情況由表單處理。

不在本次：慢層背景掃描、admin 審核、groups／settings／rule_versions／scan_runs 等慢層表、
confirm／reject／merge mutations、`tickets.is_duplicate`／`dedup_group_id`。

---

## 1. GraphQL

```graphql
"送出 task 前查重複候選：回最像的一筆，過門檻才回，否則空陣列"
ticketDedupCandidates(input: TicketDedupCheckInput!): [TicketDedupHint!]!

"回報使用者對提示的選擇"
recordDedupHintOutcome(input: RecordDedupHintOutcomeInput!): RecordDedupHintOutcomeResult!

input TicketDedupCheckInput { taskType: String!  taskName: String  taskDescription: String  geometry: GeoJSON  ticketUuid: String }
type TicketDedupHint { relatedTicketUuid: String!  relatedTaskUuid: String!  similarity: Float!  scoreComponents: [DedupScoreComponent!]! }
type DedupScoreComponent { name: String!  score: Float!  weight: Float!  passed: Boolean! }

enum DedupHintOutcome { accepted_hint  ignored_hint }
input RecordDedupHintOutcomeInput { candidateTaskUuid: String!  outcome: DedupHintOutcome!  submittedTaskUuid: String }
type RecordDedupHintOutcomeResult { auditEventUuid: String!  hintOutcome: String!  pairUuid: String }
```

- 兩支都要 `ticket.add`（登入使用者可用；Guest 403）。這不是隱私閘門（ticket 本來就公開），而是只替能送單的人
  跑計分。前端每個 task 在 `createTicketTask` 之前呼叫一次 query。
- **位置**：新開單給 `geometry`（草稿座標）；替既有的單加 task 給 `ticketUuid`，後端用那張單的座標、忽略前端送的
  `geometry`，並排除那張單自己的 task。`ticketUuid` 找不到也回 `[]`。
- `TicketDedupHint` 沿用合約 `TicketDedupRelation` 的欄位名，另加 `relatedTaskUuid`；沒有 `pairUuid`／
  `pairStatus`：送出前那個 task 還不存在，配對卡寫不出來。
- **query 失敗一律回 `[]`**（fail-open）：geometry 不合法、PostGIS／pg_trgm 出錯都一樣，記 log、
  rollback、回空。權限檢查在 fail-open 之外，仍然 403。
- **沒有 `submittedAt`**：時間訊號一律用伺服器時鐘。
- `taskName`／`taskDescription` 進 pg_trgm 前截斷到 200／2000 字元，不拒收。
- **`recordDedupHintOutcome` 只能回報自己建立的 task**（actor 必須是 `submittedTaskUuid` 的建立者），
  不 fail-open。`candidateTaskUuid` 就是 hint 的 `relatedTaskUuid`。配對卡的 `similarity`／`score_components`
  由後端重算，不收前端分數；重算時不套半徑與「還開著」的過濾。

---

## 2. 資料表

`duplicate_pairs`（配對卡）與 `dedup_audit_events`（去重決策事件），欄位與 CHECK 值照合約 §1／§1.5。

- 兩張表都有 `entity_kind text NOT NULL`（`'ticket'／'station'／'ticket_task'`）；配對的 uuid
  （`low_uuid`／`high_uuid`、`primary_uuid`／`duplicate_uuid`）不設 FK。本 PR 寫 `'ticket_task'`，
  兩個 uuid 都是 task uuid。
- `duplicate_pairs`：`low_uuid < high_uuid`；partial UNIQUE
  `uq_duplicate_pairs_entities (entity_kind, low_uuid, high_uuid) WHERE delete_at IS NULL`。
- `duplicate_group_uuid`／`rule_version_uuid` 是無 FK 的 `uuid`（被指的表屬慢層，本次不建）。
- 額外索引 `ix_base_geometries_geography`：`GIST ((geometry::geography))`，給候選檢索的
  `ST_DWithin(geometry::geography, …)` 用；model 端也宣告，讓 `create_all` 與 migration 一致。
- **候選**（「還開著」的 task）：`ticket_tasks.status NOT IN ('fulfilled', 'canceled')`、task 未軟刪；
  所屬的 ticket 未軟刪、`status <> 'cancelled'`、座標在候選半徑內。已完成（`completed`）的單不排除：它可以再加
  新 task。沒有任何 task 的單永遠不是候選。

寫入時機：

| `outcome` | 配對卡 | audit event |
|---|---|---|
| `accepted_hint`，沒有新 task | 不建卡 | `hint_accepted` |
| `accepted_hint`，有新 task | 新卡 `status='suggested'` | `hint_accepted` |
| `ignored_hint` | `status='dup_ignored'`＋`rescan_needed=true` | `ignored_by_submitter` |

已有現行卡時就地更新：兩種 outcome 都寫 `hint_outcome`；`ignored_hint` 另外把卡改成
`dup_ignored`＋`rescan_needed=true`，不論原本的 status。`decision_reason` 等於 `outcome`。

---

## 3. 計分與參數

```
distance_signal  = 2 ** (-distance_m / distance_half_m)      # 兩個 task 所屬 ticket 之間，PostGIS ST_Distance（geography，公尺）
time_signal      = 2 ** (-age_min / time_half_min)            # 候選 task 的 created_at
task_type_signal = 1.0 / 0.0                                  # task_type 相同與否
text_signal      = pg_trgm similarity(task_name || ' ' || task_description)   # 任一邊沒文字就整項不算
similarity       = Σ(signal × weight) / Σ(可用訊號的 weight)
```

第一名 `similarity >= hint_threshold` 才提示，同分時比 task uuid。候選半徑由參數反解（`max_hint_distance_m`，
現行參數＝147.4 m）再乘 1.1，上限 `MAX_CANDIDATE_RADIUS_M = 1000 m`；沒有筆數上限。

**暫定參數**（`app/services/dedup_scoring.py::FastLayerParameters`）：

| 參數 | 值 | 出處 |
|---|---|---|
| `distance_half_m` | 200 | grid search 第一名，**不是建議值** |
| `time_half_min` | 360 | 同上 |
| 權重 距離／時間／任務類型 | 2 / 0.5 / 0.5 | 同上 |
| 權重 文字 | 1.0 | **未跑過 grid**，判斷值 |
| `hint_threshold` | 0.8 | grid search 第一名，**不是建議值** |
| `component_baseline` | 0.5 | 成分燈號用；**未跑過 grid** |
