# 島嶼守望（救災資訊平台）

> 災害發生時，讓民眾、志工與救災單位在同一張地圖上回報災情、媒合任務、掌握站點狀態。

**目前狀態**：Phase 1 開發中（目標 115/06/15）｜**授權**：GPL-3.0

---

## 目錄

1. [這個專案在做什麼](#這個專案在做什麼)
2. [Repo 結構與角色導覽](#repo-結構與角色導覽)
3. [系統架構一覽](#系統架構一覽)
4. [5 分鐘跑起完整系統（Onboarding Guide）](#5-分鐘跑起完整系統onboarding-guide)
5. [本機測試帳號與驗證碼查看](#本機測試帳號與驗證碼查看)
6. [執行測試（Frontend & Backend）](#執行測試frontend--backend)
7. [開發流程與必讀規範](#開發流程與必讀規範)
8. [共用元件庫模組規劃（12 模組）](#共用元件庫模組規劃)

---

## 這個專案在做什麼

平台採模組化設計，由 12 個共用模組組成。模組之間透過標準介面溝通，彼此不直接依賴，可以獨立維護或替換。

主要使用者：

| 角色 | 使用方式 |
| :--- | :--- |
| **民眾 / 志工** | 前台（`Frontend/apps/demo`，`:3000`）：看救災地圖、回報救援需求与站點狀態、認領志工任務、申請成為後台人員 |
| **救災單位 / 管理者** | 後台（`Frontend/apps/admin`，`:3001`）：任務看板調度、互助地圖（含建物樓層與工作區域）、重複案件審核、據點管理、團隊與成員權限管理 |

---

## Repo 結構與角色導覽

| 目錄 | 內容 | 從這裡開始 |
| :--- | :--- | :--- |
| `Frontend/` | Nx 22 + pnpm monorepo，含前台 `demo`、後台 `admin`、共用 UI 與資料存取層 | [Frontend/README.md](Frontend/README.md) |
| `Backend/` | FastAPI + Strawberry GraphQL + PostgreSQL/PostGIS/H3 + Redis（Python 3.13） | [Backend/README.md](Backend/README.md) |
| `Design/` | 設計稿導覽與視覺規範（Figma 匯出檔案位於 `origin/sucrelindesign` 分支） | [Design/GUIDE.md](Design/GUIDE.md) |
| `.github/workflows/` | CI 設定（`frontend-ci.yaml`、`backend-tests.yml`、`ruff-check.yml`、`alembic-heads.yml`） | — |

**第一次來？依你的角色先讀：**

- **前端工程師** → 本頁「[5 分鐘跑起完整系統](#5-分鐘跑起完整系統onboarding-guide)」→ [`Frontend/CLAUDE.md`](Frontend/CLAUDE.md) → [`Frontend/README.md`](Frontend/README.md) → [`Frontend/docs/README.md`](Frontend/docs/README.md)
- **後端工程師** → 本頁「[5 分鐘跑起完整系統](#5-分鐘跑起完整系統onboarding-guide)」→ [`Backend/CLAUDE.md`](Backend/CLAUDE.md) → [`Backend/README.md`](Backend/README.md)
- **設計 / PM** → 本頁「[共用元件庫模組規劃](#共用元件庫模組規劃)」→ [`Design/GUIDE.md`](Design/GUIDE.md)

---

## 系統架構一覽

```text
瀏覽器
  ├─ 前台 demo   http://localhost:3000 ─┐
  └─ 後台 admin  http://localhost:3001 ─┤  Next.js BFF proxy（/api/v1/*、/api/graphql）
                                         ▼
                              FastAPI  http://localhost:8000  （REST + GraphQL）
                                ├─ PostgreSQL + PostGIS + H3  :5432
                                └─ Redis                      :6379

外部服務（本機皆可不填）：
  - Email / SMS OTP：本機預設 console 模式，驗證碼直接印在 Docker backend log
  - Google / LINE OAuth：只在後端設定，本機用 Email + 密碼即可登入
  - TGOS 門牌定位 / Google Maps API：選填，僅用於輔助地址查詢
```

- **認證機制**：登入一律由後端處理，以 `HttpOnly` session cookie（本機前綴 `wgdev`）維持登入狀態。前端不保存任何登入 secret。
- **前後端型別合約**：前端的 GraphQL / OpenAPI 型別由後端 schema 產生（`pnpm --dir Frontend schemas:generate`），CI 會檢查產生結果是否與 commit 一致。

---

## 5 分鐘跑起完整系統（Onboarding Guide）

### 1. 事前準備

| 工具 | 版本需求 | 用途 |
| :--- | :--- | :--- |
| **Docker Desktop** | 最新穩定版 | 執行 PostgreSQL（PostGIS + H3）、Redis 與 FastAPI 後端開發容器 |
| **Node.js** | `>= 22` | 執行前端 Next.js 與 Nx 工具鏈 |
| **pnpm** | `corepack enable` 自動啟用 | 管理前端 monorepo 與根目錄啟動指令 |
| **Python + `uv`** | Python `3.13` | 在本機跑後端 `pytest`、或執行 `pnpm schemas:generate` 匯出型別時需要 |

### 2. 一鍵初始化與日常啟動

在專案根目錄（`/`）直接執行：

```bash
# 第一次 clone 下來：
# 自動複製前後端環境變數檔（Backend/.env 與 Frontend/.env）、
# 安裝前端套件、建立後端虛擬環境、啟動後端 Docker、執行 Alembic migration 並灌入 RBAC 與測試假資料
corepack enable
pnpm setup

# 日常開發：
# 確保後端 Docker（db, redis, backend）在背景運行，並同時啟動前台 demo、後台 admin 與 Storybook
pnpm dev
```

啟動後的本機服務一覽：

| 服務 | 本機網址 / Port | 執行環境 | 說明 |
| :--- | :--- | :--- | :--- |
| **民眾前台 (`demo`)** | <http://localhost:3000> | 本機 Node (`pnpm`) | 救災地圖、列表、民眾求援、志工媒合、申請成為後台人員 |
| **管理後台 (`admin`)** | <http://localhost:3001> | 本機 Node (`pnpm`) | 任務看板、互助地圖、重複審核、據點管理、團隊與成員權限 |
| **UI 元件庫 (`ui`)** | <http://localhost:6006> | 本機 Node (`pnpm`) | Storybook 設計系統元件預覽 |
| **後端 API (`backend`)** | <http://localhost:8000> | Docker Container | REST 文件：<http://localhost:8000/docs>｜GraphQL：<http://localhost:8000/graphql> |
| **PostgreSQL / Redis** | `:5432` / `:6379` | Docker Container | PostGIS + H3 空間資料庫、Session 與 Rate Limit 快取 |

> 💡 **後端如何熱重載（Hot-reload）？**
> `Backend/docker-compose.yml` 已將本機 `Backend/` 目錄掛載進 `backend` 容器並開啟 `uvicorn --reload`。直接修改本機的 `.py` 檔案，Docker 內的後端就會自動重新載入，不需重啟容器。
>
> 💡 **環境變數檔**：
> 前後端統一使用 `.env`（`Backend/.env` 與 `Frontend/.env`），執行 `pnpm setup` 時會自動從各自的 `.env.example` 複製產生。

---

## 本機測試帳號與驗證碼查看

執行 `pnpm setup` 後，資料庫會載入兩個災害情境（`scripts/seed_mock_scenarios.sql`）的完整測試資料：

| 帳號（Email） | 角色 / 身分 | 預設密碼 | 用途說明 |
| :--- | :--- | :--- | :--- |
| `avol01@mock.test` | 一般民眾（建單者） | `Mock1234!` | 前台「我的任務 › 我建立的」已有 6 張單，可測編輯、刪單、停止招募 |
| `avol02@mock.test` | 志工（承接者） | `Mock1234!` | 前台「我的任務 › 我承接的」已有 4 筆不同狀態的任務，可測釋出 |
| `avol03@mock.test` | 新註冊民眾 | `Mock1234!` | 無任務，可測第一次接單或送出「申請成為後台人員」 |
| `avol04@mock.test` | 申請入隊審核中 | `Mock1234!` | 有一筆待審核的加入團隊申請（可由 `agov01` 或 `asuper01` 核准） |
| `agov01@mock.test` | 團隊管理員（光復鄉公所） | `Mock1234!` | 可進管理後台（`:3001`），管理本隊成員、產生邀請 QR、查看所有團隊名錄 |
| `asuper01@mock.test` | 超級管理員（`super_admin`） | 需手動設定（見下） | 全平台最高權限，可進後台看「成員與權限 `/users`」、管理所有團隊與重複審核 |
| `aaudit01@mock.test` | 資料檢核員（`data_auditor`） | 需手動設定（見下） | 測試後台「重複審核」與檢核員權限邊界 |

- **設定 `asuper01` / `aaudit01` 的本機密碼**：
  這兩個高權限帳號在 seed 中預設不帶密碼，本機需要測試時執行以下指令即可設定（例如設為 `Mock1234!`）：
  ```bash
  docker compose --project-directory Backend exec backend python -m scripts.set_password asuper01@mock.test
  ```
- **查看本機註冊／手機驗證碼（OTP）**：
  本機預設使用 `EMAIL_PROVIDER=console` 與 `SMS_PROVIDER=console`，驗證碼會直接印在後端容器 log：
  ```bash
  docker compose --project-directory Backend logs -f backend
  ```

---

## 執行測試（Frontend & Backend）

在專案根目錄直接執行 **`pnpm test`** 即可一次跑完前端與後端全部測試：

```bash
pnpm test
```

前端與後端也有各自的測試指令：

| 專案 | 測試框架與規模 | 是否需要啟動 Docker / DB？ | 單獨執行指令 |
| :--- | :--- | :--- | :--- |
| **Frontend** | Vitest（約 187 個 `.spec.ts(x)` 測試檔，涵蓋 `ui`、`modules`、`data-access`、`apps`） | **不需要**（純單元與元件邏輯測試，也不依賴 `.env`） | `pnpm --dir Frontend test` |
| **Backend** | Pytest + pytest-xdist（約 238 個測試檔、1,400+ 個 test cases，測試真實 PostGIS/H3 與 Redis） | **需要 `db` 與 `redis` 容器運行中**（會自動建立隔離的 `disaster_rescue_test` 資料庫，不影響開發資料） | `uv --directory Backend run pytest -n 4` |

詳細測試說明請見 [`Frontend/README.md`](Frontend/README.md) 與 [`Backend/README.md`](Backend/README.md#測試)。

---

## 開發流程與必讀規範

動手改程式碼前，請先閱讀根目錄的 **[`CLAUDE.md`](CLAUDE.md)**：

1. **前端開發（[`Frontend/README.md`](Frontend/README.md)）**
   - 動 UI 前必讀 [`Frontend/CLAUDE.md`](Frontend/CLAUDE.md) 與 [`Frontend/docs/design-system.md`](Frontend/docs/design-system.md)。
   - 顏色、圓角、字級、間距一律從 `@rescue-frontend/ui` 的 `designTokens` 取得，不可在頁面寫死色碼或數字圓角／字級。
   - 設計稿位於 `origin/sucrelindesign` 分支的 `Design/` 目錄，查閱方式見 [`Design/GUIDE.md`](Design/GUIDE.md)。
2. **後端開發（[`Backend/README.md`](Backend/README.md)）**
   - 測試與資料庫規範必讀 [`Backend/CLAUDE.md`](Backend/CLAUDE.md)。
   - 若修改了 SQLAlchemy Model，需先建立 Alembic migration，測試資料庫（由 `alembic upgrade head` 建立 template DB）才看得到新欄位。
   - 若修改了 REST API（路徑、參數、Pydantic schema、docstring）或 GraphQL Schema，**必須更新前端型別合約**：
     ```bash
     pnpm --dir Frontend schemas:generate
     ```
3. **文件索引**
   - 前端詳細文件與閱讀順序：[`Frontend/docs/README.md`](Frontend/docs/README.md)
   - 後端開發、測試與疑難排解：[`Backend/README.md`](Backend/README.md)
   - 雲端部署與維運指南：[`DEPLOY.md`](DEPLOY.md)
   - Discord 通知設定：[`DISCORD_WEBHOOK_SETUP.md`](DISCORD_WEBHOOK_SETUP.md)

---

## 共用元件庫模組規劃

平台採**模組化架構**，將功能拆分為 12 個職責明確的共用元件。各元件透過標準介面協作、互不直接耦合，使邊界清晰、易於維護與擴充，平台亦可依需求替換或升級特定功能，而不影響其他模組運作。

### 模組總覽與開發期程

| 編號 | 元件名稱 | 優先度 | 開發階段 |
| :---: | :--- | :---: | :--- |
| 1 | 二維（2D）底圖圖資呈現 | 高 | 第一階段（115/06/15） |
| 2 | 使用者登入驗證框架 | 高 | 第一階段（115/06/15） |
| 3 | 任務回報 | 高 | 第一階段（115/06/15） |
| 4 | 站點回報 | 高 | 第一階段（115/06/15） |
| 5 | 志工需求 / 任務媒合 | 高 | 第一階段（115/06/15） |
| 6 | 單點分享 | 中 | 第一階段（115/06/15） |
| 7 | 志工行前資訊 | 中 | 第二階段（115/12/15） |
| 8 | 緊急資訊公布欄 | 中 | 第二階段（115/12/15） |
| 9 | 數據庫分析儀表板 | 低 | 第二階段（115/12/15） |
| 10 | 工作區域分配 | 低 | 第二階段（115/12/15） |
| 11 | 人工智慧（AI）重複資訊查核 | 低 | 第二階段（115/12/15） |
| 12 | 直立樓層分層標記 | 低 | 第二階段（115/12/15） |

### 元件依賴關係

```text
二維底圖 ←── 任務回報、站點回報、工作區域分配
使用者登入驗證 ←── 任務媒合、站點回報（審核）、工作區域分配
任務回報 ←── 任務媒合、數據分析儀表板、AI 查核、直立樓層救援
任務媒合 / 站點回報 ←── 數據分析儀表板
```

### 關鍵設計決策

- 支援 Email 原生帳號與第三方 OAuth（Google、LINE），平台不儲存第三方密碼。
- 任務紀錄採僅追加（append-only）設計並保留完整操作紀錄（Action Log），供災後復盤檢討使用。
- 任務狀態以有限狀態機（State Machine）管理（待媒合 → 媒合中 → 媒合成功，另有刪除／停止招募路徑）。
- 分享功能使用公開 URL，前端提供一鍵複製連結與動態產生 QR Code。
