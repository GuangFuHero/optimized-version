# 後台管理系統 — ADR 全集（ADR-308）

**慣例**：沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。
ADR-308 是所有分支上第一個沒被佔用的號碼（`feat/dedup-engine-interface` 用到 ADR-307）。

---

### ADR-308 前台叫 public，後台叫 admin

**白話**：英文裡講「前台」一律用 public，講「後台」一律用 admin；backend / frontend 只拿來講程式碼。

**Context**：同一組概念在 repo 裡至少有四種英文說法，而且其中一種跟程式碼的分層撞名：

| 出處 | 寫法 | 指的是 |
|---|---|---|
| `Spec/006-backend-administration`（標題、目錄名），以及 003、004、`TODO.md` 等引用它的文件 | Backend Administration | 後台 |
| `scripts/seed_rbac.py` 的一段註解（本 ADR 已改掉） | front-of-house | 前台 |
| `Frontend/apps/demo/src/app/(site)` | site | 前台 |
| `/api/v1/admin`、`Frontend/apps/demo/src/app/admin`、`AdminUserListItem` | admin | 後台 |

"Backend" 在這個 repo 另有一個意思：`Backend/` 目錄裡的伺服器程式碼。寫成 "backend admin page" 時，讀者
分不出講的是哪一個。

**Decision**：

| 中文 | 英文行文 | 識別字（變數、enum、路由） | 例子 |
|---|---|---|---|
| 後台 | admin、admin site | `admin` | `/api/v1/admin`、`/admin/*` 頁面、`AdminUserListItem`、`AnnouncementPlacement.admin_page` |
| 前台 | public、public site | `public` | `AnnouncementPlacement.public_page` |

- **不要用**：backend / frontend 指前後台（它們專指伺服器與客戶端程式碼）、back-office、backstage、
  front-of-house、單獨的 site。
- **public 有兩個意思，要寫完整**：`PUBLIC_PERMS` 裡的 public capability 是權限概念，意思是「沒有 grant
  也讀得到」；public site 是使用者介面。前台裡有很多要登入才能用的功能（帳號設定、自己的通報單），所以
  「前台」不等於「public capability」。行文時寫 public site 或 public capability，不要只寫 public。
- **既有名稱不改**：`006-backend-administration` 的目錄名與標題、舊 spec 裡的 "Backend Administration"，
  以及前端的 `(site)` route group 都保留。讀到時一律當成 admin / public 理解。新的程式碼與文件照上表寫。

**Consequences**：
➕ 新的程式碼、API 與文件只會出現一組說法，前後端講的是同一個東西。
➕ backend / frontend 回到唯一的意思：程式碼在哪一邊。
➖ 舊文件仍留著 "Backend Administration" 與 `(site)`。改目錄名會打斷連結；Next.js 的 route group 不會
  出現在網址上，改名沒有實際收益。
➖ 要分清 public site 與 public capability，得靠寫的人自己寫完整，沒有工具擋。

---

### ADR-414 操作紀錄匯出 CSV，只給超管

**白話**：超管可以把操作紀錄（稽核紀錄）照目前的篩選條件下載成一個 CSV 檔。資料稽核員和團隊管理員只能在畫面上看，不能匯出。

**Date**: 2026-10-28（Popo，前端 10/28 提問第 5 項）

**Context**：Spec 006 User Story 的第 3 個情境寫「auditor 按 Export Logs 產生 CSV」。
目前只有 `GET /api/v1/admin/audit-logs`，每頁最多 100 筆（ADR-358）；前端先把匯出按鈕拿掉了。
`audit.view`（看全部）在種子資料裡有超管和資料稽核員，`team.audit.view`（看自己隊）有團隊管理員。

**Decision**：

1. **`POST /api/v1/admin/audit-logs/export`**，JSON body 帶篩選條件，跟列表一樣：`table`、`row_id`、`actor_uuid`、`from`、`to`。
   回 `text/csv` 附件，UTF-8 加 BOM（Excel 才讀得懂中文），新的在前。
   用 POST 而不是 GET：每次匯出都會留紀錄（ADR-417），算是寫入；瀏覽器用 cookie 登入時就要從我們自己的頁面送出（ADR-327），
   別的網站上的連結不能讓超管「被匯出」一次（2026-10-28 code review）。
2. **新的權限 `audit.export`**，只給 `super_admin`（範圍 `all`）。**跟 Spec 006 寫的不同**：資料稽核員不能匯出
   （Popo 10/28 回覆前端提問清單第 5 項時決定；理由：匯出的紀錄資訊相當敏感，檔案帶出去之後就管不到）。
   用一個新權限，而不是直接檢查角色名稱，之後要調整可以在 `/admin/rbac` 改。
   既有資料庫由 migration `b5d8e2a41c07` 補上（ADR-055）。
