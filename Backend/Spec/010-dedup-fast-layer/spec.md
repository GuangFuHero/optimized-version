# 去重快層（Dedup Fast Layer）— 初版

**Feature Branch**: `feat/dedup-fast-layer`
**Status**: Draft — 參數暫定，等真實資料重跑
**上游設計**: 去重合約＋schema 草案 §1／§2（凍結合約）、去重設計文件 §三／§四／§9.2、評估稽核報告

送求助單時，先跟「附近＋還沒結案」的單比一次，最像的一筆過門檻就提示使用者；不硬擋、不自動合併。
系統出錯就跳過提示、照常送單，漏掉的交給慢層。

---

## 1. 範圍

| 在本次 | 不在本次 |
|---|---|
| 送單前查重複的 GraphQL query | 慢層背景掃描、admin 審核介面 |
| 四訊號加權平均演算法（距離／時間／任務類型／文字） | embedding、reranker、LLM 等語意方法 |
| `duplicate_pairs`、`dedup_audit_events` 兩張表 | groups／members／settings／rule_versions／scan_runs 五張表 |
| 提示結果回報 mutation | confirm／reject／merge／拆群 mutations |
| | `tickets.is_duplicate`／`dedup_group_id`（合約 §1.3，要等 groups 表才有東西可指） |
| | 合併與軟刪流程、task 層級去重 |

---

## 2. API

```graphql
"送單前查重複候選：回最像的一筆，過門檻才回，否則空陣列"
ticketDedupCandidates(input: TicketDedupCheckInput!): [TicketDedupHint!]!

"回報使用者對提示的選擇"
recordDedupHintOutcome(input: RecordDedupHintOutcomeInput!): RecordDedupHintOutcomeResult!
```

- 兩支都要 `ticket.add`（登入使用者可用；Guest 403）。前端在 `createTicket` 之前呼叫 query。
- `TicketDedupHint` 的 `relatedTicketUuid`／`similarity`／`scoreComponents` 沿用凍結合約
  `TicketDedupRelation`／`DedupScoreComponent` 的欄位名與語意。
- **刻意偏離**：合約的 `pairUuid`／`pairStatus` 是 non-null，但送單前那張單還不存在，
  配對卡當下寫不出來 —— 所以查詢回的是 `TicketDedupHint`（少那兩欄），合約凍結的 relation
  形狀留給之後的 ticket 讀取路徑。
- **失敗一律回空**：從解析 geometry 到評分全部在同一個 try 裡，出錯就記 log、rollback、回 `[]`，
  不擋送單（設計文件 §四 fail-open）。座標是字串、null、少 coordinates、不是 Point、超出經緯度
  範圍，全部走同一個出口 —— `create_ticket` 自己的 `validate_point` 才是擋下送單的那道關。
  權限檢查在 fail-open 之外，仍然 403。
- **沒有 `submittedAt` 欄位**：時間訊號一律用伺服器時鐘。那是唯一一個前端可以自由設定的計分輸入，
  「這張單什麼時候送到」不該由前端宣稱。replay 與測試改走 service 的 `submitted_at` 參數。
- **`title`／`description` 進 pg_trgm 前先截斷**（200／2000 字元）。`similarity()` 每次呼叫都要建
  trigram set，不設上限等於把一次諮詢性查詢變成真工作；而 trigram 重疊在遠低於這個長度就飽和了。
  截斷不是拒收 —— 這支是諮詢性質的，拒收等於專門對最囉唆的災情報告關掉提示。
- **`recordDedupHintOutcome` 只能記自己的單**：`ticket.add` 在 seed 裡人人都是 `all`，光靠它會
  讓任何登入者對任意兩張單建卡，污染慢層佇列與量測。真正的守門是「actor 必須是 submitted 那張單的
  建立者」；`resource=submitted` 也一起傳，是為了 seed 之後真的收窄 `ticket.add` 時 checkpoint 2
  會生效。

---

## 3. 演算法

