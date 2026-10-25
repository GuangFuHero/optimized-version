# Verification: 028-dedup-resolve（Task 8 Docker 從零驗證）

**日期**：2026-10-24
**驗證的程式**：`feat/dedup-resolve` @ `b8ade9d52`（PR #113 approve 時的兩個建議修完之後；用 `git archive` 匯出這個 commit 再 build，未追蹤的檔案不會進 image）
**結論**：全部通過。容器內全套件 **2935 passed、0 error**。

> **第一次驗證**跑在 `38ee6e232`（code review 前），流程同樣全部通過；容器內 2774 passed 加 14 個 error，
> 原因是腳本跑全套件時沒帶 `-e PYTHONPATH=/app`，`test_seed_mock_scenarios` 的子程序找不到 `app`，帶上後 14 passed。
> **第二次**跑在 `55cb19729`（code review 修正之後，ADR-381～385），結果也全部通過（2912 passed）。
> **第三次**跑在 `6d3eb7fed`，是 PR #113 review 之後（migration 改接 #110 的 `da152a6a9d7c`、ADR 整批往後移一號、ADR-388～390），也全部通過（2929 passed）。
> **第四次**跑在 `dff0b43a4`：Chi 在 PR #113 提議、使用者同意的配對卡狀態改名（ADR-391，migration `a8d3e6b1c207`），也全部通過（2932 passed）。
> **第五次**（本報告）跑在 `b8ade9d52`：jujuyuzu approve 時的兩個建議（ADR-388 補充：被併掉的需求也擋、測試的等鎖守門只看自己的資料庫）。
> 真實流程、資料庫狀態、通知、降級防護都和第四次相同；以下數字是第五次的。
> 重做的第一次嘗試，db 容器在初始化時退出：腳本的 `CREATE EXTENSION` 和 image 自己的 postgis 初始化撞在一起。腳本改成等初始化完成再建，與程式無關。

腳本：session scratchpad `t8/docker_verify.sh <commit>`（真實流程 `t8/phase1.py`、`t8/phase2.py`），完整輸出在 `t8/docker_verify_b8ade9d52.log`。

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
Running upgrade 7370daf4c8f7 -> da152a6a9d7c, briefings: a status column, and at most one live version per state
Running upgrade da152a6a9d7c -> c3f1a9d27b54, tickets.replaced_by_uuid, ticket_tasks.merged_into_uuid: ...
Running upgrade c3f1a9d27b54 -> a8d3e6b1c207, duplicate_pairs.status: confirmed -> confirmed_duplicate, rejected -> not_duplicate
a8d3e6b1c207 (head)

ticket_tasks.merged_into_uuid
tickets.replaced_by_uuid
```

本分支的兩支 migration 接在 main 的 head `da152a6a9d7c`（#110）之後，只有一個 head。

## 3. 容器內全套件

```
app/api/v1/endpoints/duplicate_pairs.py     67   2   97%
app/services/dedup_resolve.py              180   2   99%
app/services/dedup_resolve_notices.py       64   0  100%
app/services/dedup_resolve_plan.py         216   1   99%
app/services/dedup_review.py               173   0  100%
app/services/dedup_review_tickets.py       118   2   98%
TOTAL                                    13562 478   96%
2935 passed, 120 warnings in 466.07s
```

和本機（2935 passed、96%）一致。

## 4. 真實 HTTP 流程

所有請求都打容器裡的 uvicorn（`localhost:8000`）。8 個帳號用註冊 API 建立，驗證碼從 container log 讀。

### 4.1 準備

1. 超級管理員用 `bootstrap_admin` 建立，用 REST 把另一個帳號指派成 data_auditor（200）。
2. A 的通報者開單 A（清淤人力 2、飲用水 1）。
3. B 的通報者在同一地點開單 B（清淤人力 5、飲用水 5、便當 3）。快層擋下，三項需求都疑似重複，B 帶 `acknowledgedDuplicateOf` 照樣建立，產生 3 張待審卡。
4. 兩位通報者各自用 `setTicketDisasterDetails` 填災害欄位答案（真的 API，200）：A `power_outage: no`；B `utility_hazards: gas`。
5. 照片：A 一張（pA）、B 兩張（pB、pB2）。**用 ORM 寫入**：單的照片只能透過 `createHelpRequest` 帶，而那條路徑不做重複比對，產生不了待審卡。
6. 接單：志工一接 A 清淤；志工二接 A 清淤和 B 清淤；志工三接 B 清淤和 B 飲用水；志工四接 B 便當。全部 200。

### 4.2 審核

| 步驟 | 結果 | 預期 |
|---|---|---|
| data_auditor 讀卡片 detail | 200。兩張完整的單：A（飲用水 1／0 人、清淤 2／2 人，1 張照片，`power_outage: no`）、B（清淤 5／2 人、飲用水 5／1 人、便當 3／1 人，2 張照片，`utility_hazards: gas`） | ✓ ADR-373、384、385 |
| B 有答案，request 沒帶 `disaster_details` | **422** `The other ticket has disaster_details: send the primary's full answers` | ✓ ADR-385 |
| `priority` 填 25 字 | **422** `priority must be at most 20 characters` | ✓ ADR-381（修正前是 500） |
| 一般民眾 resolve | **403** `Permission Denied.` | ✓ ADR-366 |
| A 的通報者在審核期間改了 A 的標題，審核員用舊的 version 送出 | **409** `A ticket changed since it was compared; read it again` | ✓ ADR-374 |
| 重讀 detail，數量填 2，但清淤合併後有 3 人 | **422** `Need 5c7690c5…: 3 people are on it, more than the quantity 2` | ✓ ADR-370 |
| 正確送出：B 清淤併入 A（7）、B 便當搬到 A、B 飲用水取消、A 電話改 0911222333、**A 改名「民生街 12 號淹水（合併）」**、照片 pA／pB 保留 pB2 取消、答案給完整一份 | **200**。卡片 `confirmed_duplicate`（ADR-391），事件 `ignored_by_submitter` → `merged`；回傳的 `tickets.high`（B）為 null | ✓ |
| 同一張卡再 resolve | **409** `Duplicate pair is confirmed_duplicate and cannot be resolved` | ✓ |
| super_admin revoke 這張卡 | **409** `Duplicate pair was resolved; a resolution cannot be revoked` | ✓ ADR-376 |
| 另一張卡（A 飲用水 ↔ B 飲用水） | **409** `A ticket on this card has been cancelled` | ✓ ADR-378 |
| 另一張卡（A 飲用水 ↔ 已搬到 A 的便當） | **409** `A ticket changed since it was compared` | ✓ 見 §7 |

