# Verification: 028-dedup-resolve（Task 8 Docker 從零驗證）

**日期**：2026-10-24
**驗證的程式**：`feat/dedup-resolve` @ `38ee6e232`（用 `git archive` 匯出這個 commit 再 build，未追蹤的檔案不會進 image）
**結論**：全部通過。容器內全套件第一次跑有 14 個 error，原因是容器環境少了 `PYTHONPATH`，不是程式問題（見 §3）。

腳本：session scratchpad `t8/docker_verify.sh <commit>`（真實流程 `t8/phase1.py`、`t8/phase2.py`），完整輸出在 `t8/docker_verify_38ee6e232.log`。

## 1. 環境

不碰本機既有的 `backend-*` 容器與 025 的測試容器：自己開一個 network `dedup028v`，三個裸容器都只在這個 network 裡，不對外開 port。驗證完整組刪除。

| 容器 | image | 說明 |
|---|---|---|
| `dedup028v-backend` | `dedup028-backend:verify`（`DOCKER_BUILDKIT=0 docker build --no-cache`） | 正式的 Dockerfile CMD（uvicorn，無 `--reload`），`ENV=development` 讓驗證碼印在 log |
| `dedup028v-db` | `disaster-postgres-h3:16-3.4` | 全新的空資料庫 |
| `dedup028v-redis` | `redis:7-alpine` | 全新 |

image 裡是本分支的程式：

```
alembic/versions/c3f1a9d27b54_dedup_merge_refs.py
app/services/dedup_resolve.py
app/services/dedup_resolve_notices.py
app/services/dedup_resolve_plan.py
app/services/dedup_review_tickets.py
```

## 2. 空資料庫 → migration → seed

```
Running upgrade 79a19cabc98a -> c3f1a9d27b54, tickets.replaced_by_uuid, ticket_tasks.merged_into_uuid: ...
c3f1a9d27b54 (head)

ticket_tasks.merged_into_uuid
tickets.replaced_by_uuid
```

## 3. 容器內全套件

```
app/api/v1/endpoints/duplicate_pairs.py     67   2   97%
app/services/dedup_resolve.py              163   3   98%
app/services/dedup_resolve_notices.py       45   0  100%
app/services/dedup_resolve_plan.py         185   2   99%
app/services/dedup_review.py               170   0  100%
app/services/dedup_review_tickets.py        90   2   98%
TOTAL                                    13109 480   96%
2774 passed, 120 warnings, 14 errors in 521.74s
```

14 個 error 全在 `tests/test_seed_mock_scenarios.py`，錯誤都是：

```
scripts/seed_rbac.py failed:
  File "/app/scripts/seed_rbac.py", line 22, in <module>
    from app.core.config import settings
ModuleNotFoundError: No module named 'app'
```

這組測試另開子程序執行 `scripts/seed_rbac.py`，容器裡沒有 `PYTHONPATH=/app` 就找不到 `app`。用同一個 image 另起一組環境，只跑這個檔對照：

| 設定 | 結果 |
|---|---|
| 不設 `PYTHONPATH` | 14 errors |
| `-e PYTHONPATH=/app` | **14 passed** |

所以容器內實際是 2774 + 14 = **2788 passed**，和本機（2788 passed、96%）一致。這是驗證腳本少帶環境變數，不是本分支的問題；下次的腳本要在跑全套件時加上 `-e PYTHONPATH=/app`。

## 4. 真實 HTTP 流程

所有請求都打容器裡的 uvicorn（`localhost:8000`）。8 個帳號用註冊 API 建立，驗證碼從 container log 讀。

### 4.1 準備

