# Decisions: 025-dedup-review-queue

ADR 全域連號，本 Spec 從 **ADR-336** 開始（2026-10-20 掃描所有遠端分支，最大號 335）。
commit 前再掃一次，避免與其他 open PR 撞號。

---

## ADR-336：範圍只做「判定＋撤銷」，合併與取代另開票

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**背景**：DEDUP-007 定義了四種審核動作：不是重複、確認重複、合併（逐欄位選值，另一筆取消）、
取代（一筆蓋掉另一筆）。後兩種會改 ticket／task／station 本身，也會影響已認領的志工
（要通知、要釋放認領）。

**決定**：本 Spec 只做「不是重複（rejected）」「確認重複（confirmed）」與撤銷。
合併、取代、擁有者與志工通知另開一張票。

**理由**：判定只改配對卡，前端可以先讓審核清單上線；合併的範圍（逐欄位、取消、認領、撤銷寫回）
大很多，混在一起會拖住整張票。

> 2026-10-24：拆出去的合併已在 **Spec 028**（`028-dedup-resolve`，ADR-365～385）實作：選主要單、前端送最終值、另一張單一定取消、志工跟著搬、不能撤銷。

---

## ADR-337：super_admin 與 data_auditor 都拿到 `ai_duplicate.view`／`ai_duplicate.review`

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**背景**：main 上沒有任何角色拿到這兩個權限（`scripts/seed_rbac.py` 檔頭第 13 行：還沒有功能在檢查它）。
Notion 的 ROLE-BASED TIMELINE 卡只提到 super_admin，但 DEDUP-008 與 BE-RBAC-3 都寫兩個角色。
BE-RBAC-3 擔心「data_auditor 不能寫」，但 main 上已有放寬的先例（ADR-300 的 `station.review`／`station.revoke`、
`ticket.audit`）。

**決定**：兩個角色都給，scope = `all`。

- `seed_rbac.py` 加授權並改檔頭說明；`tests/test_me_capabilities.py` 的斷言改成只缺 `role_request.add`。
- 既有資料庫：`scripts/deploy.sh` 每次 `alembic upgrade head` 之後都會跑 seed，而 seed 會補上缺的授權
  （只補缺的、不覆蓋，ADR-055），所以正常部署靠 seed 就會拿到。另外加一支 data migration `1649d30b0122`
  當保險，給只跑 migration、沒跑 seed 的資料庫；它只 INSERT 缺的授權列，不動已經在 `/admin/rbac` 改過的。（慣例，未另外拍板）

> 2026-10-21 修正（#92 review）：原文說既有資料庫只能靠 migration 補授權，理由是「seed 不覆蓋」；但 seed 會補缺的，
> `deploy.sh:211-214` 也是 migrate 完接著跑 seed，所以 migration 不是唯一的路。

**權限管的是資料，不是演算法**：view 管能不能讀配對卡與事件，review 管能不能改配對卡狀態。
`app/dedup_engine/` 不經過這兩個權限，本 Spec 也不改它。

---

## ADR-338：審核 API 用 REST `/api/v1/admin/duplicate-pairs`

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**決定**：放在 REST 的 admin 路由，路徑形狀照 main 上的 role-requests 審核
（`app/api/v1/endpoints/role_requests.py`：`GET` 清單、`POST /{uuid}/approve|reject`）：

| 方法 | 路徑 | 權限 |
|---|---|---|
| GET | `/admin/duplicate-pairs` | `ai_duplicate.view` |
| GET | `/admin/duplicate-pairs/{uuid}` | `ai_duplicate.view` |
| POST | `/admin/duplicate-pairs/{uuid}/confirm` | `ai_duplicate.review` |
| POST | `/admin/duplicate-pairs/{uuid}/reject` | `ai_duplicate.review` |
| POST | `/admin/duplicate-pairs/{uuid}/revoke` | `ai_duplicate.review`（撤銷別人的另需 `ai_duplicate.revoke`，ADR-342） |

