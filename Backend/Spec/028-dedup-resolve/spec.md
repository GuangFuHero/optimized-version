# Design: AI 重複審核 — 處理重複的單 Dedup Resolve

**Date**: 2026-10-24
**Feature**: 028-dedup-resolve
**Status**：已實作、code review 修正完成，並完成 Docker 從零驗證（2026-10-24，`55cb19729`，全套件 2912 passed、覆蓋率 96%，見 `verification.md`）。PR 尚未開。
**Base**（rebase 後）：`main` @ `2e95aec0d`
**Base**: `main` @ `a272dfdd4`，分支 `feat/dedup-resolve`
**Notion**: DEDUP-007（審核動作與後端）、DEDUP-008（AI 重複審核頁，前端 Ethan）、DEDUP-009（通知，Dennis）、
「dedup 10/23 update — 討論頁」§12
**Decisions**: `decisions.md`（ADR-365～385；381～385 是 code review 那一輪）
**前一份**：Spec 025（PR #92，判定＋撤銷）。本 Spec 是 ADR-336 拆出去的「後半段」。

## 概述

Spec 025 讓審核員可以判定「確認重複／不是重複」，但判定不動單（ADR-341）。
10/23 Carol 與工程師定案：**審核頁要能直接處理重複的單**。

本 Spec 的處理方式（2026-10-24 使用者定案，取代 Notion §12a 的四選一表）：

1. 審核員選一張**主要單**（例如 A）。
2. 主要單的欄位，前端送來最後要的值。
3. 兩張單的每一項需求，前端說要怎麼處理：留著（可改值）、併進主要單的某一項、搬到主要單、取消。
4. 另一張單（B）**一定整張取消**。B 上要留的東西，一律併進或搬到主要單；沒選的跟著 B 取消（ADR-371）。
5. 後端在**一筆交易**裡寫完，留下一筆 `merged` 事件。

```
例一：B 的需求全部併入

處理前                          處理後
A ticket                        A ticket
 ├ task1 human 2                 ├ task1 human 7   ← 併入 B.task1，數量由前端輸入
 └ task2 water 1                 └ task2 water 6   ← 併入 B.task2
B ticket                        B ticket：已取消，replaced_by = A
 ├ task1 human 5                 ├ task1：已取消，merged_into = A.task1，接單的人搬到 A.task1
 └ task2 water 5                 └ task2：已取消，merged_into = A.task2
```

```
例二：只要 B 的一部分（審核員選 B.task1 併入、B.task3 搬過去、B.task2 不要）

處理前                          處理後
A ticket                        A ticket
 └ task1 human 2                 ├ task1 human 7   ← 併入 B.task1
                                 └ task3 food 3    ← B.task3 整項搬過來（uuid、接單紀錄不變）
B ticket                        B ticket：已取消，replaced_by = A
 ├ task1 human 5                 ├ task1：已取消，merged_into = A.task1
 ├ task2 water 5                 ├ task2：已取消（審核員沒選）
 └ task3 food 3                  └ （已搬到 A）
```

「不是重複」沿用 025 的 `reject`，不變。

## main 上的現況（2026-10-24 查證，@a272dfdd4）

