# 026 加入團隊申請（BE-038）— Implementation Plan

**進度（2026-10-20）**：spec 與 ADR-350~358 已 commit（`74e5dbb9e`）。
- 基準（`e29650bfd`，main + 文件）：2170 passed、0 failed。
- Task 1 完成：全套件 2180 passed、0 failed。`teams.status` 的 CHECK 讓 4 個拿 `'inactive'` 當「非啟用」範例的既有測試
  失敗；程式從未寫入 `'inactive'`，改用 `'suspended'`（Popo 2026-10-20 選定）。
- Task 2 完成：全套件 2184 passed、5 failed。當時誤判為「套件跑到一半改了程式」；實際原因是 Task 2 的測試建了一個
  沒有權限的共用 `user` 角色，同一個 worker 上之後的申請測試就拿不到 `role_request.add`（順序相關，單獨跑會過）。
  已在後續 commit 修正：該測試改用自己命名的角色。
- Task 3 完成：全套件 2226 passed、0 failed。019 的既有測試改成帶姓名、帳號帶已驗證手機；團隊成員的 `canApply`
  改為 true（ADR-351）。
- Task 4、5、6a 完成（相關測試綠）。Task 6b 完成：Part A 收尾全套件（`-n 8`）2281 passed、0 failed，3 分 49 秒。
  019 舊的「政府／NGO 不能核准」測試移除；沒有團隊的舊申請核准時回 409（ADR-350 point 9 的延伸）。
- Task 7、8 完成。Task 9 完成：全套件 2308 passed、1 failed（Task 7 的防呆讓一個用 mock db 的通知測試壞掉，
  另一個 commit 修好）。Task 10、11 完成。Task 12：spec 加前端交接段、ADR-359～360（PROPOSED，PR 審）。
- 2026-10-20 使用者指示：Task 一口氣做完 → code review 修 → Docker 驗證 → push 並開 PR。
- Code review（high）10 項：9 項修正（`315932c5e`，記於 ADR-359），GraphQL `team` 欄位的 N+1 留著（每人申請很少）。
  另補 grant migration `79a19cabc98a`（照 Spec 025 的做法，既有 DB 不重跑 seed 也拿得到新授權）。
- Task 13 完成：見 `verification.md`。本機全套件 2335 passed、0 failed；API 走查 41/41。
- 2026-10-21 PR #93 review（jujuyuzu，CHANGES_REQUESTED）後：
  - 稽核全平台視角再遮 `user_contacts.value`、`user_identities.provider_subject`。
  - 團隊成員名單：`UserDirectory` base + `PlatformUserDirectory`／`TeamMemberDirectory`，新權限 `team.member.view`（ADR-362）。
  - 邀請頁加 `pending_elsewhere`；交接說明補 LINE-only 帳號要等 #94；RBAC 矩陣、er-diagram、migration E501。
  - **拿掉團隊解散**（Popo，依 ADMIN-027 Story 4）：status 只剩 active／suspended；ADR-357 修訂、ADR-360 SUPERSEDED。
  - 前端產生的 contracts 重新產生並 commit（使用者同意）。
- 2026-10-21 合併順序：#92 先合（使用者決定）。#93 疊在 `feat/dedup-review-queue` 上，PR base 改成該分支；
  `11f0025d521b` 改接 #92 的 head `a5e641c99923`，migration 測試 `_BEFORE` 跟著改；`api.py` 兩邊 router 都留。
  #92 合進 main 後，把 #93 的 base 改回 main。

**Goal:** 在 Spec 019 的 `role_requests` 上加入「申請加入既有團隊／成立新團隊」與團隊邀請連結，讓 team admin 與
super admin 從各自的審核佇列決定；加上團隊雜項（最後 admin 防呆、聯絡欄位、編輯／停用、稽核紀錄讀取）。

