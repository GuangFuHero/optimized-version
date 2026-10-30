<p align="center">
  <img src="logo/island-watch-horizontal.png" alt="島嶼守望・光復超人 標誌：橘色與藍色兩個互相擁抱的人形，兩人之間的留白是台灣的輪廓" width="520">
</p>

<h1 align="center">島嶼守望 Island Watch</h1>

<p align="center">災害應變共用元件庫 ・ 前身為「光復超人」</p>

> 一套可重複使用、可獨立運作的開源災害應變元件：地圖、通報、媒合、公告與協調。
> 源自 2025 年花蓮光復災後的民間救災平臺實務，並整理成可供其他災害與其他單位沿用的元件。

> 📌 **本專案持續更新中。** 想看最新的進度與資料，歡迎隨時回到這裡：
> 版本與變更見 [Releases](https://github.com/GuangFuHero/optimized-version/releases)，問題與討論見 [Issues](https://github.com/GuangFuHero/optimized-version/issues)，光復超人的官方網站與社群見[官方連結](#官方連結)。

**English summary.** *Island Watch (formerly GuangFu Hero)* is an open-source library of 12 reusable disaster-response components — a 2D map, sign-in, help-request reporting, volunteer matching, station reporting, sharing, pre-trip briefings, emergency announcements, an analytics dashboard, work-zone assignment, duplicate-report review and per-floor rescue. It is a FastAPI + PostGIS backend with a Next.js frontend, licensed under GPL-3.0. The project is pre-release (`v0.1.0-beta.x`). Documentation is in Traditional Chinese; see [Maturity](#成熟度與已知缺口) for what works today.

---

## 目錄

1. [這是什麼](#這是什麼)
2. [從光復超人到島嶼守望](#從光復超人到島嶼守望)
3. [12 個共用元件與目前狀態](#12-個共用元件與目前狀態)
4. [系統架構](#系統架構)
5. [快速開始](#快速開始)
6. [專案結構](#專案結構)
7. [測試與品質檢查](#測試與品質檢查)
8. [沿用到其他災害或單位](#沿用到其他災害或單位)
9. [採用的開放標準](#採用的開放標準)
10. [成熟度與已知缺口](#成熟度與已知缺口)
11. [貢獻方式](#貢獻方式)
12. [資訊安全](#資訊安全)
13. [授權](#授權)
14. [官方連結](#官方連結)

---

## 這是什麼

災害發生時，各單位常各自建一套地圖、表單與群組，資訊分散、重複、難以對接。本專案把災害應變共通的底層功能拆成 **12 個職責明確的元件**，元件之間透過標準介面協作、互不直接耦合，因此可以只取用需要的部分，或替換其中某一個，而不影響其他功能。

**適用對象**

| 對象 | 可以拿它做什麼 |
|---|---|
| 災民與在地居民 | 在地圖上回報需求（清淤、物資、陪同、修繕、交通、受困） |
| 志工 | 瀏覽任務、承接需求、查看行前資訊 |
| 非政府組織、政府協調人員 | 管理任務與資源站點、發布公告、劃分責任區 |
| 資料稽核員 | 檢核資料品質、處理疑似重複的通報 |
| 開發者、公部門技術人員 | 取用元件，自行部署或延伸到其他災害情境 |

**適用災害**：水災、地震、土石流、颱風、火災等。底圖圖層與動態欄位可依災害類型設定。

---

## 從光復超人到島嶼守望

### 光復超人

2025 年 9 月花蓮光復災後，許多人能親自前往災區當志工，也有一群無法親臨現場、卻同樣想出力的「遠端志工」與「鍵盤志工」。他們以各自的專業，在線上建立了一套支援現場的資訊系統，這就是**光復超人**。

信念很簡單：即使不在現場，我們仍能彼此連結，一起伸出手，讓力量匯聚成擁抱。

光復超人推出過的功能包括：

- **志工指引**：報到方式、交通概況、裝備建議，以及可加入的團隊與在地社群
- **志工地圖**：醫療站、物資站、廁所等地點，協助志工熟悉現場
- **需求媒合**：災民登錄需求，志工查看並前往支援
- **小蜜蜂配給系統**：由騎車志工組成的小蜜蜂團隊，把物資站的物資送到災民手上

### 為什麼改名為「島嶼守望」

光復超人起於一場特定的災害。為了讓同一套系統能用在水災、地震、土石流、颱風、火災等不同災害，也讓其他單位可以直接沿用，我們把平台名稱從「光復超人」改為**島嶼守望**，不再綁定單一地名。

「光復超人」仍然是我們的團隊與社群名稱，也是這一切的起點。

### 標誌：理念不變，多了一個台灣

<p align="center">
  <img src="logo/island-watch-vertical.png" alt="島嶼守望・光復超人 直式標誌：橘色與藍色兩個互相擁抱、比出肌肉的人形，兩人之間的留白是台灣的輪廓" width="260">
</p>

標誌的設計理念沒有改變：**兩個互相擁抱的人**，呼應我們一直以來的口號「用愛行動，用擁抱連結」。

新版標誌在兩人環抱之間，多了一個**台灣**的輪廓，也呼應新名字「島嶼守望」。

> 標誌與「光復超人」「島嶼守望」「GuangFuHero」名稱受商標保護，**不在 GPL v3 授權範圍內**，詳見[授權](#授權)。

---

## 12 個共用元件與目前狀態

狀態依據 `v0.1.0-beta.5`（staging 部署版）與 `main`（2026-10-30）的實際程式碼整理。

| # | 元件 | 做什麼 | 狀態 | 主要程式位置 |
|---|---|---|---|---|
| 1 | 二維底圖圖資呈現 | 互動地圖，街道圖與多種衛星影像切換；可開關圖層；記住圖層與篩選偏好（存在瀏覽器） | ✅ 已上線 | `Frontend/libs/modules/src/map/` |
| 2 | 使用者登入驗證框架 | Email 或手機註冊；Google、LINE 登入；忘記與重設密碼；帳號安全（新增聯絡方式前需先驗證） | ✅ 已上線 | `src/auth/`、`Backend/app/services/auth_*.py` |
| 3 | 任務回報 | 建立任務單（標題、地標、地址、樓層、聯絡人、需求、說明、圖片連結）；完整操作日誌與逐單歷史 | ✅ 已上線 | `src/ticket/`、`Backend/app/services/ticket.py` |
| 4 | 站點回報 | 針對既有資源站點提交修改建議（營運狀態、開放時間、名稱、說明、類型、物資狀態），後台審核 | ✅ 已上線 | `src/station/suggestion/`、`Backend/app/services/suggestion.py` |
| 5 | 志工需求／任務媒合 | 志工承接「需求」（不是整張任務單）；額滿、釋出、停止招募；任務單狀態由需求自動推算 | ✅ 已上線 | `src/ticket/needs/`、`Backend/app/services/ticket_status.py` |
| 6 | 單點分享 | LINE、Facebook、Threads、X 分享；複製連結；QR Code；分享預覽圖（伺服器端產生） | ✅ 已上線 | `src/point-share/` |
| 7 | 志工行前資訊 | 後台以 Markdown 編輯，草稿與發布；前台閱讀、勾選攜帶清單、列印 | ✅ 已上線 | `src/briefing/`、`Backend/app/models/briefing.py` |
| 8 | 緊急資訊公布欄 | 全站橫幅，可指定前台、後台或兩邊；手動發布與關閉；上限 50 字 | ✅ 已上線 | `src/announcement/`、`src/admin/announcement/` |
| 9 | 數據庫分析儀表板 | 任務與站點的統計圖表與數值（由後端產生） | 🟡 後端 API 已備；管理平台頁面尚未接上 | `Backend/app/api/v1/endpoints/analytics.py` |
| 10 | 工作區域分配 | 責任區、危險區、標示區；指派責任區給團隊 | 🟡 前台地圖可顯示；後端 API 已備；管理平台繪製與指派介面尚未上線 | `Backend/app/services/area.py`、`src/map/areas.ts` |
| 11 | 演算法重複資訊查核 | 建單時比對附近相似需求並提示；後端已有合併、保留、判定 API | 🟡 建單提示已上線；稽核員查核頁尚未上線 | `Backend/app/dedup_engine/`、`src/ticket/help-request/` |
| 12 | 直立樓層（開啟空間） | 大樓與樓層資料模型；任務單依樓層分組 | 🟡 後端資料模型已備；前端介面尚未上線 | `Backend/app/services/building_map.py` |

**開發期程**：元件 1 至 6 為第一階段（2026/06/15），元件 7 至 12 為第二階段（2026/12/15）。

**重複查核的比對訊號**：距離、時間、任務類型、文字相似度（trigram，字面比對），另有電話加分。

> 元件之間的依賴：底圖 ← 任務回報、站點回報、工作區域分配；登入 ← 任務媒合、站點審核、工作區域分配；任務回報 ← 媒合、儀表板、重複查核、直立樓層。

---

## 系統架構

```
┌────────────────────────────┐        ┌────────────────────────────────────────┐
│ Frontend（Next.js）          │        │ Backend（FastAPI）                       │
│  apps/demo   前台（公開）     │ REST   │  GraphQL（Strawberry）＋ REST（OpenAPI）  │
│  apps/admin  管理平台         │◀──────▶│  服務層 → Repository → SQLAlchemy(async)  │
│  libs/modules 業務模組       │GraphQL │  去重引擎、分析圖表、通知、稽核日誌          │
│  libs/ui      設計系統       │        └───────────────┬────────────────────────┘
│  libs/data-access 資料存取   │                        │
└────────────────────────────┘          PostgreSQL ＋ PostGIS（含 h3、pg_trgm）／ Redis
```

- **前台與管理平台分離**：兩個獨立的 Next.js 應用，共用 `libs/*`。
- **權限**：以能力（capability）為基礎的角色權限，前台以「有沒有這個能力」判斷，不寫死角色名稱。
- **訪客位置保護**：訪客只看到概略網格（H3），看不到門牌級座標與原始聯絡資訊，由後端處理。
- **資料可追溯**：重要操作寫入只增不改的稽核日誌（`audit_logs`），支援逐單歷史時間軸。

---

## 快速開始

### 需求

- Docker 與 Docker Compose
- Python 3.13、[`uv`](https://docs.astral.sh/uv/)
- Node.js 22、pnpm（以 `corepack enable` 啟用）

### 1. 啟動後端

```bash
cd Backend
cp .env.example .env          # 依需要調整
docker compose up -d          # PostgreSQL 5432、Redis 6379、FastAPI 8000
docker compose exec backend alembic upgrade head
```

### 2. 啟動前端

```bash
cd Frontend
corepack enable
pnpm install
cp .env.example .env.local    # 預設值即可連到 localhost:8000
pnpm dev
```

| 服務 | 網址 |
|---|---|
| 前台（demo） | http://localhost:3000 |
| 管理平台（admin） | http://localhost:3001 |
| Storybook | http://localhost:6006 |

登入、Google 與 LINE 的設定集中在後端，前端沒有自己的登入 secret。細節見 [`Frontend/docs/authentication.md`](Frontend/docs/authentication.md)。部署說明見 [`Backend/DEPLOY.md`](Backend/DEPLOY.md)。

---

## 專案結構

```text
.
├── Backend/          FastAPI ＋ Strawberry GraphQL ＋ SQLAlchemy；alembic 遷移；pytest
│   ├── app/          api、graphql、services、repositories、models、dedup_engine
│   ├── Spec/         各功能的規格與決策紀錄（ADR）
│   └── tests/
├── Frontend/         Nx ＋ pnpm monorepo
│   ├── apps/         demo（前台）、admin（管理平台）
│   ├── libs/         ui、modules、data-access
│   └── docs/         前端工作原則、資料存取、驗證流程、已知問題
├── Design/           前台與後台的互動原型（HTML）與設計系統，供對照用
├── Spec/Docs/        地圖圖磚服務等跨系統設計文件
└── System_Design/    系統規格的心智圖編輯器與匯出
```

### 文件索引

| 想了解 | 看這裡 |
|---|---|
| 前端分層、指令與規範 | [`Frontend/README.md`](Frontend/README.md)、[`Frontend/docs/frontend-working-principles.md`](Frontend/docs/frontend-working-principles.md) |
| 前端資料存取與 GraphQL codegen | [`Frontend/docs/data-access.md`](Frontend/docs/data-access.md) |
| 登入方式與 Session 模型 | [`Frontend/docs/authentication.md`](Frontend/docs/authentication.md) |
| 前端已知問題 | [`Frontend/docs/known-issues.md`](Frontend/docs/known-issues.md) |
| 後端執行與測試 | [`Backend/README.md`](Backend/README.md) |
| 部署 | [`Backend/DEPLOY.md`](Backend/DEPLOY.md) |
| 資料庫關聯圖 | [`Backend/Spec/Docs/er-diagram.md`](Backend/Spec/Docs/er-diagram.md) |
| 各功能的規格與決策紀錄 | `Backend/Spec/` |
| 地圖圖磚服務設計 | [`Spec/Docs/map-tile-service-design.md`](Spec/Docs/map-tile-service-design.md) |

---

## 測試與品質檢查

```bash
# 後端（需要本機的 PostgreSQL 與 Redis）
cd Backend
PYTHONPATH=. ENV=testing .venv/bin/python -m pytest tests -q -n 4

# 前端
cd Frontend
pnpm typecheck && pnpm lint && pnpm test
```

GitHub Actions 會在每個 Pull Request 執行：前端型別檢查、lint、測試；後端 pytest 與 ruff；資料庫遷移雙 head 檢查；以及 schema 與程式碼是否同步。

---

## 沿用到其他災害或單位

下列項目目前綁定「島嶼守望」這次部署，沿用時需要調整：

| 項目 | 怎麼調整 |
|---|---|
| 事件名稱、簡稱、地圖預設位置 | 管理平台「設定」→「這次災害」 |
| 品牌名稱、標誌、分享預覽圖 | 前端 `libs/modules/src/brand/`、`point-share/`（品牌字串目前寫在程式中） |
| 地址查詢 | 後端使用 TGOS 門牌查詢；其他國家或地區需替換 `Backend/app/services/address.py` 的來源 |
| 簡訊與信件 | 後端以環境變數選擇服務供應商 |
| 雲端與機密管理 | 部署腳本預設使用 GCP Secret Manager；可改為其他機密管理方式 |
| 災害類型與動態欄位 | 管理平台「欄位設定」 |

---

## 採用的開放標準

| 用途 | 標準或規格 |
|---|---|
| API 描述 | OpenAPI、GraphQL |
| 第三方登入 | OAuth 2.0（Google、LINE） |
| 地理資料 | GeoJSON、OpenStreetMap 圖磚、H3 網格索引 |
| 資料庫 | PostgreSQL、PostGIS |
| 授權 | GNU GPL v3（OSI 認可） |

衛星影像由外部單位提供，**使用前請先確認各來源的授權條款**：EOX 僅限非商業用途（CC BY-NC-SA 4.0），國土測繪中心禁止非商業再散布，NASA GIBS 為公開資料。程式碼不內含影像資料。

---

## 成熟度與已知缺口

**目前階段：Pre-release（`v0.1.0-beta.x`）。** 適合試用、評估與二次開發；**尚未建議直接用於正式災害應變。**

- 版本與變更：見 [Releases](https://github.com/GuangFuHero/optimized-version/releases)。
- 12 個元件中，1 至 8 已可使用；9 至 12 的後端已有基礎，管理平台或前端介面仍在開發。
- 個人偏好（圖層、釘選篩選、行前清單勾選）只存在瀏覽器，更換裝置不會同步。
- 緊急公告為定時更新，不是即時推送；50 字上限目前只在管理介面檢查。
- 重複查核為字面相似度，不是語意模型；門檻為暫定值，需在實際資料上持續調整。
- 路線與次要位置圖層尚無資料。
- 資料庫為務實取向：核心表已正規化，但有數處**刻意保留的重複欄位**（為效能、歷史快照或資料庫層約束），理由記錄在 `Backend/Spec` 的決策紀錄中。

---

## 貢獻方式

歡迎透過 Issue 回報問題或提出建議，也歡迎提 Pull Request。

0. 首次提交 Pull Request 時，請依 CLA Assistant Bot 的指示簽署**個人貢獻者授權協議（Individual CLA）**；未簽署無法合併。
1. 先開 Issue 說明想做的事，避免重工。
2. 從 `main` 建立分支；依 `Frontend/docs/frontend-working-principles.md` 與後端 `ruff` 設定撰寫程式。
3. 新功能請附測試；提交前執行上方的測試與 lint。
4. 修改資料庫結構請新增 alembic 遷移，且遷移只能有一個 head。
5. Pull Request 需通過 CI，並由維護者審查後合併。

> 【待補】詳細貢獻指南（`CONTRIBUTING.md`）、行為準則（`CODE_OF_CONDUCT.md`）、維護者名單與討論管道。

---

## 資訊安全

請**不要**在公開 Issue 中揭露可被利用的安全弱點。

> 【待補】弱點回報管道（信箱或 GitHub Security Advisory）與回應時程。

專案內不包含任何金鑰：機密由環境變數或機密管理服務提供，範例見各目錄的 `.env.example`。

---

## 授權

本專案遵循 [GuangFuHero 組織的授權規範](https://github.com/GuangFuHero)：

| 內容 | 授權 |
|---|---|
| 程式碼（`Backend/`、`Frontend/`、腳本與工具） | **GNU General Public License v3.0**，全文見 [`LICENSE`](LICENSE) |
| 設計素材（UI／UX 設計稿、海報、插圖、Icons、圖像、視覺模板） | 不在本 repo 釋出。依組織規範，設計類資料庫採 **CC BY-NC-SA 4.0**，目前為 [`brand-design-alignment`](https://github.com/GuangFuHero/brand-design-alignment) |
| 「光復超人」「GuangFuHero」名稱與 Logo | **不在任何開源或 CC 授權範圍內**，受商標保護；`/logo` 資料夾的檔案未經書面授權不得使用 |

本 repo 的程式碼一律為 GPL v3，每個 repo 的授權以其根目錄的 `LICENSE` 為準。程式碼不內含設計類資料庫的內容，反之亦然。

> **商標聲明**：GPL v3 授權的是程式碼，並不授予「光復超人」「GuangFuHero」名稱與 Logo 的使用權。若你部署自己的版本，請換成自己的名稱與標誌。

> 【待補】本 repo 目前仍含 `Design/` 目錄（互動原型與設計系統）與 Logo 檔案（`Design/前台/assets/logo/`），需依上述規範處理：移至設計類資料庫，或明確標示授權範圍。處理完成後，請更新這段說明。

使用的第三方套件各有其授權。內含字型 Noto Sans TC 以 SIL Open Font License 1.1 釋出。

授權或品牌使用問題，請聯繫 GuangFuHero 維護團隊。

> 【待補】軟體物料清單（SBOM）的位置或產生方式。

---

## 官方連結

想看最新的消息、參與行動或了解現場狀況，請從這裡開始：

| 管道 | 連結 |
|---|---|
| 官方網站（志工資訊、物資媒合、災民協助） | [gf250923.org/map](https://gf250923.org/map) |
| LINE 官方帳號 | [@hreco](https://page.line.me/hreco) |
| Facebook | [光復超人粉絲專頁](https://www.facebook.com/gunangfu250927) |
| Instagram | [@gunangfu250927](https://www.instagram.com/gunangfu250927/) |
| YouTube | [光復超人頻道](https://www.youtube.com/channel/UC1jIUA-kbGq-Dh1s3QBC6ow) |
| Threads | [@gunangfu250927](https://www.threads.com/@gunangfu250927) |
| GitHub 組織 | [GuangFuHero](https://github.com/GuangFuHero) |

我們會持續更新這個專案與相關資料，歡迎隨時回來看看。

---

## 專案緣起

本專案是數位發展部「運用公民科技強化公共服務韌性」計畫中，「共用元件庫」的成果，由[光復超人](https://github.com/GuangFuHero)團隊開發與維護。

**同一組織的相關專案**

| 專案 | 說明 | 授權 |
|---|---|---|
| [`legacy-version`](https://github.com/GuangFuHero/legacy-version) | 光復超人原始版本（前後端） | GPL v3 |
| [`brand-design-alignment`](https://github.com/GuangFuHero/brand-design-alignment) | UI 設計規範與品牌一致性元件 | CC BY-NC-SA 4.0 |
