# 島嶼守望：前端（Frontend）

本目錄是「島嶼守望（救災資訊平台）」的前端 monorepo，使用 **Nx 22 + pnpm workspaces** 管理：

- `apps/demo`：民眾與志工前台（`:3000`）
- `apps/admin`：救災單位與管理員後台（`:3001`）
- `libs/*`：前後台共用的 UI 設計系統（`@rescue-frontend/ui`）、業務模組（`@rescue-frontend/modules`）與資料存取層（`@rescue-frontend/data-access`）

兩個 app 都使用 **Next.js 16（App Router）+ React 19**。

> 動手修改前端或 UI 前，請務必先讀 **[`Frontend/CLAUDE.md`](CLAUDE.md)** 與 **[`docs/design-system.md`](docs/design-system.md)**。

---

## 目錄

1. [技術棧](#技術棧)
2. [事前準備](#事前準備)
3. [快速開始](#快速開始)
4. [兩種開發模式](#兩種開發模式)
5. [環境變數與本機注意事項](#環境變數與本機注意事項)
6. [專案結構](#專案結構)
7. [常用指令與測試](#常用指令與測試)
8. [開發規範](#開發規範)
9. [在手機上測試](#在手機上測試)
10. [疑難排解](#疑難排解)
11. [文件索引](#文件索引)

---

## 技術棧

| 類別 | 使用技術 |
| :--- | :--- |
| **Monorepo** | Nx 22 + pnpm workspaces |
| **App framework** | Next.js 16（App Router）、React 19 |
| **UI 與地圖** | MUI 9 + Emotion、Leaflet + leaflet.markercluster、Storybook |
| **資料存取** | urql 5（前台含 graphcache）、GraphQL Code Generator、openapi-fetch、TanStack Query |
| **驗證** | 後端核發的 `HttpOnly` session cookie；前端透過 Next.js BFF proxy 轉發（`/api/v1/*`、`/api/graphql`） |
| **語言與工具** | TypeScript 5.9（strict）、Vitest 5、ESLint 9（flat config）、Prettier |

---

## 事前準備

| 工具 | 版本 | 什麼時候需要 |
| :--- | :--- | :--- |
| **Node.js** | `>= 22` | 一定需要 |
| **pnpm** | 由 `corepack enable` 自動依 `packageManager` 安裝 | 一定需要 |
| **Docker Desktop** | 最新穩定版 | 要在本機跑真實後端與資料庫時需要 |
| **Python 3.13 + `uv`** | `3.13` | 執行 `pnpm schemas:generate`（從後端重新匯出 GraphQL / OpenAPI schema）時需要 |

---

## 快速開始

最簡單的方式是在**專案根目錄（`/`）**執行 `pnpm setup` 與 `pnpm dev`，會自動幫你把前後端環境變數、後端 Docker 與前端全部跑起來。

若你想在 `Frontend/` 目錄下單獨操作前端：

```bash
cd Frontend
corepack enable
pnpm install
cp -n .env.example .env
pnpm dev
```

`pnpm dev` 會透過 Nx 同時啟動三個服務：

| 服務 | 網址 | 單獨啟動指令 |
| :--- | :--- | :--- |
| **前台 `demo`** | <http://localhost:3000> | `pnpm dev:demo` |
| **後台 `admin`** | <http://localhost:3001> | `pnpm dev:admin` |
| **Storybook (`ui`)** | <http://localhost:6006> | `pnpm dev:ui` |

---

## 兩種開發模式

| 模式 | 適合情境 | 需要啟動後端 Docker 嗎？ |
| :--- | :--- | :--- |
| **A. 只開發 UI 元件（Storybook）或跑前端單元測試** | 修改 `libs/ui` 基礎元件、看 Storybook 或跑 `pnpm test` | **不需要** |
| **B. 接本機後端開發完整頁面（預設）** | 一般功能開發、前後台頁面聯調、測試登入與 RBAC 權限 | **需要** |

### A. 只開發 UI 元件（Storybook）

```bash
pnpm dev:ui
```

使用 stories 裡的假資料開發，打開 <http://localhost:6006>，完全不需要啟動後端。Stories 套用共用的 MUI theme，包含 icon gallery 與可互動元件。

### B. 接本機後端（預設）

1. 在專案根目錄執行過一次 `pnpm setup`（或依 [`Backend/README.md`](../Backend/README.md) 啟動後端 Docker、跑 migration 與灌入 seed）。
2. 確認 <http://localhost:8000/docs> 打得開。
3. 執行 `pnpm dev`，使用預設測試帳號登入（完整帳號列表見根目錄 [`README.md`](../README.md#本機測試帳號與驗證碼查看)，例如志工 `avol01@mock.test` / `Mock1234!`，或團隊管理員 `agov01@mock.test` / `Mock1234!`）。

---

## 環境變數與本機注意事項

前端統一使用 **`Frontend/.env`**（由 `Frontend/.env.example` 複製，已加入 `.gitignore`）。透過 Nx 啟動時，這份設定會同時提供給前台 `demo` 與後台 `admin`：

| 變數 | 說明 | 本機預設值 |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | 瀏覽器端解析的後端 REST API 基底網址（**注意結尾有 `/api`**） | `http://localhost:8000/api` |
| `API_BASE_URL` | Next.js Server 端（BFF proxy）轉發的後端 REST API 基底網址 | `http://localhost:8000/api` |
| `GRAPHQL_URL` | 後端 GraphQL endpoint | `http://localhost:8000/graphql` |
| `SITE_APP_URL` | 前台網址（供後台產生團隊邀請連結、QR Code 與跳轉回前台地圖時使用） | `http://localhost:3000` |
| `ADMIN_APP_URL` | 後台網址（供前台 `/admin` 路由跳轉至後台使用） | `http://localhost:3001` |
| `AUTH_COOKIE_PREFIX` | 登入 Cookie 名稱前綴，**必須與 `Backend/.env` 的同名變數一致** | `wgdev` |

- 前端沒有任何登入用的 OAuth secret；Google 與 LINE 登入一律由後端處理，詳見 [`docs/authentication.md`](docs/authentication.md)。
- 後台專屬的架構說明見 [`apps/admin/README.md`](apps/admin/README.md)。

---

## 專案結構

```text
Frontend/
  apps/
    admin/                     # 獨立後台（:3001），頁面使用 root routes
      src/app/(portal)/        # 需登入的後台頁面：/dashboard、/map、/tickets、/stations、/teams、/users 等
    demo/                      # 民眾前台（:3000），包含 auth 頁面與 BFF proxy
      src/app/
        (auth)/                # 公開認證頁面：登入、註冊、忘記密碼、團隊邀請等
        (site)/                # 前台頁面：救災地圖、任務清單、我的任務、帳號設定、申請成為後台人員
        api/                   # Next.js BFF proxy（/api/v1/*、/api/graphql）
      src/modules/             # app 專屬組裝層
      src/providers/           # client-side context providers
  libs/
    ui/                        # @rescue-frontend/ui：designTokens、MUI theme、icons、通用 UI primitives
    modules/                   # @rescue-frontend/modules：具備業務語意、可重用的功能模組
      src/auth/                #   登入與認證相關
      src/admin/               #   後台業務模組（ticket-board、map、station、members、duplicate-review...）
      src/site/                #   前台業務模組（map、list、task-match、station-report、point-share...）
      src/ticket/              #   跨端任務單領域邏輯與表單
      src/station/             #   站點領域邏輯
      src/role-request/        #   申請成為後台人員與入隊審核
      src/session/             #   前端登入階段與 token refresh 協調
    data-access/               # @rescue-frontend/data-access：GraphQL documents、codegen 產物、REST client、urql 與 TanStack Query hooks
  docs/                        # 詳細開發文件，入口是 docs/README.md
```

### Workspace packages 運作方式

- 每個 app 和 library 都是 private workspace package，各自在 `package.json` 宣告依賴，內部依賴使用 `workspace:*` 連結，**不使用** TypeScript path aliases。
- Libraries 透過 `exports` 欄位提供 `src/index.ts`（`@rescue-frontend/data-access` 另提供 `/admin` 與 `/server` 子路徑）。
- Next.js 的 `transpilePackages` 會直接編譯 libraries 的 TypeScript 原始碼，開發時不需要先 build libraries。

---

## 常用指令與測試

在 `Frontend/` 目錄下執行：

| 指令 | 說明 |
| :--- | :--- |
| `pnpm dev` | 透過 Nx 同時啟動 `demo`（`:3000`）、`admin`（`:3001`）與 Storybook（`:6006`） |
| `pnpm dev:demo` / `pnpm dev:admin` / `pnpm dev:ui` | 只單獨啟動其中一個服務 |
| `pnpm test` | **執行所有前端 Vitest 測試**（不需要啟動後端或設定 `.env`） |
| `pnpm affected:test` | 只對受變更影響的 projects 執行測試 |
| `pnpm typecheck` | 檢查所有 packages 的 TypeScript 型別（兩個 app 會先跑 `next typegen` 產生 route types） |
| `pnpm --filter @rescue-frontend/ui typecheck` | 只檢查單一 package 的型別 |
| `pnpm lint` | 使用 ESLint 檢查所有 projects |
| `pnpm format` / `pnpm format:check` | 透過 `nx format` 套用或檢查 Prettier 排版 |
| `pnpm build` / `pnpm build:demo` / `pnpm build:admin` | 建置全部或單一應用程式 |
| `pnpm schemas:generate` | 從 `../Backend` 匯出最新 GraphQL / OpenAPI schema 並執行 codegen（需安裝 Python 3.13 + `uv`，**不需**啟動後端容器） |
| `pnpm codegen` | 使用已存於 repo 內的 schema 執行 GraphQL / OpenAPI codegen |
| `pnpm graph` | 開啟 Nx project 依賴關係圖 |
| `pnpm reset` | 清除 Nx 快取 |

**CI 檢查流程（[`.github/workflows/frontend-ci.yaml`](../.github/workflows/frontend-ci.yaml)）**：
當 `Frontend/**` 或 `Backend/**` 有變更時，CI 會依序執行：
1. `pnpm schemas:generate` 並用 `git diff --exit-code` 確認產生出的型別檔與 commit 完全一致
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`

---

## 開發規範

1. **Design Tokens 與視覺規範（必讀）**：所有顏色、圓角、字級、間距、陰影一律從 `@rescue-frontend/ui` 的 `designTokens` 取得，禁止在頁面或模組中硬編碼 hex/rgba 色碼或數字圓角。完整規則見 [`CLAUDE.md`](CLAUDE.md) 與 [`docs/design-system.md`](docs/design-system.md)。
2. **檔案命名**：`Frontend/` 內的檔案與資料夾一律使用 `kebab-case`；TypeScript / React export 的 symbol 使用 `camelCase` 或 `PascalCase`。
3. **分層與依賴方向**：`apps -> modules -> ui -> utils`，`ui` 不可反向依賴 `modules` 或 `apps`，也不要建立籠統的 `shared` 資料夾。詳見 [`docs/frontend-working-principles.md`](docs/frontend-working-principles.md)。
4. **資料存取與 Codegen**：新增 GraphQL query/mutation 或使用 REST hook 的流程見 [`docs/data-access.md`](docs/data-access.md)。
5. **驗證與 BFF Proxy**：登入流程、Session/JWT 模型與 BFF route 對應關係見 [`docs/authentication.md`](docs/authentication.md)。
6. **已知問題**：開發前可先參考 [`docs/known-issues.md`](docs/known-issues.md)。

---

## 在手機上測試

平台的主要使用場景包含災區現場，開發前台行動版介面時建議實際在手機或 Chrome DevTools 行動裝置模擬器驗證：

1. 手機與電腦連上同一個區網 Wi-Fi。
2. 由於前端 API 請求透過 Next.js BFF proxy（`/api/v1/*`、`/api/graphql`）由 Next.js Server 轉發給本機 `:8000`，應優先使用相對路徑走 proxy，避免瀏覽器直接請求 `localhost:8000`（在手機上 `localhost` 會指向手機自己）。
3. 若需在手機實機測試完整登入，請確認 `Backend/.env` 的 `AUTH_ALLOWED_ORIGINS` 加入你的電腦區網 IP（如 `http://192.168.x.x:3000`）。

---

## 疑難排解

| 狀況 | 可能原因與處理 |
| :--- | :--- |
| 頁面顯示網路錯誤或 API 502/500 | 後端容器尚未啟動，請在根目錄執行 `pnpm dev`，並確認 <http://localhost:8000/docs> 能打開 |
| 登入成功但馬上被登出，或一直出現 401 | 1. 檢查 `Frontend/.env` 與 `Backend/.env` 的 `AUTH_COOKIE_PREFIX` 是否一致（預設皆為 `wgdev`）<br>2. 檢查 `Backend/.env` 是否存在且設定了 `AUTH_COOKIE_SECURE=false` |
| 後台（`:3001`）API 請求 404 或邀請連結網址不對 | 忘記建立 `Frontend/.env`，或 `API_BASE_URL` 漏寫了結尾的 `/api`（正確為 `http://localhost:8000/api`） |
| CI 在 `git diff --exit-code` 步驟失敗 | 後端改了 API 或 GraphQL schema 但尚未同步前端型別，請在 `Frontend/` 執行 `pnpm schemas:generate` 並 commit 變更 |
| 執行 `pnpm schemas:generate` 失敗 | 本機未安裝 Python 3.13 或 `uv`，請先安裝 `uv` 並在 `Backend/` 執行過 `uv sync` |
| Port `3000` / `3001` / `6006` 被佔用 | 用 `lsof -i :3000` 找出佔用該 port 的舊程序並關閉 |

---

## 文件索引

完整的前端架構、認證、權限與設計系統文件清單與建議閱讀順序，請見 **[`docs/README.md`](docs/README.md)**。
