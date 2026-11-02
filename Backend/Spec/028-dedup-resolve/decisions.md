# Decisions: 028-dedup-resolve

ADR 全域連號，本 Spec 從 **ADR-365** 開始（2026-10-24 掃描所有遠端分支與本機 worktree，最大號 363，
在 `Spec/007-information-publishing`）。Spec 027 已被 `027-address-normalization` 佔用，本 Spec 用 028。

> **2026-10-25 整批往後移一號**：原本是 ADR-364～384。#110（行前通知下架，Spec 007）合併時也用了 ADR-364，
> 本 Spec 改成 ADR-365～385（PR #113 review）。程式、測試、Spec 025 的註記都跟著改了。
> 386、387 已被其他分支用掉（`018-ticket-disaster-fields`），PR #113 review 那一輪的新決定從 ADR-388 起。
commit 前再掃一次，避免與其他 open PR 撞號。

---

## ADR-365：新增處理 API，判定與單的變更在同一筆交易；部分取代 ADR-341

**Date**: 2026-10-24　**Status**: Accepted（Carol 與工程師 10/23 定案，Notion §12b 第 4 項）

**背景**：ADR-341 規定判定只改配對卡，不動實體。10/23 定案要在審核頁直接處理重複的單。
如果拆成「先判定、再呼叫改單、再呼叫刪單」，中途失敗會留下判定了卻沒處理的單，
而且資料檢核員沒有改單、刪單的權限（Notion §10d）。

**決定**：
- 新增 `POST /admin/duplicate-pairs/{uuid}/resolve`。改單、處理需求、把卡改成 `confirmed_duplicate`（ADR-391 前叫 `confirmed`）、寫事件，都在同一筆交易。
- 卡是待審（`dup_ignored`、`suggested`）或 `confirmed_duplicate` 且還沒處理過，都可以處理。
  已經用 025 的 confirm 判定過的卡，不必先撤銷。
- `confirm`、`reject` 照舊只改配對卡。**ADR-341 對 confirm／reject 仍然有效**，對 resolve 不適用。

---

## ADR-366：resolve 只檢查 `ai_duplicate.review`

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 5 項）

**決定**：resolve 只要求 `ai_duplicate.review`（scope `all`），不檢查 `ticket.edit`、`ticket.delete`。

**理由**：資料檢核員的工作是處理重複，不是一般的改單。只給這一個動作，每次都留下完整事件，
比給一般改單權限範圍小。做法同站點建議審核（ADR-300）。

---

## ADR-367：選一張主要單，結果由前端輸入；不建立新單 C

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**背景**：Notion §12a 列了四種處理（不是重複、擇一、擇一並編輯、逐欄合併成新單 C）。
使用者 10/24 說明實際操作：審核員選主要單，再選要哪些需求，主要單的資料也能改。
例如 A（human 2、water 1）和 B（human 5、water 5）合併後，A 變成 human 7、water 6。
數字由審核員輸入，不是後端相加，也不限於從 A 或 B 挑一個值。

**決定**：
- 只有一種處理：`primary` 指定主要單，`ticket` 帶主要單要改的欄位，`primary_tasks`、`secondary_tasks` 說明每一項需求怎麼處理。
- 「擇一」= 主要單不改、另一張整張取消；「擇一並編輯」= 帶 `ticket`。兩者都是這一種處理的特例，不另設動作。
- **不建立新單 C**。結果都留在主要單上，沿用它的 uuid 和開單者（`created_by`）。
- 不記錄每個欄位的值來自 A、B 還是審核員輸入。值是審核員決定的，處理前兩張單的完整內容和送出的 request 都在事件裡，需要時可以比對（ADR-375）。
- 主要單可改的欄位包含聯絡人（`contact_name`、`contact_phone`、`contact_email`）。`updateTicket` 沒開放這三欄，但合併時要能留下正確的聯絡人（Notion §12c 第 6 項）。
- 位置、地址這一版不能改。改位置會牽動快層的比對與地圖，等有需要再加。（慣例，未另外拍板）

**取代**：Notion §12a 的「逐欄合併成新單 C」、「開單者由審核員指定」。

---

## ADR-368：每一項需求都要明確列出

**Date**: 2026-10-24　**Status**: Accepted（慣例，未另外拍板）

**決定**：
- `primary_tasks` 要列出主要單每一項還在的需求，`keep` 或 `cancel`。
- 另一張單每一項還在的需求，要不是被某項 `absorb`，就要列在 `secondary_tasks`（`move` 或 `cancel`）。
- 漏列、重複列、列了不屬於這兩張單的需求，回 422。

