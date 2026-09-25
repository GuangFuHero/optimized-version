# 去重快層（Dedup Fast Layer）

**Status**: Draft — 參數暫定，等真實資料重跑

送求助單前，先跟「附近＋還沒結案」的單比一次，最像的一筆過門檻就提示使用者；不硬擋、不自動合併。
系統出錯就跳過提示、照常送單。

不在本次：慢層背景掃描、admin 審核、groups／settings／rule_versions／scan_runs 等慢層表、
confirm／reject／merge mutations、`tickets.is_duplicate`／`dedup_group_id`。

---

## 1. GraphQL

```graphql
"送單前查重複候選：回最像的一筆，過門檻才回，否則空陣列"
ticketDedupCandidates(input: TicketDedupCheckInput!): [TicketDedupHint!]!

"回報使用者對提示的選擇"
recordDedupHintOutcome(input: RecordDedupHintOutcomeInput!): RecordDedupHintOutcomeResult!

input TicketDedupCheckInput { geometry: GeoJSON!  title: String!  description: String  taskType: String }
type TicketDedupHint { relatedTicketUuid: String!  similarity: Float!  scoreComponents: [DedupScoreComponent!]! }
type DedupScoreComponent { name: String!  score: Float!  weight: Float!  passed: Boolean! }

enum DedupHintOutcome { accepted_hint  ignored_hint }
input RecordDedupHintOutcomeInput { candidateTicketUuid: String!  outcome: DedupHintOutcome!  submittedTicketUuid: String }
type RecordDedupHintOutcomeResult { auditEventUuid: String!  hintOutcome: String!  pairUuid: String }
```

- 兩支都要 `ticket.add`（登入使用者可用；Guest 403）。這不是隱私閘門（ticket 本來就公開），而是只替能送單的人
  跑計分。前端在 `createTicket` 之前呼叫 query。
- `TicketDedupHint` 沿用合約 `TicketDedupRelation` 的欄位名，但沒有 `pairUuid`／`pairStatus`：
  送單前那張單還不存在，配對卡寫不出來。
- **query 失敗一律回 `[]`**（fail-open）：geometry 不合法、PostGIS／pg_trgm 出錯都一樣，記 log、
  rollback、回空。權限檢查在 fail-open 之外，仍然 403。
- **沒有 `submittedAt`**：時間訊號一律用伺服器時鐘。
- `title`／`description` 進 pg_trgm 前截斷到 200／2000 字元，不拒收。
- **`recordDedupHintOutcome` 只能回報自己建立的單**（actor 必須是 `submittedTicketUuid` 的建立者），
  不 fail-open。配對卡的 `similarity`／`score_components` 由後端重算，不收前端分數；重算時不套半徑
  與未結案過濾。

---

## 2. 資料表

`duplicate_pairs`（配對卡）與 `dedup_audit_events`（去重決策事件），欄位與 CHECK 值照合約 §1／§1.5。

- 兩張表都有 `entity_kind text NOT NULL`（`'ticket'／'station'／'ticket_task'`）；配對的 uuid
  （`low_uuid`／`high_uuid`、`primary_uuid`／`duplicate_uuid`）不設 FK。本 PR 只寫 `'ticket'`。
- `duplicate_pairs`：`low_uuid < high_uuid`；partial UNIQUE
  `uq_duplicate_pairs_entities (entity_kind, low_uuid, high_uuid) WHERE delete_at IS NULL`。
- `duplicate_group_uuid`／`rule_version_uuid` 是無 FK 的 `uuid`（被指的表屬慢層，本次不建）。
- 額外索引 `ix_base_geometries_geography`：`GIST ((geometry::geography))`，給候選檢索的
  `ST_DWithin(geometry::geography, …)` 用；model 端也宣告，讓 `create_all` 與 migration 一致。
- 「未結案」＝ `status NOT IN ('completed', 'cancelled')` 且未軟刪。

寫入時機：

| `outcome` | 配對卡 | audit event |
|---|---|---|
| `accepted_hint`，沒有新單 | 不建卡 | `hint_accepted` |
| `accepted_hint`，有新單 | 新卡 `status='suggested'` | `hint_accepted` |
| `ignored_hint` | `status='dup_ignored'`＋`rescan_needed=true` | `ignored_by_submitter` |

已有現行卡時就地更新：兩種 outcome 都寫 `hint_outcome`；`ignored_hint` 另外把卡改成
`dup_ignored`＋`rescan_needed=true`，不論原本的 status。`decision_reason` 等於 `outcome`。

---

## 3. 計分與參數

```
distance_signal  = 2 ** (-distance_m / distance_half_m)      # PostGIS ST_Distance（geography，公尺）
time_signal      = 2 ** (-age_min / time_half_min)
task_type_signal = 1.0 / 0.0                                  # 任一邊沒填就整項不算
text_signal      = pg_trgm similarity(title || ' ' || description)   # 任一邊沒文字就整項不算
similarity       = Σ(signal × weight) / Σ(可用訊號的 weight)
```

第一名 `similarity >= hint_threshold` 才提示。候選半徑由參數反解（`max_hint_distance_m`，
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

---

## 4. 據點

登記據點前走同一套快層：跟附近、還在服務的據點比一次，過門檻就提示，出錯一樣 fail-open。

```graphql
"登記據點前查重複候選：回最像的一筆，過門檻才回，否則空陣列"
stationDedupCandidates(input: StationDedupCheckInput!): [StationDedupHint!]!

recordDedupHintOutcome(input: RecordDedupHintOutcomeInput!, entityKind: DedupEntityKind! = ticket): RecordDedupHintOutcomeResult!

input StationDedupCheckInput { geometry: GeoJSON!  type: String  name: String  description: String }
type StationDedupHint { relatedStationUuid: String!  similarity: Float!  scoreComponents: [DedupScoreComponent!]! }
enum DedupEntityKind { ticket  station }
```

- `stationDedupCandidates` 要 `station.add`（跟 `createStation` 同一個權限）。
- 候選：未軟刪、`operational_status IN ('active', 'temporarily_closed')`，且不是已過 `expires_at`
  的臨時據點。
- 計分用 `STATION_FAST_LAYER_PARAMETERS`：送單那組參數把 `time_weight` 歸零，時間訊號整項不出現在
  `scoreComponents`。文字訊號比 `name || ' ' || description`，類型訊號比 `stations.type`。
- `recordDedupHintOutcome` 的 `entityKind` 預設 `ticket`，不帶就跟 §1 完全相同；送 `station` 時
  `candidateTicketUuid`／`submittedTicketUuid` 放據點 uuid，兩張表的 `entity_kind` 寫 `'station'`，
  權限換成 `station.add`。