**Architecture:** 沿用 019 的 service／endpoint／GraphQL 分層（ADR-014 thin endpoint）。新增 `team_invites` 表與
`app/services/team_invite.py`；審核權限判斷集中在 `role_request.py` 的 `_require_reviewer`；加成員的寫入抽成不 commit
的 helper 給核准共用；團隊狀態對權限的影響放在身分解析（`active_identity_repository`）一處。

**Tech Stack:** FastAPI, strawberry, SQLAlchemy async, PostgreSQL, Redis, pytest（`uv run pytest -n 8`）, ruff。無新依賴。

**Source spec:** `Spec/026-join-requests/spec.md`（ADR-350~358）

**Branch:** `feat/join-requests`（off `origin/main` `108734cda`）。migration parent 是 `209c4375c3e1`；
`Spec/025-dedup-review-queue` 也接同一個 head，**後合併的那張改 `down_revision`，PR 說明要寫順序**。

---

## Global Constraints

- **019 的既有行為不能壞。** 資料檢核員申請、撤回、先決者勝、通知文字照舊；WG-141~143 的測試照舊通過（ADR-351）。
- **一人一筆待審**沿用 `uq_role_requests_one_pending`，不新增唯一索引（ADR-351）。
- **後端範圍**：不列前端 task，不重產前端 contracts；前端只拿 spec 的 API 段與 Task 12 的交接說明。
- **PR 範圍**：只放本票的東西；既有 lint、既有 baseline 失敗不在這裡修。
- **個資**：`applicant_*` 與 `real_name` 不進前台回應、`UserRefType`、歷程操作者名稱、通知內文（ADR-355）。

### 每個 Task 的完成條件（Definition of Done）

1. **有測試。** 每個動到程式碼的 Task 都有自己的新測試，先寫、先看它紅（RED），再實作到綠（GREEN）。
   純重構（Task 6a）也要有測試釘住「行為沒變」。
2. **本 Task 的測試綠＋相關測試綠。** 每個 Task 結束跑本 Task 新增／改到的測試檔，加上同一區的既有測試
   （例如動到申請就跑 `tests/test_role_request*.py tests/test_graphql/test_role_request*.py`）。
   **全套件**（`uv run pytest tests -q -n 8`，約 4～5 分鐘）只在這些時點跑，對照基準只能多、不能少：
   Task 6b 完成（Part A 收尾）、Task 9 完成（權限解析改動）、Task 13 Docker 驗證前；動到共用元件
   （`security.py`、`conftest`、seed）時另外加跑。（Popo 2026-10-20 決定，原本是每個 Task 都跑）
   - **單獨跑測試檔要用新的 DB 名**（例如 `TEST_DB_URL=.../t_<亂數>`）：GraphQL 測試的資料會留在 DB 裡跨次保留，
     髒 DB 會遮住順序相關的錯（Task 2 的教訓）。
3. **一個 Task 一個 commit**，conventional commits，測試與實作同一個 commit。
4. **新決策**：實作中冒出的決策照樣寫成 ADR（從 ADR-359 起，commit 前再掃一次遠端），同時更新 spec、decisions、plan。
5. **整張票完成後做 Task 13 的 Docker 完整驗證**；沒通過不算完成、不回報完成、不開 PR。

### 測試環境

- 本票自己的容器（不共用 025 的 `dedup025-testdb`／`dedup025-testredis`）：
  `join026-testdb`（`disaster-postgres-h3:16-3.4`，`127.0.0.1:5439`）、`join026-testredis`（`127.0.0.1:6394`）。
  `localhost:6379` 是 enerlyzer 的 redis，絕對不要用。

```
docker run -d --name join026-testdb -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5439:5432 disaster-postgres-h3:16-3.4
docker run -d --name join026-testredis -p 127.0.0.1:6394:6379 redis:7-alpine
export TEST_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5439/disaster_rescue_test"
export TEST_ADMIN_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5439/postgres"
export TEST_REDIS_URL="redis://localhost:6394/15"
```

- worktree 裡先 `uv sync`（`.venv` 的 strawberry 太舊會誤報失敗），再 `uv run pytest -n 8`。