**理由**：前端選了什麼就寫什麼，後端不替審核員猜。版本檢查（ADR-374）擋住了「審核員沒看到的新需求」，
所以完整清單一定能列得出來。

---

## ADR-369：併入的需求，接單紀錄搬到併入的那一項

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**背景**：10/01 的決定是「釋放並通知」。使用者 10/24 改成搬過去：合併後的數量（例如 human 7）
已經把 B 的 5 人算進去，不搬的話 A 會缺人。

**決定**：
- B 的需求被 `absorb` 進 A 的某一項時，B 那一項上的 `task_assignments` 改掛到 A 那一項（`task_uuid` 改值，`assigned_at` 不變）。
- 同一位志工兩邊都有接單（`uq_assignment_task_actor`）：留 A 的那筆，刪掉 B 的那筆，人數算一個。刪掉的記在事件的 `dropped_assignments`。
- `move` 的需求整項搬家，接單紀錄本來就跟著需求，不用改。
- 被 `cancel` 的需求，接單紀錄照 `delete_ticket_task` 的做法處理。
- 志工要收到通知：需求已經併到 A，聯絡人改成 A 的聯絡人（ADR-379）。

**取代**：DEDUP-007 10/01「Their assignments are released, not moved automatically」。

---

## ADR-370：數量不得少於接單人數；需求狀態依人數重算；只能併同類型

**Date**: 2026-10-24　**Status**: Accepted（第一點使用者拍板，其他為慣例，未另外拍板）

**決定**：
1. 處理後任何一項需求，接單人數大於 `quantity`，回 422。不會有人的接單被默默取消。
2. `quantity` 照 `_validate_need_size` 檢查：rescue 以外必填、至少 1。
3. `absorb` 只能併同一個 `task_type` 的需求，否則 422。不同類型的人數意義不同（例如 rescue 可以沒有數量）。
4. 處理後，保留的需求依人數重算狀態：
   - 已停止招募（`recruiting_stopped_at` 有值）：維持 `fulfilled`。
   - 有數量且人數 ≥ 數量：`fulfilled`，設 `completed_at`。
   - 原本 `fulfilled`（因為滿額），現在還有空位：回到 `pending`，清掉 `completed_at`。
   - 其他：不變。

**理由**：需求的狀態只能由擁有它的動作改（ADR-293）。resolve 改了數量和人數，就是這種動作。
規則和接單、取消接單時一致（`_lock_task_with_room`、ADR-291／292）。

---

## ADR-371：被合併的單一定整張取消；部分合併 = 只選一部分進主要單

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板，同日改過一次）

**背景**：同日稍早的版本允許 B 單保留剩下的需求（`secondary_ticket = keep`、需求 `stay`）。
使用者重新討論後改成：B 被合併就應該消失，某些項目要留，就合進 A。

**決定**：
- resolve 一定把另一張單取消＋軟刪除（同 `delete_ticket`），`replaced_by_uuid` = 主要單。request 沒有 `secondary_ticket` 欄位。
- 「部分合併」= 審核員只選 B 的一部分需求、細項進主要單（`absorb` 或 `move`），其他 `cancel`。
- 兩張單都要保留，就用「不是重複」（025 的 reject）。
- 主要單處理後至少要有一項需求。

**取代**：同日稍早的「另一張單可以保留（部分合併）」。

---

## ADR-372：新增 `tickets.replaced_by_uuid`、`ticket_tasks.merged_into_uuid`

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 6 項；欄位形式為慣例，未另外拍板）

> **「GraphQL 不回傳」部分被 ADR-444 取代（2026-10-31，`Spec/018-ticket-disaster-fields/decisions.md`）**：
> 分享連結用的 `ticketAvailability` 順著 `tickets.replaced_by_uuid` 找到還在的那張，回 `merged` 時帶它的 uuid。
> `TicketType` 仍不回這個欄位，`merged_into_uuid` 照舊不回。

**背景**：Notion §10e 第 2 項：刪掉 B 之後，B 上看不出是因為和 A 重複，只有配對卡知道。

**決定**：兩張表各加一個 nullable FK，只做紀錄。
- **GraphQL 不回傳**（使用者 10/24）。導向主要單靠通知：四種通知的 `ref_uuid` 都是主要單（ADR-379）。
  被搬走的志工，接單紀錄已在主要單上，「我承接的」直接列出主要單；GraphQL 的 `ticket(uuid)` 本來就不回已軟刪除的單。
