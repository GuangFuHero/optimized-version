# Plan: 025-dedup-review-queue

**Spec**: `spec.md`　**Decisions**: `decisions.md`（ADR-336～345）
**Branch**: `feat/dedup-review-queue`（從 `origin/main` @ `108734cda` 開，未設 upstream）

每個 Task：先寫會失敗的測試（RED）→ 實作（GREEN）→ 全套件不比基準差 → 單獨 commit（只 `git add` 本 Task 的檔案，
commit 前看 `git diff --cached --stat`）。
測試環境：專屬 DB（`dedup025-testdb`，5435）與 redis（`dedup025-testredis`，6390）；
`TEST_REDIS_URL=redis://localhost:6390/<n>` 一定要設，不能碰 6379（enerlyzer 的）。

## Task 0：基準

- 在本分支 `uv sync` 後跑全套件，記下 passed 數與覆蓋率（`COVERAGE_CORE=sysmon`）。
- ✅ 2026-10-20：`108734cda` 上 **2170 passed、0 failed，覆蓋率 96%**，`pytest -n 4` 跑 5 分 24 秒。
  環境：`dedup025-testdb`（5435）、`dedup025-testredis`（6390，xdist 用 db 15 往下）；
  worktree 的 `.venv` 需要另外 `uv pip install --python .venv/bin/python pytest-cov`（`uv sync` 不會裝）。

## Task 1：權限 — `Perm`、seed、data migration（ADR-337、342）

- ✅ 2026-10-20：migration `1649d30b0122`（接 `209c4375c3e1`）；全套件 **2181 passed**（基準 +11），覆蓋率 96%。

- `app/core/permissions.py`：加 `AI_DUP_REVOKE = "ai_duplicate.revoke"`。
- `scripts/seed_rbac.py`：super_admin 加 view／review／revoke；data_auditor 加 view／review（附註解指向 ADR-337）；改檔頭第 13 行說明。
- 新 migration（接 main 的 head）：新增 `ai_duplicate.revoke` 權限列；INSERT 缺的授權列（`ON CONFLICT DO NOTHING` 或 `NOT EXISTS`），不動已存在的；downgrade 刪掉這次加的。
- 測試：
  - `test_me_capabilities`：super_admin 只缺 `role_request.add`；data_auditor 有 view／review、沒有 revoke。
  - 其他角色（user、team admin／member）沒有這三個。
  - migration：upgrade 後授權存在；已在 runtime 改過 scope 的授權不被覆蓋；downgrade 後回到原狀。

## Task 2：撤銷事件類型（ADR-344）

- ✅ 2026-10-20：migration `a5e641c99923`（接 `1649d30b0122`）；降級在有 `verdict_revoked` 時失敗、不刪紀錄。全套件 **2183 passed**，覆蓋率 96%。

- `app/models/dedup.py`：`AUDIT_EVENT_TYPES` 加 `verdict_revoked`。
- migration：重建 `ck_dedup_audit_events_type`。
- 測試：可寫入 `verdict_revoked`；未知類型仍被 CHECK 擋下；downgrade 可回。

## Task 3：讀取 — repository、摘要載入、service（ADR-339、340）

- ✅ 2026-10-20：`app/services/dedup_review.py`（`list_pairs`、`get_pair`）＋ repository；摘要欄位回填 spec §2.1。全套件 **2206 passed**。

- `dedup_repository`：`list_pairs(filters, sort, skip, limit)` 回 `(rows, total)`；`get_pair`；`events_for_pair`。
- 摘要載入：依 `entity_kind` 分組，每種一條 query；對照模型定下摘要欄位，回填 spec §2.1。
- service：`list_duplicate_pairs`、`get_duplicate_pair`，檢查 `ai_duplicate.view`。
- 測試：預設只回待審；`status`／`entity_kind`／`source_layer` 篩選；兩種排序；分頁與 total；
  軟刪除的卡不出現；實體被軟刪除時 `deleted: true`；查詢數固定（N 張卡不會 N 條 query）；沒權限被擋。

## Task 4：讀取 — REST 端點（ADR-338）

- ✅ 2026-10-20：`app/api/v1/endpoints/duplicate_pairs.py`、`app/schemas/duplicate_pair.py`；API 測試 14 個（seed 的 super_admin／data_auditor 200，user／team admin／member 403）。

- `app/api/v1/endpoints/duplicate_pairs.py`＋`app/schemas/duplicate_pair.py`，掛到 admin router。
- 測試（API 層）：super_admin／data_auditor 200；user、team 身分 403；404；`limit` 超過上限 422；`evidence` 原樣回傳。

## Task 5：判定 — confirm／reject（ADR-341、343）

- ✅ 2026-10-20：service 測試 16 個＋API 9 個；突變測試（拿掉 `FOR UPDATE`、拿掉待審檢查）都會被抓到。全套件 **2245 passed**，`dedup_review.py` 覆蓋率 100%。

- service：鎖卡、檢查狀態、改 `status`／`reviewed_by`／`reviewed_at`、寫事件（含 `before_state`／`after_state`、`note`）。
- 端點：`POST /{uuid}/confirm`、`/reject`。
- 測試：兩種判定的狀態與事件；不是待審 → 409；`note` 長度上限；實體完全不變（比對判定前後的 task／station 欄位）；
  同時判定只有一個成功（兩個 session 並發）；沒有 review 權限 403。

## Task 6：撤銷（ADR-342、343、344）