四個訊號正規化到 0–1，取「可用訊號」的加權平均，第一名過門檻才提示。
公式與評估腳本 `evaluate_fast_layer.py` 完全一致（距離／時間／任務類型三項是直接移植）：

```
distance_signal  = 2 ** (-distance_m / distance_half_m)      # PostGIS ST_Distance（geography，公尺）
time_signal      = 2 ** (-age_min / time_half_min)
task_type_signal = 1.0 / 0.0                                  # 任一邊沒填就整項不算
text_signal      = pg_trgm similarity(title || ' ' || description)   # 任一邊沒文字就整項不算
similarity       = Σ(signal × weight) / Σ(可用訊號的 weight)
```

訊號不可用時「從分母移除」而不是「當 0 分」：沒填 `task_type` 的單不該因為沒填而被壓到門檻以下。

**暫定參數**（`app/services/dedup_scoring.py::FastLayerParameters`）：

| 參數 | 值 | 出處 |
|---|---|---|
| `distance_half_m` | 200 | grid search 第一名，**不是建議值** |
| `time_half_min` | 360 | 同上 |
| 權重 距離／時間／任務類型 | 2 / 0.5 / 0.5 | 同上 |
| 權重 文字 | 1.0 | **未跑過 grid**，本 PR 的判斷值 |
| `hint_threshold` | 0.8 | grid search 第一名，**不是建議值** |
| `component_baseline` | 0.5 | 成分燈號用；**未跑過 grid** |

稽核報告原話：13 個手編 fixture、沒有真實送單情境、沒有人工正解；recall 100% 時最低 false hint
rate 仍有 66.7%。**不是參數調不好，是資料不夠。** 收到真實資料後用同一支腳本重跑再調。

**候選半徑由參數推導，沒有筆數上限。** 唯一該被排除的候選，是「數學上不可能過門檻」的那些；
筆數截斷來自對 DB 工作量的猜測，跟公式無關 —— 密集災區裡最近的 50 張並不等於最像的 50 張。

把計分公式對距離反解，其他三個訊號全部給滿分（W = 四個權重的總和）：

```
threshold = (d_signal × w_d + (W − w_d)) / W
d_signal  = 1 + W × (threshold − 1) / w_d
distance  = −distance_half_m × log2(d_signal)
```

W 取「四個訊號全部可用」的情況，因為那是邊界最寬的時候：訊號不可用會退出平均、W 變小，
而 `threshold − 1` 是負的，W 越小反而要求 `d_signal` 越大、半徑越短。所以用全滿算出來的半徑，
對任何欄位填寫組合都夠用。上表參數代進去＝ **147.4 m**，再乘 1.1 的浮點餘裕（避免剛好落在門檻上
的候選被進位誤差刷掉）。

**參數一動，半徑跟著動**：`distance_half_m` 加倍半徑就加倍，`hint_threshold` 調低半徑就變寬，
沒有第二個數字要記得改。兩個退化情況誠實回答：距離權重為 0、或門檻低到其他三訊號自己就過得了時，
距離永遠排除不掉任何人（回 `inf`，由 service 夾到 `MAX_CANDIDATE_RADIUS_M = 1000 m` 並記
warning —— 那代表參數要看，不是資料要看）；門檻為 1.0 時只有同座標才可能過（回 0）。

---

## 4. 資料表

嚴格照合約 §1／§1.5 的欄位與 CHECK 值（`event_type` 含合約 §1.5 補的 `group_welded`／`weld_kept`／
`member_detached` —— 快層不會寫，但值域是凍結合約的一部分，先寫進去省得慢層落地時還要改 constraint）。
兩張表都是**不綁 ticket 的泛用配對表**：`duplicate_pairs`、`dedup_audit_events` 都多一欄
`entity_kind text NOT NULL`（CHECK 值域 `'ticket'／'station'／'ticket_task'`），配對的兩個
uuid（`duplicate_pairs.low_uuid`／`high_uuid`，`dedup_audit_events.primary_uuid`／`duplicate_uuid`）
一律不設 FK —— 同一張表要服務不同的 entity kind，沒辦法固定指到某一張實體表的主鍵。快層目前只寫
`entity_kind='ticket'`；`station`／`ticket_task` 先開在值域裡，留給之後的擴展。partial UNIQUE 索引
（`uq_duplicate_pairs_entities`）也跟著改成 `(entity_kind, low_uuid, high_uuid) WHERE delete_at IS NULL`。