1. 超級管理員用 `bootstrap_admin` 建立，用 REST 把另一個帳號指派成 data_auditor（200）。
2. A 的通報者開單 A（清淤人力 2、飲用水 1）。
3. B 的通報者在同一地點開單 B（清淤人力 5、飲用水 5、便當 3）。快層擋下，三項需求都疑似重複（`DuplicatesSuspected`，`task:0`～`task:2`）。B 帶 `acknowledgedDuplicateOf` 照樣建立，產生 3 張待審卡。
4. 接單：志工一接 A 清淤；志工二接 A 清淤和 B 清淤；志工三接 B 清淤和 B 飲用水；志工四接 B 便當。全部 200。

### 4.2 審核

| 步驟 | 結果 | 預期 |
|---|---|---|
| data_auditor 讀卡片 detail | 200。兩邊都是完整的單：B（清淤 5／2 人、便當 3／1 人、飲用水 5／1 人）、A（清淤 2／2 人、飲用水 1／0 人），含聯絡電話 | ✓ |
| 一般民眾 resolve | **403** `Permission Denied.` | ✓ ADR-365 |
| A 的通報者在審核期間改了 A 的標題，審核員用舊的 version 送出 | **409** `A ticket changed since it was compared; read it again` | ✓ ADR-373（只改單的欄位也抓得到） |
| 重讀 detail，數量填 2，但清淤合併後有 3 人 | **422** `Need d1fe75a7…: 3 people are on it, more than the quantity 2` | ✓ ADR-369 |
| 正確送出：B 清淤併入 A（7）、B 便當搬到 A、B 飲用水取消、A 電話改成 0911222333 | **200**。卡片 `confirmed`，事件 `ignored_by_submitter` → `merged`；回傳的 `tickets.low`（B）為 null | ✓ |
| 同一張卡再 resolve | **409** `Duplicate pair is confirmed and cannot be resolved` | ✓ |
| super_admin revoke 這張卡 | **409** `Duplicate pair was resolved; a resolution cannot be revoked` | ✓ ADR-375 |
| 另一張卡（A 飲用水 ↔ B 飲用水） | **409** `A ticket on this card has been cancelled` | ✓ ADR-377 |
| 另一張卡（B 便當 ↔ A 飲用水） | **422** `Both sides are needs of the same ticket` | ✓ ADR-376，見 §6 |

處理後的主要單：

```
民生街 12 號淹水（更新） 0911222333
[('一樓客廳清淤人力', 7, 3, 'pending'), ('便當', 3, 1, 'pending'), ('飲用水', 1, 0, 'pending')]
```

## 5. 資料庫實際狀態

**單**

```
          title           |   status    | contact_phone | deleted |       replaced_by
--------------------------+-------------+---------------+---------+--------------------------
 民生街 12 號淹水（更新） | in_progress | 0911222333    | f       |
 民生街 12 號一樓淹水     | cancelled   | 0912345678    | t       | 民生街 12 號淹水（更新）
```

**需求**

```
    task_name     | quantity |  status  | deleted |        on_ticket         |                 merged_into
------------------+----------+----------+---------+--------------------------+---------------------------------------------
 一樓客廳清淤人力 |        7 | pending  | f       | 民生街 12 號淹水（更新） |
 飲用水           |        1 | pending  | f       | 民生街 12 號淹水（更新） |
 一樓客廳清淤人力 |        5 | canceled | t       | 民生街 12 號一樓淹水     | 一樓客廳清淤人力 @ 民生街 12 號淹水（更新）
 便當             |        3 | pending  | f       | 民生街 12 號淹水（更新） |
 飲用水           |        5 | canceled | t       | 民生街 12 號一樓淹水     |
```

- B 便當整項搬到 A（`on_ticket` 是 A），uuid 不變。
- B 清淤取消，`merged_into` 指向 A 清淤。B 飲用水是取消，不是併入，所以沒有 `merged_into`。

**接單紀錄**

```
 volunteer |    task_name     |          title
-----------+------------------+--------------------------
 志工一    | 一樓客廳清淤人力 | 民生街 12 號淹水（更新）
 志工三    | 一樓客廳清淤人力 | 民生街 12 號淹水（更新）
 志工三    | 飲用水           | 民生街 12 號一樓淹水
 志工二    | 一樓客廳清淤人力 | 民生街 12 號淹水（更新）
 志工四    | 便當             | 民生街 12 號淹水（更新）
```

