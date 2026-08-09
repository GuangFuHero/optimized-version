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
- `apps/demo/src/app/api/bff/auth/[[...segments]]/route.ts`
- `apps/demo/src/app/(site)/map/[[...segments]]/*`
- `apps/demo/src/modules/auth/session/*`

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
- `admin/user`

判斷標準：

- 帶明確產品能力語意
- 可被多個 route 或 page composition 重用
- 仍值得在 library 層維護

### `libs/data-access`

適合放：

- GraphQL documents
- codegen 產物
- urql client
- REST endpoint 封裝

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
