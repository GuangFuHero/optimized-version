# 島嶼守望 前端專案說明

本目錄為「島嶼守望（救災資訊平台）」的前端 monorepo，使用 **Nx + pnpm** 管理。`apps/demo` 是前台，`apps/admin` 是獨立後台，兩者使用 Next.js App Router，並透過 `libs/*` 共用 UI、業務 modules 與資料存取層。

---

## 技術棧

- **Monorepo**：Nx 22 + pnpm workspaces，各 app 與 library 使用自己的 `package.json`
- **App framework**：Next.js 16（App Router）、React 19
- **UI**：MUI 9 + Emotion、Leaflet / react-leaflet（地圖）
- **資料存取**：urql 5、GraphQL Code Generator、openapi-fetch、TanStack Query；前台保留 urql graphcache
- **驗證**：NextAuth 4（JWT session）+ 共用 REST proxy（`/api/v1/auth/*`）
- **語言/工具**：TypeScript 5.9（strict）、ESLint 9（flat config）、Prettier

---

## 開始使用

### 1. 安裝套件

```bash
corepack enable
pnpm install
```

### 2. 設定環境變數

```bash
cp .env.example .env.local
```

依需求填入：

- `NEXT_PUBLIC_API_BASE_URL`：後端 REST API base URL
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET` / `AUTH_SECRET`：NextAuth 設定
- `GOOGLE_MAPS_API_KEY`：地圖圖層 / 地理編碼用
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`：Google SSO（見 [`docs/authentication.md`](docs/authentication.md)）
- `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET`：LINE SSO（見 [`docs/authentication.md`](docs/authentication.md)）

### 3. 啟動開發環境

```bash
pnpm dev
```

Nx 會同時啟動 demo（`http://localhost:3000`）、admin（`http://localhost:3001`）與 Storybook（`http://localhost:6006`）。

也可用 `pnpm dev:demo`、`pnpm dev:admin` 或 `pnpm dev:ui` 單獨啟動。後台環境設定見 [admin README](apps/admin/README.md)。

---

## 專案結構

```text
Frontend/
  apps/
    admin/                  # 獨立後台，頁面使用 root routes
      src/app/(portal)/     # Dashboard、map、tickets、stations 等需登入頁面
    demo/                   # 前台、auth 與 backend proxies
      src/app/
        (auth)/             # 登入 / 註冊 / 忘記密碼 等公開頁面
        (site)/             # 前台救災地圖 / 清單 / 帳號頁面
        api/                # NextAuth、REST / GraphQL proxy、Google reverse geocode
      src/modules/          # app-local composition，尚未提升為 libs/modules 的頁面實作
      src/lib/               # server-side helpers（NextAuth options 等）
      src/providers/         # client-side context providers

  libs/
    ui/                     # @rescue-frontend/ui — design tokens、theme、icons、UI primitives
      src/foundation/        # icons / theme / tokens
      src/components/        # 通用 component primitives

    modules/                # @rescue-frontend/modules — domain-aware reusable UI modules
      src/auth/               # 登入 surface（login form、brand header 等）
      src/admin/              # 後台 surface（shell、map、ticket、station、user-management、field-configuration ...）
      src/site/               # 前台 surface（map、list、route、shell、point-share、station-report、task-match ...）
      src/brand/              # 品牌 icon / 素材
      src/shared/             # 跨 surface 共用（目前僅 station-type-options，見 docs/known-issues.md）

    data-access/            # @rescue-frontend/data-access — GraphQL documents、codegen 產物、REST client、urql client 設定

```

### Workspace packages

`apps/demo`、`apps/admin` 與 `libs/*` 都是 private workspace packages，各自在 `package.json` 宣告 dependencies。內部依賴使用 `workspace:*`，由 pnpm 連結，不使用 TypeScript path aliases。共用開發工具保留在 root `package.json`。

Libraries 透過 `exports` 提供 `src/index.ts`，`@rescue-frontend/data-access/server` 則提供 `src/server.ts`。Next.js 的 `transpilePackages` 負責編譯這些 TypeScript source，不需要先 build libraries。

在 `Frontend/` 執行 `pnpm typecheck` 會先從 backend export 最新 schemas、執行 codegen，再檢查所有 packages。Schema export 需要 `uv` 與 Python 3.13，不需啟動 backend 或 database。也可用 `pnpm --filter @rescue-frontend/ui typecheck` 單獨檢查一個 package。兩個 app 的 typecheck 會先執行 `next typegen` 產生 route types。GitHub Actions 的 `frontend-ci.yaml` 會在 frontend 或 backend 更新時執行 typecheck 與 lint。

開發 UI library 時，執行 `pnpm dev:ui` 啟動 Storybook，預設 port 為 6006。Stories 使用共用 MUI theme，包含 icon gallery 與可互動的 pagination。更多指令見 [`libs/ui/README.md`](libs/ui/README.md)。

---

## 常用指令

| 指令                                         | 說明                                                    |
| -------------------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                                  | 透過 Nx 同時啟動 demo、admin 與 Storybook                |
| `pnpm dev:demo`                              | 啟動 `demo` app 開發伺服器                              |
| `pnpm build:demo`                            | build `demo` app                                        |
| `pnpm start:demo`                            | 以 production build 啟動 `demo` app                     |
| `pnpm build`                                 | build 所有 Nx projects                                  |
| `pnpm lint`                                  | lint 所有 Nx projects                                   |
| `pnpm affected:build` / `pnpm affected:lint` | 只對受影響的 projects 執行 build / lint（適合 CI）      |
| `pnpm format` / `pnpm format:check`          | 透過 `nx format` 套用 / 檢查 Prettier 格式              |
| `pnpm graph`                                 | 開啟 Nx project dependency graph                        |
| `pnpm reset`                                 | 清除 Nx cache                                           |
| `pnpm schemas:generate`                      | Export backend schemas 並執行 GraphQL / OpenAPI codegen |
| `pnpm codegen`                               | 使用已存的 schemas 執行 GraphQL / OpenAPI codegen       |

---

## 開發規範

1. **檔案命名**：`Frontend` 內的檔案與資料夾一律使用 `kebab-case`；TypeScript / React 的 exported symbol 可繼續使用 `camelCase` 或 `PascalCase`。自動產生或外部工具管理的產物（`node_modules`、`.next`、`.nx`、`dist`、`__generated__` 等）不套用此規則。
2. **分層與依賴方向**：`apps -> modules -> ui -> utils`，`ui` 不可依賴 `modules`/`apps`，不建立籠統的 `shared` 資料夾。完整規則與判斷流程見 [`docs/frontend-working-principles.md`](docs/frontend-working-principles.md)。
3. **`libs/modules` 的 surface family**：以 `auth` / `admin` / `site` 作為第一層 ownership boundary，再依 feature 分組。目前各 surface 實際狀態見 [`docs/frontend-library-layering-inventory.md`](docs/frontend-library-layering-inventory.md)。
4. **GraphQL / 資料存取**：新增查詢、mutation 或執行 codegen 的流程見 [`docs/data-access.md`](docs/data-access.md)。
5. **驗證流程**：登入方式、Session/JWT 模型、BFF route 對應見 [`docs/authentication.md`](docs/authentication.md)。
6. **已知技術債 / TODO**：開發前可先參考 [`docs/known-issues.md`](docs/known-issues.md)，避免重複踩坑或重新引入已知問題。

---

## 文件索引

完整文件清單與閱讀順序請見 [`docs/README.md`](docs/README.md)。