權限檢查放在 service 層（與既有 admin 端點一致），端點只負責轉換。

---

## ADR-339：「待審」= `dup_ignored` ＋ `suggested`

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**決定**：清單預設只回 `status IN ('dup_ignored', 'suggested')` 且未軟刪除的卡；判定後變成
`confirmed`／`rejected` 就離開預設清單（可用 `status` 篩選看已處理的）。

**理由**：目前快層只會寫 `dup_ignored`（使用者照樣建立）；`suggested` 是之後慢層用的，
先算進去，慢層上線時不用改 API。

---

## ADR-340：清單直接帶兩邊的摘要，一次批次查

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**決定**：每張卡帶 `low`、`high` 兩邊的摘要（比對用的幾個欄位：名稱、類型、座標、狀態、
建立者、建立時間；task 另帶所屬 ticket 的 uuid 與標題）。後端依 `entity_kind` 分組後一次查回
（每種一條 query），不會一張卡查一次。完整內容由前端點進去再用既有 API 查。

- 模型沒有地址欄位，比對位置用座標（geometry 的中心點）。欄位對照見 spec §2.1。
- 實體（或 task 所屬的 ticket）已軟刪除時，那一邊回 `{uuid, deleted: true}`，其他欄位為 null；卡仍照常顯示，讓審核員可以判定。

> 2026-10-21 修正（#92 review）：原文寫「地址」與「摘要回 `null`」，和實作不符；實作在 Task 3 定案時已改為上面的寫法，ADR 沒跟著改。
- 審核員本來就有 `*.view_pii = all`，摘要不另外遮罩。

---

## ADR-341：「確認重複」只改配對卡，不動實體

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**決定**：confirm／reject 只改配對卡的 `status`、`reviewed_by`、`reviewed_at`，並寫事件；
不寫 task／station 的 `is_duplicate`／`dedup_group_id`，不取消任何一筆。
後續處理（合併、取消）屬於 ADR-336 的另一張票。

> 2026-10-24：**部分被 ADR-365（Spec 028）取代**。confirm／reject 仍只改配對卡；
> 新增的 `resolve` 會在同一筆交易裡改單、處理需求，並把卡改成 `confirmed`。

---

## ADR-342：撤銷 — 自己的判定用 review，撤別人的需要新權限 `ai_duplicate.revoke`

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**背景**：使用者要「只有原審核人或 super_admin 能撤銷」。這套 RBAC 只看權限，不寫死角色名稱；
站點建議的撤銷就是另開 `station.revoke`。

**決定**：
- 新增 `Perm.AI_DUP_REVOKE = "ai_duplicate.revoke"`，只授給 super_admin（seed＋data migration）。
- 撤銷時：`reviewed_by == 目前使用者` → 只需 `ai_duplicate.review`；否則需要 `ai_duplicate.revoke`，沒有就 403。
- 撤銷把卡改回判定前的狀態（存在判定事件的 `before_state`），清掉 `reviewed_by`／`reviewed_at`，寫撤銷事件。不限時間。

---

> 2026-10-25：配對卡的已審狀態改名為 `confirmed_duplicate`／`not_duplicate`（Spec 028 ADR-391）。本檔與 ADR-339、343 寫的
> `confirmed`／`rejected` 指的是改名前的狀態值；**事件類型仍是 `confirmed`／`rejected`**，沒有改。

---

## ADR-343：判定只能從「待審」出發，要改判先撤銷

**Date**: 2026-10-20　**Status**: Accepted（慣例，未另外拍板）

**決定**：confirm／reject 只接受待審狀態的卡，否則回 409；revoke 只接受 `confirmed`／`rejected`。
要把 confirmed 改成 rejected，先撤銷再判定，事件歷史才會完整。
同一張卡的判定與撤銷用 `SELECT ... FOR UPDATE` 鎖住，兩個審核員同時按時只有一個成功（照 `suggestion.py::_lock_station`）。

---

## ADR-344：撤銷事件新增 `verdict_revoked` 類型

