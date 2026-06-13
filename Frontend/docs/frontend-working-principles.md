# 前端工作原則與結構方針

> 目的：定義 Frontend monorepo 的分層方式、依賴方向與檔案擺放原則，避免 `libs/ui` 持續混入 module 語意，也避免以 `shared` 當成無邊界的收納區。

---

## 1. 核心原則

1. `apps` 承接框架與路由邊界。
2. `libs/ui` 承接通用的 UI foundation，不承接業務 module 語意。
3. `libs/modules` 承接可組裝的業務 UI modules。
4. `libs/data-access` 承接 API、GraphQL client 與資料存取。
5. `libs/utils` 承接純函式與無框架依賴工具。
6. 不使用 `shared` 作為籠統資料夾名稱；任何共用內容都必須有明確層級與所有權。

---

## 2. 建議分層

### 2.1 `apps`

職責：

- Next.js route files
- surface family 可保留 `src/<surface>/index.ts` 作為 internal aggregation barrel，再由 root barrel 控制對外匯出
- `page.tsx`、`layout.tsx`、`metadata`
- route group 與 layout boundary
- app-level providers
- 導頁、權限閘道、framework adapter

不應放入：

- 想要跨多個 surface 重用的通用 UI primitive
- 應由 library 維護的 reusable module component

說明：`page.tsx` 是框架入口，不應被抽進 library。可以被抽出的，是 route 背後的 React screen、section 或 composition，而不是 route file 本身。

### 2.2 `libs/ui`

職責：

- design tokens
- theme
- icons
- primitives
- 通用 layout shells
- 與業務無關的可重用 UI building blocks

適合放入的內容：

- `foundation/icons`
- `foundation/theme`
- `foundation/tokens`
- `foundation/primitives`
- `foundation/layouts`

不應放入：

- `auth`、`map`、`ticket` 這類帶業務語意的 modules
- screen-level business composition
- route-aware page objects

### 2.3 `libs/modules`

職責：

- 可組裝的業務 UI modules
- 帶明確 module 所有權的 component、composition、type、fixture
- domain-aware UI state 與 module 封裝
- 以 capability family 作為第一層 ownership boundary，必要時再於 family 內依 `admin` / `site` / workflow 分組

適合放入的內容：

- `auth/login`
- `map`
- `list`
- `route`
- `point-share`
- `station/admin`
- `station/report`
- `ticket/admin`
- `ticket/task-match`
- `shell/admin`
- `shell/site`

模組結構原則：

- `libs/modules` 先對齊具名 capability，例如 `map`、`ticket`、`station`、`shell`
- 若某個 capability 內仍有明顯 surface-owned workflow，再於 capability 內用 `admin`、`site` 等次級目錄分隔
- feature 內部 shape 可依複雜度採扁平 root 或複合結構，不要求所有 feature 套同一個模板

每個 feature 應自行管理自己的：

- `components`
- `compositions`
- `types.ts`
- 視需要存在的 `hooks`、`context`、`constants.ts`、`stories`

### 2.4 `libs/data-access`

職責：

- GraphQL documents
- typed documents
- API client
- cache policy
- 資料存取 helper

原則：避免在 `ui` 中直接混入資料存取邏輯；若 module 需要整合資料，可由 `libs/modules` 或 `apps` 承接。

### 2.5 `libs/utils`

職責：

- 純工具函式
- formatting
- parser
- 非 React 與非 framework 依賴的 helper

---

## 3. 依賴方向

建議依賴方向如下：

```text
apps -> modules -> ui -> utils
apps -> data-access
modules -> data-access
modules -> utils
ui -> utils
```

約束：

- `ui` 不可依賴 `modules`
- `ui` 不可依賴 `apps`
- `data-access` 不可依賴 `apps`
- `apps` 可以依賴所有下層 library，但應盡量只承接 route 與 orchestration

說明：`modules` 依賴 `ui` 不是問題，這是正確的分層依賴。真正需要避免的是低層反過來依賴高層。

---

## 4. 為什麼不用 `shared`

`shared` 只表示「很多地方會用」，沒有表示「它屬於哪一層」。

這會導致以下問題：

- theme、types、storybook fixtures、view helpers 被混放
- runtime code 與 preview-only code 混放
- module 所有權消失
- 新增檔案時沒有清楚的提升規則

原則：

- 不建立籠統的 `shared` 根資料夾
- 共用內容必須被提升到有語意的層級，例如 `ui/foundation`、`modules/ticket/common`

