# 前台地圖互動架構

> 目的：說明前台地圖目前的互動架構、資料流、狀態保存方式，以及為什麼選擇這套實作方向。這份文件面向後續接手的工程師，用來理解系統設計與維護邊界，而不是記錄單次修復過程。

---

## 1. 設計目標

前台地圖的核心需求不是單純把資料畫到地圖上，而是同時滿足以下幾件事：

1. 地圖可拖動、縮放，且 URL 能同步反映目前視角。
2. 視角更新不應導致整個 React 畫面樹大規模 rerender。
3. 資料查詢要以 viewport 為中心，只更新目前視角需要的資料。
4. Leaflet 圖層應做增量同步，而不是每次重新掛載或整批重建。
5. URL、資料、圖層與 UI 控制狀態要各自有清楚責任邊界。

基於這些目標，目前架構刻意把「路由狀態」、「viewport 狀態」、「live data 狀態」與「Leaflet render state」拆開管理。

---

## 2. 技術方向與選型理由

## 2.1 為什麼不把整個地圖互動都交給 React state

地圖拖動是高頻互動。若把 `position`、`bbox`、markers、overlays 全都作為普通 React state 自上而下傳遞，會有幾個直接代價：

1. 拖動後父層會重新 render。
2. 依賴 bbox 的資料 hook 會跟著重跑。
3. 下游圖層容易整批更新。
4. 一旦有人把 map instance lifecycle 綁到 viewport，上層更新就可能觸發整張地圖重建。

因此目前的實作方向是：

- React 負責 UI orchestration 與 route semantics
- external store 負責高頻 viewport 與 live data 狀態
- Leaflet instance 負責地圖畫布與圖層 render

這比較接近地圖引擎本身的運作模式，也比較符合 Leaflet 這類 imperative library 的特性。

## 2.2 為什麼保留 Leaflet imperative layer sync

Leaflet 的強項是 map instance 與 layer 的直接控制，不是讓整份地圖資料每次透過 React diff 重算。

因此 marker、cluster、closure overlay 目前都採用：

- 建立一次 layer
- 後續用 ref 保存 layer handle
- 資料改變時做增量同步

好處：

1. 視覺穩定，不容易閃爍。
2. 不需要整批 clear / rebuild。
3. 可以精準控制哪些圖層要更新、哪些不動。
4. 地圖與 React render tree 的責任分離更清楚。

## 2.3 為什麼 viewport 用 external store

viewport 屬於高頻且偏「引擎狀態」的資料：

- `position`
- `bbox`

這類資料不適合變成 scene root 的普通 React state。external store 的好處是：

1. 只有真的關心 viewport 的模組才訂閱它。
2. URL 寫回可以不伴隨整個 route snapshot 更新。
3. map canvas 可以直接根據 viewport store 做同步，不必經過上層 React props 重新灌值。

## 2.4 為什麼 live data 不直接用 bbox 驅動 `useQuery`

若在畫面根節點直接：

```tsx
const { data } = useQuery({ variables: { bounds: bbox } });
```

那 bbox 每次更新時，query hook、scene render path、下游組件都會一起重新進入 render cycle。

目前改成 imperative fetch controller + store 的原因是：

1. bbox 更新只觸發資料控制器工作。
2. React 僅在 snapshot 實際變化時重新讀取。
3. scene 與 route orchestration 不需要與每次 viewport 變化綁死。

## 2.5 為什麼 map live data 不走全域 `UrqlProvider`

專案仍保留全域 `UrqlProvider`，但 map live data 刻意不使用它，而是走獨立的 fetch-only client。

原因不是因為全域 provider 沒價值，而是因為它的責任與地圖 live data 的特性不同。

全域 provider 目前承擔的是一般 UI data flow：

- React hook 型查詢與 mutation
- graphcache
- SSR exchange
- suspense-driven query lifecycle

這類設定適合：

- 表單 mutation
- 一般頁面資料查詢
- 需要共享 cache 的 UI
- 需要 declarative `useQuery` / `useMutation` 的元件

但 map live data 的需求不同：

- 查詢由 viewport 高頻驅動
- 只關心最新一筆 bounds 對應結果
- 不需要跨畫面共享 cache
- 不需要 Connection pagination merge
- 不應被 SSR / suspense / graphcache resolver 介入結果重建

