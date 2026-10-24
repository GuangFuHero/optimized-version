# Decisions: 028-dedup-resolve

ADR 全域連號，本 Spec 從 **ADR-364** 開始（2026-10-24 掃描所有遠端分支與本機 worktree，最大號 363，
在 `Spec/007-information-publishing`）。Spec 027 已被 `027-address-normalization` 佔用，本 Spec 用 028。
commit 前再掃一次，避免與其他 open PR 撞號。

---

## ADR-364：新增處理 API，判定與單的變更在同一筆交易；部分取代 ADR-341

**Date**: 2026-10-24　**Status**: Accepted（Carol 與工程師 10/23 定案，Notion §12b 第 4 項）

**背景**：ADR-341 規定判定只改配對卡，不動實體。10/23 定案要在審核頁直接處理重複的單。
如果拆成「先判定、再呼叫改單、再呼叫刪單」，中途失敗會留下判定了卻沒處理的單，
而且資料檢核員沒有改單、刪單的權限（Notion §10d）。

**決定**：
- 新增 `POST /admin/duplicate-pairs/{uuid}/resolve`。改單、處理需求、把卡改成 `confirmed`、寫事件，都在同一筆交易。
- 卡是待審（`dup_ignored`、`suggested`）或 `confirmed` 且還沒處理過，都可以處理。
  已經用 025 的 confirm 判定過的卡，不必先撤銷。
- `confirm`、`reject` 照舊只改配對卡。**ADR-341 對 confirm／reject 仍然有效**，對 resolve 不適用。

---

## ADR-365：resolve 只檢查 `ai_duplicate.review`

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 5 項）

**決定**：resolve 只要求 `ai_duplicate.review`（scope `all`），不檢查 `ticket.edit`、`ticket.delete`。

**理由**：資料檢核員的工作是處理重複，不是一般的改單。只給這一個動作，每次都留下完整事件，
比給一般改單權限範圍小。做法同站點建議審核（ADR-300）。

---

## ADR-366：選一張主要單，結果由前端輸入；不建立新單 C

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**背景**：Notion §12a 列了四種處理（不是重複、擇一、擇一並編輯、逐欄合併成新單 C）。
使用者 10/24 說明實際操作：審核員選主要單，再選要哪些需求，主要單的資料也能改。
例如 A（human 2、water 1）和 B（human 5、water 5）合併後，A 變成 human 7、water 6。
數字由審核員輸入，不是後端相加，也不限於從 A 或 B 挑一個值。

**決定**：
- 只有一種處理：`primary` 指定主要單，`ticket` 帶主要單要改的欄位，`primary_tasks`、`secondary_tasks` 說明每一項需求怎麼處理。
- 「擇一」= 主要單不改、另一張整張取消；「擇一並編輯」= 帶 `ticket`。兩者都是這一種處理的特例，不另設動作。
- **不建立新單 C**。結果都留在主要單上，沿用它的 uuid 和開單者（`created_by`）。
- 不記錄每個欄位的值來自 A、B 還是審核員輸入。值是審核員決定的，處理前兩張單的完整內容和送出的 request 都在事件裡，需要時可以比對（ADR-374）。
- 主要單可改的欄位包含聯絡人（`contact_name`、`contact_phone`、`contact_email`）。`updateTicket` 沒開放這三欄，但合併時要能留下正確的聯絡人（Notion §12c 第 6 項）。
- 位置、地址這一版不能改。改位置會牽動快層的比對與地圖，等有需要再加。（慣例，未另外拍板）

**取代**：Notion §12a 的「逐欄合併成新單 C」、「開單者由審核員指定」。

---

## ADR-367：每一項需求都要明確列出

**Date**: 2026-10-24　**Status**: Accepted（慣例，未另外拍板）

**決定**：
- `primary_tasks` 要列出主要單每一項還在的需求，`keep` 或 `cancel`。
- 另一張單每一項還在的需求，要不是被某項 `absorb`，就要列在 `secondary_tasks`（`move` 或 `cancel`）。
- 漏列、重複列、列了不屬於這兩張單的需求，回 422。

