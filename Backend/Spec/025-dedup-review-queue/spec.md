# Design: AI 重複審核 後端 — Dedup Review Queue

**Date**: 2026-10-20
**Feature**: 025-dedup-review-queue
**Status**：已實作並完成 Docker 從零驗證（2026-10-20，`d6e39d567`，全套件 2276 passed、覆蓋率 96%，見 `verification.md`）。PR 尚未開。
**Base**: `main` @ `108734cda`，分支 `feat/dedup-review-queue`
**Notion**: DEDUP-007（審核動作與後端）、DEDUP-008（AI 重複審核頁，前端 Ethan）、DEDUP-009（通知）、
ROLE-BASED TIMELINE →「Super admin access to AI 重複審核 (DEDUP-008)」（Carol 指派給 Popo）
**Decisions**: `decisions.md`（ADR-336～345）

## 概述

去重快層（Spec 021／022，PR #73 已合）在使用者「照樣建立」時會留下一張配對卡
（`duplicate_pairs`，`status = dup_ignored`）和一筆事件（`dedup_audit_events`，
`ignored_by_submitter`）。目前**沒有任何 API 讀得到這些卡，也沒有人能處理它們**。

本功能提供 AI 重複審核頁要用的後端：列出待審的配對卡（帶兩邊摘要）、判定「確認重複／不是重複」、
撤銷判定、新卡產生時提醒審核員，並讓 super_admin 與 data_auditor 拿到對應權限。

**權限管的是資料，不是演算法。** `ai_duplicate.view` 管能不能讀配對卡與審核紀錄，
`ai_duplicate.review` 管能不能改配對卡狀態。`app/dedup_engine/`（Chi 的演算法）不經過這些權限，本功能也不改它。

## main 上的現況（2026-10-20 查證）

| 項目 | 現況 | 位置 |
|---|---|---|
| 權限定義 | `ai_duplicate.view`、`ai_duplicate.review` 已存在 | `app/core/permissions.py:80-81` |
| 角色授權 | **沒有任何角色**拿到，super_admin 與 data_auditor 都沒有 | `scripts/seed_rbac.py`（檔頭第 13 行） |
| 測試 | 明確斷言 super_admin **沒有**這兩個權限 | `tests/test_me_capabilities.py:84-85` |
| 配對卡 | 快層只寫 `dup_ignored`；沒有群組（慢層未做） | `app/services/dedup.py::_ignore_pair` |
| 讀取 API | 無。repository 只有送單時用的兩個方法 | `app/repositories/dedup_repository.py` |
| 判定動作 | 無 | — |
| 待審通知 | 掛在沒人會寫的 `is_duplicate` 上，永遠不會觸發 | `app/services/ticket.py:888`、`app/services/station.py:302` |
| 可參考的先例 | 審核端點形狀：role-requests；鎖與撤銷：站點建議 | `app/api/v1/endpoints/role_requests.py`、`app/services/suggestion.py` |

## 目標

- super_admin 與 data_auditor 打開 AI 重複審核頁，看到所有待審配對卡與兩邊摘要，並能判定、撤銷。
- 其他身分在 API 層被擋下；`GET /api/v1/users/me` 的 `capabilities` 不列這些權限，前端據此隱藏入口（ADMIN-019）。
- 每個判定與撤銷都留下事件。
- 使用者照樣建立後，審核員收到一則提醒。

## 非目標

- **不做合併、取代**，不改 ticket／task／station 本身，不寫 `is_duplicate`（ADR-336、341）。
- **不做擁有者與志工通知**（屬合併票，ADR-345）。
- **不改演算法**，不改 `app/dedup_engine/`。
- **不做慢層**（背景掃描、群組）。API 以配對卡為單位，`duplicate_group_uuid` 原樣回傳。
- **批次匯入不去重**（ADR-299 不變）。
- **不處理前端**：交接說明寫在 plan。

---

## 1. 權限（ADR-337、342）

| 權限 | super_admin | data_auditor | 其他 |
|---|---|---|---|
| `ai_duplicate.view` | all | all | — |
| `ai_duplicate.review` | all | all | — |
| `ai_duplicate.revoke`（新增） | all | — | — |

- `seed_rbac.py` 加授權、改檔頭說明；`Perm` 加 `AI_DUP_REVOKE`。
- 既有資料庫：部署時 `deploy.sh` 在 migrate 之後會跑 seed，seed 會補上缺的授權；另有 data migration `1649d30b0122` 當保險（新增 `ai_duplicate.revoke` 權限列、為兩個角色 INSERT 缺的授權列，不動 runtime 改過的，ADR-055）。

## 2. API（ADR-338）

全部在 `/api/v1/admin/duplicate-pairs`，權限檢查在 service 層。

### 2.1 `GET /admin/duplicate-pairs` — `ai_duplicate.view`

