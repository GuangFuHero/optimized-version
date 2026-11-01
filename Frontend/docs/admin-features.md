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
- `station/admin/station-drawer`
- `station/admin/station-management`
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
- 依賴 `StationCreateDrawer`（共用的 `StationFormDrawer` 新增模式）、`TicketCreateSheet`（任務管理的 `TicketForm` 新增模式，以點下的位置為圖釘）
- 只有登入狀態會顯示建立 controls

### `/stations`（資源站點管理 v2，ADMIN-026）

- `page.tsx` 掛載 `StationManagementPage`（`libs/modules/src/station/admin/station-management/`），接真實 API
- 篩選（類型、營運狀態、行政區、指派 Team、官方認定、成立、更新時間、關鍵字，存在 URL）、列表／地圖切換。列表上方的狀態統計（各營運狀態的數量卡片）照設計拿掉（糖 2026-10-31）
- 列表會分頁讀完權限範圍內所有站點（上限 5,000），官方認定、更新時間篩選與排序（開設中優先、最近更新優先）在前端做
- 站點抽屜是 `/stations` 自己的 `StationDetailSheet`（libs/ui 的 `SheetFrame` 加 `variant="admin"`，詳情與編輯是同一個 frame 裡切換的 `SheetLayout`，不會疊第二層），不用地圖的 `StationDetailDrawer`：基本資料、照片、資源、聯絡資訊（無 `station.view_pii` 時顯示遮罩值且不可改）、版本歷史；`/stations?station=<uuid>` 直接開啟，給通知連結用
- 新增／編輯用 `station/form` 的 `StationForm`，與兩張 `/map` 的新增共用同一份表單與同一套欄位版面（設計稿 `station-drawer.jsx`）；新增都用 `StationFormDrawer`，`/stations` 傳 `variant="admin"`，編輯則把 `StationFormLayout` 放進站點抽屜；地址只在新增時送出（`UpdateStationInput` 不能改 `secondaryLocation`）
- 刪除站點、列表上直接改營運狀態與指派 Team；後台（`/stations`、後台地圖）新增的站點帶 `source: "official"`；前台 `/map` 不能新增站點
- 前台修改建議審查：依欄位決定採用／不採用（可改寫入值），一次送出附一則審核備註（`mergeStationSuggestions` 只收一個 `reviewNote`；ticket 寫「每一則附備註」，為了保持一次送出不可分割，維持一則）
- 批次匯入（試算 → 欄位對應 → 確認，失敗列可下載）與匯出（單一類型，CSV／Excel）
- 匯入是新增站點的一種方式：放在「新增站點」的下拉，列表空的時候也在「新增站點」旁；要同時有 `station.add` 和 `station.import` 才看得到，沒有新增權限的人不顯示（糖 2026-10-31）
- 匯入一律官方：後端批次匯入新增的站點一律存 `source: "official"`，不看檔案的 source 欄（CSV、Excel、貼上的內容都一樣）
- 匯入新增的站點用預設營運狀態（營運中），和其他新增的站點一樣；更新既有站點不改營運狀態
- 匯入視窗依設計稿：欄位對應一列三組、「試算結果」只列失敗的列（第幾列／欄位／原因）
- .xlsx 表頭列上方的標題列（Numbers 匯出時會把表格名稱放在第一列）或空白列，由後端略過
- 權限一律看後端回的 capabilities（`station.add/edit/delete/review/assign/import/export/view_history/view_pii`）

**超出 ADMIN-026 的部分（依設計稿加入）：**

- 篩選多了「行政區」（取自已載入站點）與「成立」（災後首週／首週之後，以專案 `started_at` 起算）
- 匯出一次一種類型，各類型筆數只算自己 Team 的站點（team 角色的 `station.export` 只匯出指派給該 Team 的站點）
- 地圖檢視：類型顏色圖釘、群集、圖例、縮放、飛到選取站點。改到共用的 `map/*`，但都是 admin 才開的選項，前台地圖不變

**設計稿沒有、先保留（待設計確認，糖 2026-10-31）：**

- 篩選的「更新」（24 小時內／超過 24 小時／超過 72 小時）
- 「N 欄待審」標籤（列表名稱欄與詳情頂部）
- 匯入可選 Excel 與貼上內容（設計稿只寫 CSV）

**後端缺口（尚無 API，畫面未做或以前端方式替代）：**

- 已刪除站點無法重新啟用，也無法回溯到某個版本（沒有 restore／rollback）
- 修改建議沒有記錄「投稿時的值」，也只給第一筆建議的時間：衝突判斷改用版本歷史，欄位在第一筆建議之後有被改過就標「衝突」。資源（station_property）欄位：有 `audit.view` 時用歷史的原始列比對 property uuid；沒有時歷史事件不帶 uuid，只能保守判斷（同欄位任一資源改過都算）
- `stations` 查詢沒有 source／更新時間篩選，也不能排序
- 批次匯入還不經過重複檢查（`create_station` 不走 `dedup_submission`），匯入視窗也就不提重複。#148（DEDUP-006）之後會加上「疑似重複 N 列」步驟
- 設計稿的「這份檔案是『物資集散』，這列寫的是『避難收容』」：後端沒有這項檢查，列上的 type 會直接蓋過選的類型
- 匯出只能選一種類型，不套用列表篩選
- 站點照片只能附 URL，沒有上傳端點
- 站點群（大場地底下掛多個子站，列表縮排、子站標「屬：○○」）：後端已有欄位（`stations.child_station_uuid`，指向母站），但 GraphQL 還沒開放，前端讀不到；開放後再做（糖 2026-10-31）