既有的 `ticket_tasks.is_duplicate`、`dedup_group_id` 不用：它們是給慢層群組的，意思不同。

---

## ADR-373：detail API 回傳兩張完整的單；清單 API 不回

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 3 項；形狀為慣例，未另外拍板）

**決定**：
- `GET /admin/duplicate-pairs/{uuid}` 多回 `tickets.low`、`tickets.high`：單的欄位、聯絡人、還在的需求（含接單人數與細項）、`version`。
- 卡是 `ticket_task` 時，取需求所屬的單。卡是 `station` 時為 `null`。
- 不回接單志工的姓名或聯絡方式，只回人數。
- 清單 API 不加，避免一頁最多 200 張卡都載入完整的單。

**理由**：配對卡比的是需求，處理的是整張單，審核頁要先看到整張單。

---

## ADR-374：版本檢查用 detail 回傳的 `version`，對不上回 409

**Date**: 2026-10-24　**Status**: Accepted（Notion §12c 第 1 項；做法為慣例，未另外拍板）

**背景**：審核頁讀的是即時內容。審核員比對期間，單或需求可能被改、被接單。
只比單的 `updated_at` 不夠：改需求、接單都不會動到單的 `updated_at`。

**決定**：
- `version` 是一個不透明字串：審核員比對的**內容本身**的雜湊（sha256），包含單的欄位、每一項還在的需求、每一個還在的細項，需求與細項依 uuid 排序。
  2026-10-24 code review 後加入照片與災害欄位答案（ADR-384、385）。
  細項也要算：request 必須列出每一個細項（ADR-380），審核員沒看到的新細項要擋下。
- 不用 `updated_at`。2026-10-24 Task 2 實測：單繼承 `BaseGeometry`，`updated_at` 在 `base_geometries` 上；
  只改單自己的欄位（例如 `title`），ORM 不會更新 `base_geometries`，`updated_at` 不變。用時間戳會漏掉這種修改。
- 排除接單會動到的欄位：需求的 `claim_count`、`status`（滿額），單的 `status`、`audit_status`。
- resolve 鎖住兩張單和需求之後重算，和 `expected_versions` 不同就回 409。前端重新載入、請審核員再比對一次。
- 接單人數不算進 `version`：人數的檢查在鎖住之後做（ADR-370），接單不必讓審核員重新比對。

---

## ADR-375：`merged` 事件記錄處理前後的完整內容與原始 request

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 6 項；內容為慣例，未另外拍板）

**決定**：見 spec §5。重點：
- `before_state`：兩張單處理前的完整內容，含需求與接單人 uuid。不能撤銷，所以這是還原的唯一依據。
- `affected_refs.request`：前端送來的原始 request。
- `reversible = false`。
- `audit_logs` 的觸發器照常記錄每一列的變更。事件是給審核用的整體紀錄，不取代 `audit_logs`。

---

## ADR-376：這一版不能撤銷處理結果

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**決定**：
- 處理過的卡（有 `merged` 事件），`revoke` 回 409。
- 要還原就人工處理，依據 `merged` 事件的 `before_state`。真的需要撤銷再另開票。

**理由**：撤銷要把需求搬回去、接單紀錄搬回去、處理之後又被改過的情況也要處理，工作量比處理本身還大。

---

## ADR-377：只處理任務單的卡；站點卡、同一張單的兩項需求回 422

**Date**: 2026-10-24　**Status**: Accepted（慣例，未另外拍板）

**決定**：
- 卡是 `ticket_task` 或 `ticket` 才能 resolve。`station` 回 422。
  Carol 10/22 說 AI 重複審核應只審任務單，正式決定前站點卡只能判定。
- 卡的兩邊是同一張單的兩項需求：沒有兩張單可以合併，回 422。審核員可以用 confirm 或 reject 判定。

---

## ADR-378：其他含被取消單的待審卡不動

**Date**: 2026-10-24　**Status**: Accepted（慣例，未另外拍板）

**背景**：Notion §12c 第 5 項。B 被取消後，可能還有別的待審卡含 B 或 B 的需求。

**決定**：
- 那些卡不動，留在佇列。摘要已會顯示 `deleted: true`（Spec 025 §2.1）。
- 對那些卡 resolve 回 409（任一張單已取消）。審核員可以用 reject 或 confirm 結案。

**理由**：自動結案等於替審核員判定。那張卡的另一邊可能和 A 也是重複，要人看過。

---

