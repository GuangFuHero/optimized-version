# Plan: 028-dedup-resolve

**Spec**: `spec.md`　**Decisions**: `decisions.md`（ADR-365～380）
**Branch**: `feat/dedup-resolve`（從 `origin/main` @ `a272dfdd4` 開，未設 upstream）

每個 Task：先寫會失敗的測試（RED）→ 實作（GREEN）→ 全套件不比基準差 → 單獨 commit（只 `git add` 本 Task 的檔案，
commit 前看 `git diff --cached --stat`）。
測試環境：專屬 DB 與 redis（Task 0 決定 port，不能和 025 的 5435／6390 共用）；
`TEST_REDIS_URL` 一定要設，不能碰 6379（enerlyzer 的）。
通知失敗 rollback 後的回傳，要用 API 層測試，service 測試抓不到 session 過期（`MissingGreenlet`）。

## 新增與修改的檔案

| 檔案 | 內容 |
|---|---|
| `alembic/versions/<new>_dedup_merge_refs.py` | 兩個新欄位（接 `79a19cabc98a`） |
| `app/models/request.py`、`app/models/ticket_task.py` | `replaced_by_uuid`、`merged_into_uuid` |
| `app/services/dedup_review_tickets.py`（新） | 讀兩張完整的單、算 `version`（§2） |
| `app/services/dedup_resolve_plan.py`（新） | 純函式：request ＋ 兩張單的快照 → 處理計畫，或 422（§3.3、§3.4） |
| `app/services/dedup_resolve.py`（新） | 鎖、版本檢查、寫入、事件、通知（§3.5、§5、§6） |
| `app/services/dedup_review.py` | `get_pair` 帶 `tickets`；`revoke` 對處理過的卡回 409 |
| `app/schemas/duplicate_pair.py` | `TicketForReview`、`ResolveRequest` 等 |
| `app/api/v1/endpoints/duplicate_pairs.py` | `POST /{uuid}/resolve` |

拆成三個新檔，是因為 `dedup_review.py` 已有 347 行，處理的邏輯加進去會超過 800 行。
計畫（plan）和寫入分開，讓 §3.4 那一大張 422 表可以用純函式測，不必每個都建資料庫資料。

---

## Task 0：基準

- ✅ 2026-10-24：`75f1a5689` 上 **2683 passed、0 failed，覆蓋率 96%**，`pytest -n 4` 跑 11 分 42 秒。
  環境：`dedup028-testdb`（5436）、`dedup028-testredis`（6391，`TEST_REDIS_URL` db 15 往下、`REDIS_URL` db 1）。

- [ ] 在 worktree `uv sync`，另裝 `pytest-cov`（`uv pip install --python .venv/bin/python pytest-cov`）。
- [ ] 起專屬的 test DB（h3 image）與 redis，先查 port 沒被佔用。
- [ ] 全套件跑一次（`COVERAGE_CORE=sysmon`、`pytest -n 4`），記下 passed 數與覆蓋率。

## Task 1：兩個新欄位（ADR-372）

- ✅ 2026-10-24：migration `c3f1a9d27b54`（接 `79a19cabc98a`）；全套件 **2687 passed**（基準 +4），覆蓋率 96%。
  第一次全套件抓到 plan 漏掉的兩處（3 failed）：`history_fields.py` 要把兩個欄位分類（列為 `_FK` 排除，時間軸顯示的是刪除事件）；
  `seed_mock_scenarios.sql` 的清除段要先放掉別人的單／需求指向 mock 資料的這兩個參照。

- [ ] migration：`tickets.replaced_by_uuid`（FK `tickets.uuid`，nullable）、`ticket_tasks.merged_into_uuid`（FK `ticket_tasks.uuid`，nullable）。
  downgrade 在有值時失敗，不默默丟掉紀錄（同 025 `a5e641c99923` 的作法）。