### `/tickets`

- 已有 page 檔案
- 對應的 reusable modules 位於 `ticket/admin/*`
- 任務詳情的「系統資訊」只有查核狀態（疑似重複的單才出現）；設計稿的公開範圍、自動封存沒有：後端的任務單沒有公開範圍欄位，也沒有自動封存規則與封存天數設定，等後端有了再加
- 每項需求可寫「進度備註」（`updateTicketTask` 的 `progressNote`，要有該單的 `ticket.edit`）；清空後儲存即刪除。需求狀態仍不能手改（BE-034）
- 地圖視圖左邊清單：範圍內有圖釘的空間排在任務單前面，點了開逐層檢視
- 新增任務的地址必填（設計稿 `tk-form.jsx`）；空間裡的一戶用那一棟的地址，不必填
- 編輯空間裡的一戶：樓層只能選那一棟的樓層（原本寫的樓層那一棟沒有時，保留成一個選項），地址與地標用那一棟的，不能改
- 匯入、匯出：任務管理的設計稿沒有，版面照資源站點的匯入與匯出（`station-v2/station-import.jsx`、`station-export-dialog.jsx`）
- 疑似重複（設計稿 `tk-table.jsx`、`tk-detail.jsx`；Dan、糖 2026-10-30 釐清）：任務單或它的需求還有沒處理完的重複配對時，列表標題旁標琥珀色「疑似重複」，抽屜上方標「查核中 · 疑似重複」，系統資訊寫「查核狀態：疑似與「X」重複」（X 是對方單的標題；沒有看得到的對方單時只寫「疑似重複」）。資料是任務單的 `verificationStatus`（ADR-443），後端只給有 `ai_duplicate.view` 的人（資料檢核員、超管），其他人拿到 null，畫面就不顯示。不做篩選；設計稿沒有的「不是重複」「兩單合一」不顯示。任務單的 `audit_status`（`auditTicket`）看板不讀也不改

**後端缺口（尚無 API，畫面未做）：**

- 編輯任務單不能改聯絡人：`UpdateTicketInput` 沒有聯絡欄位，只有新增時能填
- 編輯空間不能改地址：`UpdateBuildingMapInput` 沒有地址欄位
- 列表欄位是固定的：設計稿的欄位順序與顯示由「欄位設定」頁統一管理（TM-FS-101），後端 `ticketPropertyConfigs` 還沒有順序或「列表顯示」欄位
- 批次匯入會先比對疑似重複（#148）：疑似重複的列不建立、放進報告檔，試算與結果會算出列數；還不能逐列選「不建立／仍要建立」（DEDUP-006）
- 編輯任務單不能移動地標：`UpdateTicketInput` 沒有 geometry，設計稿要求編輯時可改
- 列表排序只有最新與需求優先（`TicketListOrder` 的 NEWEST／NEEDS_FIRST），沒有設計稿的「優先級 → 缺口 → 更新時間」
- 篩選沒有設計稿的行政區域、組織分配、時間：`tickets` 查詢沒有這些參數
- 指派 Team 沒有 API（ADR-049），列的 ⋯ 裡顯示「尚未開放」
- 通知連結：`/tickets?ticket=<uuid>` 會直接開抽屜，但後台頂欄的鈴鐺還沒接 `/notifications`，目前沒有東西連進來
- 空間與任務單混排：任務單由後端分頁，空間不能照設計稿跟任務單一起排序，只能放在第一頁最前面、空間之間排序
- `buildingMaps` 與每個空間的 `buildingMapTickets` 一次最多 200 筆；後者也不含看不到詳情的單，所以空間的件數與各樓層狀態可能偏少，畫面不會標出

**依設計稿刻意不做：**

- 災害專屬欄位只在詳情唯讀顯示，表單不填（設計稿「報案無需選災害」，欄位清單待權責單位確認）
- 列表不展開需求列，需求以「需求·承接進度」欄呈現

**設計稿有、還沒做（待產品決定權限或做法）：**

- 「我的單位／全部單位」範圍切換（AC-VS-104）
- 列的 ⋯ 「升為生命危急」（設計稿只給超級管理員，後端沒有對應 capability）
- 新增時的「歸屬單位」（隸屬多個單位時要選）

**需求文件或設計稿沒有出處、待確認要不要留：**

- 表單的「災害類型（選填）」多選：設計稿寫「系統已預設，報案無需選災害」
- 表單的房號、Email、需求的「說明」；需求上把承接的人移除（×）；進度備註（出自 BE-036 的 task progress notes，設計稿沒有）
- 地圖的「請放大地圖」「此範圍沒有符合的任務單」提示與群集的「此區任務單」清單；需求篩選的「醫療」
- 空間：完成的空間圖釘變淡、空間列的「缺 N 人」、只有沒樓層的單要幫忙時摘要寫「還需要幫忙」不寫數字、「改回你打的」、「200+」
- 搜尋只比對空間的名稱與地址；原型在只搜尋時也會列出底下有單符合的空間

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
