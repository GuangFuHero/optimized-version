# Admin 功能現況

本文件只描述目前 `Frontend` repo 已存在的 admin 程式碼，不再把未實作規劃和現況混寫。

## 路由現況

Admin 使用獨立的 Next.js 16 app `apps/admin`，預設 port 為 3001。頁面位於 `src/app/(portal)`，URL 不含 `/admin` prefix。Demo 的 `/admin/:path*` 會導向 admin app，部署時以 `ADMIN_APP_URL` 指定網址。

- `/dashboard`
- `/map`
- `/stations`
- `/tickets`
- `/users`
- `/teams`
- `/announcements`
- `/briefings`
- `/audit`
- `/settings`

`/` 導向 `/dashboard`。Portal layout 要求 NextAuth session；未登入時導向 `/login?callbackUrl=/`。Backend 負責各 API 的 permission checks。兩個 app 共用 document layout、基本 providers 和 server proxy handlers；各 app 保留自己的 query cache。

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

### `/map`

- `page.tsx` + `admin-map-page.client.tsx` 已存在
- 使用 `@rescue-frontend/modules` 的 `Map`
- 已有「新增站點 / 新增任務」控制 UI
- 依賴 `StationCreateDrawer`、`TicketCreateDrawer`
- 只有登入狀態會顯示建立 controls

### `/stations`

- 已有 page 檔案
- 對應的 reusable modules 位於 `station/admin/*`

### `/tickets`

- 已有 page 檔案
- 對應的 reusable modules 位於 `ticket/admin/*`

### `/users`

- 已有 page 檔案
- 對應的 reusable modules 位於 `admin/user/user-list`

## 目前缺口

部分列表與管理頁仍使用 demo 資料或 placeholder。`@rescue-frontend/data-access/admin` 已提供 TanStack Query hooks，REST 使用 generated OpenAPI types，GraphQL 使用 urql 與 The Guild typed documents。後續頁面可直接串接這些 hooks，共用 query client callback 會顯示 error toast。

## 建議閱讀順序

若要接手 admin：

1. 先看 `apps/admin/src/app/(portal)/layout.tsx` 與 [admin README](../apps/admin/README.md)
2. 再看 `libs/modules/src/shell/admin/*`
3. 再看 `station/admin/*`、`ticket/admin/*`、`admin/user/*`
4. 地圖相關則補看 `libs/modules/src/map/*`
