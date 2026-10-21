# Verification: 025-dedup-review-queue（Task 9 Docker 從零驗證）

**日期**：2026-10-20
**驗證的程式**：`feat/dedup-review-queue` @ `d6e39d567`（用 `git archive` 匯出這個 commit 再 build，未追蹤的檔案不會進 image）
**結論**：全部通過。

> 第一次驗證跑在 `0f7b8b1ad`，結果相同（容器內 2274 passed）。之後 Task 7 的 code review 找到通知失敗時
> 回傳欄位出錯的問題（ADR-345 補充），修在 `d6e39d567`，所以用修正後的 commit 從零重做一次；以下都是重做的結果。
> 重做用的腳本：scratchpad `t9/docker_verify.sh <commit>`，完整輸出在 `t9/docker_verify_d6e39d567.log`。

## 1. 環境

不碰本機既有的 `backend-*` 容器：自己開一個 network `dedup025v`，三個裸容器都只在這個 network 裡，不對外開 port。

| 容器 | image | 說明 |
|---|---|---|
| `dedup025v-backend` | `dedup025-backend:verify`（`DOCKER_BUILDKIT=0 docker build --no-cache`） | 正式的 Dockerfile CMD（uvicorn，無 `--reload`），`ENV=development` 讓驗證碼印在 log |
| `dedup025v-db` | `disaster-postgres-h3:16-3.4` | 全新的空資料庫 |
| `dedup025v-redis` | `redis:7-alpine` | 全新 |

確認 image 裡是本分支的程式：

```
alembic/versions/1649d30b0122_ai_duplicate_grants.py
alembic/versions/a5e641c99923_dedup_event_verdict_revoked.py
app/services/dedup_review.py
no review report in image
```

## 2. 空資料庫 → migration → seed

```
Running upgrade eb02aafe5f5a -> 209c4375c3e1, briefing and announcement drafts ...
Running upgrade 209c4375c3e1 -> 1649d30b0122, ai_duplicate.*: grant the review queue to super_admin and data_auditor (ADR-337, ADR-342)
Running upgrade 1649d30b0122 -> a5e641c99923, dedup_audit_events: allow event_type 'verdict_revoked' (ADR-344)
a5e641c99923 (head)

         key         |            string_agg
---------------------+-----------------------------------
 ai_duplicate.review | data_auditor=all, super_admin=all
 ai_duplicate.revoke | super_admin=all
 ai_duplicate.view   | data_auditor=all, super_admin=all
```

空資料庫跑 migration 時角色還不存在，所以授權由接著執行的 seed 補上。「既有資料庫只跑 migration、不重跑 seed」那條路，在本機用 main 的 seed 驗過（見 `Backend/SPEC025_CODE_REVIEW.md` 第二節，或重跑 scratchpad 的 `real025/run.sh`）。

## 3. 容器內全套件

在容器裡另外安裝 pytest／pytest-asyncio／pytest-xdist／pytest-cov（image 不含開發套件），測試 DB 和 redis 都用這個 stack 自己的：

```
$ docker exec -e TEST_DB_URL=...@db:5432/disaster_rescue_test -e TEST_REDIS_URL=redis://redis:6379/15 \
    dedup025v-backend python -m pytest -n 4 -q -p no:randomly --cov=app
app/api/v1/endpoints/duplicate_pairs.py              53      1    98%
app/services/dedup_review.py                        161      0   100%
app/services/dedup_submission.py                    109      0   100%
TOTAL                                             11158    438    96%
2276 passed, 97 warnings in 426.23s (0:07:06)
```

和本機（2276 passed、96%）一致。

## 4. 實際打 API 走完整流程

腳本在容器裡用真的 HTTP 打 `http://localhost:8000`（容器裡的 uvicorn），沒有任何 in-process 替身：

1. phase 1 註冊四個帳號；
2. 從 host 用 `docker logs` 讀出驗證碼，放回容器；
3. phase 2 驗證、登入，用 `scripts/bootstrap_admin.py` 建出 super admin；super admin 透過 `POST /admin/users/{uuid}/role` 指派 data_auditor；兩人都 `switch-identity` 切換身分。

註冊有每分鐘 3 次的 IP 限流，所以腳本在這個 stack 自己的 redis 清掉 `ratelimit:*`。

