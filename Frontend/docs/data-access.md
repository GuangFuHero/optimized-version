# 前後端資料串接說明

本文件描述 `libs/data-access` 目前實作的資料存取層。

## 整體結構

```text
libs/data-access/
  codegen.ts                   # GraphQL codegen 設定
  src/
    graphql/
      schema.graphql           # 後端匯出的 GraphQL schema，前後台共用
      admin/admin.graphql      # 後台的 operations
      tickets/ geo/ …          # 前台的 operations
      __generated__/           # graphql-codegen 產物
      request.ts               # createGraphqlRequest、GraphqlError
    rest/
      openapi.json             # 後端匯出的 OpenAPI
      openapi.d.ts             # openapi-typescript 產物
      openapi-client.ts        # createRestClient（openapi-fetch）、responseData
      api-error.ts             # ApiError
    admin/                     # 後台的 TanStack Query options 與 hooks
    index.ts                   # 對外 export 入口
```

## Source Of Truth

- GraphQL contract：`src/graphql/schema.graphql`，由 `pnpm schemas:export` 從後端匯出
- REST contract：`src/rest/openapi.json`，同上
- GraphQL operations：`src/graphql/**/*.graphql`

新增資料需求時，先改 `.graphql`（REST 不用改，路徑和型別都來自 OpenAPI），再執行 `pnpm codegen`。

## 送出請求

- GraphQL：`createGraphqlRequest({ url, fetch, cache })` 回傳一個函式，收 generated document、variables 與 `AbortSignal`，
  回傳 data。後端回了 GraphQL errors 時丟 `GraphqlError`，`graphQLErrors` 是後端的訊息；沒拿到 GraphQL 回答（斷線、
  proxy 的 401）時 `networkError` 有值，有回應的話 `response` 也在。
- REST：`createRestClient({ fetch, baseUrl })` 是 openapi-fetch client，回應不是 OK 時丟 `ApiError`（`status`、後端的 `code`）。

瀏覽器端一律走 app 自己的 proxy（`/api/graphql`、`/api/v1/*`），不直接連後端：Content-Security-Policy 的
`connect-src 'self'` 會擋掉瀏覽器對其他網域的 fetch，被擋時只在 console 留一行訊息，畫面上看不到錯誤。
server 端（分享卡片的 metadata、render 前讀登入的人）用 `libs/modules/src/server/backend-api-url.ts` 的後端網址。

各 app 的 client：

- 前台：`libs/modules/src/session/site-clients.ts` 的 `siteGraphql`、`siteRestClient`，都經過 `sessionExpiryFetch`，
  proxy 標記登入已失效時把分頁重新整理成訪客（見 [`authentication.md`](authentication.md)）。
- 後台：`libs/data-access/src/admin/client.ts` 的 `adminGraphql`、`adminRestClient`。

## 讀取與快取

元件裡的讀取都交給 TanStack Query，不在 `useEffect` 裡自己 fetch。

- 前台：`siteGraphqlQuery(document, variables)` 給 `useQuery`，key 是 document 與 variables。預設每次 mount 都重讀、
  切回分頁不重讀、失敗不跳 toast（畫面自己顯示錯誤）。寫入用 `siteGraphqlMutation(document)` 給 `useMutation`，
  失敗一樣不跳 toast。
- 後台：`@rescue-frontend/data-access/admin` 的 query options 與 hooks，失敗由 `createAdminQueryClient` 的 callback 跳 toast。

## Codegen Workflow

1. 修改 `.graphql` 文件
2. 執行 `pnpm codegen`（`pnpm schemas:generate` 會先從後端匯出 schema）
3. 更新使用端 import 與型別

對應設定檔是 `libs/data-access/codegen.ts`。

## 修改原則

- 不要在 `libs/ui` 寫資料存取邏輯。
- `libs/modules` 若需要 reusable data hook，可以依賴 `@rescue-frontend/data-access`。
- 前後台共用的 Next.js 邊界邏輯（REST／GraphQL proxy、cookie 轉送、render 前的 refresh）放在
  `libs/modules/src/server/`；app 的 route file（`apps/*/src/app/api/**/route.ts`）和 `apps/demo/src/proxy.ts`
  只負責掛上去，並指定是前台（`site`）還是後台（`admin`）。