### 已知陷阱

1. **commit 會 expire 物件。** 019 的 service 處處先讀 `actor.uuid` 再 commit；新寫的核准路徑同樣要先讀好再 commit，
   否則 `MissingGreenlet`。
2. **partial unique index 的 `index_where` 不能用綁定參數**（跑約 5 次後 generic plan 讓 upsert 全壞）。任何
   `ON CONFLICT ... WHERE` 一律 `text()` ／ `literal_column`。
3. **`require_scope` 不帶 resource 時，scope 不是 none 就通過。** 給 team admin `team.edit`（team）後，
   `create_team` 要明確要求 `Scope.ALL`，否則 team admin 能建團隊（ADR-357 point 2）。
4. **ADR-130 測試**（`tests/test_history_permissions.py`）要求 `audit.view` 只有兩個持有者；團隊稽核用新權限
   `team.audit.view`，不要動 `audit.view`（ADR-358）。
5. **前台請求帶 `X-WG-Realm: site`** 才會以 `user` 身分取得 `role_request.add`（ADR-289）；邀請連結 REST 的測試要帶。
6. **覆蓋率**：`COVERAGE_CORE=sysmon`，預設 tracer 量不到 ASGI client 路徑。
7. **git**：用 `/opt/homebrew/bin/git`；git root 是 `optimized-version/`；不要 `git add -A`；commit 前看 `--cached --stat`。

---

## Task 順序的關鍵

- **Task 1 先做 schema**，後面所有 Task 都依賴新欄位。
- **Task 3（送出）→ Task 5（審核權限）→ Task 6（核准）** 是 Part A 主線，順序不能換：核准要有帶團隊的申請、
  也要有權限判斷。
- **Task 4（邀請連結）** 只依賴 Task 1、3，可以跟 5、6 交錯。
- **Task 9（團隊停用）風險最高**：會改每一次權限檢查。放在 Part A 完成之後，單獨一個 commit，測試要包含全套件。
- Part B（Task 7~10）彼此獨立。

---

## Task 1: Migration 與 model

**Files:** `alembic/versions/<rev>_join_requests.py`（新）、`app/models/role_request.py`、`app/models/team_invite.py`（新）、
`app/models/team.py`、`app/models/auth.py`、`app/models/__init__.py`、`app/db/triggers.py`

- [ ] 開工前記基準：`uv run pytest tests -q -n 4` 的 passed／failed 數寫進本檔進度
- [ ] `role_requests` 加 `team_uuid`、`new_team_name`、`invite_uuid`、`applicant_name`、`applicant_phone`、`applicant_email`
- [ ] CHECK `ck_role_requests_target`、`ck_role_requests_invite`（spec Data model）
- [ ] index `ix_role_requests_team_pending`
- [ ] 新表 `team_invites`（`token` unique、`expires_at` 的 server default `now() + interval '24 hours'`），加進 `AUDITED_TABLES`，
      trigger 在同一個 migration 建
- [ ] `users.real_name`；`teams.contact_name`、`teams.contact_phone`；`teams.status` CHECK（`active`／`suspended`；2026-10-21 拿掉 `disbanded`）
- [ ] 資料：pending 且無團隊的 `government`／`ngo` 申請改 `rejected`，`review_note = '申請流程已更新，請重新送出申請。'`，
      `closed_at = now()`（ADR-350 point 9）
- [ ] downgrade：反向移除欄位與表；**不**還原被拒的舊申請（寫在 docstring）

**Tests:** `tests/test_migration_join_requests.py`（新）
- 從 `209c4375c3e1` 升級：有 pending `government` 舊列 → 變 `rejected` 並帶註記；`data_auditor` pending 不受影響
- CHECK：`data_auditor` 帶 `team_uuid` → IntegrityError；`team_uuid` 與 `new_team_name` 同時有 → IntegrityError
- `team_invites.expires_at` 由 DB 填，且等於 `created_at + 24h`
- `downgrade -1` → `upgrade head` 乾淨
- `alembic heads` 單一 head

