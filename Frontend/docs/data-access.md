# 前後端資料串接說明

本文件描述 `libs/data-access` 目前實作的資料存取層，不包含已過時的規劃目錄。

## 整體結構

```text
libs/data-access/
  src/
    graphql/
      client/                  # urql client、graphcache、url 解析
      geo/geo.graphql          # station / closure area queries + mutations
      tickets/tickets.graphql  # ticket / task queries + mutations
      __generated__/           # graphql-codegen 產物
      index.ts
    rest/
      endpoints.ts             # REST endpoint 常數
      request-async.ts         # 共用 request helper
      v1/...                   # auth / users/me 封裝
      index.ts
    index.ts                   # 對外 export 入口
```

## Source Of Truth

- GraphQL contract：`libs/data-access/src/graphql/**/*.graphql`
- GraphQL typed documents：`libs/data-access/src/graphql/__generated__/*`
- REST endpoint mapping：`libs/data-access/src/rest/endpoints.ts`

新增資料需求時，先改 `.graphql` 或 `rest/v1/*`，再由 `src/index.ts` 決定是否對外公開。

## GraphQL Client

主要檔案：

- `libs/data-access/src/graphql/client/urql.ts`
- `libs/data-access/src/graphql/client/cache.ts`

目前行為：

- 預設使用 `graphCache + fetchExchange`
- server runtime 預設 `fetchOptions.cache = 'no-store'`
- 可透過 `authToken` 或 `getToken()` 自動帶入 `Authorization` header
- GraphQL URL 解析順序：
  1. server: `GRAPHQL_URL`，否則 `NEXT_PUBLIC_GRAPHQL_URL`
  2. client: `NEXT_PUBLIC_GRAPHQL_URL`
  3. 若都沒有，從 `NEXT_PUBLIC_API_BASE_URL` 推導 `/graphql`

## Graphcache

目前只處理 connection-style 累積分頁：

- `stations`
- `closureAreas`
- `tickets`
- `ticketTasks`

對應實作在 `connectionPagination()` resolver。若新增同型別分頁欄位，要同步補到 `cache.ts`。

## GraphQL Documents

### Geo domain

`libs/data-access/src/graphql/geo/geo.graphql` 目前包含：

- `GetStations`
- `GetStation`
- `GetClosureAreas`
- `GetClosureArea`
- `CreateStation`
- `UpdateStation`
- `DeleteStation`
- `CreateStationProperty`
- `CreateCrowdSourcing`

### Ticket domain

`libs/data-access/src/graphql/tickets/tickets.graphql` 目前包含：

- `GetTickets`
- `GetTicket`
- `GetTicketTasks`
- `CreateTicket`
- `UpdateTicket`
- `CreateTicketTask`
- `UpdateTicketTask`
- `CreateTaskProperty`

## REST Client

`libs/data-access/src/rest/endpoints.ts` 目前對應：

- auth
  - login / register / verify / resend-verification
  - salt / refresh / logout / logout-all
  - forgot-password / reset-password
  - sso google / line
  - link google / line
  - change-password / set-password
  - contacts / contacts/verify / contacts/resend
- users
  - `me`

所有 REST endpoint 都從 `NEXT_PUBLIC_API_BASE_URL` 推導，預設值是 `http://localhost:8000/api`。

## Frontend Integration Points

目前 `apps/demo` 主要有兩種接法：

1. 一般 GraphQL / server-side query
   - 透過 `createUrqlClient()` 或 `getServerUrqlClient()`
2. auth 與 profile 類 REST
   - 透過 app-local wrapper 呼叫 `/api/bff/auth/*`
   - BFF 再轉呼叫 `@rescue-frontend/data-access` 的 REST client

補充：

- `/api/graphql` 是 frontend 自己的 proxy route，不是 `libs/data-access` 直接知道的固定 URL。
- 前台地圖 live data 雖然仍重用 `createUrqlClient()`，但會建立 fetch-only client，避免受全域 graphcache / provider 生命週期干擾。

## Codegen Workflow

1. 修改 `.graphql` 文件
2. 執行 `pnpm codegen`
3. 更新使用端 import 與型別

目前 script：

```bash
pnpm codegen
```

對應設定檔是 `libs/data-access/src/graphql/codegen.ts`。

## 修改原則

- 不要在 `libs/ui` 寫資料存取邏輯。
- `libs/modules` 若需要 reusable data hook，可以依賴 `@rescue-frontend/data-access`。
- app-local route handler（例如 BFF / GraphQL proxy）負責框架邊界、cookie 與 request/response 轉換，不要把這些 Next.js 邊界邏輯塞回 library。