## ADR-379：通知和 resolve 同一張 PR

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板；通知類型與內容為慣例，未另外拍板）

**背景**：Notion 上 DEDUP-009（通知）的負責人是 Dennis。如果分開上線，會有一段時間志工被搬走、需求被取消，卻沒人通知。

**決定**：
- 通知寫在本 Spec，和 resolve 同一張 PR。要跟 Dennis 說一聲，DEDUP-009 的 notice 2、3 由這張做。
- 四種類型：`dedup_task_merged`、`dedup_task_canceled`、`dedup_ticket_merged`、`dedup_ticket_updated`（spec §6）。
- `dedup_task_merged` 也給整項 `move` 過去的需求上的志工：他們的聯絡人一樣換成主要單的（2026-10-24 Task 6 補，spec §6 原表漏了）。
- commit 之後發送，失敗只記 log，不回滾處理（同 ADR-345）。
- 通知內容不放聯絡人的電話與 Email，收件人到主要單頁面看。通知會留在收件匣，聯絡方式之後可能又改。
- 審核員本人不收。

**取代**：DEDUP-009 10/01 的「志工收到 task was revoked / stopped recruiting」——併入的志工改收「已合併」。

---

## ADR-380：需求下的細項也由前端逐項選

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**決定**：
- `keep`、`move` 的需求要帶 `properties`，列出處理後這一項的每一個細項（自己的，加上被併入需求的）。
- 每個細項 `keep`（可改 `property_value`、`quantity`、`comment`；屬於被併入需求的改掛過來）或 `cancel`（軟刪除）。
- 漏列、重複列、列了不屬於它的細項，回 422。
- `cancel` 的需求不帶 `properties`。

**理由**：和需求同一套規則（ADR-368），前端選什麼就寫什麼。自動全搬會出現兩個同名品項，不搬會讓 B 的品項不見。

---

# Code review 那一輪（2026-10-24，`SPEC028_CODE_REVIEW.md`）

ADR-381～385。審查共 10 條，修 1、2、3、4、6、8、9；7（`_settle` 抽成共用）超出範圍不修；10 在 Postgres 上重現不出來。
第 1 條（migration parent）是程序問題，不另寫 ADR：rebase 到 main `2e95aec0d`，`down_revision` 改成 `7370daf4c8f7`（commit `ec0e6633d`）。

---

## ADR-381：主要單的 `priority`、`task_type` 檢查長度

**Date**: 2026-10-24　**Status**: Accepted（code review 第 2 條；使用者同意修）

**背景**：`tickets.priority` 是 `String(20)`、`task_type` 是 `String(50)`。處理 API 沒檢查長度，實測超過時資料庫丟 `DBAPIError`，REST 回 500。

**決定**：`_ticket_changes` 檢查兩個欄位的長度，超過回 422。合法值仍不驗（ADR-126，`updateTicket` 也不驗）。

---

## ADR-382：通知用處理後的標題

**Date**: 2026-10-24　**Status**: Accepted（code review 第 3 條；使用者同意修）

**背景**：通知的主要單標題取自處理前的快照。request 同時改了標題時，通知寫的是已經不存在的舊標題。

**決定**：通知用處理後的快照（`after`）的標題。另一張單的標題不會被改，照舊。

---

## ADR-383：主要單沒有變動時，不通知主要單的開單者

**Date**: 2026-10-24　**Status**: Accepted（code review 第 4 條；使用者同意修）

**背景**：判斷「主要單有沒有變」時，把另一張單被取消的需求也算進去。只是「選 A、B 全部取消」時，A 沒有任何變動，A 的開單者也收到「你的單已更新」；兩張單同一人開的，會收到兩則。

**決定**：只看主要單自己的變動：欄位、它的需求（保留的改值、併入、取消）、搬進來的需求、細項、照片、災害欄位答案。另一張單被取消的需求不算。

---

## ADR-384：照片由審核員逐張選

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**背景**：code review 第 5 條。另一張單取消後，它的照片留在已取消的單上；GraphQL 不回已刪除的單，照片就看不到了。審核頁也沒有顯示照片。

**決定**：
- detail 回傳兩張單還在的照片（`ref_type = "geometry"`、`ref_uuid` = 單）。照片算進 `version`。
- request 的 `photos` 列出兩張單**每一張**照片，`keep` 或 `cancel`，比照需求的規則（ADR-368）：漏列、重複、不屬於這兩張單，回 422。
- `keep` 的另一張單照片改掛到主要單；`cancel` 軟刪除。
- 兩張單都沒有照片時，`photos` 可以省略。
- 不檢查照片張數上限：建單的上限（`HELP_REQUEST_PHOTO_MAX`）只管民眾一次送出的數量。合併後超過，是兩邊的照片加起來，由審核員決定要留幾張。（慣例，未另外拍板）

