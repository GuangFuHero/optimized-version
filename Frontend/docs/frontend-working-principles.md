# 前端工作原則與結構方針

本文件描述目前 `Frontend` monorepo 採用的分層原則。目的是避免 framework 邊界、UI foundation、業務 modules 與資料存取再次混在一起。

## 核心原則

1. `apps` 承接 Next.js route 與 framework 邊界。
2. `libs/ui` 承接通用 UI foundation，不承接業務流程。
3. `libs/modules` 承接可重用的業務 UI modules。
4. `libs/data-access` 承接 GraphQL / REST client 與資料存取封裝。
5. 共用內容要放在有語意的目錄，不用模糊的根層 `shared`。

## 依賴方向

```text
apps -> modules -> ui
apps -> data-access
modules -> data-access
ui -> data-access (generated types only)
```

補充：

- `ui` 不可依賴 `modules` 或 `apps`
- `data-access` 不可依賴 `apps`
- `apps` 可以依賴下層 library，但應只保留 route、metadata、provider、BFF 這類 app 邊界

## 各層責任

### `apps/demo`

適合放：

- `page.tsx`
- `layout.tsx`
- route handlers
- metadata
- auth gate / redirect
- dynamic import orchestration
- app-local composition

目前例子：

- `apps/demo/src/app/api/graphql/route.ts`
- `apps/demo/src/app/api/v1/[...segments]/route.ts`
- `apps/demo/src/app/(site)/map/[[...segments]]/*`

### `libs/ui`

適合放：

- theme
- tokens
- icons
- reusable UI primitive

不適合放：

- auth / map / station / ticket 這類帶產品語意的流程

### `libs/modules`

適合放：

- `auth/login`
- `map`
- `route`
- `list`
- `point-share`
- `shell`
- `station`
- `ticket`
- `admin/members`

判斷標準：

- 帶明確產品能力語意
- 可被多個 route 或 page composition 重用
- 仍值得在 library 層維護

### `libs/data-access`

適合放：

- GraphQL documents
- codegen 產物
- GraphQL / REST client

不適合放：

- Next.js cookie / request / response 邊界
- page-specific orchestration

## Capability-first 原則

`libs/modules/src` 目前以 capability 作為第一層 ownership，例如：

- `map/*`
- `route/*`
- `shell/*`
- `station/*`
- `ticket/*`

若某能力內仍有 surface-specific workflow，再往下一層切：

- `shell/admin/*`
- `shell/site/*`
- `station/admin/*`
- `ticket/admin/*`
- `map/site/*`

這樣可以避免把「可跨 surface 重用的能力」綁死在 `site/*` 或 `admin/*`。

## 關於 `shared`

原則上不要在 library 根層新增籠統 `shared` 目錄，因為它不表達 ownership。

可接受的情況：

- feature 內部的小範圍共用，例如 `admin/shared/detail-modal-frame`

不可接受的情況：

- 跨很多能力卻沒有語意名稱的根層 `shared/*`

## 提升規則

1. 只服務單一路由：留在 `apps/demo`
2. 只服務單一 feature：留在該 feature 目錄
3. 同一 capability 內多處重用：提升到該 capability 內具名位置
4. 跨 capability 但仍有產品語意：建立新的具名 family
5. 已無業務語意且可廣泛重用：提升到 `libs/ui`

## State、表單與 render

- Server state 由 TanStack Query 持有，讀取與失效規則見 [data-access](data-access.md)。不要把 query data 複製到 Zustand。
- 跨元件的 client state 使用 Zustand。地圖 viewport、選取與 framing store 依畫面建立；共用 drawer 入口與偏好設定使用共用 store。只在單一元件使用的開關可保留 React state。
- 表單與 inline editor 的 draft values 使用 TanStack Form；API 欄位從 generated GraphQL / OpenAPI contracts 推導。地圖幾何、流程 stage、非同步請求與取消後的回應判斷仍由原本的 workflow 負責。
- 表單開啟時的初值需固定，避免 refetch 覆寫尚未編輯的欄位。驗證時機、錯誤消失時機與取消後重開的內容都屬於行為契約。根層 submit errors 若需在編輯時保留，使用 `dontValidate: true`，再清除實際修改欄位的錯誤。
- 有欄列、排序、分頁或差異篩選的資料表使用 TanStack Table。共用樣式由 `ui/DataTable` 提供；重複比對表保留自己的 merged-cell grid，由 Table 處理 rows 與差異篩選。
- Search params 使用 nuqs。前台 URL 由 `useSiteRouteState` 處理，後台站點與任務 board 由 `useBoardSearchParams` 處理；sign-in return marker 由 `useReturnQuery` 消費。保留原本的 push / replace、shallow / server navigation 與一次性讀取規則，不替 local filters 新增 URL persistence。
- 兩個 Next app 啟用 React Compiler；ESLint 啟用 Rules of React。讓 compiler 處理 render 計算，無須預先加 `useMemo`。Effects 留給 DOM、Leaflet、瀏覽器事件、計時器與外部狀態同步；由事件直接造成的狀態變更放回 handler 或 workflow hook。