## Task 2: 團隊名錄 `roleRequestTeams`

**Files:** `app/graphql/role_requests/queries.py`、`types.py`、`app/repositories/team_repository.py`

- [ ] `roleRequestTeams(type: GOV|NGO = null)` → `[{ uuid, name, type }]`，只列 `status='active'` 且未刪除，依名稱排序
- [ ] 需登入，不檢查 capability；不回稅籍、聯絡人、成員

**Tests:** `tests/test_graphql/test_role_request_teams.py`（新）
- 未登入 → 401；登入的一般使用者看得到全部啟用中團隊
- 停用、已刪除的團隊不出現；`type` 篩選正確
- 回應欄位只有 `uuid`／`name`／`type`

## Task 3: 送出申請帶團隊與申請人資料

**Files:** `app/services/role_request.py`、`app/models/role_request.py`（常數）、`app/graphql/role_requests/types.py`、`mutations.py`、`queries.py`

- [ ] `SubmitRoleRequestInput`：加 `teamUuid`、`newTeamName`、`name`、`email`；拿掉 `contact`
- [ ] 規則（ADR-350 point 2、ADR-352）：政府／NGO 二擇一；資料檢核員不能帶團隊；團隊要啟用中且類型相符；新名稱 trim 後
      不分大小寫比對不能重複
- [ ] 資格（ADR-351）：團隊申請只擋「目前已是該團隊成員」；資料檢核員維持 `_has_backoffice_identity`
- [ ] 申請人資料（ADR-355）：手機讀帳號已驗證的 phone，沒有 → `A verified phone number is required`；Email 用帳號已驗證的，
      沒有才用輸入值；`name` 必填 ≤ 100；寫入 `applicant_*`
- [ ] `RoleRequestType` 加 `team`、`newTeamName`、`viaInvite`、`applicantName`、`applicantPhone`（遮罩，用 `mask_phone`）、`applicantEmail`
- [ ] `myRoleRequests.canApply`：只看 `role_request.add` 與有無 pending，不再看後台身分（ADR-351 Consequences）
- [ ] 抽出 `_validated_target(...)` 給 Task 4 共用

**Tests:** `tests/test_role_request_join.py`（新）＋改 `tests/test_graphql/test_role_requests.py`
- spec「API → New refusals」每一條各一個案例，訊息原文比對
- A 團隊成員申請 B → 成功；B 成員申請 B → `You are already a member of this team`；被移出 B 後 → 成功
- 有 pending 時再送任何一種 → `You already have a pending request`（沿用 index）
- 帳號無手機 → 拒絕；有手機 → `applicant_phone` 等於帳號手機；帳號有 email 時輸入的 email 被忽略
- `users.name` 送出後不變
- 019 的資料檢核員案例全部照舊通過

## Task 4: 邀請連結

**Files:** `app/services/team_invite.py`（新）、`app/repositories/team_invite_repository.py`（新）、
`app/api/v1/endpoints/team_invites.py`（新）、`app/api/v1/endpoints/admin.py`、`app/api/v1/api.py`、`app/schemas/team_invite.py`（新）

- [ ] `POST`／`GET /api/v1/admin/teams/{team_uuid}/invites`：`team.member.manage` 對該團隊（checkpoint 2，同 `add_team_member`）
- [ ] token：`secrets.token_urlsafe(24)`；回應不含 invite 的 uuid
- [ ] 有效性查詢一條 SQL：`token = :t AND expires_at > now() AND teams.status = 'active' AND teams.delete_at IS NULL`（ADR-353）
- [ ] `GET /api/v1/invites/{token}`：回團隊、`expires_at`、`my_request`；無效一律 404 同一訊息
- [ ] `POST /api/v1/invites/{token}/requests`：走 Task 3 的 `submit`，身分取團隊類型、記 `invite_uuid`；需 `role_request.add`
- [ ] 錯誤對應：404／409（pending、已是成員）／422（欄位）