---

## ADR-385：災害欄位答案由審核員給出完整的一份

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**背景**：code review 第 5 條。另一張單的災害欄位答案（`ticket_disaster_details`，例如是否斷電）取消後看不到，審核頁也沒有顯示。

**決定**：
- detail 回傳兩張單的答案 `{property_name: [values]}`，算進 `version`。
- request 的 `disaster_details` 是主要單處理後**完整的**答案，整份取代，做法同 `setTicketDisasterDetails`（不驗欄位是否存在於設定，ADR-092；驗大小，ADR-267）。值由前端輸入，可以從兩邊挑，也可以改。
- 另一張單有答案時 `disaster_details` 必填，避免沒看到就丟掉；只有主要單有答案時可省略，省略就不動。
- 地址仍不在這一版（ADR-367）。地址牽動位置，和快層比對、地圖相關，另開票。

**為什麼不逐筆列出**：同一個欄位兩邊常常都有答案（例如兩邊都答了是否斷電），逐筆 keep／cancel 會留下互相矛盾的答案。給出完整的一份，和民眾送出表單的方式一致。

---

# PR #113 review 那一輪（2026-10-25，jujuyuzu）

ADR-388～390（386、387 已被 `018-ticket-disaster-fields` 用掉）。review 的其他項目不另寫 ADR：

- migration 改接 #110 的 `da152a6a9d7c`（`6a292f356`）。
- ADR 整批往後移一號（`7449a7cae`，見本檔開頭）。
- `er-diagram.md` 補上 `replaced_by_uuid`、`merged_into_uuid`；Spec 025 註記的範圍改成 365～385。

---

## ADR-388：既有的接單、取消接單、編輯，在鎖住之後確認需求沒有被搬走

**Date**: 2026-10-25　**Status**: Accepted（review 建議；做法為慣例，未另外拍板）

**背景**：resolve 會把需求搬到主要單（`move`），也會把被併入需求上的接單紀錄、細項搬到併入的那一項。
既有的寫入流程（`ticket._lock_ticket_and_task`、`update_ticket_task`、`_add_task_property`、`update_task_property`、
`unassign_task_actor`）都是先在沒鎖的情況下讀「需求在哪張單」，再去鎖那張單。
它們的 docstring 甚至寫著「需求不會換單」。

在 resolve 持有鎖的時候開始的動作，會排在 resolve 後面等鎖。拿到鎖時，需求已經在主要單上，它卻還照舊的單做事。
測試實際重現了兩種：
- **取消接單**：刪掉已經搬到 A 的那筆接單紀錄，卻去重算已取消的 B，A 的需求可能停在「已滿」但其實有空位，之後沒人接得進去。
- **編輯需求**：用 B 的範圍檢查權限，改到 A 的需求。

**決定**：
- 這些流程在鎖住之後重讀一次：需求現在屬於哪張單、接單紀錄或細項現在屬於哪一項。
  在等鎖期間被 resolve 搬走了，就回錯誤「已合併到另一張單，請重新整理再試」，**不改去鎖新的單**。
- 不改去鎖新的單，是因為權限是照舊的單檢查的，而且這種情況只會在 resolve 進行的那一刻發生。請使用者重試最簡單也最安全。
- 接單（`_lock_task_with_room`）本來就會因為 B 已取消而拒絕，但訊息是「Ticket task not found」；現在改成同一個「已合併」的訊息。
- `_lock_ticket_and_task` 的 docstring 改掉「需求不會換單」那一句。

**測試**：`tests/test_dedup_resolve_concurrency.py`。讓 resolve 停在鎖住之後、寫入之前，用第二條連線做那個動作，
等 `pg_stat_activity` 顯示它在等鎖，再放 resolve 完成。取消接單、接單、編輯需求、新增細項、修改細項各一個；拿掉檢查，對應的測試就失敗。