刻意差異：

1. `duplicate_group_uuid`／`rule_version_uuid` 建成無 FK 的 `uuid` —— 被指的兩張表屬慢層、本次不建。
2. `CREATE EXTENSION IF NOT EXISTS pg_trgm` 補進 migration。測試環境已手動裝了 pg_trgm 1.6，
   但既有 migration 只記了 postgis，重建 DB 會漏掉。
3. 多建一個 `ix_base_geometries_geography`（`GIST ((geometry::geography))`）。geoalchemy2 建的
   GIST 索引是在 geometry 欄上，operator class 不同，餵不了 `ST_DWithin(geometry::geography, …)`
   —— 沒有它，送單路徑會對整張 `base_geometries` 做 seq scan。model 端也宣告了同一個索引，
   讓 `create_all` 建出來的 schema 跟 production 一致。

寫入時機：

| API 收到的 `outcome` | 配對卡 | audit event |
|---|---|---|
| `accepted_hint` | 沒有新單就沒有卡 | `hint_accepted` |
| `ignored_hint` | `status='dup_ignored'`＋`rescan_needed=true` | `ignored_by_submitter` |

**已決定變更**：API 現在直接收 `hint_outcome` 的兩個值（`accepted_hint`／`ignored_hint`），不再收
四選一再由後端收斂——四選一是前端層面「留言／建議修改／更新自己的單／照樣送出」的細節，這版拿掉了，
`decision_reason` 現在就等於 `outcome`，不再帶四選一那層額外資訊。前端（PR #47）目前送的是舊的
`submitted_anyway` 等四值，需要跟著改送 `accepted_hint`／`ignored_hint`。
配對卡的 `similarity`／`score_components` 由後端在兩張單都存在後**重算**，不收前端傳來的分數。

已有現行卡時就地更新：`hint_outcome` 兩種情況都照記 —— 它描述的是使用者做了什麼，不是判定結果。
**已決定變更**：原本「卡片 status 已是 `confirmed`／`rejected` 時只更新 `hint_outcome`、不動
`status`」的保護已經拿掉——收到 `ignored_hint` 時，不論卡片目前是什麼 status（包含 admin 已經
`confirmed`／`rejected` 的定案卡），都會被改成 `dup_ignored`＋`rescan_needed=true`。合約 §1.1
講的「推翻定案是舊卡軟刪＋插新列」在這支寫入路徑上目前不成立，是本次明確拿掉的行為，不是遺漏。

---

## 5. 測試

```bash
cd Backend
docker compose up -d db redis          # PostGIS + Redis，測試套件兩者都要
uv sync --group dev
uv run pytest tests/test_dedup_scoring.py tests/test_dedup_service.py tests/test_graphql/test_dedup.py
```

- `tests/test_dedup_scoring.py` — 演算法。期望值直接取自評估腳本對同組輸入的輸出；這支開始紅
  就代表移植版跟評估腳本漂開了，離線調參不再能預測線上行為。
- `tests/test_dedup_service.py` — 過門檻／不過門檻／出錯回空（把候選檢索換成假的才測得到「DB 炸了」）。
- `tests/test_graphql/test_dedup.py` — 真的打 DB：PostGIS 距離、pg_trgm 相似度、權限、寫入結果。

---

## 6. 據點

登記據點前也走同一套快層：跟附近、還在對外服務的據點比一次，最像的一筆過門檻就提示，不硬擋、
不自動合併，出錯一樣 fail-open、照常登記。