**Tests:** `tests/test_team_invites.py`（新）
- team admin 建立自己團隊的邀請 → 201；建立別隊 → 404；member → 403；super admin 任何團隊 → 201
- 24 小時內打開 → 200；**用 DB 把 `expires_at` 改成過去**（不 mock 時鐘、不靠用戶端時間）→ 打開與送出都 404
- 不存在的 token、停用團隊的 token → 404，訊息與過期相同
- 送出後列的 `invite_uuid`、`team_uuid`、`requested_role` 正確
- 帶／不帶 `X-WG-Realm: site` 各一條：團隊成員以團隊身分呼叫時的行為與 GraphQL 一致

## Task 5: 審核權限與佇列（ADR-354）

**Files:** `app/services/role_request.py`、`app/api/v1/endpoints/role_requests.py`、`app/schemas/role_request.py`

- [ ] `_require_reviewer(actor, request)`：成員申請 → `role_request.review` 或 `team.member.manage` 涵蓋該團隊；
      新團隊／資料檢核員 → 只有 `role_request.review`；不符 → `RoleRequestNotFoundError`（404）
- [ ] `GET /admin/role-requests`：兩個權限都沒有 → 403；有其一時 service 依呼叫者過濾（review 持有者看全部；team admin 只看目前身分團隊的成員申請）；
      新篩選 `team_uuid`、`kind`
- [ ] 回應加新欄位與 `team_name`；`applicant_*` 給有權審該筆的人看
- [ ] reject 的 `note` 改必填：`A reason is required`（422）

**Tests:** `tests/test_role_request_review_scope.py`（新）＋改 `tests/test_role_requests_api.py`
- team admin：只看到自己隊的成員申請；看不到別隊、新團隊、資料檢核員申請
- team admin 對別隊申請 approve／reject → 404；對新團隊申請 → 404
- 既無 `role_request.review` 也無 `team.member.manage` 的人（member、一般使用者）→ 403
- super admin 看全部；`kind`、`team_uuid` 篩選
- reject 無理由 → 422；有理由 → 通知內文是理由
- 資料檢核員（`user.view`、無 review）看不到任何申請

## Task 6a: 抽出加成員 helper（純重構）

**Files:** `app/services/admin.py`

- [ ] 把「刪這隊舊角色＋加新角色」抽成 `_grant_team_role(db, *, user_uuid, team_uuid, role)`，不 commit、不通知
- [ ] `add_team_member` 改呼叫它，對外行為不變

**Tests:** 既有 `tests/test_admin*.py` 全綠＋新增一條：helper 呼叫後未 commit（rollback 後無列）

## Task 6b: 核准成員申請與新團隊（ADR-350 point 6）

**Files:** `app/services/role_request.py`、`app/services/admin.py`

- [ ] 成員：鎖列 → 團隊仍啟用、申請人不是成員 → `_grant_team_role(member)` → 記 `granted_*` → 寫 `users.real_name` → 一次 commit
- [ ] 新團隊：名稱仍未被用 → 建團隊（類型取身分）→ `_grant_team_role(admin)` → 同上
- [ ] 資料檢核員：照舊，另寫 `real_name`
- [ ] 通知：成員「你已加入「{team}」」、新團隊「「{team}」已建立，你是管理員」；不另送 `team_member_added`
- [ ] 送出時通知該隊 admin（`resolve_team_admin`），與 review 持有者合併去重

**Tests:** `tests/test_role_request_approve_team.py`（新）
- 成員核准後持有 `member`，能切換到團隊身分（打 identity switch）
- 新團隊核准：團隊建立、類型正確、申請人是 `admin`
- 送出到核准之間有人建了同名團隊 → 409，申請仍 pending
- team admin 與 super admin 同時核准（兩個 session 併發）→ 一個 200、一個 409
- 過期邀請的申請可核准（接 Task 4）
- `real_name` 核准後寫入；拒絕、撤回不寫；`users.name` 不變
- 送出成員申請時該隊 admin 收到通知