> **2026-10-25 補充（PR #113 approve 時的兩個建議，使用者同意修）**：
> - **被併掉的需求也要擋**：被 `absorb` 的需求留在已取消的那張單上、軟刪除，只查「在不在同一張單」會放行，
>   編輯或新增細項就寫到看不見的需求上並回報成功（實測重現）。`_need_still_on` 遇到 `delete_at` 有值也回「找不到」；
>   單純的「刪除需求」與「編輯」同時發生也一併擋下。`update_task_property` 先查細項是否被搬走、再查需求，訊息才會是「已合併」。
> - **測試的等鎖守門只看自己的資料庫**：`_waiting_on_a_lock` 原本數整台 Postgres 的等鎖；平行跑測試或多人共用時，
>   別的資料庫的等鎖會讓 resolve 在第二個動作排隊前就被放行（實測：守門放行時自己資料庫的等鎖數是 0），測試只是時間湊巧才通過。
>   查詢加上 `datname = current_database()`，並補一個測試：另一個資料庫有人等鎖時，守門不能放行。

---

## ADR-389：聯絡人有改時，也通知主要單原本的志工

**Date**: 2026-10-25　**Status**: Accepted（使用者拍板；review 的提問）

**背景**：審核員把主要單的聯絡人改掉時（例如換成另一張單的聯絡人），搬過來的志工會從 `dedup_task_merged` 得知聯絡人改了，
但主要單原本就在的志工不會。`updateTicket` 改聯絡人也不通知，所以這不是退步，但合併時聯絡人常常會換。

**決定**：
- 主要單的聯絡人（姓名、電話、Email 任一）處理前後不同時，發 `dedup_ticket_contact_changed` 給主要單**原本需求上**的志工。
- 已經從另一張單搬過來的人不再收這則：`dedup_task_merged` 已經說了聯絡人改了。
- 聯絡人送了相同的值，不算有改，不發。
- 內容同樣不放電話與 Email（ADR-379）。

---

## ADR-390：取消通知的文字分兩種；兩張單同一人開的，只收一則

**Date**: 2026-10-25　**Status**: Accepted（使用者拍板；review 的 nit）

**決定**：
- `dedup_task_canceled`：另一張單被取消的需求，照舊附「這件事改由「主要單」處理」；
  **主要單自己**被取消的需求，那件事沒有移到別處，改成「「主要單」和另一張重複的單合併時，你承接的這筆需求取消了」。
  同一個人兩種都有時只收前一種。
- 兩張單是同一個人開的：只發 `dedup_ticket_merged`（它已經說明合併了），不再另發 `dedup_ticket_updated`。修正 ADR-383。

---

## ADR-391：配對卡的已審狀態改名為 `confirmed_duplicate`／`not_duplicate`；事件類型不改

**Date**: 2026-10-25　**Status**: Accepted（使用者拍板；Chi 在 PR #113 提議，和 POPO 在 Discord 談過，直接在這張改）

**背景**：配對卡的已審狀態叫 `confirmed`／`rejected`。系統裡另外幾套審核也用類似的詞：資料檢核 `audited`（PR #84）、
站點修改建議 `approved`／`rejected`、申請管理權限 `approved`／`rejected`。容易混淆的有兩點：

- `confirmed`、`audited`、`approved` 都只說「審過了」，看不出審的是什麼。團隊裡已經有人問 audited 跟 confirmed 差在哪。
- **方向相反**：其他地方的 `rejected` 是「被拒絕」，對那筆資料是壞結果；配對卡的 `rejected` 是「不是重複」，對兩張單是好結果。
  `confirmed` 則是「確認重複」，其中一張會被合併掉。配對卡審的是兩筆之間的關係，不是一筆資料過不過。

**決定**：
- `duplicate_pairs.status`：`confirmed` → `confirmed_duplicate`，`rejected` → `not_duplicate`。`dup_ignored`、`suggested` 不變。
- migration `a8d3e6b1c207`（接 `c3f1a9d27b54`）：把既有的值改成新名稱、重建 `ck_duplicate_pairs_status`；降級把值改回舊名稱、恢復舊 CHECK。
- **事件類型（`dedup_audit_events.event_type`）不改**，仍是 `confirmed`／`rejected`。事件記的是「審核員做了什麼」（確認、駁回），不會被讀反；
  事件表和舊事件都不動。既有事件的 `before_state`／`after_state` 裡記的狀態值也不改寫：那是當時的紀錄。
- 原本同一組常數 `VERDICTS` 拆成兩組：`VERDICT_STATUSES`（卡的狀態）和 `VERDICT_EVENTS`（判定事件），用 `VERDICT_EVENT` 對應（`dedup_review.py`）。
  撤銷時用事件類型找最新一筆判定事件，用卡的狀態判斷能不能撤銷。