若把這類查詢送進全域 exchange pipeline，容易出現以下問題：

1. graphcache 會以 Query resolver 角度嘗試讀取或組裝結果。
2. connection-style cache merge 會引入與 viewport 查詢無關的語意。
3. imperative `client.query(...).toPromise()` 拿到的結果生命週期，可能與畫面上看到的 network response 不一致。
4. 地圖這種 latest-only 資料流，會被迫承受全域 cache / suspense 策略的複雜度。

因此目前設計是分流：

- 全域 `UrqlProvider` 保留給一般 UI query / mutation
- map live data 使用獨立 `createUrqlClient({ exchanges: [fetchExchange] })`

這不是在否定全域 cache，而是在避免將「共享 UI 資料流」與「地圖引擎資料流」混成同一條責任鏈。

---

## 3. 架構總覽

```txt
URL / History
    ↕
SiteMapRouteProvider
    ├─ route state（低頻、具語意）
    └─ viewport store（高頻、視角狀態）
              ↓
      SiteMapLiveDataStore
              ↓
           Map
              ↓
      RescueMapCanvas / Leaflet
              ↓
   marker layer / cluster / closure overlay
```

這裡的分層是刻意設計的：

- URL 承載可分享、可還原的 route semantics
- route provider 承載頁面層級的互動狀態
- viewport store 承載高頻地圖視角
- live data store 承載 viewport 驅動的資料查詢結果
- canvas 承載 Leaflet instance 與圖層同步

---

## 4. 狀態分層

## 4.1 Route State

型別來源：

- `libs/modules/src/site/route/types.ts`
- `libs/modules/src/admin/map/types.ts`

用途：

- 描述目前頁面的語意狀態
- 可被序列化到 URL
- 可用於分享、返回、重新整理後還原

包含內容：

- `baseLayer`
- `dataType`
- `subDataTypes`
- `selectedMarkerId`
- `search`

在 map module 中，`position` 與 `bbox` 雖然仍屬於 route state 型別的一部分，但實務上已拆出去由 viewport store 管理。

## 4.2 Viewport State

檔案：

- `libs/modules/src/site/map/use-site-map-viewport-state.ts`

用途：

- 描述目前地圖視角
- 避免 drag / zoom 導致整個 scene rerender

包含內容：

- `position`
- `bbox`

實作：

- `createSiteMapViewportStore(...)`
- `useSyncExternalStore(...)`

這個 store 是 map 視角的單一事實來源。

## 4.3 Live Data State

檔案：

- `libs/modules/src/site/map/use-site-map-live-data.ts`

用途：

- 保存目前 viewport 對應的 markers
- 保存目前 viewport 對應的 closure areas
- 保存 loading/error
- 保存使用者本地 dismiss 的 marker 狀態

這層刻意不與 route provider 混在一起，因為它的更新頻率、來源與生命週期都不同。

## 4.4 Leaflet Render State

檔案：

- `libs/modules/src/admin/map/components/rescue-map-canvas/index.tsx`

用途：

- 保存 `L.Map`
- 保存 tile layer
- 保存 marker cluster layer
- 保存 closure overlay layer
- 保存 layer handle map

這一層不應視為 React business state，而是 render engine state。

---

## 5. URL 與路由實作

## 5.1 URL 形態

前台 map URL 目前採用：

```txt
/map/{baseLayer}/{dataType}[/{subDataTypes}][/@{lat},{lng},{zoom}z]?id=...&search=...
```

例子：

```txt
/map/street/station/@24.9829338,121.5099880,10z
```

這個設計的原因：

1. 視角資訊在 URL 上可直接辨識。
2. 與地圖產品常見的分享格式接近。
3. route semantics 與 query string 的責任分離較清楚。

## 5.2 Parse / Serialize 邊界

檔案：

- `libs/modules/src/site/route/parse.ts`
- `libs/modules/src/site/route/serialize.ts`

責任：

- `parse.ts`：從 path + query 還原 route state
- `serialize.ts`：將 route state 轉回可分享網址

要求：

- 任何 URL 格式變更，必須同時更新 parse 與 serialize
- 不要在 UI 層手動拼接 map URL

