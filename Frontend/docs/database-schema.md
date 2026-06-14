# 後端資料契約摘要

這份文件只保留前端目前實際會碰到的資料模型摘要。更細的 source of truth 以 repo 內 vendored contract 為準：

- GraphQL：`libs/data-access/src/graphql/schema.graphql`
- REST OpenAPI：`libs/data-access/openapi.json`
- Frontend queries：`libs/data-access/src/graphql/**/*.graphql`

## 前端目前主要依賴的實體

### User

REST `/v1/users/me` 與 auth 流程目前至少依賴：

- `uuid`
- `name`

auth session 額外保存：

- `loginIdentity`
- `authProvider`

這兩個是 frontend session 模型，不是 `/users/me` payload 本身。

### Station

前端目前在 GraphQL `StationFields` 依賴：

- `uuid`
- `propertyName`
- `geometry`
- `type`
- `name`
- `description`
- `opHour`
- `level`
- `comment`
- `source`
- `visibility`
- `verificationStatus`
- `confidenceScore`
- `isDuplicate`
- `isTemporary`
- `isOfficial`
- `priorityScore`
- `createdBy`
- `createdAt`
- `updatedAt`

單筆站點詳情額外使用：

- `secondaryLocation`
- `properties`

### ClosureArea

前端目前依賴：

- `uuid`
- `propertyName`
- `geometry`
- `status`
- `informationSource`
- `comment`
- `createdBy`
- `createdAt`
- `updatedAt`

### Ticket

前端目前在 `TicketFields` 依賴：

- `uuid`
- `propertyName`
- `geometry`
- `title`
- `description`
- `contactName`
- `contactEmail`
- `contactPhone`
- `status`
- `priority`
- `taskType`
- `visibility`
- `verificationStatus`
- `reviewNote`
- `createdBy`
- `createdAt`
- `updatedAt`

單筆工單詳情額外使用：

- `photos`
- `tasks`

### TicketTask

前端目前依賴：

- `uuid`
- `ticketUuid`
- `taskType`
- `taskName`
- `taskDescription`
- `quantity`
- `status`
- `source`
- `progressNote`
- `visibility`
- `moderationStatus`
- `reviewNote`
- `createdAt`
- `updatedAt`

單筆任務列表額外使用：

- `properties`
- `assignments`

## 分頁模型

目前前端 GraphQL cache 假設後端採用 connection-style 結構：

```graphql
type SomeConnection {
  items: [SomeType!]!
  pageInfo: PageInfo!
}
```

`pageInfo` 目前至少包含：

- `totalCount`
- `hasNextPage`
- `hasPreviousPage`

## Auth 相關 REST 契約

前端目前依賴的 auth REST 能力包括：

- `salt`
- `login`
- `register`
- `verify`
- `resend-verification`
- `refresh`
- `logout`
- `logout-all`
- `forgot-password`
- `reset-password`
- `sso/google`
- `sso/line`
- `link/google`
- `link/line`
- `change-password`
- `set-password`
- `contacts`
- `contacts/verify`
- `contacts/resend`

## 維護原則

- 如果前端 query 或 REST payload 改了，先更新 contract source，再同步更新本文件。
- 不在這裡記錄 repo 無法驗證的 migration 編號、資料庫實作細節或外部 backend 規劃。
