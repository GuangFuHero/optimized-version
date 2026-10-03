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
| 後台 | admin、admin site | `admin` | `/api/v1/admin`、`/admin/*` 頁面、`AdminUserListItem`、`AnnouncementPlacement.ADMIN_PAGE` |
| 前台 | public、public site | `public` | `AnnouncementPlacement.PUBLIC_PAGE` |

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
