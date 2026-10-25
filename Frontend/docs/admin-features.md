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

`/` 導向 `/dashboard`。Portal layout 要求登入 cookie；未登入時導向 `/login?callbackUrl=/`。Backend 負責各 API 的 permission checks。兩個 app 共用 document layout、基本 providers 和 server proxy handlers；各 app 保留自己的 query cache。

## 已存在的 Admin Modules

`libs/modules/src` 內目前已有：

- `admin/announcement`
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

### `/announcements`

- 對應的 module 位於 `admin/announcement`
- 列出所有啟用中的公告，可發布（建立草稿後啟用）與關閉公告
- 每個頁面最多顯示一則公告；發布會取代目標頁面的公告。前後台共用的公告被取代或關閉時，兩邊同時停止顯示
- 發布前列出將被取代的公告
- 歷史紀錄使用共用 Timeline，從 announcements 排除未發布草稿，依最近發布時間排序，顯示目前文字、最近發布者與發布時間，以及顯示中／已下架狀態。後端尚未提供關閉與取代事件，也不保留先前文字或發布紀錄

## 目前缺口

部分列表與管理頁仍使用 demo 資料或 placeholder。`@rescue-frontend/data-access/admin` 已提供 TanStack Query hooks，REST 使用 generated OpenAPI types，GraphQL 使用 urql 與 The Guild typed documents。後續頁面可直接串接這些 hooks；一般錯誤由共用 query client callback 顯示 error toast。

頁面與 shell 的 optional reads 必須用對應的 capability 控制 query 的 `enabled`，取得權限前保持 `false`，失去權限時隱藏 cached data。任一 active admin query 的 permission 403 都會讓 `AdminShell` 在目前 URL 顯示整頁 403；mutation failures 仍走原本的 error handling。

## 建議閱讀順序

若要接手 admin：

1. 先看 `apps/admin/src/app/(portal)/layout.tsx` 與 [admin README](../apps/admin/README.md)
2. 再看 `libs/modules/src/shell/admin/*`
3. 再看 `station/admin/*`、`ticket/admin/*`、`admin/user/*`
4. 地圖相關則補看 `libs/modules/src/map/*`