3. **欄位**：`created_at`、`table_name`、`action`、`row_id`、`actor_uuid`、`actor_name`（操作人暱稱）、`client_ip`、
   `context`、`old_values`、`new_values`。後三個是 JSON 字串。開頭是 `=`、`+`、`-`、`@` 的值會加 `'`，
   避免試算表把它當公式執行（`app/core/tabular.py::write_csv`，ADR-208）。
4. **一次最多 10,000 筆**。超過回 422 `audit_export_too_large`，另帶 `matched`（符合幾筆）、`limit`（上限），
   前端可以顯示「符合 N 筆，一次最多 10,000 筆」，請使用者縮小時間範圍；不截斷，免得有人把一部分當成全部。
   正式環境的操作紀錄很多，前端呼叫時應該預設帶時間範圍。
5. **一律是平台視角**（含 IP）。申請人資料的遮罩規則跟畫面一樣：沒有 `role_request.review` 的人看到 `[redacted]`
   （ADR-359 第 5 點）。種子資料的超管都有，只有在 `/admin/rbac` 另外授權時才會遇到。
6. **時間一律是 UTC**：`created_at` 用 ISO 格式並帶 `+00:00`，檔名也是 UTC。前端交接要說明，Excel 打開看到的時間比台灣時間早 8 小時。
   **已被 ADR-430 改掉**：預設仍是 UTC，但可以帶 `tz` 指定時區。

**Consequences**：
➕ 超管可以把一段時間的紀錄帶去做外部分析。
➖ 超過 10,000 筆要分段下載。
➖ 資料稽核員要匯出得先在 `/admin/rbac` 授權 `audit.export`。

---

### ADR-417 每次匯出操作紀錄都留一筆紀錄

**白話**：誰在什麼時候匯出了操作紀錄、用了什麼篩選、匯出幾筆，都會留在操作紀錄裡。

**Date**: 2026-10-28（Popo，資安檢查後）

**Context**：ADR-414 讓超管一次能下載 10,000 筆，內容可能包含申請人的手機、email。
但下載只是讀取，不會改到任何資料表，資料表上的稽核觸發器不會記錄，所以「誰帶走了哪些資料」查不到。

**Decision**：每次成功匯出，寫一筆 `audit_logs`：`table_name = audit_logs`、`action = EXPORT`、
`row_id` 是這次匯出的新 id、`new_values = {rows, filters}`，操作人、IP、身分跟其他紀錄一樣取自這個請求。
寫法跟強制登出的紀錄一樣（ADR-191）：`action` 不是 INSERT／UPDATE／DELETE，不會被當成資料異動。
被拒絕的匯出（403、超過上限的 422）不記錄：沒有檔案流出去。
**超過上限的 422 已被 ADR-429 改成要記錄**；403 仍不記錄。

**Consequences**：
➕ 事後查得到誰帶走了哪些資料。
➖ 匯出紀錄本身也會出現在之後的匯出檔裡。

---

### ADR-428 匯出不認得的欄位要擋掉

**白話**：匯出的 JSON 裡出現不認得的欄位（例如把 `table` 打成 `table_name`）就回 422，不會當作沒篩選、把整份紀錄匯出去。

**Date**: 2026-10-29（PR #155 code review）

**Context**：`AuditExportRequest` 原本照 Pydantic 預設，不認得的欄位直接忽略。打錯一個篩選欄位名稱，
結果就是「沒有篩選」：匯出全部資料表、整個時間範圍，匯出紀錄（ADR-417）也記成沒篩選。

**Decision**：`AuditExportRequest` 設 `extra="forbid"`，多出來的欄位回 422，在讀任何紀錄之前就擋下，也不留匯出紀錄（ADR-429 只記錄「讀了才發現太多」的情況）。
`from`／`to` 照舊也接受欄位本名 `since`／`until`（`populate_by_name`），這兩個不算不認得。

**Consequences**：
➕ 打錯字是 422，不是一份比預期大很多的檔案。
➖ 前端之後如果想在 body 多帶別的東西（例如追蹤用的欄位），要先在這裡加上。

---

### ADR-429 超過一萬筆被拒的匯出也要留紀錄

**白話**：想匯出超過一萬筆被拒絕時，也寫一筆匯出紀錄，記下篩選條件和符合幾筆。只有「根本沒有匯出權限」（403）不記錄。

**Date**: 2026-10-29（PR #155 code review）