- 志工二兩邊都接了清淤，合併後只剩 A 那一筆（ADR-368）。
- 志工三從 B 清淤搬到 A 清淤。
- 志工三在 B 飲用水上的紀錄留在已取消的需求上，和 `delete_ticket_task` 的做法一致。

**通知**

```
 recipient  |         type         |                               title                                |   ref_type   |          opens
------------+----------------------+--------------------------------------------------------------------+--------------+--------------------------
 資料檢核員 | dedup_review_pending | 疑似重複待審核：3 筆                                               | dedup_review |
 超級管理員 | dedup_review_pending | 疑似重複待審核：3 筆                                               | dedup_review |
 志工三     | dedup_task_canceled  | 你承接的需求已取消                                                 | ticket       | 民生街 12 號淹水（更新）
 志工三     | dedup_task_merged    | 你承接的需求已合併到「民生街 12 號淹水（更新）」                   | ticket       | 民生街 12 號淹水（更新）
 志工四     | dedup_task_merged    | 你承接的需求已合併到「民生街 12 號淹水（更新）」                   | ticket       | 民生街 12 號淹水（更新）
 B 的通報者 | dedup_ticket_merged  | 你的求助「民生街 12 號一樓淹水」已併入「民生街 12 號淹水（更新）」 | ticket       | 民生街 12 號淹水（更新）
 A 的通報者 | dedup_ticket_updated | 你的求助「民生街 12 號淹水（更新）」已因重複審核更新               | ticket       | 民生街 12 號淹水（更新）
```

- 每則處理後的通知點開都是主要單（ADR-378）。
- 志工四的需求是整項搬過來的，也收到「已合併」（Task 6 補的收件人）。
- 志工一、志工二本來就在 A 清淤上，沒有收到通知。
- 審核員本人沒有收到。

**事件與卡片**

```
      event_type      | count | reversible
----------------------+-------+------------
 hint_shown           |     3 | t
 ignored_by_submitter |     3 | t
 merged               |     1 | f

   status    | count
-------------+-------
 confirmed   |     1
 dup_ignored |     2
```

**存取紀錄**（`/api/v1/admin/duplicate-pairs*`）

```
   2 /api/v1/admin/duplicate-pairs 200 OK
   2 /api/v1/admin/duplicate-pairs/{uuid} 200 OK
   1 /api/v1/admin/duplicate-pairs/{uuid}/resolve 200 OK
   1 /api/v1/admin/duplicate-pairs/{uuid}/resolve 403 Forbidden
   3 /api/v1/admin/duplicate-pairs/{uuid}/resolve 409 Conflict
   1 /api/v1/admin/duplicate-pairs/{uuid}/revoke 409 Conflict
   2 .../resolve 422 Unprocessable Content
```

## 6. 降級防護

```
alembic downgrade 79a19cabc98a  → exit 1
row(s) of tickets still have replaced_by_uuid set
current: c3f1a9d27b54 (head)
```

有資料時降級會失敗，紀錄不會被刪掉。

## 7. 觀察到、但符合設計的行為

**整項搬過去的需求，原本的卡片會變成「同一張單」**

B 便當原本和 A 飲用水有一張待審卡。B 便當搬到 A 之後，這張卡的兩邊都在 A 上。resolve 它回 422（ADR-376），卡片留在佇列裡，兩邊都沒有 `deleted`。審核員可以用 reject 或 confirm 結案。

這照 ADR-376、377 的規則運作，但前端要知道會出現這種卡片。

## 8. 與 plan 的差異

- plan 寫的「B 在前台查得到 `replacedByUuid`」已在 ADR-371 改成不做。導向主要單靠通知，§5 已驗證每則通知都指向主要單。
- 驗證腳本跑全套件時少了 `-e PYTHONPATH=/app`（§3）。