- API 路徑 `/confirm`、`/reject` 不改，那是動作。清單的 `status` 篩選、回應的 `status` 用新名稱。前端只有自動產生的合約檔用到，一併重產。
- 不動 `app/dedup_engine/` 與 `tools/dedup_eval/`：評估工具的 `confirmed` 是它自己資料集的標籤，不是配對卡狀態。

**為什麼不用 `is_duplicate`**：`is_duplicate` 已經是 `ticket_tasks`、`stations` 上的欄位名（慢層用），同名容易混。

---

## ADR-440：詳情的兩張單附上地點（地址到樓、室，或電線桿）

**Date**: 2026-10-29　**Status**: Accepted（使用者拍板：欄位範圍、權限跟聯絡人一樣、要算進 `version`）

**背景**：DEDUP-008 的 mock 規定「審核員選了哪一邊的地址，那一張就是主要單」（DUP-BE-431），因為處理時不能改地址（ADR-367）。
但 `TicketForReview` 只有座標，沒有地址。地址存在 `secondary_locations`（以 `geometry_uuid` 對到單），
審核頁讀不到，就沒辦法照 mock 選主要單。

**決定**：
- `tickets.low`／`tickets.high` 多一個 `location`：
  `location_type`（`address`／`pole`）、`full_address`、`building_section`、`floor`、`room`、`pole_id`。單沒有地點時為 `null`。
- **不給**地標補充、空間描述、求救者所在空間、可否進入、電線桿備註和照片。這些是自由文字，不是分辨兩張單是否同一處的依據。
- 一張單照慣例只有一筆地點（沒有 constraint）。有多筆時取 uuid 最小的一筆，和 `secondary_location_repository.get_by_geometry` 一樣。
- **權限跟聯絡人一樣**：有 `ai_duplicate.view` 就給，不另外檢查 `ticket.view_detail`／`ticket.view_pii`。
  選主要單一定要看地址，和聯絡人不遮的理由相同（ADR-373）。目前持有 `ai_duplicate.view` 的兩個角色本來就都看得到工單地址。
- **算進 `version`**（ADR-374）：審核員讀完之後有人改了地址，送出處理會收到 409，要重新讀、重新比對。
  沒給的自由文字欄位不算進去，改了不會 409。
- 處理時仍然不能改地址（ADR-367 不變）。`merged` 事件的 `before_state` 會一併記下兩張單的地點，被取消那張的地址也有紀錄。

---

## ADR-445：每項需求附上這張配對卡專用的承接人代號

**Date**: 2026-11-01　**Status**: Accepted（使用者拍板：用代號，不用兩兩共同人數，也不加試算 API）

**背景**：Jarvis 做 DEDUP-008 時發現，詳情的每項需求只有 `claim_count`。後端在處理時會把要合在一起的需求上的人去重後才比名額（ADR-369、`dedup_resolve_plan._headcount`），前端只能把人數相加。同一個人在兩邊都有承接時，前端會多算，把後端其實會接受的合併擋下。

合併後的人數取決於審核員把哪幾項需求合在一起，詳情沒辦法事先給一個固定數字。

**決定**：
- `tickets.low/high.tasks[]` 多一個 `claimant_keys`：每位承接人一個代號，排序後給。代號是 `sha256("{配對卡 uuid}:{承接人 uuid}")` 的前 16 碼。
- 同一張卡裡，同一個人在兩張單上的代號相同。前端把要合在一起的需求代號取聯集，數量就是合併後的人數；不管怎麼合都準。
- 換一張卡代號就不同，從代號看不出是誰，也串不起跨卡的同一人。

> **補充（2026-11-01，HC 在 #179 的 review）**：代號是不加密鑰的雜湊。手上已經有這張卡、又知道某人 uuid 的人，可以自己算出代號，測試那個人有沒有在某項需求上。代號本身不含 uuid，跨卡也串不起來，上面這兩點不變。現在看得到詳情的兩個角色（超管、資料檢核員）本來就看得到承接人，所以不加密鑰（使用者拍板），API 欄位說明改成照實寫。
- 權限同詳情（`ai_duplicate.view`）。
- **不算進 `version`**：跟 `claim_count` 一樣會隨承接變動。處理時仍以鎖住後的實際承接人檢查名額（ADR-374 不變）。
- `claim_count` 改成由同一批承接紀錄算出，等於代號數量。
- 處理（resolve）讀單時不帶卡號，代號為空；只有詳情會給。`merged` 事件的 `before_state` 因此會有空的 `claimant_keys`，真實承接人照舊記在 `people`。