**Context**：ADR-417 的理由是「沒有檔案流出去就不記錄」。但事後查「誰想拿稽核資料」時，
一次想拉超過一個檔案上限的嘗試，正是要看到的東西；原本這種嘗試不留任何痕跡。

**Decision**：
1. 超過上限時，先寫一筆 `EXPORT` 紀錄再回 422。紀錄的 `new_values` 跟成功時同一個形狀：`rows = 0`、`matched` = 符合幾筆、`filters`、`tz`（ADR-430）。
2. 成功的匯出也多記 `matched`（等於 `rows`）。`matched` 大於 `rows` 就是被拒的那種，不需要另外的欄位區分。
3. 403（沒有 `audit.export` 或範圍不是 `all`）、422 的欄位錯誤（ADR-428）、時區錯誤（ADR-430）仍不記錄：這些都在讀紀錄之前就擋下，不是「對紀錄的嘗試」。
4. 取代 ADR-417「超過上限的 422 不記錄」那一句。

**Consequences**：
➕ 事後查得到誰試過拉一大段紀錄，即使沒成功。
➖ 有人一直按會留下很多筆被拒的紀錄；前端預設帶時間範圍（ADR-414 第 4 點）可以減少這種情況。

---

### ADR-430 匯出可以指定時區，預設仍是 UTC

**白話**：匯出時可以帶 `tz`（例如 `Asia/Taipei`），檔案裡的時間和檔名就用那個時區寫，時間後面仍帶時差（`+08:00`）。不帶就是 UTC，跟原本一樣。

**Date**: 2026-10-29（PR #155 code review）

**Context**：ADR-414 第 6 點讓檔案一律用 UTC，台灣的人用 Excel 打開，每一列都早 8 小時，檔名也是。
分析網址的 `tz` 參數（`app/api/v1/endpoints/analytics.py::_parse_tz`）已經是同樣的作法。

**Decision**：
1. `AuditExportRequest` 加 `tz`，IANA 時區名稱，預設 `"UTC"`。不認得的名稱（`Mars/Olympus`）、格式不對的（空字串、`../etc/passwd`、`+08:00`）都回 422，在讀紀錄之前就擋下。
2. `created_at` 換成那個時區再寫 ISO，保留時差；檔名的時間也用那個時區。
3. `old_values`／`new_values` 裡面的時間不轉：那是資料表當時存的原始內容，改了就不是原始紀錄。
4. 匯出紀錄（ADR-417）多記 `tz`。
5. 取代 ADR-414 第 6 點的「時間一律是 UTC」。

**Consequences**：
➕ 前端帶 `Asia/Taipei`，Excel 打開就是台灣時間。
➖ 同一個檔案裡 `created_at` 跟 JSON 欄位裡的時間可能是不同時區，看的人要注意時差。

---

### ADR-431 稽核紀錄裡的邀請連結 token 一律遮掉

**白話**：`team_invites` 的紀錄裡，邀請連結的 `token` 在稽核列表和匯出檔裡都顯示成 `[redacted]`，不管是誰看。

**Date**: 2026-10-29（PR #155 code review；列表 API 是既有問題，Popo 決定在 #155 一起修）

**Context**：邀請連結在 24 小時內任何登入的人都能用（ADR-353），連結帶的就是 `token`。
稽核觸發器把整列存進 `audit_logs`，所以 `token` 會出現在稽核列表 API（ADR-358）和匯出檔（ADR-414）。
匯出檔本來就是拿去外面用、會被轉傳的東西；拿到檔案的人就能用這個 token 替那個團隊送出加入申請。
做分析用不到 token 的值。

**Decision**：
1. `app/services/audit_log.py` 的遮罩函式改成一個 `mask_values(table_name, values, reads_applicant_details=...)`，列表 API 和匯出共用：
   - `_SECRET_KEYS`（目前只有 `team_invites.token`）對所有人都遮；
   - `_APPLICANT_KEYS` 照舊只對沒有 `role_request.review` 的人遮（ADR-359 第 5 點）。
2. 團隊管理員、資料稽核員、超管看列表都一樣看不到 token。團隊管理員要邀請連結，本來就從建立邀請的 API 拿。
3. 原本的 `redact_applicant_details` 併進 `mask_values`，不留兩個函式，免得之後只改到其中一邊。

**Consequences**：
➕ 下載的檔案、畫面上的紀錄都不再是一把可用的邀請連結。
➖ 要從稽核紀錄對出「是哪一條連結」只能用 `row_id`（邀請的 uuid），uuid 本來就不能變成連結（ADR-353）。