**Date**: 2026-10-20　**Status**: Accepted（慣例，未另外拍板）

**背景**：`AUDIT_EVENT_TYPES` 有 `confirmed`、`rejected`，但對應撤銷的只有 `unmerged`（給合併用）。

**決定**：新增 `verdict_revoked`，`before_state`／`after_state` 記錄撤銷前後的狀態。需要 migration 改
`ck_dedup_audit_events_type`。不重用 `unmerged`，以免之後合併票上線時兩種撤銷分不清。

---

## ADR-345：待審提醒改掛在建卡上，每次送出一則；移除永遠不會觸發的舊分支

**Date**: 2026-10-20　**Status**: Accepted（使用者拍板）

**背景**：`app/services/ticket.py:888` 與 `app/services/station.py:302` 的 `dedup_flag_*` 通知掛在
`is_duplicate`／`dedup_group_id` 的變動上；沒有程式會寫這兩個欄位，所以永遠不會觸發（DEDUP-009 也指出）。

**決定**：
- `app/services/dedup_submission.py` 的 `submit_new_ticket`／`submit_new_task`／`submit_new_station`
  在 commit 之後，若這次送出寫了 `dup_ignored` 卡，就發一則通知給有 `ai_duplicate.review` 的人：
  「N 筆疑似重複待審」，附審核頁連結。同一次送出不論幾張卡只發一則。
- 通知失敗只記 log，不影響已完成的建立。
- 移除上述兩個舊分支。（查證時兩段都沒有測試；`UpdateTicketTaskInput` 只有 `progress_note`、
  `UpdateStationInput` 沒有 `is_duplicate`，批次匯入也沒有這兩個欄位，所以確實不會觸發。）
- 擁有者通知與志工通知屬於合併票（ADR-336）。

**實作時補定（慣例，未另外拍板）**：
- 通知類型改名為 `dedup_review_pending`，不沿用 `dedup_flag_ticket`／`dedup_flag_station`：
  舊名稱是「一筆實體一則」，新的是「一次送出一則」，沿用會誤導。前端沒有任何地方用到舊名稱。
  `Spec/Docs/er-diagram.md` 的類型清單已同步。
- `ref_type = "dedup_review"`、`ref_uuid = None`：一次送出可能有好幾張卡，所以指向審核頁本身，不指向單張卡。
- 實作在 `app/services/dedup_review.py::notify_new_cards`，由 `dedup_submission` 三個 submit 在 commit 後呼叫。

**Task 7 review 補充（2026-10-20）**：通知失敗時的 `db.rollback()` 會讓 session 裡**所有**物件過期（不受
`expire_on_commit=False` 影響），包括目前登入的使用者。GraphQL 在 mutation 之後解析 `contactName`／`contactPhone`
時要用它判斷權限，讀到過期的物件就丟 MissingGreenlet：工單已經建好，回應卻帶著 `Unexpected error.`。
修法：`notify_new_cards` 多收 `actor`，rollback 之後 `refresh(actor)`；建立的 entity 本來就由呼叫端在通知後 refresh。
回歸測試：`tests/test_graphql/test_dedup_review_notify_graphql.py`。

---

## ADR-443：任務單加唯讀 `verificationStatus`，從配對卡讀出「疑似重複」

**Date**: 2026-10-30　**Status**: Accepted（使用者 2026-10-30 照建議；依據糖的管理平台原型
`Design/後台/docs/任務管理.md`（`sucrelindesign` 分支）：`verification` 查核狀態，`disputed`＝疑似重複
→ 後端 `TicketType.verificationStatus`；2026-10-31 popo review #174 後改成卡兩邊要是兩張不同、還在的單才算，
Dan 同意）

**背景**：管理平台任務單看板要在單上標「疑似重複」，並寫出跟哪張單重複（原型 `tk-table.jsx` 列表標題旁、
`tk-detail.jsx` 抽屜「查核狀態：疑似與 X 重複」），只給資料檢核員和超管看。配對卡（`duplicate_pairs`）已經記了
哪兩筆疑似重複、審核到哪，但快層的卡是需求對需求（`ticket_task`），單上讀不到。`auditStatus` 是另一件事
（PR #84 的資料檢核），不拿來用。