| 參數 | 預設 | 說明 |
|---|---|---|
| `status` | 待審（`dup_ignored`＋`suggested`，ADR-339） | 可多選，含 `confirmed`、`rejected` |
| `entity_kind` | 全部 | `ticket_task`／`station`／`ticket` |
| `source_layer` | 全部 | `fast`／`slow`／`manual`／`system` |
| `sort` | `-created_at` | `similarity`、`-similarity`、`created_at`、`-created_at` |
| `skip`、`limit` | 0、50 | `limit` 上限 200 |

回傳 `{ items, total }`。每個 item：

- 卡本身：`uuid`、`entity_kind`、`status`、`similarity`、`evidence`（原樣，結構由 engine 決定）、
  `engine_version`、`method`、`source_layer`、`duplicate_group_uuid`、`hint_outcome`、
  `created_at`、`reviewed_by`、`reviewed_at`。
- `low`、`high` 兩邊的摘要（ADR-340），三種實體共用一個形狀（`app/services/dedup_review.py::EntitySummary`）：

  | 欄位 | ticket_task | station | ticket |
  |---|---|---|---|
  | `uuid`、`deleted` | ✓ | ✓ | ✓ |
  | `title` | `task_name` | `name` | `title` |
  | `type` | `task_type` | `type` | `task_type` |
  | `status` | `status` | `operational_status` | `status` |
  | `ticket_uuid`、`ticket_title` | 所屬工單 | — | — |
  | `longitude`、`latitude` | 所屬工單的點 | 中心點 | 點 |
  | `created_by`、`created_at` | ✓ | ✓ | ✓ |

  - 模型沒有地址欄位，比對位置用座標（取 geometry 的中心點，多邊形站點也只給一個點）。
  - 實體或（task 的）所屬工單已軟刪除 → `deleted: true`，其他欄位為 null。
  - 依 `entity_kind` 分組、每種一條 query 批次載入（`DuplicatePairRepository.entity_summaries`）。

### 2.2 `GET /admin/duplicate-pairs/{uuid}` — `ai_duplicate.view`

單張卡（同上的形狀）＋ `events`：這張卡的 `dedup_audit_events`，依時間排序。
找不到或已軟刪除 → 404。

### 2.3 `POST /admin/duplicate-pairs/{uuid}/confirm`、`/reject` — `ai_duplicate.review`

- 鎖住這張卡（`FOR UPDATE`）；不是待審狀態 → 409（ADR-343）。
- `status` → `confirmed`／`rejected`，記 `reviewed_by`、`reviewed_at`。
- 寫事件 `confirmed`／`rejected`：`before_state = {status: 原狀態}`、`after_state = {status: 新狀態}`、
  `actor_uuid`、`source_layer = manual`、`decision_reason`（body 可帶 `note`，選填，長度上限 1000）。
- 不動任何實體（ADR-341）。
- 回傳更新後的卡。

### 2.4 `POST /admin/duplicate-pairs/{uuid}/revoke` — `ai_duplicate.review`（＋`ai_duplicate.revoke`）

- 鎖住這張卡；不是 `confirmed`／`rejected` → 409。
- `reviewed_by` 不是目前使用者 → 還需要 `ai_duplicate.revoke`，沒有 → 403（ADR-342）。
- 狀態改回最近一筆判定事件的 `before_state.status`，清掉 `reviewed_by`／`reviewed_at`。
- 寫事件 `verdict_revoked`（ADR-344）。
- 回傳更新後的卡。

## 3. 待審提醒（ADR-345）

- `dedup_submission.submit_new_ticket`／`submit_new_task`／`submit_new_station` commit 之後，
  這次送出若寫了 `dup_ignored` 卡，就發一則通知給有 `ai_duplicate.review` 的人
  （`NotificationRecipientResolver.resolve_permission`），內容「N 筆疑似重複待審」。
  類型 `dedup_review_pending`，`ref_type = "dedup_review"`、`ref_uuid = None`（指向審核頁）。
- 通知失敗只記 log，不影響已完成的建立。
- 移除 `ticket.py`、`station.py` 裡兩個永遠不會觸發的 `dedup_flag_*` 分支與其測試。

## 4. 資料庫變更

| 變更 | 說明 |
|---|---|
| `ck_dedup_audit_events_type` | 加入 `verdict_revoked`（ADR-344） |
| `permissions` | 新增 `ai_duplicate.revoke` |
| `role_permission_assign` | super_admin：view／review／revoke；data_auditor：view／review |

清單查詢用既有的 `ix_duplicate_pairs_status`（partial，`delete_at IS NULL`）。

## 5. 邊界情況

- 實體被軟刪除：卡照常顯示，摘要 `deleted: true`，仍可判定。
- 兩個審核員同時判定同一張卡：一個成功，另一個 409。
- 撤銷別人的判定、沒有 revoke 權限：403；自己撤自己的：可以。
- 已撤銷的卡再撤一次：409（它已回到待審）。
- 平台以外的身分（team 身分、一般 user）：403。
- `limit` 超過上限：422。