據點有三種狀態：開著、暫時關閉、永久關閉。快層拿前兩種來比——永久關閉的據點不會再重複開張，
比了也沒意義。已經設定「臨時據點＋到期時間」而且時間已經過期的，也不比，即使狀態欄位還沒被
人手動改掉。

據點只看三件事：離多遠、是不是同一類、名字和描述像不像。跟送單那組比起來少一件——時間不算，
因為「這個據點多久前登記的」跟「現在是不是重複」沒有關係，一個月前登記的舊站不該因為久了就被
判定成比較不像。距離、類型、文字三個訊號的算法、半衰／權重／門檻都沿用送單那組
（`app/services/dedup_scoring.py::STATION_FAST_LAYER_PARAMETERS`，只把時間權重歸零）。時間權重
歸零時，時間這個訊號整個從分數拆帳裡消失，不會留一個權重 0 的假訊號。

```graphql
"登記據點前查重複候選：回最像的一筆，過門檻才回，否則空陣列"
stationDedupCandidates(input: StationDedupCheckInput!): [StationDedupHint!]!
```

- 權限跟建立據點的 mutation 用同一個（`station.add`）。
- `StationDedupHint` 的欄位比照 `TicketDedupHint`：`relatedStationUuid`／`similarity`／
  `scoreComponents`，一樣是送單前那張卡還不存在時的暫時形狀。
- `recordDedupHintOutcome` 現在多收一個 `entityKind` 引數，預設 `ticket`；送 `station` 時
  `duplicate_pairs`／`dedup_audit_events` 寫入的 `entity_kind` 一併變成 `'station'`。
  `candidateTicketUuid`／`submittedTicketUuid` 這兩個欄位名不因為 entity kind 而改名，兩種據點
  跟單都借用同一組名字。`ticketDedupCandidates`、以及沒有指定 `entityKind` 的舊呼叫方式，行為
  不變。

---

## 7. 待團隊決定

1. 送單前的回傳型別要不要就叫 `TicketDedupRelation`、把 `pairUuid`／`pairStatus` 放寬成 nullable。
2. 「接受提示」沒有第二張單時要不要仍造一張卡（現在不造，只留 event）。
3. 候選半徑改為**由參數推導**（`max_hint_distance_m`，公式見 §3），不再有筆數上限：現行參數
   ＝147.4 m × 1.1。要決定的是 `MAX_CANDIDATE_RADIUS_M = 1000 m` 這個 backstop 值，以及
   1.1 這個浮點餘裕是否夠。`test_graphql/test_dedup.py` 有兩支測試釘住行為：50 張更近的雜訊單
   不會擠掉 92 m 外的真雙胞胎；超出邊界的候選則根本不進查詢。
4. 文字權重 1.0 與 `component_baseline` 0.5 都沒跑過 grid。
5. 評估腳本要補 `text_weight` 與 fixture 的文字欄位（在設計工作區，不在本 repo）。
6. `CLOSED_TICKET_STATUSES = ("completed", "cancelled")` 是本 PR 定的「未結案」口徑，
   對齊 `services/ticket.py::VALID_TRANSITIONS` 的兩個終點，合約沒定義。
7. `similarity` 這裡是**加權平均**（除以 Σweight），合約 §1.4 字面寫的是 `Σ(score × weight)`。
   除以 Σweight 才能讓「訊號不可用就退出平均」成立，也才保證落在 0–1（CHECK 要求）；
   但這跟合約字面不同，要確認。
8. 重評配對卡時**忽略半徑與未結案過濾**（兩張單都已存在，候選是指定的），所以提示與送出之間原單
   剛好結案，分數快照仍然算得出來。
9. 「接受提示」而**已經有現行卡**時，只改 `hint_outcome`、不動 `status`。
10. `DESCRIPTION_MAX_CHARS = 2000` 是本 PR 挑的（`tickets.description` 是無上限 TEXT，沒有欄寬可對）。
11. `recordDedupHintOutcome` 目前只允許送單者本人回報，admin 不能代記。
