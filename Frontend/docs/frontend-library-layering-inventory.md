# Frontend Library Layering Inventory

本文件記錄 `libs/modules/src` 目前的實際分層。它是現況快照，不是理想架構草圖。

> 最後更新：2026-06-14

## Foundation 留在 `libs/ui`

- `foundation/icons`
- `foundation/theme`
- `theme/*`
- `components/Icon`
- `components/ListPagination`

`libs/ui` 目前仍只承接 design system / primitive 級責任，沒有業務流程。

## `libs/modules` 現況

目前採 capability-first 結構，不是以 `site` / `admin` 當第一層。

### `auth/`

- `auth/login`
  - `components/*`
  - `theme/auth-theme.ts`
  - `utils/identity-validation.ts`

### `brand/`

- `brand/assets/*`
- `guang-fu-brand-icon.tsx`

### `list/`

- `site-list-view.tsx`
- `site-list-row.tsx`

### `map/`

- `components/*`
- `hooks/*`
- `site/*`
- `utils/*`
- `constants.ts`
- `types.ts`
- `mock-data.ts`

說明：

- 地圖核心能力已集中在 `map/*`
- site map 專屬 route / viewport / live-data hook 在 `map/site/*`

### `point-share/`

- 分享目標解析
- 分享連結
- QR code
- `PointShareDrawer`

### `route/`

- `parse.ts`
- `serialize.ts`
- `constants.ts`
- `types.ts`
- `use-site-route-state.ts`
- `controls/*`

### `shell/`

- `shell/site/*`
- `shell/admin/*`
- `layout.ts`
- `sidebar.ts`
- `menu-glyph.ts`

### `station/`

- `admin/station-create/*`
- `admin/station-detail/*`
- `admin/station-list/*`
- `report/*`
- `type-options.ts`

### `ticket/`

- `admin/ticket-create/*`
- `admin/ticket-detail/*`
- `admin/ticket-list/*`
- `admin/ticket-report/*`
- `task-match/*`
- `status.ts`

### `admin/`

這一層目前只保留較明確屬於 admin domain、但尚未歸進其他 capability 的內容：

- `admin/field-configuration`
- `admin/invite-side-sheet`
- `admin/shared/detail-modal-frame`
- `admin/user/user-list`

## App-local 暫留項

以下仍留在 `apps/demo`，因為它們綁定 Next.js route 或 app-specific orchestration：

- `src/app/**`
- `src/modules/auth/login/*`
- `src/modules/auth/session/*`
- `src/modules/auth/api/*`

## 對外匯出現況

`libs/modules/src/index.ts` 目前主要對外暴露：

- auth login UI
- route helpers
- `SiteListView`
- `Map`
- site map hooks / controls
- point-share utilities
- `SiteShell`
- station drawers / report
- ticket drawers / task-match

目前沒有把整個 admin surface 全量從 root barrel 對外公開，admin 多數仍由 app route 直接 import 對應 module。