---

## 5. 檔案擺放判斷規則

### 5.1 這個檔案應該放在 `apps` 嗎？

符合以下任一條件，就留在 `apps`：

- 它是 `page.tsx`、`layout.tsx`、route handler 或 metadata
- 它直接綁定 Next.js App Router 邊界
- 它負責導頁、權限判斷、server/client route adapter
- 它只服務單一 app surface，沒有抽象成 reusable module 的價值

### 5.2 這個檔案應該放在 `libs/ui` 嗎？

符合以下條件才放在 `libs/ui`：

- 它不帶特定業務名詞
- 它可以被多個 modules 重用
- 它的價值是視覺基礎能力，而不是業務流程封裝

例如：

- Button
- TextField
- DrawerShell
- Theme tokens
- Icons

### 5.3 這個檔案應該放在 `libs/modules` 嗎？

符合以下條件則放在 `libs/modules`：

- 它屬於特定業務 module
- 它帶有 domain 名詞，但仍然可被組裝與重用
- 它是 section、panel、form、detail card、workflow composition

例如：

- Auth login form
- Map overlay shell
- Ticket detail drawer
- Station detail tabs

### 5.4 如果要進 `libs/modules`，應先放到哪個 capability family？

優先依照功能能力判斷，例如 `map`、`ticket`、`station`、`shell`、`point-share`。

符合以下情況，可視為 capability-owned：

- 它的核心價值是某個具名能力，例如地圖渲染、任務詳情、站點表單、分享流程
- 它可能被不同 surface 重用，但仍帶明確產品語意
- 它不應由單一 surface 私有化，否則其他 surface 會被迫依賴其內部實作

若同一 capability 內仍有 surface-specific workflow，再往下一層切：

- surface shell 或 navigation：`shell/admin/...`、`shell/site/...`
- surface-owned workflow：`station/admin/...`、`ticket/admin/...`
- cross-surface capability：直接留在 family root，例如 `map/...`、`route/...`、`point-share/...`
- 仍只服務單一路由的 screen composition：先留在 `apps/.../modules`

例子：

- `RescueMapController`、marker types、map canvas 應留在 `map/...`，而不是 `admin/map/...`
- admin 專用站點建立流程可放在 `station/admin/station-create/...`
- site 專用任務媒合流程可放在 `ticket/task-match/...`

---

## 6. 共用元件的提升規則

當某個元件被多處使用時，依照以下順序決定它該放哪裡：

1. 只在單一路由或單一 page composition 使用：留在 `apps/.../modules`。
2. 只在單一 feature 使用：留在該 feature 內。
3. 只在同一個 capability family 內被多個 workflow 使用：放在該 capability family 的具名位置，例如 `map/...`、`ticket/...`、`shell/...`。
4. 跨多個 capability 使用，但仍帶產品語意：建立新的具名 concept family，不使用 `shared`。
5. 多個不相關 modules 都使用，且已不帶業務語意：提升到 `libs/ui`。

這條規則的目的是避免過早提升，也避免所有跨模組共用內容最後都掉進一個無邊界資料夾。

補充：不要因為 `sidebar`、`top-navbar` 看起來是常見 UI，就直接視為全局共用。若它的 menu items、role badge、權限語意或 layout 行為仍綁定某個 workflow，就讓它留在 `shell/admin`、`shell/site` 這類 capability 內次級目錄。只有當抽掉這些語意後，剩下的是通用 shell frame、primitive 或無業務語意的 layout pattern，才考慮提升到 `libs/ui` 或新的具名 concept family。

---

## 7. 命名原則

### 7.1 在 library 層使用 `modules`

本 repo 在 library 層採用 `modules`，因為這一層的核心目的是提供可組裝的業務 UI slice，而不是直接對應 route feature。

### 7.2 不在 library path 使用 deployment app 名稱

例如不使用：

- `libs/modules/src/demo/admin/...`
- `libs/modules/src/web-admin/...`

原因：library 的結構不應綁定某個實體 app 名稱；app 名稱屬於 deployment surface，不是 reusable library taxonomy。

補充：`auth` 可以作為第一層 family，因為它本身就是獨立 capability；`admin`、`site` 則更適合作為 capability 內的次級分組，例如 `shell/admin`、`station/admin`、`shell/site`。避免把所有共用能力先丟進 `admin/*` 再讓其他 surface 反向依賴。