```
STEP super_admin capabilities ai_duplicate.* -> ['ai_duplicate.review', 'ai_duplicate.revoke', 'ai_duplicate.view']
STEP assign data_auditor -> 200
STEP data_auditor capabilities ai_duplicate.* -> ['ai_duplicate.review', 'ai_duplicate.view']
STEP createTicket #1 -> 200 {"__typename":"TicketCreated", ...}
STEP createTicket #2 (same) -> 200 {"__typename":"DuplicatesSuspected","suspects":[{"draftRef":"task:0","relatedKind":"ticket_task",...}]}
STEP createTicket #2 create anyway -> 200 {"__typename":"TicketCreated", ...}
STEP GET queue as citizen -> 403
STEP GET queue as data_auditor -> 200 {"items":[{"uuid":"12359cf0-...","entity_kind":"ticket_task","status":"dup_ignored","similarity":1.0,...
STEP GET queue as super_admin -> 200
STEP card sides -> {"low": {"uuid": "24996385-...", "deleted": false, "title": "一樓淹水需要抽水機", "type": "rescue", "status": "pending", ...
STEP confirm as citizen -> 403
STEP confirm as data_auditor -> 200 {"status":"confirmed",...}
STEP confirm again -> 409 {"detail":"Duplicate pair is already confirmed"}
STEP revoke own as data_auditor -> 200 {"status":"dup_ignored",...}
STEP confirm as super_admin -> 200 {"status":"confirmed",...}
STEP revoke super_admin's as data_auditor -> 403
STEP revoke as super_admin -> 200 {"status":"dup_ignored",...}
STEP reject as data_auditor -> 200 {"status":"rejected",...}
```

uvicorn 的 access log 和上面的結果逐筆對得上（uuid 換成 `{uuid}`）：

```
   3 /api/v1/admin/duplicate-pairs 200 OK
   1 /api/v1/admin/duplicate-pairs 403 Forbidden
   1 /api/v1/admin/duplicate-pairs/{uuid} 200 OK
   2 /api/v1/admin/duplicate-pairs/{uuid}/confirm 200 OK
   1 /api/v1/admin/duplicate-pairs/{uuid}/confirm 403 Forbidden
   1 /api/v1/admin/duplicate-pairs/{uuid}/confirm 409 Conflict
   1 /api/v1/admin/duplicate-pairs/{uuid}/reject 200 OK
   2 /api/v1/admin/duplicate-pairs/{uuid}/revoke 200 OK
   1 /api/v1/admin/duplicate-pairs/{uuid}/revoke 403 Forbidden
```

## 5. 資料庫裡的結果

待審提醒只發給 data_auditor 和 super admin，觸發的人是照樣建立的那位民眾（ADR-345）：

```
 recipient  |         type         |        title         |   ref_type   |   actor
------------+----------------------+----------------------+--------------+------------
 資料檢核員 | dedup_review_pending | 疑似重複待審核：1 筆 | dedup_review | 另一位民眾
 超級管理員 | dedup_review_pending | 疑似重複待審核：1 筆 | dedup_review | 另一位民眾
```

兩個 task 完全沒被動到（ADR-341）：

```
     task_name      | status  | is_duplicate | never_updated
 一樓淹水需要抽水機 | pending | f            | t
 一樓淹水需要抽水機 | pending | f            | t
```

事件：

```
      event_type      | count
 confirmed            |     2
 hint_shown           |     1
 ignored_by_submitter |     1
 rejected             |     1
 verdict_revoked      |     2
```

## 6. 有撤銷紀錄時不能降級（ADR-344）

```
$ docker exec dedup025v-backend alembic downgrade 1649d30b0122
downgrade exit 1
check constraint "ck_dedup_audit_events_type" of relation "dedup_audit_events" is violated by some row
current: a5e641c99923 (head)
verdict_revoked rows: 2
```

## 7. 沒有在這裡驗的

- 前端畫面：DEDUP-008 屬前端（交接表在 plan 最後一段）。OpenAPI 型別在 #92 review 後已重新產生（`695cb6676`），Frontend CI 的 typecheck／lint／test 都通過。
- 正式環境的寄信：這裡用 `ENV=development` 的 console sender，從 log 讀驗證碼。
- 通知失敗時的回應：容器裡沒有辦法讓通知故意失敗，這條路改用正式的 app 和 `SessionLocal` 在本機重現（修正前出錯、修正後正常），證據在 `Backend/SPEC025_CODE_REVIEW.md` 第六節。