**理由**：前端選了什麼就寫什麼，後端不替審核員猜。版本檢查（ADR-373）擋住了「審核員沒看到的新需求」，
所以完整清單一定能列得出來。

---

## ADR-368：併入的需求，接單紀錄搬到併入的那一項

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**背景**：10/01 的決定是「釋放並通知」。使用者 10/24 改成搬過去：合併後的數量（例如 human 7）
已經把 B 的 5 人算進去，不搬的話 A 會缺人。

**決定**：
- B 的需求被 `absorb` 進 A 的某一項時，B 那一項上的 `task_assignments` 改掛到 A 那一項（`task_uuid` 改值，`assigned_at` 不變）。
- 同一位志工兩邊都有接單（`uq_assignment_task_actor`）：留 A 的那筆，刪掉 B 的那筆，人數算一個。刪掉的記在事件的 `dropped_assignments`。
- `move` 的需求整項搬家，接單紀錄本來就跟著需求，不用改。
- 被 `cancel` 的需求，接單紀錄照 `delete_ticket_task` 的做法處理。
- 志工要收到通知：需求已經併到 A，聯絡人改成 A 的聯絡人（ADR-378）。

**取代**：DEDUP-007 10/01「Their assignments are released, not moved automatically」。

---

## ADR-369：數量不得少於接單人數；需求狀態依人數重算；只能併同類型

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

## ADR-370：被合併的單一定整張取消；部分合併 = 只選一部分進主要單

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

## ADR-371：新增 `tickets.replaced_by_uuid`、`ticket_tasks.merged_into_uuid`

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 6 項；欄位形式為慣例，未另外拍板）

**背景**：Notion §10e 第 2 項：刪掉 B 之後，B 上看不出是因為和 A 重複，只有配對卡知道。

**決定**：兩張表各加一個 nullable FK，只做紀錄。
- **GraphQL 不回傳**（使用者 10/24）。導向主要單靠通知：四種通知的 `ref_uuid` 都是主要單（ADR-378）。
  被搬走的志工，接單紀錄已在主要單上，「我承接的」直接列出主要單；GraphQL 的 `ticket(uuid)` 本來就不回已軟刪除的單。
既有的 `ticket_tasks.is_duplicate`、`dedup_group_id` 不用：它們是給慢層群組的，意思不同。

---

## ADR-372：detail API 回傳兩張完整的單；清單 API 不回

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 3 項；形狀為慣例，未另外拍板）

**決定**：
- `GET /admin/duplicate-pairs/{uuid}` 多回 `tickets.low`、`tickets.high`：單的欄位、聯絡人、還在的需求（含接單人數與細項）、`version`。
- 卡是 `ticket_task` 時，取需求所屬的單。卡是 `station` 時為 `null`。
- 不回接單志工的姓名或聯絡方式，只回人數。
- 清單 API 不加，避免一頁最多 200 張卡都載入完整的單。

**理由**：配對卡比的是需求，處理的是整張單，審核頁要先看到整張單。

---

## ADR-373：版本檢查用 detail 回傳的 `version`，對不上回 409

**Date**: 2026-10-24　**Status**: Accepted（Notion §12c 第 1 項；做法為慣例，未另外拍板）

**背景**：審核頁讀的是即時內容。審核員比對期間，單或需求可能被改、被接單。
只比單的 `updated_at` 不夠：改需求、接單都不會動到單的 `updated_at`。

**決定**：
- `version` 是一個不透明字串：審核員比對的**內容本身**的雜湊（sha256），包含單的欄位、每一項還在的需求、每一個還在的細項，需求與細項依 uuid 排序。
  細項也要算：request 必須列出每一個細項（ADR-379），審核員沒看到的新細項要擋下。
- 不用 `updated_at`。2026-10-24 Task 2 實測：單繼承 `BaseGeometry`，`updated_at` 在 `base_geometries` 上；
  只改單自己的欄位（例如 `title`），ORM 不會更新 `base_geometries`，`updated_at` 不變。用時間戳會漏掉這種修改。