- [ ] model 加欄位。GraphQL 不加（ADR-372）。
- [ ] migration 接 main 的 head `79a19cabc98a`。#96（`7370daf4c8f7`）、#98（`e4b7c2a19d63`）也接同一個 parent，開 PR 前依合併順序改 `down_revision`。
- [ ] 測試：
  - migration upgrade／downgrade；有值時 downgrade 失敗。
  - FK：指向不存在的單 → 寫入失敗。
  - `test_migrations_match_models` 照常通過（migration 與 model 欄位一致）。

## Task 2：讀取兩張完整的單（ADR-373、374）

- ✅ 2026-10-24：`app/services/dedup_review_tickets.py`；全套件 **2707 passed**（+20），覆蓋率 96%；之後補一個測試（兩邊都已取消），單檔 18 passed。
  **改了設計**：`version` 改成內容雜湊，不用 `updated_at`。實測只改單的 `title`，`base_geometries.updated_at` 不變（ADR-374 已更新）。
  plan 原寫的 `ticket_version(ticket, tasks, properties)` 改成 `ticket_version(TicketForReview)`。

- [ ] `dedup_review_tickets.py`：
  ```python
  @dataclass(frozen=True)
  class TicketForReview: ...          # spec §2 的欄位，含 tasks[].properties、claim_count

  async def tickets_for_pair(db, pair) -> tuple[TicketForReview | None, TicketForReview | None]
  def ticket_version(ticket, tasks, properties) -> str   # sha256，見 ADR-374
  ```
  - `ticket_task` 卡 → 取兩項需求所屬的單；`ticket` 卡 → 那兩張單；`station` 卡 → `(None, None)`。
  - 已取消或軟刪除的單 → `None`。
  - 固定查詢數：單一條、需求一條、細項一條、接單人數一條（`GROUP BY task_uuid`）。
- [ ] `dedup_review.get_pair` 帶 `tickets`；schema 加 `TicketForReview`、`DuplicatePairDetail.tickets`。清單 API 不變。
- [ ] 測試：
  - `ticket_task` 卡回兩張單；`ticket` 卡；`station` 卡 `tickets` 為 `null`；一邊已刪除 → 那邊 `null`。
  - 已刪除的需求、細項不出現；`claim_count` 正確。
  - `version`：改單的欄位、改需求、加需求、改細項、加細項都會變；接單不會變（ADR-374）。
  - 查詢數固定（不隨需求數成長）。
  - API：super_admin、data_auditor 看得到聯絡人；沒有 `ai_duplicate.view` 403。

## Task 3：處理計畫 — 純函式（ADR-367、368、370、371、377、380）

- ✅ 2026-10-24：`app/services/dedup_resolve_plan.py`、`ResolveRequest`（`app/schemas/duplicate_pair.py`，未知欄位 422）；純函式測試 33 個；
  突變測試 9 條（類型、人數、漏列需求／細項、重複志工、重複列、主要單方向、細項搬移、全部取消）都會被抓到。全套件 **2741 passed**，覆蓋率 96%。

- [ ] `dedup_resolve_plan.py`：
  ```python
  def build_plan(request: ResolveRequest, pair_kind: str,
                 low: TicketForReview, high: TicketForReview) -> ResolvePlan
  ```
  `ResolvePlan` 列出：主要單、另一張單、主要單欄位的變更、每項需求的處理（keep／cancel／absorb／move）與新值、
  每個細項的處理、處理後每項需求的接單人數（扣掉重複的志工）。不碰資料庫。
- [ ] 檢查（全部回 `ValueError` → 422）：spec §3.4 中 422 的每一列。
- [ ] 主要單欄位用和建單相同的驗證；`disaster_types` 的合法值要查資料庫，留到 Task 4 呼叫 `validate_disaster_types`。
- [ ] 測試（純函式，不用資料庫）：
  - 例一（B 全部併入）、例二（部分併入＋搬移＋取消）產生的計畫正確。
  - §3.4 的每一個 422 各一個測試。
  - 同一位志工兩邊都有接單 → 人數算一個（ADR-369）。
  - 接單人數 = 新數量 → 通過；大於 → 422。
  - rescue 可以沒有數量；其他類型沒有數量 → 422。