| 項目 | 現況 | 位置 |
|---|---|---|
| 判定 API | confirm／reject／revoke，只改配對卡 | `app/services/dedup_review.py`、`app/api/v1/endpoints/duplicate_pairs.py` |
| 配對卡的單位 | 快層比的是**需求對需求**（`ticket_task`），整張單不比 | `app/dedup_engine/fast.py` |
| 卡片兩邊的摘要 | 只有標題、類型、狀態、座標、開單者 | `dedup_review.py::EntitySummary` |
| `merged` 事件類型 | 已在 CHECK 裡，沒人寫 | `app/models/dedup.py::AUDIT_EVENT_TYPES` |
| 刪單 | 取消＋軟刪除，通知接單志工 | `app/services/ticket.py::delete_ticket` |
| 改單／改需求 | 需要 `ticket.edit`；需求的 `status` 不能改 | `ticket.py::update_ticket`、`update_ticket_task` |
| 單的狀態 | 依需求推算 | `app/services/ticket_status.py::recompute_ticket_status` |
| 資料檢核 | 內容改了會退回 `no_audit` | `app/services/ticket_audit.py::void_stale_verdict` |
| 接單紀錄 | 同一人同一項需求只能一筆 | `models/ticket_task.py::TaskAssignment`（`uq_assignment_task_actor`） |
| 需求滿額 | 人數 ≥ 數量就算滿 | `ticket.py::_lock_task_with_room` |
| 「被誰取代」 | 無欄位 | — |
| 資料檢核員的單權限 | 沒有 `ticket.edit`、`ticket.delete` | `scripts/seed_rbac.py` |

## 目標

- 資料檢核員或 super admin 在 AI 重複審核頁，一次送出就把兩張單處理完。
- 結果完全由前端輸入決定，後端只檢查資料是否合法、是否被別人改過。
- 處理前的完整內容、處理方式、處理後的結果都留在 `merged` 事件裡。
- 受影響的志工與開單者收到通知（§6，DEDUP-009 的 notice 2、3）。
- 被取消的單和需求，記得是被哪一張、哪一項取代。

## 非目標

- **不能撤銷**處理結果（ADR-376）。
- **不建立新單 C**（ADR-367）。
- **不處理站點**：站點卡呼叫 resolve 回 422（ADR-377）。站點是否整個排除在 AI 重複審核外，另案決定（Notion §8 第 1 項）。
- **不改送單時的提示**：回傳「哪些欄位疑似重複」（Notion §12b 第 1 項）另開票。
- **不改演算法**，不改 `app/dedup_engine/`。
- **不處理前端**：交接說明寫在 plan。

---

## 1. 權限（ADR-366）

| 動作 | 權限 |
|---|---|
| 讀兩張完整的單 | `ai_duplicate.view` |
| 處理 | `ai_duplicate.review` |

處理時**不檢查** `ticket.edit`、`ticket.delete`。資料檢核員不必另外拿一般的改單、刪單權限。

## 2. 讀取：`GET /admin/duplicate-pairs/{uuid}` 加上兩張完整的單（ADR-373）

既有回應不變，多一個欄位 `tickets`：

```json
"tickets": {
  "low":  { ...TicketForReview },
  "high": { ...TicketForReview }
}
```

- 卡是 `ticket_task` → 取兩項需求各自所屬的單；卡是 `ticket` → 就是那兩張單。
- 卡是 `station` → `tickets` 為 `null`。
- 某一邊的單已取消或軟刪除 → 那一邊為 `null`。

`TicketForReview`：

| 欄位 | 說明 |
|---|---|
| `uuid`、`version` | `version` 用在處理時的版本檢查（ADR-374） |
| `title`、`description`、`priority`、`task_type`、`disaster_types`、`person_trapped_reported`、`immediate_danger_reported` | 單的欄位 |
| `contact_name`、`contact_phone`、`contact_email` | 聯絡人。需要 `ai_duplicate.view`，審核員要能比對 |
| `longitude`、`latitude` | 單的點 |
| `status`、`audit_status` | 唯讀 |
| `created_by`、`created_at` | 開單者 |
| `tasks` | 還在的需求：`uuid`、`task_type`、`task_name`、`task_description`、`quantity`、`status`、`claim_count`、`recruiting_stopped`、`properties` |
| `tasks[].properties` | 還在的細項：`uuid`、`property_name`、`property_value`、`quantity`、`status`、`comment` |
| `photos` | 還在的照片：`uuid`、`url`、`created_at`（ADR-384） |
| `disaster_details` | 災害欄位答案：`{property_name: [value, …]}`（ADR-385） |

清單 API（`GET /admin/duplicate-pairs`）**不加**這個欄位，避免一頁 200 張卡都載入完整的單。