- 排除接單會動到的欄位：需求的 `claim_count`、`status`（滿額），單的 `status`、`audit_status`。
- resolve 鎖住兩張單和需求之後重算，和 `expected_versions` 不同就回 409。前端重新載入、請審核員再比對一次。
- 接單人數不算進 `version`：人數的檢查在鎖住之後做（ADR-369），接單不必讓審核員重新比對。

---

## ADR-374：`merged` 事件記錄處理前後的完整內容與原始 request

**Date**: 2026-10-24　**Status**: Accepted（Notion §12b 第 6 項；內容為慣例，未另外拍板）

**決定**：見 spec §5。重點：
- `before_state`：兩張單處理前的完整內容，含需求與接單人 uuid。不能撤銷，所以這是還原的唯一依據。
- `affected_refs.request`：前端送來的原始 request。
- `reversible = false`。
- `audit_logs` 的觸發器照常記錄每一列的變更。事件是給審核用的整體紀錄，不取代 `audit_logs`。

---

## ADR-375：這一版不能撤銷處理結果

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**決定**：
- 處理過的卡（有 `merged` 事件），`revoke` 回 409。
- 要還原就人工處理，依據 `merged` 事件的 `before_state`。真的需要撤銷再另開票。

**理由**：撤銷要把需求搬回去、接單紀錄搬回去、處理之後又被改過的情況也要處理，工作量比處理本身還大。

---

## ADR-376：只處理任務單的卡；站點卡、同一張單的兩項需求回 422

**Date**: 2026-10-24　**Status**: Accepted（慣例，未另外拍板）

**決定**：
- 卡是 `ticket_task` 或 `ticket` 才能 resolve。`station` 回 422。
  Carol 10/22 說 AI 重複審核應只審任務單，正式決定前站點卡只能判定。
- 卡的兩邊是同一張單的兩項需求：沒有兩張單可以合併，回 422。審核員可以用 confirm 或 reject 判定。

---

## ADR-377：其他含被取消單的待審卡不動

**Date**: 2026-10-24　**Status**: Accepted（慣例，未另外拍板）

**背景**：Notion §12c 第 5 項。B 被取消後，可能還有別的待審卡含 B 或 B 的需求。

**決定**：
- 那些卡不動，留在佇列。摘要已會顯示 `deleted: true`（Spec 025 §2.1）。
- 對那些卡 resolve 回 409（任一張單已取消）。審核員可以用 reject 或 confirm 結案。

**理由**：自動結案等於替審核員判定。那張卡的另一邊可能和 A 也是重複，要人看過。

---

## ADR-378：通知和 resolve 同一張 PR

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板；通知類型與內容為慣例，未另外拍板）

**背景**：Notion 上 DEDUP-009（通知）的負責人是 Dennis。如果分開上線，會有一段時間志工被搬走、需求被取消，卻沒人通知。

**決定**：
- 通知寫在本 Spec，和 resolve 同一張 PR。要跟 Dennis 說一聲，DEDUP-009 的 notice 2、3 由這張做。
- 四種類型：`dedup_task_merged`、`dedup_task_canceled`、`dedup_ticket_merged`、`dedup_ticket_updated`（spec §6）。
- commit 之後發送，失敗只記 log，不回滾處理（同 ADR-345）。
- 通知內容不放聯絡人的電話與 Email，收件人到主要單頁面看。通知會留在收件匣，聯絡方式之後可能又改。
- 審核員本人不收。

**取代**：DEDUP-009 10/01 的「志工收到 task was revoked / stopped recruiting」——併入的志工改收「已合併」。

---

## ADR-379：需求下的細項也由前端逐項選

**Date**: 2026-10-24　**Status**: Accepted（使用者拍板）

**決定**：
- `keep`、`move` 的需求要帶 `properties`，列出處理後這一項的每一個細項（自己的，加上被併入需求的）。
- 每個細項 `keep`（可改 `property_value`、`quantity`、`comment`；屬於被併入需求的改掛過來）或 `cancel`（軟刪除）。
- 漏列、重複列、列了不屬於它的細項，回 422。
- `cancel` 的需求不帶 `properties`。

**理由**：和需求同一套規則（ADR-367），前端選什麼就寫什麼。自動全搬會出現兩個同名品項，不搬會讓 B 的品項不見。