## Task 4：寫入（ADR-365、366、369、370、371、374、375）

- ✅ 2026-10-24：`app/services/dedup_resolve.py`；`dedup_review` 公開 `lock_pair`／`checked_note`／`pair_detail`／`has_merged_event`，`revoke` 對處理過的卡 409；
  `ticket._mark_need_deleted` 改名為公開的 `mark_need_deleted`。service 測試 25 個，全套件 **2766 passed**，覆蓋率 96%。
  突變測試 8 條都會被抓到；第一輪「拿掉卡片鎖」「拿掉已處理檢查」沒被抓到，補了 reject 與 resolve 同時送出的並發測試、改比對訊息後才抓到。

- [ ] `dedup_resolve.py`：
  ```python
  async def resolve(db, *, actor, pair_uuid, request) -> ResolveResult
  ```
  照 spec §3.5 的順序：鎖卡 → 依 uuid 鎖兩張單 → 依 uuid 鎖需求 → 重讀快照、比 `version`（409）→ `build_plan` →
  寫入 → 卡改 `confirmed` → `merged` 事件 → commit。只檢查 `ai_duplicate.review`。
  - 需求的取消用 `_mark_need_deleted` 的同一套規則；整張單取消照 `delete_ticket` 的欄位（`status`、`delete_at`），加上 `replaced_by_uuid`。
    不呼叫這兩個函式本身：它們會檢查 `ticket.delete`、自己 commit、自己發通知。
  - 接單紀錄搬移：`UPDATE task_assignments SET task_uuid = A`；重複的志工刪 B 那筆。
  - 需求狀態依 ADR-370 重算；主要單 `recompute_ticket_status`、`void_stale_verdict`。
  - 細項：`keep` 改值、改掛 `task_uuid`；`cancel` 軟刪除。
- [ ] `dedup_review.revoke`：卡有 `merged` 事件 → 409（ADR-376）。
- [ ] 測試（service，真資料庫）：
  - 例一、例二寫完後，A、B、需求、細項、接單紀錄、配對卡、事件逐欄比對。
  - 志工搬移後，A 的需求滿額 → `fulfilled`；併入後還有空位、原本滿額 → 回 `pending`；停止招募的維持。
  - 主要單原本 `audited` → `no_audit`。
  - 409：版本對不上；卡已處理過；任一張單已取消；卡已被 reject。
  - 已 confirm 的卡（025 流程）可以處理（ADR-365）。
  - 處理過的卡 `revoke` → 409。
  - 中途失敗（例如在寫事件前丟例外）→ 全部回滾，A、B 不變。
  - 兩個審核員同時處理同一張卡 → 一個成功，另一個 409（兩個 session 並發）。
  - 只有 `ai_duplicate.review`、沒有 `ticket.edit`／`ticket.delete` 的身分可以處理（ADR-366）。
  - `audit_logs` 有記到每一列的變更。
  - 突變測試：拿掉版本檢查、拿掉 `FOR UPDATE`、拿掉人數檢查，各自要有測試會失敗。

## Task 5：REST 端點（ADR-365）

- ✅ 2026-10-24：`POST /admin/duplicate-pairs/{uuid}/resolve`；API 測試 13 個（seed 的 super_admin／data_auditor 200，user／team admin／member 403，格式錯 422×4，計畫拒絕 422，版本過期 409，404，處理後撤銷 409）。全套件 **2779 passed**，覆蓋率 96%。

- [ ] `POST /admin/duplicate-pairs/{uuid}/resolve`，schema `ResolveRequest`；回傳處理後的卡（detail 形狀）。
  錯誤對應沿用 `_refusal`（404／409／422）。
- [ ] 測試（API 層，用 seed 的角色）：
  - data_auditor、super_admin 200；team admin、team member、一般 user 403。
  - request 格式錯（缺 `primary`、未知 `action`）422。
  - 回傳的 `tickets`：被取消的那一邊 `null`；`events` 最後一筆是 `merged`。