---

## 6. Route Provider 與 Viewport Provider

檔案：

- `libs/modules/src/site/map/use-site-map-route-state.ts`

這個 provider 做兩件事：

1. 維護 route semantics
2. 建立並持有 viewport store

### `replace()` 的角色

當非 viewport 狀態改變時，例如：

- 切換站點 / 任務
- 篩選子類型
- 開啟或關閉 selected marker

應使用 `replace()`。

它會更新 provider snapshot，讓依賴 route semantics 的 UI 正常同步。

### `replaceUrl()` 的角色

當只有 viewport 變化時，例如：

- 拖動
- 縮放

應優先使用 `replaceUrl()`。

它只做：

- `window.history.replaceState(...)`
- viewport store 更新

不刷新整個 route snapshot。

這是前台地圖維持互動穩定的核心之一。

---

## 7. Live Data 實作

檔案：

- `libs/modules/src/site/map/use-site-map-live-data.ts`

## 7.1 為什麼是 store + imperative fetch

目前 live map data 採用：

- 獨立的 fetch-only urql client
- `client.query(...).toPromise()` 執行查詢
- external store 保存結果

這種方式的好處：

1. bbox 改變不需要把 `useQuery` 掛在畫面根節點。
2. 可以把資料更新責任集中在單一 controller。
3. 可以更容易做 snapshot equality、dismiss、stale response 防護。
4. 可以明確避開全域 graphcache / SSR / suspense 對 live data query lifecycle 的介入。

## 7.2 Store Snapshot 結構

```ts
{
  markers: readonly RescueMapMarkerItem[]
  closureAreas: readonly RescueMapClosureArea[]
  isFetching: boolean
  error: CombinedError | null
}
```

## 7.3 目前查詢策略

markers：

- 根據 `dataType` 決定查 `GetStationsDocument` 或 `GetTicketsDocument`
- 依 `bbox` 傳入 bounds

closure areas：

- 獨立查 `GetClosureAreasDocument`
- 同樣依 `bbox` 傳入 bounds

這個設計讓 markers 與 overlays 可共用同一份 viewport，但仍保持資料責任清楚。

---

## 8. Scene 與 UI 組裝

檔案：

- `apps/demo/src/app/(site)/map/[[...segments]]/site-map-view.client.tsx`

目前頁面分成兩層：

## 8.1 `SiteMapScene`

負責：

- 持有 `useSiteMapRouteState()`
- 決定何時 `replace()`、何時 `replaceUrl()`
- 管理 create mode、share、report、task-match dialog 等頁面互動

## 8.2 `SiteMapViewportDataLayer`

負責：

- 訂閱 viewport store
- 將 `baseRouteState + viewportState` 合併成查詢需要的狀態
- 使用 live data store
- 將 `baseRouteState` 與 `viewportStore` 分別傳給 `Map`

這種拆法的好處是：

1. route semantics 不必與高頻 viewport 耦合
2. data fetch 與 scene orchestration 分開
3. 日後若要替換資料來源或加入 cache policy，修改範圍集中

---

## 9. Map 與 Controller

檔案：

- `libs/modules/src/admin/map/index.tsx`
- `libs/modules/src/admin/map/hooks/use-rescue-map-controller.ts`

`Map` 的職責是 page-level composition，不是 viewport state owner。

### `useRescueMapController()` 管什麼

- `baseLayer`
- `dataType`
- `subDataTypes`
- `selectedMarkerId`
- layer panel 開關
- marker 過濾結果
- closureAreas 顯示狀態

### `Map` 為什麼要 `memo`

因為它不應在 viewport 變更時被迫重新 render。

`Map` 目前接收：

- 非 viewport 的 `routeState`
- `viewportStore`
- 已經查好的 `markers`
- 已經查好的 `closureAreas`

這樣可以把高頻 drag 與上層 UI composition 盡量解耦。

---

## 10. RescueMapCanvas 與 Leaflet

檔案：

- `libs/modules/src/admin/map/components/rescue-map-canvas/index.tsx`

## 10.1 地圖初始化

`L.map(...)` 只在 mount 時建立一次。

初始位置來源：

- `initialViewportStateRef`