**決定**：

- `TicketType.verificationStatus: TicketVerificationType`（可為 null），每次讀的時候從配對卡算，不存：
  - `state: TicketVerificationState!`：目前只有 `disputed`。
  - `duplicateOf: [TicketDuplicateRefType!]!`：跟哪幾張單（`uuid`、`title`）。
- **什麼算疑似重複**：這張單或它的需求，有一張重複審核還能合併的卡：
  - 卡沒軟刪除，種類是 `ticket` 或 `ticket_task`；
  - 狀態是 `dup_ignored`／`suggested`（待審，ADR-339），或 `confirmed_duplicate` 但還沒合併（沒有 `merged` 事件）；
  - 卡兩邊對回的是兩張不同的單，兩張都沒取消、沒刪除。
  - 跟 `dedup_resolve` 能合併的卡同一個條件：前兩條是 `RESOLVABLE_KINDS`、`RESOLVABLE_STATUSES`、`has_merged_event`；
    最後一條不成立，合併會擋下來：一邊取消或刪了回 409（`_locked_snapshot`），兩邊是同一張單回 422（`build_plan`）。
  - 判「不是重複」或合併後就不算；撤回判定後卡回到待審，又算。
- **合併留下的卡**：仍要建立時，每個像既有需求的需求各寫一張卡（`dedup_submission._record_acknowledged`），
  合併只結掉審核員按的那張。例：A 有抽水機、飲用水兩個需求，B 在同一個地方送一樣的兩個、仍要建立，寫了兩張卡；
  合併抽水機那張（B 併進 A）後，飲用水那張還是待審，但另一邊是已取消的 B（飲用水併進 A 的那個），或 A 自己
  （飲用水搬到 A）。這張卡合併不了，不算，A 不會一直標疑似重複。
- **卡對回單**：`ticket` 卡兩邊就是單；`ticket_task` 卡用需求**現在**所屬的單（`ticket_tasks.ticket_uuid`），
  跟 `dedup_review_tickets.ticket_uuids_for_pair` 一樣。合併把需求搬到主單後，那個需求還能處理的卡跟著算在主單；
  需求刪了，卡還在審核清單裡，兩張單都還在就照樣算（合併只看單）。
- **`duplicateOf`**：卡另一邊的單，同一張只列一次，照最早那張卡的建立時間排。算數的卡另一邊一定是還在的另一張單，
  所以 `disputed` 時至少有一張。
- **誰看得到**：在這張單上持有 `ai_duplicate.view` 的人（超管、資料檢核員，ADR-337），跟重複審核頁同一個權限；
  其他人（含前台、訪客）拿到 null，也不查。審核頁已經給整張單，標題不會多給。
- **怎麼查**：`disputes_by_ticket` DataLoader（`app/services/ticket_verification.py`），一頁的單一起查：
  卡一句、對方單的標題一句，不隨筆數增加。
- **不做**：不能用它篩選或排序；不加存資料的欄位、不用 migration；不改 `ticket_audit`／`auditStatus`／通知；
  不改重複審核頁和合併的程式。

**理由**：卡的狀態由建卡、判定、撤回、合併四條路徑改，存一份在單上就要每條都記得同步；讀的時候算，判完下一次讀
就對，也不會多一個從別的表推得出來的欄位（第三正規化）。

**Consequences**：

- ➕ 看板跟重複審核頁同一個來源，判完就看得到。
- ➖ 看得到的人每頁多兩句 SQL。卡那句從還能處理的卡找起（`ix_duplicate_pairs_status`）；已合併的卡也是
  `confirmed_duplicate`，會一直累積，靠 `ix_dedup_audit_events_pair` 排掉。卡只在「仍要建立」時寫，數量小。