## 3. 處理：`POST /admin/duplicate-pairs/{uuid}/resolve`（ADR-365、366）

### 3.1 Request

```json
{
  "primary": "low",
  "expected_versions": { "low": "…", "high": "…" },
  "ticket": {
    "title": "…",
    "priority": "high",
    "contact_phone": "…"
  },
  "primary_tasks": [
    { "task": "<A.task1>", "action": "keep", "absorb": ["<B.task1>"], "values": { "quantity": 7 } },
    { "task": "<A.task2>", "action": "keep", "absorb": ["<B.task2>"], "values": { "quantity": 6 } }
  ],
  "secondary_tasks": [
    { "task": "<B.task3>", "action": "move" }
  ],
  "note": "已電話確認是同一戶"
}
```

| 欄位 | 必填 | 說明 |
|---|---|---|
| `primary` | ✓ | `low` 或 `high`，指卡片的哪一邊。卡是 `ticket_task` 時，指那一邊需求所屬的單 |
| `expected_versions` | ✓ | 審核員看到的兩張單的 `version`（ADR-374） |
| `ticket` | | 主要單要改的欄位。只帶要改的。可改的欄位見 §3.2 |
| `primary_tasks` | ✓ | 主要單**每一項**還在的需求（ADR-368） |
| `secondary_tasks` | ✓ | 另一張單**每一項**還在、而且沒被 `absorb` 的需求 |
| `photos` | 兩張單有照片時 ✓ | 兩張單**每一張**還在的照片：`keep` 或 `cancel`（ADR-384） |
| `disaster_details` | 另一張單有災害欄位答案時 ✓ | 主要單處理後**完整的**災害欄位答案，整份取代（ADR-385） |
| `note` | | 審核員備註，上限 1000 字 |

### 3.2 主要單可改的欄位

`title`、`description`、`priority`、`task_type`、`disaster_types`、`person_trapped_reported`、
`immediate_danger_reported`、`contact_name`、`contact_phone`、`contact_email`。

- 驗證和建單時相同：長度、`disaster_types` 的合法值（`validate_disaster_types`，`keep` = 主要單現有的）。
- `priority` 最多 20 字、`task_type` 最多 50 字（欄位長度），超過回 422（ADR-381）。`priority` 的合法值不驗，同 `updateTicket`（ADR-126）。
- `status` 不能改，照需求推算。
- 位置、地址不在這一版（ADR-367）。

### 3.3 需求的處理（ADR-368～370）

**主要單的需求**（`primary_tasks`）：

| `action` | 結果 |
|---|---|
| `keep` | 保留，套用 `values`。`absorb` 列出的另一張單的需求併進來 |
| `cancel` | 取消（同 `delete_ticket_task` 的取消方式）。不能帶 `absorb` |

`values` 可改：`task_name`、`task_description`、`quantity`。

**細項**（`task_properties`，ADR-380）：`keep` 和 `move` 的項目要帶 `properties`，列出處理後這一項的**每一個**細項：

```json
{ "task": "<A.task1>", "action": "keep", "absorb": ["<B.task1>"], "values": { "quantity": 7 },
  "properties": [
    { "property": "<A.task1 的細項>", "action": "keep", "values": { "quantity": 3 } },
    { "property": "<B.task1 的細項>", "action": "keep" },
    { "property": "<B.task1 的另一個細項>", "action": "cancel" }
  ] }
```

- 要列的細項 = 這一項自己的，加上它 `absorb` 的需求的。
- `keep`：保留，套用 `values`（`property_value`、`quantity`、`comment`）。原本屬於被併入需求的，改掛到這一項。
- `cancel`：取消（軟刪除）。
- `cancel` 的需求不帶 `properties`，細項跟著需求一起取消。

**另一張單的需求**（`secondary_tasks`，加上被 `absorb` 的）：

