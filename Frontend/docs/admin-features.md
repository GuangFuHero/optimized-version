# Admin 功能現況

本文件只描述目前 `Frontend` repo 已存在的 admin 程式碼，不再把未實作規劃和現況混寫。

## 路由現況

`apps/demo/src/app/admin` 目前有以下頁面檔案：

- `/admin/map`
- `/admin/stations`
- `/admin/tickets`
- `/admin/users`

但目前 `apps/demo/src/app/admin/layout.tsx` 會直接 `redirect('/map')`，因此整個 `/admin/*` route tree 實際上是停用狀態。

結論：

- admin 頁面與對應 modules 已經存在
- admin 路由目前沒有對外開放
- 若要啟用，第一步是先處理 `admin/layout.tsx` 的 redirect 與 auth gate

## 已存在的 Admin Modules

`libs/modules/src` 內目前已有：

- `admin/field-configuration`
- `admin/invite-side-sheet`
- `admin/user/user-list`
- `shell/admin/*`
- `station/admin/station-create`
- `station/admin/station-detail`
- `station/admin/station-list`
- `ticket/admin/ticket-create`
- `ticket/admin/ticket-detail`
- `ticket/admin/ticket-list`
- `ticket/admin/ticket-report`
- `map/*` 與 `map/components/*`

其中有些命名帶 `admin`，有些已被提升成 capability-first 結構，例如地圖核心能力在 `map/*`，而不是 `admin/map/*`。

## 各頁面目前實作狀態

### `/admin/map`

- `page.tsx` + `admin-map-page.client.tsx` 已存在
- 使用 `@rescue-frontend/modules` 的 `Map`
- 已有「新增站點 / 新增任務」控制 UI
- 依賴 `StationCreateDrawer`、`TicketCreateDrawer`
- 只有登入狀態會顯示建立 controls

### `/admin/stations`

- 已有 page 檔案
- 對應的 reusable modules 位於 `station/admin/*`

### `/admin/tickets`

- 已有 page 檔案
- 對應的 reusable modules 位於 `ticket/admin/*`

### `/admin/users`

- 已有 page 檔案
- 對應的 reusable modules 位於 `admin/user/user-list`

## 目前缺口

以 repo 現況來看，admin 主要缺口不是「完全沒模組」，而是：

1. route tree 被 `admin/layout.tsx` 強制 redirect，功能無法實際進入
2. admin 專用 auth shell / route guard 仍被註解
3. 文件與實作之間曾混入大量「未來可能做」的規劃敘述，容易誤判哪些功能已存在

## 建議閱讀順序

若要接手 admin：

1. 先看 `apps/demo/src/app/admin/layout.tsx`
2. 再看 `libs/modules/src/shell/admin/*`
3. 再看 `station/admin/*`、`ticket/admin/*`、`admin/user/*`
4. 地圖相關則補看 `libs/modules/src/map/*`