- ✅ 2026-10-20：service 測試 16 個＋API 4 個（用 seed 的 data_auditor／super_admin）；突變測試（拿掉撤別人要 revoke 的檢查、一律還原成 dup_ignored）都會被抓到。全套件 **2265 passed**。

- service：鎖卡、檢查狀態、判斷是否本人、非本人檢查 `ai_duplicate.revoke`、改回 `before_state.status`、清審核人、寫 `verdict_revoked`。
- 端點：`POST /{uuid}/revoke`。
- 測試：本人撤銷（data_auditor）成功；data_auditor 撤別人的 403；super_admin 撤別人的成功；
  待審狀態撤銷 409；撤銷後回到清單；撤銷後可再判定；事件歷史順序正確。

## Task 7：待審提醒（ADR-345）

- ✅ 2026-10-20：`dedup_review.notify_new_cards`（類型 `dedup_review_pending`）；移除 `ticket.py`／`station.py` 的死分支（−48 行）；`test_dedup_submission` 的站點通知預期跟著改。全套件 **2274 passed**；真實流程中只有 data_auditor 和 super admin 收到通知。

- `dedup_submission` 三個 submit 函式：commit 後若寫了 `dup_ignored` 卡，發一則通知（N 筆）；失敗只記 log。
- 移除 `ticket.py`、`station.py` 的 `dedup_flag_*` 舊分支與其測試。
- 測試：照樣建立 1 個任務 → 一則；一張工單 3 個任務都照樣建立 → 仍一則、N=3；沒照樣建立 → 不發；
  通知服務丟例外 → 建立仍成功；收件人是有 review 權限的人（super_admin、data_auditor），一般 user 收不到。

## Task 8：文件

- ✅ 2026-10-20：spec 狀態更新；022 的「不做 admin 審核」加上指向 025 的註記（021 是 Chi 的快層 spec，不動）；`seed_rbac.py` 檔頭已在 Task 1 改好；`er-diagram.md` 的通知類型已在 Task 7 改好。重掃所有遠端分支：ADR 336～345 只在 025、沒有撞號，全域最大號 345；Spec 資料夾 025 沒有被其他分支使用。

- spec 狀態更新；`seed_rbac.py` 檔頭；`Spec/022` 中提到「admin 審核不在範圍」的地方加指向 025 的註記。
- 再掃一次全域 ADR 號，確認 336～345 沒撞號。

## Task 9：Docker 從零完整驗證

- ✅ 2026-10-20：image 從 `0f7b8b1ad` 的 `git archive` 以 `--no-cache` build；容器內全套件 **2274 passed**、覆蓋率 96%；真 HTTP 完整流程、通知、降級防護都通過。報告見 `verification.md`。

- 照 [docker-verify-isolated-stack] 的作法：從零 build image、全新 DB、跑 migration 與 seed、容器內跑全套件。
- 實際打 API 走一遍：使用者照樣建立 → 審核員收到通知 → 清單出現該卡（含兩邊摘要）→ confirm → 離開清單 →
  data_auditor 撤銷別人的被擋 → super_admin 撤銷 → 回到清單 → reject。
- 驗證報告寫進本資料夾的 `verification.md`。完成後回報，**不自己開 PR**。

## 交給前端的 API 變更（DEDUP-008，Ethan）

需要重新產生 `Frontend/libs/data-access` 的 OpenAPI 型別（後端不改前端，ADR 範圍見 spec 非目標）。

| 方法 | 路徑（前綴 `/api/v1/admin`） | 權限 | 成功 | 失敗 |
|---|---|---|---|---|
| GET | `/duplicate-pairs?status=&entity_kind=&source_layer=&sort=&skip=&limit=` | `ai_duplicate.view` | `{items, total}` | 403、422 |
| GET | `/duplicate-pairs/{uuid}` | `ai_duplicate.view` | 卡＋`events` | 403、404 |
| POST | `/duplicate-pairs/{uuid}/confirm`（body 可省略，`{"note": "..."}` 最多 1000 字） | `ai_duplicate.review` | 更新後的卡 | 403、404、409（不是待審）、422（備註太長） |
| POST | `/duplicate-pairs/{uuid}/reject`（同上） | `ai_duplicate.review` | 更新後的卡 | 同上 |
| POST | `/duplicate-pairs/{uuid}/revoke`（無 body） | `ai_duplicate.review`；撤別人的另需 `ai_duplicate.revoke` | 回到待審的卡 | 403、404、409（沒有判定可撤） |

- `status`、`entity_kind`、`source_layer` 可重複帶（`?status=confirmed&status=rejected`）；不帶 `status` 時只回待審（`dup_ignored`＋`suggested`）。
- 每張卡的 `low`／`high` 是兩邊的摘要，欄位見 spec §2.1；`deleted: true` 表示那一邊已被刪除。
- `GET /api/v1/users/me` 的 `capabilities` 會多出 `ai_duplicate.view`／`ai_duplicate.review`（super_admin、data_auditor）與
  `ai_duplicate.revoke`（只有 super_admin）。導覽列入口依 `ai_duplicate.view` 顯示（ADMIN-019）。
- 撤銷按鈕：卡的 `reviewed_by` 是自己 → 有 review 就顯示；是別人 → 需要 `ai_duplicate.revoke`。
- 通知：新類型 `dedup_review_pending`，`ref_type = "dedup_review"`、`ref_uuid = null`，點了應該開審核頁。舊的 `dedup_flag_ticket`／`dedup_flag_station` 已移除（從來沒發出過）。
- 合併、取代、逐欄位選值本次不提供（ADR-336）。