處理後的主要單（回應）：

```
民生街 12 號淹水（合併） 0911222333
[('一樓客廳清淤人力', 7, 3, 'pending'), ('便當', 3, 1, 'pending'), ('飲用水', 1, 0, 'pending')]
photos ['pA.jpg', 'pB.jpg']
disaster_details {'power_outage': ['yes'], 'utility_hazards': ['gas', 'water']}
```

## 5. 資料庫實際狀態

**單**

```
          title           |   status    | contact_phone | deleted |       replaced_by
--------------------------+-------------+---------------+---------+--------------------------
 民生街 12 號淹水（合併） | in_progress | 0911222333    | f       |
 民生街 12 號一樓淹水     | cancelled   | 0912345678    | t       | 民生街 12 號淹水（合併）
```

**需求**

```
    task_name     | quantity |  status  | deleted |        on_ticket         |                 merged_into
------------------+----------+----------+---------+--------------------------+---------------------------------------------
 一樓客廳清淤人力 |        7 | pending  | f       | 民生街 12 號淹水（合併） |
 飲用水           |        1 | pending  | f       | 民生街 12 號淹水（合併） |
 一樓客廳清淤人力 |        5 | canceled | t       | 民生街 12 號一樓淹水     | 一樓客廳清淤人力 @ 民生街 12 號淹水（合併）
 便當             |        3 | pending  | f       | 民生街 12 號淹水（合併） |
 飲用水           |        5 | canceled | t       | 民生街 12 號一樓淹水     |
```

- B 便當整項搬到 A（`on_ticket` 是 A），uuid 不變。
- B 清淤取消，`merged_into` 指向 A 清淤。B 飲用水是取消，不是併入，所以沒有 `merged_into`。

**接單紀錄**

```
 volunteer |    task_name     |          title
-----------+------------------+--------------------------
 志工一    | 一樓客廳清淤人力 | 民生街 12 號淹水（合併）
 志工三    | 一樓客廳清淤人力 | 民生街 12 號淹水（合併）
 志工三    | 飲用水           | 民生街 12 號一樓淹水
 志工二    | 一樓客廳清淤人力 | 民生街 12 號淹水（合併）
 志工四    | 便當             | 民生街 12 號淹水（合併）
```

- 志工二兩邊都接了清淤，合併後只剩 A 那一筆（ADR-369）。
- 志工三從 B 清淤搬到 A 清淤；他在 B 飲用水上的紀錄留在已取消的需求上，和 `delete_ticket_task` 的做法一致。

**照片**（ADR-384）

```
             url             |        on_ticket         | deleted
-----------------------------+--------------------------+---------
 https://example.com/pA.jpg  | 民生街 12 號淹水（合併） | f
 https://example.com/pB2.jpg | 民生街 12 號一樓淹水     | t
 https://example.com/pB.jpg  | 民生街 12 號淹水（合併） | f
```

**災害欄位答案**（ADR-385）

```
          title           |  property_name  | value
--------------------------+-----------------+-------
 民生街 12 號一樓淹水     | utility_hazards | gas
 民生街 12 號淹水（合併） | power_outage    | yes
 民生街 12 號淹水（合併） | utility_hazards | gas
 民生街 12 號淹水（合併） | utility_hazards | water
```

A 的答案被整份取代（`power_outage` 從 no 變 yes，多了 `utility_hazards`）；B 的答案留在已取消的 B 上，不動。

**通知**