| 處理 | 結果 |
|---|---|
| 被 `absorb` | 取消，`merged_into_uuid` = 併入的那一項。接單紀錄搬過去（ADR-369） |
| `move` | 整項搬到主要單：`ticket_uuid` 改成主要單，uuid、接單紀錄都不變。可帶 `values` |
| `cancel` | 取消 |

### 3.3.1 照片與災害欄位答案（ADR-384、384）

```json
"photos": [
  { "photo": "<A 的照片>", "action": "keep" },
  { "photo": "<B 的照片>", "action": "keep" },
  { "photo": "<B 的另一張照片>", "action": "cancel" }
],
"disaster_details": { "power_outage": ["yes"], "utility_hazards": ["gas", "water"] }
```

- **照片**：兩張單每一張還在的照片都要列出。
  - `keep`：留在主要單，B 的照片改掛到主要單（`ref_uuid` = 主要單）。
  - `cancel`：軟刪除。
- **災害欄位答案**：主要單處理後的完整答案，整份取代（同 `setTicketDisasterDetails`）。值由前端輸入，可以從 A、B 挑，也可以改。
  - 另一張單有答案時必填，不能漏，否則 422。只有主要單有答案時可省略，省略就不動。
  - 大小限制同 `setTicketDisasterDetails`（ADR-267）。
- 地址仍不在這一版（ADR-367），留在已取消的另一張單上。

### 3.4 檢查（全部通過才寫入）

| 情況 | 回應 |
|---|---|
| 沒有 `ai_duplicate.review` | 403 |
| 卡不存在 | 404 |
| 卡不是待審也不是 `confirmed`；或已經處理過 | 409 |
| 卡是 `station` | 422（ADR-377） |
| 卡的兩邊是同一張單的需求 | 422 |
| 任一張單已取消或刪除 | 409 |
| `expected_versions` 對不上 | 409，請重新比對（ADR-374） |
| 有需求沒列到、列了兩次、或列了不屬於這兩張單的需求 | 422 |
| `absorb` 的需求類型（`task_type`）和併入的那一項不同 | 422（ADR-370） |
| 處理後某項需求的接單人數大於 `quantity` | 422（ADR-370） |
| `quantity` 不合 `_validate_need_size`（rescue 以外必填、至少 1） | 422 |
| `keep`／`move` 的項目漏列、重複列細項，或列了不屬於它的細項 | 422（ADR-380） |
| 主要單處理後沒有任何需求 | 422 |
| `priority` 超過 20 字、`task_type` 超過 50 字 | 422（ADR-381） |
| 照片漏列、重複列，或列了不屬於這兩張單的照片 | 422（ADR-384） |
| 另一張單有災害欄位答案，但 request 沒帶 `disaster_details` | 422（ADR-385） |
| `disaster_details` 超過大小限制 | 422（ADR-267） |

### 3.5 寫入順序（一筆交易）

1. 鎖配對卡（`FOR UPDATE`），檢查狀態。
2. 依 uuid 順序鎖兩張單，再依 uuid 順序鎖兩張單的需求（ADR-291 的鎖順序）。
3. 檢查版本、檢查 request（§3.4）。
4. 記錄處理前的完整內容（§5）。
5. 改主要單的欄位。
6. 處理每一項需求與細項；搬接單紀錄（ADR-369）；重算需求狀態（ADR-370）。
7. 照片改掛或軟刪除；帶了 `disaster_details` 就取代主要單的答案（ADR-384、384）。
8. 另一張單取消＋軟刪除，`replaced_by_uuid` = 主要單（ADR-371）。
8. 主要單 `recompute_ticket_status`、`void_stale_verdict`。
9. 配對卡 → `confirmed`，記 `reviewed_by`、`reviewed_at`。
10. 寫 `merged` 事件。
11. commit。
12. commit 之後發通知（§6）。通知失敗只記 log，不影響已完成的處理。

### 3.6 Response

