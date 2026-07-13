# 前台地圖互動架構

本文件描述目前 `/map` 與 `/list` 共享的前台地圖狀態分層，以及 route metadata / point-share 的接法。

## 路由入口

前台相關頁面：

- `apps/demo/src/app/(site)/map/[[...segments]]/page.tsx`
- `apps/demo/src/app/(site)/map/[[...segments]]/site-map-page.client.tsx`
- `apps/demo/src/app/(site)/map/[[...segments]]/site-map-view.client.tsx`
- `apps/demo/src/app/(site)/list/[[...segments]]/page.tsx`

目前 `/map` 的 client 入口會先延遲 `120ms` 再 mount Leaflet 畫面，避免 initial hydration / mount 時序問題。

## 狀態分層

### 1. URL / route semantics

由 `libs/modules/src/route/*` 處理：

- `parseSiteRouteState`
- `createSiteHref`
- `useSiteRouteState`
- `SITE_*` 常數與 subtype 選項

這一層負責：

- `baseLayer`
- `dataType`
- `subDataTypes`
- `selectedMarkerId`
- `search`
- module 類型（`map` / `list`）

### 2. Viewport state

由 `libs/modules/src/map/site/use-site-map-viewport-state.ts` 處理。

這一層保存高頻變動的地圖視角：

- `position`
- `bbox`

實作刻意使用 external store，避免每次 drag / zoom 都把整棵 React tree 捲進 rerender。

### 3. Live data state

由 `libs/modules/src/map/site/use-site-map-live-data.ts` 處理。

這一層負責：

- 依 viewport 查詢 markers / closure areas
- 保存 loading / error
- 保存本地 dismiss 狀態

### 4. Leaflet render state

由 `libs/modules/src/map/components/rescue-map-canvas/*` 與 `Map` 組件處理。

這一層保存：

- `L.Map`
- tile layer
- marker / overlay layer handles

這不是 business state，而是 render engine state。

## 主要模組位置

### Capability modules

- `libs/modules/src/map/*`
- `libs/modules/src/map/site/*`
- `libs/modules/src/route/*`
- `libs/modules/src/list/*`
- `libs/modules/src/point-share/*`

### App-local composition

- `apps/demo/src/app/(site)/map/[[...segments]]/*`

app route 保留：

- Next.js `page.tsx`
- metadata 產生
- dynamic import / mount orchestration

## Metadata And Sharing

`/map` 與 `/list` 目前都會在 `generateMetadata()` 中呼叫：

- `resolvePointShareTargetFromRoute()`

用途：

- 依 route state 產生分享標題與描述
- 產生 Open Graph metadata
- 與 `PointShareDrawer` 使用的分享目標保持一致

相關檔案：

- `libs/modules/src/point-share/*`
- `apps/demo/src/app/(site)/map/[[...segments]]/page.tsx`
- `apps/demo/src/app/(site)/list/[[...segments]]/page.tsx`

## 為什麼不用單一 React State 包全部

目前實作刻意把 route、viewport、live data、Leaflet layer 拆開，原因很直接：

1. viewport 是高頻狀態，不適合放在頁面根層普通 state
2. live data 應由 viewport 驅動，但不應讓整個 scene 每次都重跑
3. Leaflet layer 比較適合 imperative 增量同步，而不是每次由 React 重建
4. URL state 需要可分享、可重建，和 render engine state 責任不同

## 目前相關功能

`SiteMapView` 目前除了一般地圖瀏覽，也整合了：

- `SiteMapControls`
- `PointShareDrawer`
- `SiteStationReportDrawer`
- `StationReportHistoryPanel`
- `TaskMatchDeleteConfirmDialog`
- `StationCreateDrawer`
- `TicketCreateDrawer`

也就是說，前台地圖不只是讀取資料，還承接了分享、回報、任務媒合與建立標記等互動。