```
 recipient  |         type         |                               title                                |   ref_type   |          opens
------------+----------------------+--------------------------------------------------------------------+--------------+--------------------------
 資料檢核員 | dedup_review_pending | 疑似重複待審核：3 筆                                               | dedup_review |
 超級管理員 | dedup_review_pending | 疑似重複待審核：3 筆                                               | dedup_review |
 志工三     | dedup_task_canceled          | 你承接的需求已取消                                                 | ticket       | 民生街 12 號淹水（合併）
 志工三     | dedup_task_merged            | 你承接的需求已合併到「民生街 12 號淹水（合併）」                   | ticket       | 民生街 12 號淹水（合併）
 志工四     | dedup_task_merged            | 你承接的需求已合併到「民生街 12 號淹水（合併）」                   | ticket       | 民生街 12 號淹水（合併）
 志工一     | dedup_ticket_contact_changed | 「民生街 12 號淹水（合併）」的聯絡人已更新                         | ticket       | 民生街 12 號淹水（合併）
 志工二     | dedup_ticket_contact_changed | 「民生街 12 號淹水（合併）」的聯絡人已更新                         | ticket       | 民生街 12 號淹水（合併）
 B 的通報者 | dedup_ticket_merged          | 你的求助「民生街 12 號一樓淹水」已併入「民生街 12 號淹水（合併）」 | ticket       | 民生街 12 號淹水（合併）
 A 的通報者 | dedup_ticket_updated         | 你的求助「民生街 12 號淹水（合併）」已因重複審核更新               | ticket       | 民生街 12 號淹水（合併）
```

- 通知用的是處理後的新標題「（合併）」（ADR-382）。
- 每則點開都是主要單（ADR-379）。
- 志工四的需求是整項搬過來的，也收到「已合併」。
- 志工一、志工二本來就在 A 清淤上，沒有收到「已合併」。A 的電話改了，所以他們收到 `dedup_ticket_contact_changed`（ADR-389）。
  志工三、四是搬過來的，已經從「已合併」得知，不重複通知。
- 審核員本人沒有收到。

**事件與卡片**

```
      event_type      | count | reversible
----------------------+-------+------------
 hint_shown           |     3 | t
 ignored_by_submitter |     3 | t
 merged               |     1 | f

   status            | count
---------------------+-------
 confirmed_duplicate |     1
 dup_ignored         |     2

     card_status     | event_type
---------------------+------------
 confirmed_duplicate | merged
 dup_ignored         |
 dup_ignored         |
```

卡片狀態用新名稱（ADR-391）。這個流程是從待審卡直接 resolve，沒有經過 confirm／reject，所以沒有產生 `confirmed`／`rejected` 判定事件；
「卡片用新名稱、事件類型保留舊名稱」由容器內全套件驗證（`test_dedup_review_decide` 同時檢查 `confirmed_duplicate` 與事件 `confirmed`）。

**存取紀錄**（`/api/v1/admin/duplicate-pairs*`）

```
   2 /api/v1/admin/duplicate-pairs 200 OK
   2 /api/v1/admin/duplicate-pairs/{uuid} 200 OK
   1 /api/v1/admin/duplicate-pairs/{uuid}/resolve 200 OK
   1 /api/v1/admin/duplicate-pairs/{uuid}/resolve 403 Forbidden
   4 /api/v1/admin/duplicate-pairs/{uuid}/resolve 409 Conflict
   1 /api/v1/admin/duplicate-pairs/{uuid}/revoke 409 Conflict
   3 .../resolve 422 Unprocessable Content
```

## 6. 降級防護

```
alembic downgrade da152a6a9d7c  → exit 1
row(s) of tickets still have replaced_by_uuid set
current: a8d3e6b1c207 (head)
```

有資料時降級會失敗，紀錄不會被刪掉。降級先經過改名 migration（`a8d3e6b1c207` 把狀態改回舊名稱），再在 `c3f1a9d27b54` 被擋下；
整段是同一筆交易，所以停在 `a8d3e6b1c207`、狀態維持新名稱，不會留下改了一半的狀態。

## 7. 觀察到、但符合設計的行為

**整項搬過去的需求，原本的卡片會變成「同一張單」**

B 便當原本和 A 飲用水有一張待審卡。B 便當搬到 A 之後，這張卡的兩邊都在 A 上。

- 腳本送的是另一張卡的 `version`，所以先被版本檢查擋下，回 409。
- 前端照正常流程重讀這張卡再送出時，會拿到 422「兩邊是同一張單」（ADR-377）。code review 第 9 條把這個檢查留在處理計畫裡，所以它排在版本檢查之後。
- 卡片留在佇列裡，兩邊都沒有 `deleted`，審核員可以用 reject 或 confirm 結案（ADR-378）。

前端要知道會出現這種卡片。

## 8. 與 plan 的差異

- plan 寫的「B 在前台查得到 `replacedByUuid`」已在 ADR-372 改成不做。導向主要單靠通知，§5 已驗證每則通知都指向主要單。
- 照片用 ORM 寫入，理由見 §4.1 第 5 點。