原因：

- 避免 viewport 更新重新執行 map initialization effect
- 避免 `map.remove()` cleanup 被 drag / zoom 誤觸發

## 10.2 視角同步

拖動後由 Leaflet 自己先完成視角變更，接著：

1. `moveend` / `zoomend`
2. debounce
3. `controller.setViewportState(...)`
4. route provider 寫回 URL 與 viewport store

當外部 viewport 改變時，canvas 再以 `setView(...)` 同步 Leaflet instance。

## 10.3 Tile Layer

tile layer 只在 base layer 改變時切換。

它不應因為：

- drag
- bbox 查詢
- marker 更新

而重新建立。

## 10.4 Marker Layer

目前使用 cluster layer，並以 `syncMarkerLayer(...)` 做增量同步：

- 新增：`addLayer`
- 移除：`removeLayer`
- 同 id 位置改變：`setLatLng`
- icon 改變：`setIcon`

## 10.5 Closure Overlay Layer

closure area 不再整批 clear。

目前作法：

- 每個 area 對應一個 `L.LayerGroup`
- 使用 signature 判斷內容是否變更
- 未變更不動
- 變更時只重畫該 area

這讓 overlay 更新與 marker 更新都維持在增量模式。

---

## 11. 目前互動流程

## 11.1 拖動地圖

```txt
Leaflet moveend / zoomend
    ↓
controller.setViewportState(...)
    ↓
SiteMapRouteProvider.replaceUrl(...)
    ↓
history.replaceState + viewport store update
    ↓
live data store 依 bbox fetch
    ↓
canvas / layers 增量同步
```

## 11.2 切換站點 / 任務與篩選

```txt
UI interaction
    ↓
route state 更新
    ↓
provider snapshot 更新
    ↓
scene / map 讀取新的語意狀態
    ↓
live data store 依條件重新抓資料
```

## 11.3 點選 marker

```txt
marker click
    ↓
selectedMarkerId 更新
    ↓
URL query id 更新
    ↓
detail drawer / metadata / share target 同步更新
```

---

## 12. 這套架構的優勢

1. URL 具備分享與還原能力。
2. viewport 更新不會天然擴散到整個 React tree。
3. 資料查詢責任集中，可控性高。
4. Leaflet layer 增量同步，畫面穩定。
5. route semantics、viewport、live data、render engine 各自邊界清楚。
6. 後續若要導入更進一步的 tile / vector-tile 策略，有明確替換點。

---

## 13. 維護規則

後續修改這塊時，請遵守以下規則：

1. 不要把 viewport 改回 scene root 的普通 React state。
2. 不要讓 bbox 直接在頁面根節點驅動 `useQuery`。
3. 不要把 `L.map(...)` 初始化 effect 綁到 viewport 相關 dependency。
4. 不要讓 drag 只為了改 URL 就更新整個 route snapshot。
5. 不要對 marker / overlay 做整批 clear + rebuild。
6. 不要在 UI 層自行拼接 map URL，統一走 parse / serialize。
7. 若新增新的地圖資料層，優先思考它應屬於：
   - route semantics
   - viewport state
   - live data state
   - Leaflet render state

---

## 14. 後續擴充方向

若資料量再增加，可沿這個架構延伸：

1. live data store 增加更精細的 cache 與 stale response 策略
2. markers / overlays 依資料型態拆成多個獨立 store
3. 將大規模面資料或背景資料替換為 tile / vector tile 管線
4. 保留 scene-level orchestration，不讓 render engine 細節回滲到 UI composition

---

## 15. 相關檔案索引

- `libs/modules/src/site/route/parse.ts`
- `libs/modules/src/site/route/serialize.ts`
- `libs/modules/src/site/map/use-site-map-route-state.ts`
- `libs/modules/src/site/map/use-site-map-viewport-state.ts`
- `libs/modules/src/site/map/use-site-map-live-data.ts`
- `apps/demo/src/app/(site)/map/[[...segments]]/site-map-view.client.tsx`
- `libs/modules/src/admin/map/index.tsx`
- `libs/modules/src/admin/map/hooks/use-rescue-map-controller.ts`
- `libs/modules/src/admin/map/components/rescue-map-canvas/index.tsx`