## Task 6：通知（ADR-379）

- ✅ 2026-10-24：`app/services/dedup_resolve_notices.py`（覆蓋率 100%）；通知測試 9 個（含通知失敗時 REST 仍回 200）。全套件 **2788 passed**，覆蓋率 96%。
  補了 spec §6 漏的收件人：整項 `move` 過去的需求上的志工也收 `dedup_task_merged`。

- [ ] `dedup_resolve.py` 在 commit 之後發四種通知（spec §6）；失敗只記 log、rollback 後 refresh actor（同 `notify_new_cards`）。
- [ ] 每一種、每位收件人只收一則；審核員本人不收（`dispatch` 本來就排除 `actor_uuid`）。
- [ ] `Spec/Docs/er-diagram.md` 的通知類型清單加這四種。
- [ ] 測試：
  - 例一：B 的志工收到 `dedup_task_merged`；B 的開單者收到 `dedup_ticket_merged`；A 的開單者收到 `dedup_ticket_updated`。
  - 例二：被取消的 B.task2 上的志工收到 `dedup_task_canceled`。
  - 一位志工搬了兩項需求 → 只收一則 `dedup_task_merged`。
  - 審核員自己是 A 的開單者 → 不收。
  - 通知內容不含電話、Email。
  - 通知服務丟例外 → 處理仍成功；REST 回傳不壞。

## Task 7：合約檔與文件

- ✅ 2026-10-24：`pnpm schemas:generate` 只動到 REST 合約（`openapi.json`、`openapi.d.ts`，GraphQL 沒變），已單獨 commit `68bd0e523`；spec 狀態、025 ADR-336 註記已更新。
  重掃所有遠端分支與本機 worktree：其他地方 ADR 最大號仍是 363，沒有人用 365～380，也沒有 Spec 028。

- [ ] `cd Frontend && pnpm schemas:generate`，commit 產生的合約檔（Frontend CI 會 `git diff`）。
- [ ] spec 的狀態更新；`Spec/025` ADR-336 加指向 028 的註記（ADR-341 已加）。
- [ ] 重掃所有遠端分支的 ADR 號與 Spec 資料夾號，確認 365～380、028 沒有撞號。

## Task 8：Docker 從零完整驗證

- ✅ 2026-10-24：`38ee6e232` 從零 build；容器內 2774 passed + 14 error（`test_seed_mock_scenarios` 的子程序少 `PYTHONPATH=/app`，加上後 14 passed），等於 2788；
  真實 HTTP 流程 403／409（版本過期）／422（人數）／200／409×3 都符合預期，資料庫、接單、通知、降級防護都通過。報告見 `verification.md`。

- [ ] 照 docker-verify-isolated-stack 的作法：`git archive` 該 commit、`--no-cache` build、全新 DB、migration、seed、容器內跑全套件。
- [ ] 真 HTTP 走一遍：
  1. 使用者建 A（human 2、water 1）；另一位使用者建 B（human 5、water 5、food 3），照樣建立。
  2. 兩位志工各接 B.task1、A.task1；一位志工同時接了 A.task1 和 B.task1。
  3. data_auditor 收到待審通知，讀 detail 拿到兩張單與 `version`。
  4. 有人在中途改了 A → resolve 409 → 重讀 → resolve 成功（例二）。
  5. 檢查 A、B、需求、接單紀錄、`replaced_by_uuid`／`merged_into_uuid`；各收件人的通知點開是主要單。
  6. 對同一張卡 revoke → 409。
- [ ] 報告寫進 `verification.md`。完成後回報，**不自己開 PR**。

---

## Task 9：code review 修正（ADR-381～385）

依 `SPEC028_CODE_REVIEW.md`，使用者同意修 1、2、3、4、6、8、9，並決定 B 的照片與災害欄位答案由審核員選（ADR-384、385）。