## Task 7: 最後 admin 防呆（ADR-356）

**Files:** `app/services/admin.py`

- [ ] `remove_team_member`、`add_team_member`（把 admin 改成別的角色）：鎖該隊所有 admin 授權 `FOR UPDATE`，只剩這一位 → 409
- [ ] 最後 super admin：只補測試

**Tests:** `tests/test_team_last_admin.py`（新）
- 唯一 admin 被移除／降級 → 409；兩個 admin 時可以
- 兩個 admin 同時互相降級（併發）→ 一個成功、一個 409，最後至少一個 admin
- admin 移除其他所有成員 → 成功（Story 4）
- `assign_role` 與 `rbac_admin` 撤銷最後 super admin → 409（既有行為，補測試）

## Task 8: 團隊編輯與聯絡欄位（ADR-357 point 1、2、5）

**Files:** `app/services/admin.py`、`app/api/v1/endpoints/admin.py`、`app/schemas/admin.py`、`scripts/seed_rbac.py`、`RBAC_RESOURCE_ROLE_MATRIX.md`

- [ ] `PATCH /admin/teams/{uuid}`：name、tax_id、contact_name、contact_phone；不能改 type；名稱規則同 ADR-352
- [ ] seed：`admin` 加 `team.edit: team`；`create_team` 要求 `Scope.ALL`
- [ ] `TeamResponse` 加聯絡欄位；`team.view` scope 不變

**Tests:** `tests/test_team_edit.py`（新）＋改 `tests/test_seed_rbac.py`
- team admin 改自己隊 → 200；改別隊 → 404；建團隊 → 403
- super admin 改任何隊；改成已存在的名稱 → 409
- member 看得到自己隊的聯絡欄位、看不到別隊（列表沒有別隊）

## Task 9: 團隊停用／恢復（ADR-357 point 3、4）——風險最高（2026-10-21 拿掉解散）

**Files:** `app/repositories/active_identity_repository.py`、`app/core/security.py`（權限解析）、`app/services/admin.py`、
`app/api/v1/endpoints/admin.py`、`app/services/role_request.py`

- [ ] `POST /admin/teams/{uuid}/status`，`team.edit` at `all`
- [ ] 身分解析排除非 `active` 團隊的授權：`list_for_user` 不列、`resolve` 回 None（舊 token → 401，ADR-096）、
      權限解析不計
- [ ] 離開 `active` 時，該隊 pending 申請改 `rejected`（`團隊已停用`）並通知申請人
- [ ] 先讀 `resolve_scope` 與 `in_scope` 的實作，確認只有一處要改；若不只一處，先寫 ADR 再動

**Tests:** `tests/test_team_status.py`（新）
- 停用：成員的團隊身分不能切換；舊 token 打 API → 401；平台身分不受影響
- 停用：成員原本能做的團隊操作（例如改站點）→ 403／404
- 恢復：權限原樣回來，授權列沒有被刪
- 停用後：邀請 404、名錄不列、pending 申請被拒並通知；`disbanded` 回 422
- **全套件**：這個 Task 結束一定要跑全套件並比基準

## Task 10: 稽核紀錄讀取 API（ADR-358）

**Files:** `app/core/permissions.py`、`scripts/seed_rbac.py`、`app/services/audit_log.py`（新）、`app/api/v1/endpoints/audit_logs.py`（新）、
`app/schemas/audit_log.py`（新）、migration（expression index，併入 Task 1 或新開，視 Task 1 是否已 commit）

- [ ] 新權限 `team.audit.view`：`admin` at `team`、`super_admin` at `all`
- [ ] `GET /admin/audit-logs`：`audit.view` at `all` 看全部；否則 `team.audit.view` at `team` 只看目前身分團隊的相關列（ADR-358 point 4 的表）
- [ ] 分頁 `limit` ≤ 100；篩選 `table`、`row_id`、`actor_uuid`、`from`、`to`
- [ ] expression index；用 `EXPLAIN` 確認團隊查詢有用到（抓實際 SQL，不看 ORM）