**不採用**：
- 兩兩需求的共同人數：三項以上合在一起會算錯。
- 試算 API：前端每次調整都要多打一次，而名額檢查本來就會在處理時再做一次。

## ADR-446：細項附上顯示名稱

**Date**: 2026-11-01　**Status**: Accepted（使用者拍板：詳情直接帶，不改權限）

**背景**：細項的顯示名稱在 `task_property_config.label`，前端要用 `taskPropertyConfigs` 讀。那支要 `dynamic_field.view`，資料稽核員沒有，請求會讓整頁 403，所以稽核員只看得到細項的 key（Jarvis 回報，2026-11-01 實測稽核員呼叫回 `403: Permission Denied`）。

**決定**：
- `tasks[].properties[]` 多一個 `display_label`：該需求類型（`task_type`）的設定 `label`；沒有設定或 `label` 是空的就用 `property_name`。跟 `taskPropertyConfigs.displayLabel` 的回退規則一樣（ADR-095）。
- 用需求的 `task_type` 加細項 key 對設定，同一個 key 在別的需求類型的名稱不採用。
- 一個 query 讀完所有細項的名稱，查詢數不隨細項數增加；沒有細項就不查。
- **不算進 `version`**：名稱是顯示用的，不是審核員比對的內容。後台改名稱不會讓審核員收到 409。
- 權限不動：稽核員一樣沒有 `dynamic_field.view`。
- `merged` 事件的 `before_state`／`after_state` 會一併記下處理當下的名稱。

**不採用**：
- 給稽核員 `dynamic_field.view`：連所有動態欄位設定都看得到，範圍比需要的大。
- 讓 `taskPropertyConfigs` 也接受 `ai_duplicate.view`：一支 API 混用兩種權限。

## ADR-447：細項附上顯示與編輯用的欄位設定

**Date**: 2026-11-01　**Status**: Accepted（使用者拍板：合併人數只留 `claimant_keys`（ADR-445 不變），#207 只取 `sort_order`，再補齊頁面用到的其他設定）

**背景**：審核頁顯示與編輯細項時，除了名稱（ADR-446），還用到欄位設定的五項（#205 `compare-view.tsx:115-124`、`model.ts:241-256, 437`）：
- `sortOrder`：細項排序。
- `dataType`、`enumOptions`：最終值用哪種輸入框、下拉有哪些選項。
- `unit`：數值後面的單位。
- `isActive`：標示「已停用」。

這些都在 `taskPropertyConfigs`，要 `dynamic_field.view`。稽核員沒有（`scripts/seed_rbac.py` 的 `data_auditor` 不含 `FIELD_VIEW`），所以稽核員看到的細項沒有排序、沒有單位，最終值只能用文字框。

`sort_order` 的做法來自 HC 的 #207（已關閉）。#207 另外的 `label` 跟 `display_label` 重複，`/resolve/preview` 跟 ADR-445 的決定不同，都不採用。

**決定**：
- `tasks[].properties[]` 多 `sort_order`、`data_type`、`enum_options`、`unit`、`is_active`，取自和 `display_label` 同一筆設定（需求的 `task_type`＋細項 key），停用的設定也算。
- 沒有設定時五欄都是 `null`。`is_active` 用 `null` 而不是 `true`，前端分得出「沒有設定」和「啟用中」。
- 和 `display_label` 同一個 query 讀出，查詢數不變；`(task_type, property_name)` 在表上是 unique，一個 key 最多一筆。
- **不算進 `version`**：都是設定，不是單的內容。後台改設定不會讓審核員收到 409。
- 權限不動：有 `ai_duplicate.view` 就給。
- **這是 ADR-226 的例外**：`taskPropertyConfigs` 的停用設定只給有 `dynamic_field.edit` 的人（ADR-226），這裡持有 `ai_duplicate.view` 就拿得到，資料檢核員也包含在內。範圍只到卡上兩張單已經有的細項，不是整份欄位定義；審核員要知道停用欄位在畫面上怎麼顯示、怎麼編輯才比對得了。`taskPropertyConfigs` 本身的規則不變。這個例外也記在 `RBAC_RESOURCE_ROLE_MATRIX.md` 的重複審核一節（HC 在 #179 review 要求，2026-11-01）。

**不採用**：
- 給稽核員 `dynamic_field.view`：理由同 ADR-446。
- #207 的 `label`：和 `display_label` 重複。
- #207 的 `/resolve/preview`：ADR-445 已決定不加試算 API，維持。

