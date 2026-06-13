# Frontend Library Layering Inventory

本文件記錄 `libs/modules/src` 目前的分層現況，供後續搬遷與 reviewer 快速確認 ownership。目標方向與判斷規則見 [`frontend-working-principles.md`](frontend-working-principles.md)；本文件只反映「現在長什麼樣子」，會隨重構持續更新。

> 最後更新：2026-06-13。`admin/*` 部分僅同步目錄結構，內部實作尚未納入本次審查範圍。

---

## Foundation 留在 libs/ui

- `Icons` / `UiIcon`：透過 `libs/ui/src/foundation/icons` 對外暴露，底層實作位於 `libs/ui/src/components/Icon`
- `theme` / `lightTheme` / `darkTheme`、`colorSchemes` / `spacing` / `shape` / `typography`：位於 `libs/ui/src/foundation/theme`、`libs/ui/src/theme`
- `libs/ui/src/components/ListPagination`：通用分頁元件

---

## libs/modules 現有業務模組

### `auth/` — 登入 surface

- `auth/login`：登入表單、品牌標頭等（原自 `libs/ui/src/modules/auth` 搬移）

### `admin/` — 後台 surface（尚未納入本次審查）

- `admin/field-configuration`：動態欄位設定面板
- `admin/invite-side-sheet`：邀請使用者側欄
- `admin/map`：地圖元件、controller、hooks、mock data（`components`、`hooks`、`utils`、`constants.ts`、`types.ts`、`mock-data.ts`）
- `admin/shared`：admin 內部共用元件（`admin-list-page-layout`、`detail-modal-frame`）— 見下方「`shared` 命名現況」
- `admin/shell`：sidebar、top navbar 等 layout chrome，內部以 `components/` 收納（`sidebar`、`top-navbar`、`mobile-top-navbar`、`menu-glyph`、`layout` 常數等）
- `admin/station`：站點管理（`station-create`、`station-detail`、`station-list`）
- `admin/ticket`：工單管理（`ticket-create`、`ticket-detail`、`ticket-list`、`ticket-report`）
- `admin/user`：使用者管理（`user-list`）

### `site/` — 前台 surface

> 對應 `apps/demo/src/app/(site)/**`。此 surface 已有多個 reusable modules，下方依複雜度分類。

#### 複合 feature（多個 component / hooks / types）

- `site/map`：前台地圖核心 — route/viewport/live-data hooks、`SiteMapControls`。marker / closure area 轉換邏輯（`mapStationToMarker`、`mapTicketToMarker`、`mapClosureAreaToOverlay` 等）已集中於 `markers.ts`，供 `use-site-map-live-data.ts` 與 `use-live-rescue-map-markers.ts`（`usePaginatedRescueMapMarkers`）共用。
- `site/route`：共用路由狀態（`SiteRouteState`）的 parse/serialize 與 `useSiteRouteState`，供 `/map`、`/list` 共用
- `site/list`：`/list` 頁面主視圖（`SiteListView`、`SiteListRow`）
- `site/shell`：前台外殼 — `SiteShell`、top navbar、mobile top navbar、sidebar、user menu、header search。
- `site/point-share`：分享卡片 / QR code / OG metadata 解析（`resolvePointShareTargetFromRoute` 目前仍依賴 mock data，見 [`known-issues.md`](known-issues.md#31-point-share-的-og--分享內容仍使用-mock-data) 3.1）
- `site/station-report`：站點現況回報（localStorage-backed）
- `site/task-match`：任務認領 / 任務配對紀錄（localStorage-backed）

#### 共用 primitives

- `site/shared`：`SiteControlSurface`、`SiteDataTypeToggle`、`SiteSubTypeFilter` — 同一 surface 內多個 feature 共用的小型 UI primitives

### `brand/`

- 品牌 icon / 素材（`GuangFuBrandIcon` 等）

---

## `shared` 命名現況

[`frontend-working-principles.md`](frontend-working-principles.md) 第 4 節原則上不建立籠統的 `shared` 根資料夾。目前 `libs/modules/src` 下有三個以 `shared` 命名的目錄：

- `libs/modules/src/shared/station-type-options`：**跨 surface**（被 `site/route/constants.ts` 使用），與原則牴觸最明顯，已列入 [`known-issues.md`](known-issues.md#52-libsmodulessrcsharedstation-type-options-違反不使用-shared-原則) 5.2。
- `libs/modules/src/admin/shared`、`libs/modules/src/site/shared`：屬於 surface 內部共用（符合提升規則第 3 條的精神），但命名上仍是 `shared`，未來如需大幅擴充建議改用更具語意的名稱（例如 `admin/common`、`site/common`）。優先度低，非阻塞。

---

## App-local 暫留項

- `apps/demo/src/app/**`：Next.js route、layout、providers 與 app orchestration
- `apps/demo/src/modules/auth/**`：登入/註冊/重設密碼/帳號安全等 app-local composition（`login`、`session`、`api`、`shared`）
- `apps/demo/src/modules/map/**`：app-local 地圖頁面 composition

---

## Canonical Imports

- foundation-only imports 使用 `@rescue-frontend/ui`
- domain-aware reusable UI 使用 `@rescue-frontend/modules`