### 7.3 feature entrypoint 與內部 shape

建議統一為：

```text
<capability>/[surface]/<feature>/
  index.tsx | index.ts
  components/
  hooks/
  context/
  types/
```

原則：

- 每個 feature 維持穩定 entrypoint，例如 `src/<capability>/[surface]/<feature>/index.ts` 或 `index.tsx`
- 單一主 component feature 可直接使用 `index.tsx` 作為實作檔
- 複合 feature 再拆 `components`、`hooks`、`context`、`types` 等具名位置
- Storybook review-only 的 stories、fixtures、preview adapter 應由 `libs/ui/src/storybook/**` 承接，而不是留在 `libs/modules`
- 不要求所有 feature 都套用同一種目錄深度；重點是 entrypoint 穩定、內部責任具名

---

## 8. 建議的目標目錄

```text
Frontend/
  apps/
    demo/
      src/
        app/
        modules/

  libs/
    ui/
      src/
        foundation/
          icons/
          theme/
          tokens/
          primitives/
          layouts/
        storybook/
          modules/
            auth/
            admin/
            map/
            ticket/
            station/
            site/

    modules/
      src/
        auth/
          login/
            components/
            index.ts
        map/
          components/
          hooks/
          site/
            index.ts
          index.tsx
        list/
          index.tsx
        route/
          index.ts
        point-share/
          index.ts
        shell/
          admin/
          site/
          index.ts
        station/
          admin/
          report/
          type-options.ts
        ticket/
          admin/
          task-match/
          index.ts

    data-access/
    utils/
```

說明：`apps/demo/src/modules` 可以保留 app-local composition；只有在確認具備跨 route 或跨 surface 的可重用價值時，才提升到 `libs/modules`。`admin`、`site` 不必作為 `libs/modules` 第一層預先鋪滿；只有在某個 capability 內確實需要 surface-specific workflow 時，再長出對應次級目錄即可。

---

## 9. Storybook 與 runtime 的邊界

原則：

- storybook fixture、mock data、preview baseline 不進 runtime barrel
- shared Storybook 的 stories、fixtures、preview adapter 集中放在 `libs/ui/src/storybook/**`
- `libs/modules` 只保留 runtime source；若要預覽 module surface，請在 `libs/ui` 內建立 foundation-owned story harness
- `index.ts` 只暴露 runtime 與受控 public API

這樣可以避免 library public surface 被 story 專用內容污染。

---

## 10. 實作準則摘要

1. route file 永遠留在 `apps`
2. foundation 永遠留在 `libs/ui`
3. reusable 業務 module UI 進 `libs/modules` 前，先判斷屬於哪個 capability family
4. shell 與 navigation 先留在 `shell` family，再依需要分 `admin`、`site`
5. app-only composition 可以先留在 `apps/.../modules`
6. 不使用 `shared` 當兜底資料夾
7. 共用內容必須依照提升規則晉升
8. 低層不可反向依賴高層
9. root barrel 只暴露穩定 public API，不攤平所有內部實作

---

## 11. PR 檢查清單

提交前請檢查：

1. 這個檔案是否放在正確層級？
2. 它是否已先放到正確的 capability family，例如 `auth`、`map`、`ticket`、`station`、`shell`？
3. 它是否其實只是 app route adapter，不應抽成 library？
4. 它是否其實只是同一個 surface 的 shell，不該被假設成全局共用？
5. 它是否引入了反向依賴？
6. 它是否其實已經不帶業務語意，應升到 `libs/ui`？
7. 它是否被丟進模糊的 `shared` 位置？
8. storybook 專用內容是否與 runtime 分離？
9. public export 是否仍然最小且可控？

---

## 12. 後續重構建議

建議優先順序：

1. 先把 `libs/ui` 收斂成 foundation 導向結構。
2. 再讓 `libs/modules` 對齊 capability family，例如 `auth`、`map`、`ticket`、`station`、`shell`。
3. 將現有 app-specific screen composition 區分為 app-local、capability-owned 與 surface-owned workflow。
4. 把像 `sidebar`、`top-navbar` 這類 shell 元件先收斂到 `shell` family，而不是預設成某個 surface 的私有共用。
5. 最後再整理 public exports 與 path alias，讓 import 路徑對齊新的分層。

本文件描述的是工作原則與目標方向；實際搬遷可依 module 逐步進行，不要求一次完成所有重構。