- [x] 1. rebase 到 main `2e95aec0d`，migration 改接 `7370daf4c8f7`（`ec0e6633d`）
- [x] 2. `priority`／`task_type` 長度 → 422（ADR-381）
- [x] 3. 通知用處理後的標題（ADR-382）
- [x] 4. 主要單沒變不通知它的開單者（ADR-383）
- [x] 5. 照片：detail 回傳、`version`、request 逐張 keep／cancel（ADR-384）
- [x] 6. 災害欄位答案：detail 回傳、`version`、request 完整一份（ADR-385）
- [x] 7. `_check_size` 改呼叫 `_validate_need_size`
- [x] 8. 重複接單一次 DELETE
- [x] 9. 主要單判斷、同一張單檢查各留一處
- [x] 每條先寫會失敗的測試；全套件；合約檔重產（`55cb19729`）；Docker 從零重做（`55cb19729`，容器內 2912 passed，流程全部符合預期，見 `verification.md`）
- 2026-10-24：全套件 **2912 passed**（rebase 後含 #96／#98 的測試），覆蓋率 96%；突變測試 12 條都會被抓到。
  TDD 例外：讀取層「照片與答案算進 version」先寫了實作，事後用突變測試確認測試有效。
  第一次全套件抓到一個隨機失敗：災害欄位答案在同一交易寫入時 `created_at` 相同，依 uuid 排序會亂序（也會讓 version 亂跳），
  且漏了 `delete_at` 過濾。改成和 `tickets_repository.list_by_ticket`、GraphQL loader 一樣依 `(property_name, value)` 排序並排除軟刪除。

## Task 10：PR #113 review（ADR-388～390）

jujuyuzu 2026-10-25 的 review。

- [x] migration 改接 #110 的 `da152a6a9d7c`（`6a292f356`）
- [x] ADR 整批往後移一號，364～384 → 365～385（`7449a7cae`）
- [x] 既有的接單、取消接單、編輯，在鎖住之後確認需求沒被搬走（ADR-388），並發測試 5 個
- [x] 聯絡人有改時通知主要單原本的志工（ADR-389）
- [x] 取消通知文字分兩種、兩張單同一人只收一則（ADR-390）
- [x] `er-diagram.md` 補欄位與通知類型；Spec 025 註記範圍
- [x] 全套件 **2929 passed**；Docker 從零重做（`6d3eb7fed`，容器內 2929 passed，流程全部符合預期，見 `verification.md`）
- [x] 補修移號漏掉的清單寫法（`ADR-372、383、384` 這種，只有第一個被移到），共 20 行
- [ ] 回覆 review

## 交給前端的 API 變更（DEDUP-008，Ethan）

| 方法 | 路徑（前綴 `/api/v1/admin`） | 權限 | 成功 | 失敗 |
|---|---|---|---|---|
| GET | `/duplicate-pairs/{uuid}` | `ai_duplicate.view` | 卡＋`events`＋**`tickets`**（新） | 403、404 |
| POST | `/duplicate-pairs/{uuid}/resolve`（新） | `ai_duplicate.review` | 處理後的卡（detail 形狀） | 403、404、409（已處理、單已取消、`version` 對不上）、422（request 不合法） |
| POST | `/duplicate-pairs/{uuid}/revoke` | 不變 | 不變 | 多一種 409：處理過的卡不能撤銷 |

- 審核頁先讀 detail，用 `tickets.low`／`tickets.high` 並排顯示；送出 resolve 時把兩邊的 `version` 原樣帶回。
- 收到 409（`version` 對不上）→ 重新讀 detail，請審核員再比對一次。
- request 要列出兩張單**每一項**需求、`keep`／`move` 的每一個細項（spec §3.3）。漏列會 422。
- 「不是重複」仍用 `/reject`。
- 導向主要單靠通知（`ref_uuid` = 主要單），GraphQL 沒有新欄位。
- 新通知類型：`dedup_task_merged`、`dedup_task_canceled`、`dedup_ticket_merged`、`dedup_ticket_updated`，
  都是 `ref_type = "ticket"`、`ref_uuid` = 主要單。