- ➖ 不能用它篩選；要的話得另外決定存一份，或在列表查詢裡加子查詢。
- ➖ 判了「是重複」還沒合併的卡，審核頁預設清單看不到（ADR-339 預設只列待審），要篩 `confirmed_duplicate`
  才找得到，看板卻會標它。
- ➖ 反過來，合併留下的卡、另一邊的單取消或刪了的卡，看板不標，審核頁清單卻還列著（清單只照卡的狀態），
  只能判「是／不是重複」，合併不了。這是重複審核本來的行為，這裡不改。
- ◾ `auditStatus` 照舊是資料檢核；看板的「疑似重複」改讀 `verificationStatus`。同一次拿掉看板不再用、
  也還沒進 main 的 `viewerCanAudit` 和 `ticketsExtent(auditStatus:)`；`tickets(auditStatus:)` 不動。

---

## ADR-455：重複審核加「提示率」和「誤報率」（`GET /admin/duplicate-hint-rates`）

**Date**: 2026-11-01　**Status**: Proposed

**背景**：團隊想知道快層的提示好不好用，有兩個問題：民眾多常被提示打斷（提示率），跳出來的提示準不準（誤報率）。
上線後沒有人逐筆看每個提示，誤報率只能用快層已經記的資料估。資料檢核員不一定審得完每張配對卡，所以要有不靠審核結果的估法。

**決定**：

- 新增 `GET /api/v1/admin/duplicate-hint-rates?since=&until=`，只讀。時間要帶時區，`since` 含、`until` 不含；
  預設是最近 30 天。權限 `ai_duplicate.view`，跟審核頁一樣（ADR-337）。
- 回 task（`ticket_task`）一列、站點（`station`）一列，次數和比例一起回，前端可以顯示「N 次裡 k 次」。分母是 0 時比例回 null，不用 0 假裝量過：
  - `hint_rate`（提示率）＝跳提示的次數 ÷ 送出次數。送出次數＝跳提示的次數＋沒跳提示就建立的
    （這段時間新建立的 task／站點，扣掉看到提示還是送出建出來的）。
  - `false_alarm_rate_without_auditors`（誤報率，不用審核結果）＝看到提示還是送出的次數 ÷ 跳提示的次數。
  - `false_alarm_rate_with_auditors`（誤報率，用審核結果）＝看到提示還是送出的次數 ×
    （已審的配對卡判定 `not_duplicate` 的比例）÷ 跳提示的次數。
  - `review_coverage`＝已審的配對卡 ÷ 看到提示還是送出的次數，太低就別太相信上一個數字。
- **一次提示怎麼算**：一筆 `hint_shown`；同一個人、同一天（台灣時間）、被提示同一筆舊資料只算一次，
  因為回去改內容再送，可能又跳同一筆。「看到提示還是送出」用同樣的條件配對 `ignored_by_submitter`，
  審核結果讀它那張卡現在的 `status`（撤回判定會回到待審，ADR-344）。
- **看到提示就沒送出的，當作提示是對的**：快層不寫 `hint_accepted`，沒送出只會留下 `hint_shown`（ADR-303）。
- 批次匯入的提示和匯入建立的列也一起算：新建立的 task／站點分不出是不是匯入的，只算單筆送出會對不起來。

**後果**：

- ➕ 不用新資料表、不用 migration，只讀快層已經記的東西。
- ➖ 兩個誤報率都是估的：看到提示就沒送出的人，有些只是放棄，不是真的重複，會讓數字偏低；
  不用審核結果的版本把看到提示還是送出的全算成誤報，又會偏高，所以這個版本偏哪邊不一定。
- ➖ 已知誤差：改完內容、沒再跳提示就建立，會同時算在跳提示和沒跳提示建立；跳提示和送出跨過台灣時間的午夜就配不起來；
  以 task 計，不是以單計；匯入時沒勾的列預設不建立，也會被當成接受提示；不經過快層就建立的 task／站點，會被算進送出次數。
- ◾ 畫面和說明文字另開前端 PR（重複審核頁，#205 之後）。