回傳處理後的卡（同 detail 的形狀，含 `tickets` 與 `events`）。被取消的那一邊 `tickets` 為 `null`。

## 4. 資料庫變更

| 表 | 變更 | 說明 |
|---|---|---|
| `tickets` | 新增 `replaced_by_uuid`（FK `tickets.uuid`，nullable） | 整張被取消時指向主要單 |
| `ticket_tasks` | 新增 `merged_into_uuid`（FK `ticket_tasks.uuid`，nullable） | 被併入時指向併入的那一項 |

這兩個欄位只做紀錄，GraphQL 不回傳（ADR-372）。導向主要單靠通知：每則通知的 `ref_uuid` 都是主要單（§6）。

不新增事件類型，`merged` 已經在 CHECK 裡。

## 5. `merged` 事件（ADR-375）

| 欄位 | 內容 |
|---|---|
| `event_type` | `merged` |
| `pair_uuid` | 這張卡 |
| `primary_uuid`、`duplicate_uuid` | 主要單、另一張單 |
| `actor_uuid` | 審核員 |
| `source_layer` | `manual` |
| `decision_reason` | `note` |
| `before_state` | `{pair_status, tickets: {low: …, high: …}}`：兩張單處理前的完整內容（同 `TicketForReview`，含需求與每一項的接單人 uuid） |
| `after_state` | `{pair_status: "confirmed", tickets: {…}}`：處理後的內容 |
| `affected_refs` | `{request: <原始 request>, absorbed: {<B.task>: <A.task>}, moved: […], canceled_tasks: […], moved_assignments: […], dropped_assignments: […], moved_properties: […], canceled_properties: […], moved_photos: […], canceled_photos: […]}` |
| `reversible` | `false`（ADR-376） |

## 6. 通知（ADR-379）

commit 之後發送，照 `dedup_review.notify_new_cards` 的寫法：失敗只記 log，不回滾處理。
所有通知 `ref_type = "ticket"`、`ref_uuid` = 主要單，點開就到主要單。
通知內容**不放聯絡人的電話或 Email**，請收件人到主要單的頁面看。

| 類型 | 對象 | 什麼時候 | 內容 |
|---|---|---|---|
| `dedup_task_merged` | 搬過去的志工 | 需求被 `absorb`，或整項 `move` 到主要單（兩者的聯絡人都改成主要單的；同一人在兩邊都已接的，不另通知） | 「你承接的需求已合併到「<主要單標題>」」，聯絡人改成主要單的聯絡人 |
| `dedup_task_canceled` | 被取消需求上的志工 | 需求被 `cancel`（不是併入） | 「你承接的需求已取消」，附主要單 |
| `dedup_ticket_merged` | 另一張單的開單者 | 每次處理 | 「你的單已併入「<主要單標題>」」，列出哪些需求併入或搬到主要單、哪些取消 |
| `dedup_ticket_updated` | 主要單的開單者 | 主要單的欄位、需求或細項有變 | 「你的單已因重複審核更新」 |

- 一個人同時符合多種，每種各收一則；同一種只收一則（一個志工搬了兩項需求，只收一則）。
- 審核員本人不收。
- `task_name`、`ticket.title` 照現有通知的寫法放進標題。

## 7. 邊界情況

- 同一位志工在 A.task1 和 B.task1 都有接單：併入後只留一筆（A 的），人數算一個（ADR-369）。
- 主要單原本已經檢核過（`audited`）：內容一改就退回 `no_audit`（既有規則）。
- 主要單原本某項需求已滿，併入後數量加大：需求重新開放（ADR-370）。
- 需求已被開單者手動停止招募（`recruiting_stopped_at`）：維持停止，數量仍不得少於人數。
- 另一張單還在其他待審卡裡：那些卡不動，摘要顯示 `deleted: true`；對那些卡 resolve 回 409（ADR-378）。
- 兩個審核員同時處理同一張卡：一個成功，另一個 409。
- 處理過的卡再 `revoke`：409（ADR-376）。
