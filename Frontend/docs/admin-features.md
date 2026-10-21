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

### `/stations`（資源站點管理 v2，ADMIN-026）

- `page.tsx` 掛載 `StationManagementPage`（`libs/modules/src/station/admin/station-management/`），接真實 API
- 狀態統計（`/analytics/stations/data` 各營運狀態數量）、篩選（類型、營運狀態、指派 Team、官方認定、更新時間、關鍵字，存在 URL）、列表／地圖切換
- 列表會分頁讀完權限範圍內所有站點（上限 5,000），官方認定、更新時間篩選與排序（開設中優先、最近更新優先）在前端做
- 站點抽屜：基本資料、照片、資源、聯絡資訊（無 `station.view_pii` 時顯示遮罩值且不可改）、版本歷史；`/stations?station=<uuid>` 直接開啟，給通知連結用
- 新增／編輯／刪除站點、列表上直接改營運狀態與指派 Team；後台新增的站點一律 `source: "official"`（`/map` 的新增抽屜也是）
- 前台修改建議審查：依欄位決定採用／不採用（可改寫入值），一次送出附一則審核備註（`mergeStationSuggestions`）
- 批次匯入（試算 → 欄位對應 → 確認，失敗列可下載）與匯出（單一類型，CSV／Excel）
- 權限一律看後端回的 capabilities（`station.add/edit/delete/review/assign/import/export/view_history/view_pii`）

**後端缺口（尚無 API，畫面未做或以前端方式替代）：**

- 已刪除站點無法重新啟用，也無法回溯到某個版本（沒有 restore／rollback）
- 修改建議沒有記錄「投稿時的值」：衝突判斷改用版本歷史，欄位在第一筆建議之後有被改過就標「衝突」；資源（station_property）欄位因歷史沒有 property uuid，只能保守判斷
- `stations` 查詢沒有 source／更新時間篩選，也不能排序
- 匯入無法強制 `source=official`：要標示官方，檔案的 source 欄需填 `official`
- 匯出只能選一種類型，不套用列表篩選
- 站點照片只能附 URL，沒有上傳端點
- 群眾評分沒有站點層級的讀取與統計，且 `crowdSourcings` 原始資料公開回傳 `userUuid`
- 營運狀態文字（開設中／暫時關閉／永久關閉）待產品確認是否改為兩態，只需改 `model/status.ts`

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
