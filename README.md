# 島嶼守望（救災資訊平台）

> 災害發生時，讓民眾、志工與救災單位在同一張地圖上回報災情、媒合任務、掌握站點狀態。

**版本**：v0.1.0（每一版的變更見 [Releases](https://github.com/GuangFuHero/optimized-version/releases)）｜**授權**：程式碼 GPL-3.0-only，設計素材 CC BY-SA 4.0，名稱與 Logo 不授權（見[授權](#授權)）

這是一套開源、不綁定特定災害的救災協作平台。水災、土石流、地震都可以用：部署一套、設定好災害事件，就能讓民眾求助、志工承接、救災單位調度。歡迎各地的救災社群拿去用、一起維護。

---

## 目錄

1. [平台概覽](#平台概覽)
2. [主要功能](#主要功能)
3. [角色與他們在系統裡做的事](#角色與他們在系統裡做的事)
4. [5 分鐘跑起完整系統（Onboarding Guide）](#5-分鐘跑起完整系統onboarding-guide)
5. [部署到伺服器](#部署到伺服器)
6. [用在你的災害](#用在你的災害)
7. [技術文件導覽](#技術文件導覽)
8. [參與貢獻](#參與貢獻)
9. [授權](#授權)

---

## 平台概覽

平台分成兩個網站，共用同一個後端與資料庫：

| 網站 | 給誰用 | 說明 |
| :--- | :--- | :--- |
| **前台** | 民眾、志工 | 不用登入就能看地圖、求助單與站點；登入後可以送出求助、承接任務 |
| **管理平台** | 政府單位、NGO、資料檢核員、平台管理員 | 調度任務、分配責任區、管理站點與團隊、看儀表板；要有後台身分才進得去 |

```text
瀏覽器
  ├─ 前台         ─┐
  └─ 管理平台     ─┤  Next.js（同一個 monorepo 的兩個 app）
                   ▼
              FastAPI 後端（REST + GraphQL）
                ├─ PostgreSQL + PostGIS + H3（空間資料）
                └─ Redis（登入 session、流量限制）
```

---

## 主要功能

| 功能 | 說明 |
| :--- | :--- |
| **救災地圖** | 在同一張地圖上看求助單、資源站點、危險區與責任區；可以切換街道圖與衛星影像底圖、篩選類型與狀態。也有清單模式 |
| **求助與任務回報** | 民眾送出求助單，寫明需要的人力、物資或搜救；建單者可以修改、刪除、停止招募 |
| **志工媒合** | 志工承接需求、需要時釋出；人數湊滿就自動停止招募。任務狀態由需求自動推算：待媒合、進行中、已完成 |
| **資源站點** | 物資、醫療、住宿、充電等站點的位置與營運狀態；登入的使用者都可以建議修改，由管理平台審核後更新 |
| **分工與調度** | 在地圖上劃責任區、指派給 NGO；標示危險區；大樓與多樓層的現場可以「看各樓層」逐層管理 |
| **資訊發布** | 緊急資訊公布欄（公告）、志工行前資訊（報到、交通、裝備清單）、單點分享（任務或站點的公開連結） |
| **重複資料查核** | 新增任務或站點時，系統先比對是否已經有類似的資料並提示；疑似重複的配對由人在管理平台審核、合併 |
| **數據儀表板** | 任務數量與狀態、志工需要與缺口、每日趨勢；可以依地區（到村里）、類型、狀態篩選 |
| **匯入與匯出** | 任務與站點可以用 CSV 或 Excel 批次匯入（有範本可下載）與匯出 |
| **帳號與團隊** | Email 或手機＋密碼、Google、LINE 登入；用邀請連結或 QR Code 加入團隊；每一次修改都留下歷史紀錄，供災後檢討 |

---

## 角色與他們在系統裡做的事

下面是各角色在救災情境裡主要做的事。每個角色實際能看到、能修改哪些資料，由後端的權限設定決定，部署的單位可以調整。

| 角色 | 在哪裡 | 主要做的事 |
| :--- | :--- | :--- |
| **民眾（求助者）** | 前台 | 查看附近的災情與資源站點；送出求助單、說明需要什麼；需求滿足後停止招募；分享求助單給親友 |
| **志工** | 前台 | 找到需要人力的任務並承接；出發前看行前資訊；在「我的任務」追蹤自己承接的工作；回報站點的最新狀況 |
| **政府單位** | 管理平台 | 掌握全區災情與缺口；調度所有任務；劃設責任區與危險區、分派給 NGO；管理站點與單位成員 |
| **NGO（民間救援團隊）** | 管理平台 | 處理自己責任區內的任務與站點；管理團隊成員、用 QR Code 邀請新成員加入 |
| **資料檢核員** | 管理平台 | 審核疑似重複的任務與站點並合併；確保資料正確 |
| **平台管理員** | 管理平台 | 設定災害事件、發布公告與行前資訊、管理所有團隊與人員 |

民眾和志工可以在前台申請成為政府單位或 NGO 的成員、或資料檢核員，由團隊管理員或平台管理員審核。

---

## 5 分鐘跑起完整系統（Onboarding Guide）

在自己的電腦上跑起完整系統，只有這台電腦看得到。不用申請網域或任何第三方服務。

### 1. 事前準備

| 工具 | 版本需求 | 用途 |
| :--- | :--- | :--- |
| **Docker Desktop**（Linux 裝 Docker Engine 與 Compose 外掛即可） | 最新穩定版 | 執行 PostgreSQL（PostGIS + H3）、Redis 與後端 |
| **Node.js** | `>= 22` | 執行前端 |
| **pnpm** | `corepack enable` 自動啟用 | 管理前端 monorepo 與根目錄的指令 |
| **Python + `uv`** | Python `3.13` | `pnpm setup` 會用它建立後端虛擬環境 |

### 2. 初始化與啟動

在專案根目錄執行：

```bash
# 第一次：複製環境變數檔、安裝套件、啟動後端 Docker、建立資料庫，並灌入示範資料
corepack enable
pnpm setup

# 之後每次：啟動後端、前台、管理平台與 UI 元件庫
pnpm dev
```

| 服務 | 網址 |
| :--- | :--- |
| 前台 | <http://localhost:3000> |
| 管理平台 | <http://localhost:3001> |
| 後端 API 文件 | <http://localhost:8000/docs>（REST）、<http://localhost:8000/graphql>（GraphQL） |
| UI 元件庫（Storybook） | <http://localhost:6006> |

`pnpm setup` 會灌入兩個示範災害情境的資料（花蓮光復土石流、宜蘭冬山水災），以及各種角色的示範帳號，帳號清單寫在 [`Backend/scripts/seed_mock_scenarios.sql`](Backend/scripts/seed_mock_scenarios.sql) 的開頭。

本機跟正式環境的差別：

- 簡訊與 Email 驗證碼不會真的寄出，而是印在後端的紀錄裡：`docker compose --project-directory Backend logs -f backend`。
- 不能用 Google、LINE 登入，改用 Email＋密碼。
- 地址不會自動定位成座標，但照樣可以存。

開發與測試的細節見 [`Frontend/README.md`](Frontend/README.md) 與 [`Backend/README.md`](Backend/README.md)。

---

## 部署到伺服器

要讓別人用網址連進來，照你的情境選一條路，步驟都在 [`DEPLOY.md`](DEPLOY.md)：

| 情境 | 從哪裡開始 |
| :--- | :--- |
| 在 GCP 從零架設一套（正式環境） | [`DEPLOY.md` 第 10 節：從零架設雲端環境](DEPLOY.md#10-從零架設雲端環境one-time-bootstrap) |
| 在自己的電腦（Ubuntu＋Docker）架設，讓別人連進來（僅供測試） | [`DEPLOY.md` 第 10 節開頭](DEPLOY.md#在自己的電腦上架設要先知道的事) |
| 更新已經架好的環境 | [`DEPLOY.md` 第 2 節：日常部署速查](DEPLOY.md#2-日常部署速查tldr) |

部署方式：一台主機用 Docker Compose 跑前台、管理平台、後端、資料庫與 Redis，透過 Cloudflare Tunnel 提供 HTTPS；資料庫每天自動備份。`deploy.sh` 一個指令完成建置、資料庫 migration 與健康檢查，也能退回指定版本。

### 要準備的外部服務

申請方式見 [`DEPLOY.md` 第 10 節 Step 1](DEPLOY.md#step-1事前申請外部第三方服務需提前準備)。有些服務要綁定主機的固定 IP、需要人工審核，請提早申請。

| 服務 | 用途 | 沒設定會怎樣 |
| :--- | :--- | :--- |
| 網域＋Cloudflare Tunnel | 前台與管理平台的網址、HTTPS | 外面連不進來 |
| 簡訊服務（目前接簡訊王 KotSMS） | 手機驗證碼 | 不能用手機註冊或驗證手機，也就不能申請後台身分 |
| Email 服務（目前接 SMTP2GO） | Email 驗證碼與通知信 | 不能用 Email 註冊、重設密碼 |
| Google OAuth、LINE Login | 第三方帳號登入 | 少了這兩種登入方式，Email、手機＋密碼照樣能用 |
| 內政部 TGOS 門牌定位 | 地址與座標互轉 | 地址照樣能存，只是不會自動定位 |

各環境要填的環境變數，對照表在 [`DEPLOY.md` 第 6 節](DEPLOY.md#6-環境變數cookiecloudflare-tunnel-與第三方服務設定)；本機的值寫在 [`Backend/.env.example`](Backend/.env.example) 與 [`Frontend/.env.example`](Frontend/.env.example)。地圖底圖與門牌查詢的使用條款見 [`MAP_TERMS.md`](MAP_TERMS.md)。

---

## 用在你的災害

部署好之後，大致照這個順序開始：

1. **建立第一個平台管理員**：見 [`DEPLOY.md` 第 10 節 Step 7](DEPLOY.md#step-7建立第一個超級管理員帳號super_admin)。
2. **設定災害事件**：在管理平台的「設定」填入災害名稱、災害類型、開始時間與地圖的預設範圍。
3. **建立團隊、邀請成員**：政府單位與 NGO 各自建立團隊，用邀請連結或 QR Code 讓成員加入。
4. **匯入既有資料**：已經有的站點或任務清單，可以用管理平台的匯入功能（CSV 或 Excel，有範本）一次匯入。
5. **劃責任區**：在管理平台的互助地圖劃好責任區，分派給負責的團隊。
6. **換成你的名稱與 Logo**：「島嶼守望」「光復超人」的名稱與 Logo 不在開源授權範圍內，要換的檔案列在 [`LICENSING.md`](LICENSING.md)。

---

## 技術文件導覽

| 想了解 | 看這裡 |
| :--- | :--- |
| 前端架構、開發方式 | [`Frontend/README.md`](Frontend/README.md)、[`Frontend/docs/README.md`](Frontend/docs/README.md) |
| 後端架構、開發方式 | [`Backend/README.md`](Backend/README.md) |
| 資料庫結構（ER 圖） | [`Backend/Spec/Docs/er-diagram.md`](Backend/Spec/Docs/er-diagram.md)；實際的 schema 以 [`Backend/alembic/versions/`](Backend/alembic/versions/) 的 migration 為準 |
| 任務與站點的欄位定義 | [`Backend/Spec/Docs/mapping-tasks.csv`](Backend/Spec/Docs/mapping-tasks.csv)、[`Backend/Spec/Docs/mapping-stations.csv`](Backend/Spec/Docs/mapping-stations.csv) |
| API | 執行中的後端 `/docs`（REST）與 `/graphql`；前端使用的契約檔 [`schema.graphql`](Frontend/libs/data-access/src/graphql/schema.graphql)、[`openapi.json`](Frontend/libs/data-access/src/rest/openapi.json)；摘要見 [`Frontend/docs/database-schema.md`](Frontend/docs/database-schema.md) |
| 各功能的規格與設計決策 | [`Backend/Spec/`](Backend/Spec/)：每個功能一個資料夾，`spec.md` 是規格，`decisions.md` 是決策紀錄（ADR） |
| 設計稿與設計系統 | [`Design/GUIDE.md`](Design/GUIDE.md)、[`Frontend/docs/design-system.md`](Frontend/docs/design-system.md) |
| 部署、備份、金鑰輪替 | [`DEPLOY.md`](DEPLOY.md) |
| 第三方套件與授權 | [`SBOM/README.md`](SBOM/README.md)、[`LICENSING.md`](LICENSING.md) |

```text
Frontend/   前端 monorepo（Nx + pnpm）：前台 apps/demo、管理平台 apps/admin、共用 UI 與資料存取層
Backend/    後端（FastAPI + Strawberry GraphQL + PostgreSQL/PostGIS/H3 + Redis，Python 3.13）
Design/     設計稿導覽（設計稿本身在 sucrelindesign 分支）
.github/    CI 與自動化設定
```

---

## 參與貢獻

歡迎送 issue 和 PR，程式、設計、測試、文件、翻譯都很需要。

- **怎麼貢獻**：[`CONTRIBUTING.md`](CONTRIBUTING.md)。第一次送 PR 要先簽個人貢獻者授權協議（CLA），PR 上會有提示。
- **行為準則**：[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。
- **資安問題**：**不要**開公開的 issue，照 [`SECURITY.md`](SECURITY.md) 私下通報。
- **貢獻者**：[`CONTRIBUTORS.md`](CONTRIBUTORS.md)。

---

## 授權

- **程式碼與技術文件**：GNU GPL v3.0 only，全文見 [`LICENSE`](LICENSE)。
- **設計素材**（插圖、吉祥物「光復寶寶」、UI 設計稿、設計文件）：CC BY-SA 4.0，作者標示「光復超人設計團隊」。
- **名稱與 Logo**（「光復超人」「島嶼守望」等）：不在任何開源或創用 CC 授權範圍內。部署自己的版本時，請換成你自己的名稱與 Logo。
- **第三方內容**：套件見 [`SBOM/README.md`](SBOM/README.md)，地圖與地址服務的條款見 [`MAP_TERMS.md`](MAP_TERMS.md)。

每一類內容的範圍、字型與圖示的授權，見 [`LICENSING.md`](LICENSING.md)。