**Tests:** `tests/test_audit_log_api.py`（新）
- super admin、資料檢核員看全部；team admin 只看到自己隊的團隊列、授權、申請、邀請、責任區
- team admin 看不到別隊的同類列；member → 403
- `audit.view` 仍只有兩個持有者（既有 ADR-130 測試不改、照樣綠）
- 分頁與篩選

## Task 11: 後台使用者清單的本名（ADR-355 point 5）

**Files:** `app/api/v1/endpoints/admin.py`、`app/schemas/admin.py`、`app/services/admin.py`

- [ ] `GET /admin/users` 項目加 `real_name`，只對 `role_request.review` 持有者填值，其他人為 null

**Tests:** 改 `tests/test_admin_users*.py`
- super admin 看得到；資料檢核員為 null
- 前台 GraphQL、歷程、`UserRefType` 都沒有 `real_name`（grep schema 守衛測試）

## Task 12: 收尾

- [ ] spec 加「交給前端的 API 變更」段：GraphQL input／type 差異、兩支 REST、錯誤訊息表、手機兩段驗證、`canApply` 語意改變
- [ ] `Spec/019-role-requests/spec.md` 的 Non-goals／Rules 標註被 026 修改的條目
- [ ] ruff 只檢查本票改到的檔案

## Task 13: Docker 完整驗證（整張票的完成條件）

不動使用者現有的 `backend-db-1`／`backend-redis-1`；compose 檔、腳本都放 scratchpad。

### 13.1 本機收尾
- [ ] `uv run pytest tests -q -n 8`：比基準只多不少
- [ ] `COVERAGE_CORE=sysmon uv run pytest --cov=app/services/role_request --cov=app/services/team_invite --cov=app/services/audit_log tests -q`：≥ 80%
- [ ] `uv run alembic heads` 單一 head

### 13.2 從零建立
- [ ] `DOCKER_BUILDKIT=0 docker build -t join026-backend:verify .`
- [ ] `-p join026verify` 起 db（`disaster-postgres-h3:16-3.4`）、redis、backend；db／redis 不開 port；backend 用 8012
- [ ] 全新 volume：`alembic upgrade head`；`downgrade -1` → `upgrade head`
- [ ] `python scripts/seed_rbac.py`

### 13.3 容器裡跑全套件
- [ ] backend 容器內對 stack 的 db 跑 `pytest tests -q`，結果與 13.1 一致

### 13.4 實際打 API（`docker cp` 腳本進容器、`docker exec` 打 `localhost:8000`）
- [ ] team admin 建邀請 → 一般使用者打開 → 送出 → 出現在 team admin 與 super admin 佇列 → team admin 核准 → 使用者切換到團隊身分
- [ ] 同一人有 pending 時掃另一隊邀請 → 409；撤回後 → 成功
- [ ] 邀請 `expires_at` 改到過去 → 打開與送出都 404
- [ ] 前台選既有團隊申請 → super admin 代為核准 → 另一邊再核准 → 409
- [ ] 成立新團隊 → super admin 核准 → 團隊建立、申請人是 admin、`real_name` 寫入
- [ ] 資料檢核員申請照舊可核准
- [ ] 唯一 admin 移除自己 → 409
- [ ] 停用團隊 → 成員舊 token 401 → 恢復 → 正常
- [ ] team admin 讀稽核紀錄只看到自己隊
- [ ] 查 `audit_logs`：申請、核准、邀請、狀態變更都有紀錄，身分快照正確

### 13.5 清理與回報
- [ ] `docker compose -p join026verify ... down -v`；確認 `backend-db-1`、`backend-redis-1` 沒被動到
- [ ] 13.1~13.4 實際輸出整理成驗證報告回報。**不自行開 PR、不 push**
