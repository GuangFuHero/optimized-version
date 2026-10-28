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

1. **`GET /api/v1/admin/audit-logs/export`**，篩選條件跟列表一樣：`table`、`row_id`、`actor_uuid`、`from`、`to`。
   回 `text/csv` 附件，UTF-8 加 BOM（Excel 才讀得懂中文），新的在前。
2. **新的權限 `audit.export`**，只給 `super_admin`（範圍 `all`）。**跟 Spec 006 寫的不同**：資料稽核員不能匯出（Popo 10/28 決定）。
   用一個新權限，而不是直接檢查角色名稱，之後要調整可以在 `/admin/rbac` 改。
   既有資料庫由 migration `b5d8e2a41c07` 補上（ADR-055）。
3. **欄位**：`created_at`、`table_name`、`action`、`row_id`、`actor_uuid`、`actor_name`（操作人暱稱）、`client_ip`、
   `context`、`old_values`、`new_values`。後三個是 JSON 字串。開頭是 `=`、`+`、`-`、`@` 的值會加 `'`，
   避免試算表把它當公式執行（`app/core/tabular.py::write_csv`，ADR-208）。
4. **一次最多 10,000 筆**。超過回 422，請使用者縮小時間範圍；不截斷，免得有人把一部分當成全部。
5. **一律是平台視角**（含 IP）。申請人資料的遮罩規則跟畫面一樣：沒有 `role_request.review` 的人看到 `[redacted]`
   （ADR-359 第 5 點）。種子資料的超管都有，只有在 `/admin/rbac` 另外授權時才會遇到。

**Consequences**：
➕ 超管可以把一段時間的紀錄帶去做外部分析。
➖ 超過 10,000 筆要分段下載。
➖ 資料稽核員要匯出得先在 `/admin/rbac` 授權 `audit.export`。
