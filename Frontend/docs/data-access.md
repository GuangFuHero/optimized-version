# 前後端資料串接說明

> 說明 `libs/data-access` 如何透過 GraphQL 與後端溝通，包含架構設計、檔案結構與資料流。

---

## 一、整體架構

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│                                                             │
│     apps/demo    ─────────→  libs/data-access  ──→ GraphQL │
│     (current portal UI and future admin sections)          │
│                         (Urql Client)       (HTTP)         │
└─────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                         Backend                             │
│                                                             │
│   FastAPI  →  Strawberry GraphQL  →  SQLAlchemy  →  PG     │
└─────────────────────────────────────────────────────────────┘
```

**核心原則：** 維護中的 `demo` 與未來掛載在其中的 admin sections 共用同一套 `libs/data-access`，
不重複撰寫 API 邏輯。

> 補充：目前維護中的 `demo` baseline 是 Next.js 的 login-first 入口頁。未來若要加入 admin experiences，也會以 `demo` 內的 route groups 與 nested layouts 實作，而不是恢復成獨立 app。本文件中的 GraphQL 與資料流範例描述的是共享 data-access 能力，不代表所有規劃中的 portal 或 admin 畫面都已在目前 baseline 掛載。

---

## 二、libs/data-access 目錄結構

```
libs/data-access/
├── codegen.ts                        # GraphQL Code Generator 設定
└── src/
    ├── index.ts                      # 公開 API（對外 export 的入口）
    │
    ├── client/
    │   ├── urql.ts                   # Urql Client 工廠（createUrqlClient）
    │   ├── cache.ts                  # graphcache 設定（分頁合併 resolver）
    │   └── index.ts                  # barrel export
    │
    ├── graphql/                      # ← GraphQL operation 文件（.graphql 格式）
    │   ├── geo/
    │   │   └── geo.graphql           # 地理空間：站點、封閉區域
    │   └── tickets/
    │       └── tickets.graphql       # 工單系統：工單、任務、屬性
    │
    └── __generated__/                # ← codegen 自動產出（勿手動修改）
        └── graphql.ts                # TypeScript 型別 + typed document nodes
```

---

## 三、.graphql 文件的結構與作用

`.graphql` 文件是**前端告訴後端「我需要什麼資料」的合約文件**。
它使用 GraphQL Query Language 撰寫，不含任何業務邏輯。

### 組成元素

| 元素       | 說明                            | 範例                                    |
| ---------- | ------------------------------- | --------------------------------------- |
| `fragment` | 可重用的欄位片段，避免重複      | `fragment StationFields on StationType` |
| `query`    | 讀取操作（對應 HTTP GET 語意）  | `query GetStations(...)`                |
| `mutation` | 寫入操作（對應 HTTP POST 語意） | `mutation CreateStation(...)`           |

### Fragment（欄位片段）

```graphql
# geo.graphql
fragment StationFields on StationType {
  uuid
  name
  type
  geometry # ← GeoJSON 格式，型別為自定義 scalar
  visibility
  createdAt
  # ... 其他欄位
}
```

**作用：** 定義「每次查詢站點時，我想要哪些欄位」。
所有用到 `StationType` 的 query/mutation 都可以用 `...StationFields` 引用，
確保欄位一致，避免每個地方重複寫。

### Query（查詢）

```graphql
# 查詢站點列表（支援地理範圍過濾 + 分頁）
query GetStations(
  $bounds: BoundsInput # 地理邊界框（可選）
  $stationType: String # 站點類型過濾（可選）
  $skip: Int = 0 # 分頁偏移
  $limit: Int = 50 # 每頁筆數
) {
  stations(
    bounds: $bounds
    stationType: $stationType
    skip: $skip
    limit: $limit
  ) {
    items {
      ...StationFields # ← 引用上面的 Fragment
    }
    pageInfo {
      ...PageInfoFields # ← 分頁資訊
    }
  }
}
```

**結構說明：**

- `$bounds`, `$stationType` 等是**變數**，在 React 組件裡動態傳入
- `stations(...)` 對應後端的 `GeoQuery.stations()` resolver
- 回傳的是 `StationConnection { items, pageInfo }` 結構（分頁 Connection 型別）

### Mutation（寫入）

```graphql
# 建立站點
mutation CreateStation($input: CreateStationInput!) {
  createStation(input: $input) {
    ...StationFields # ← 建立成功後，回傳完整的站點資料
  }
}
```

---

## 四、前後端對應關係

### Geo Domain（地理空間）

| 前端（.graphql）                 | 後端（Python Resolver）                             | 說明                             |
| -------------------------------- | --------------------------------------------------- | -------------------------------- |
| `query GetStations`              | `GeoQuery.stations()`                               | 查詢站點列表，支援地理過濾       |
| `query GetStation`               | `GeoQuery.station()`                                | 查詢單一站點（含二級位置、屬性） |
| `query GetClosureAreas`          | `GeoQuery.closure_areas()`                          | 查詢封閉區域列表                 |
| `query GetClosureArea`           | `GeoQuery.closure_area()`                           | 查詢單一封閉區域                 |
| `mutation CreateStation`         | `GeoMutation.create_station()`                      | 建立站點（需認證）               |
| `mutation UpdateStation`         | `GeoMutation.update_station()`                      | 更新站點（所有者或管理員）       |
| `mutation DeleteStation`         | `GeoMutation.delete_station()`                      | 軟刪除站點                       |
| `mutation CreateStationProperty` | `StationPropertyMutation.create_station_property()` | 新增站點物資/服務項目            |
| `mutation CreateCrowdSourcing`   | `StationPropertyMutation.create_crowd_sourcing()`   | 提交群眾評分                     |

### Tickets Domain（工單系統）

| 前端（.graphql）              | 後端（Python Resolver）                     | 說明                              |
| ----------------------------- | ------------------------------------------- | --------------------------------- |
| `query GetTickets`            | `RequestQuery.tickets()`                    | 查詢工單列表，支援狀態/優先級過濾 |
| `query GetTicket`             | `RequestQuery.ticket()`                     | 查詢單一工單（含照片、任務列表）  |
| `query GetTicketTasks`        | `TicketTaskQuery.ticket_tasks()`            | 查詢工單下的任務列表              |
| `mutation CreateTicket`       | `RequestMutation.create_ticket()`           | 建立工單                          |
| `mutation UpdateTicket`       | `RequestMutation.update_ticket()`           | 更新工單狀態（含狀態機驗證）      |
| `mutation CreateTicketTask`   | `TicketTaskMutation.create_ticket_task()`   | 建立任務                          |
| `mutation UpdateTicketTask`   | `TicketTaskMutation.update_ticket_task()`   | 更新任務狀態/審核                 |
| `mutation CreateTaskProperty` | `TicketTaskMutation.create_task_property()` | 新增任務結構化屬性                |

---

## 五、資料流（以查詢站點為例）

```
React Component
   │
   │  const [result] = useQuery({
   │    query: GetStationsDocument,      // codegen 生成的 typed document
   │    variables: { skip: 0, limit: 50 }
   │  })
   │
   ▼
Urql Client  (libs/data-access/src/client/urql.ts)
   │
  │  POST <你的 GraphQL Endpoint，例如 http://localhost:8000/graphql>
   │  Body: { query: "query GetStations...", variables: {...} }
   │  Header: Authorization: Bearer <JWT>  (如果已登入)
   │
   ▼
graphcache  (libs/data-access/src/client/cache.ts)
   │
   │  快取命中？→ 直接回傳快取資料（不發 HTTP 請求）
   │  快取未命中？→ 繼續往下
   │
   ▼
FastAPI /graphql  （後端）
   │
   │  Strawberry 解析 query
   │  → GeoQuery.stations(bounds, skip, limit)
   │  → SQLAlchemy 執行 SELECT ... FROM station WHERE delete_at IS NULL
   │     （若有 bounds → 加上 ST_Intersects 地理過濾）
   │
   ▼
Response: {
  "data": {
    "stations": {
      "items": [...],
      "pageInfo": { "totalCount": 120, "hasNextPage": true, ... }
    }
  }
}
   │
   ▼
graphcache 合併 items（connectionPagination resolver）
   │
   ▼
React Component 取得型別安全的資料
```

---

## 六、分頁機制說明

後端使用 **Offset Pagination**（`skip` + `limit`），回傳 Connection 型別：

```graphql
type StationConnection {
  items: [StationType!]!
  pageInfo: PageInfo!
}

type PageInfo {
  totalCount: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}
```

前端的 `graphcache` 設定了 `connectionPagination` resolver（`cache.ts`），
每次請求不同 `skip` 值時，會**自動將歷史頁面的 items 合併累積**，
無需在 React 組件裡手動管理已載入的資料陣列：

```tsx
// React 組件
const [page, setPage] = useState(0);
const [result] = useQuery({
  query: GetStationsDocument,
  variables: { skip: page * 50, limit: 50 },
});

// result.data.stations.items 永遠是「到目前為止所有載入過的站點」的合集
```

---

## 七、認證（JWT）

後端以 JWT Bearer Token 進行認證，透過 `Authorization` header 傳遞：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5...
```

`createUrqlClient` 現在會自動解析 GraphQL endpoint，優先順序如下：

1. `GRAPHQL_URL`（server-only）
2. `NEXT_PUBLIC_GRAPHQL_URL`
3. 從 `NEXT_PUBLIC_API_BASE_URL` 推導（例如 `http://localhost:8000/api` → `http://localhost:8000/graphql`）

`demo` 使用 NextAuth credentials provider 呼叫後端登入 API，並把後端回傳的 JWT 保存到 NextAuth JWT session。RSC/server-side GraphQL 請求可透過 `getServerAuthSession()` 讀取 session 內的 token，client-side GraphQL 則透過 `SessionProvider` / `useSession()` 取得同一份 token。

範例：

```ts
const client = createUrqlClient({
  getToken: () => session?.accessToken,
});
```

**無 token：** 公開 Query（站點列表、工單列表）仍可正常查詢  
**有 token：** 所有 Mutation 操作（建立/更新/刪除）才能執行

**RSC / server-side Query：** 可透過 `apps/demo/src/lib/urql-rsc.ts` 的 `getServerUrqlClient()` 從 NextAuth server session 讀取 token；server-side 預設會以 `cache: 'no-store'` 發送 GraphQL 請求，避免 Next RSC fetch cache 造成舊資料殘留。

---

## 八、Codegen 工作流程

`.graphql` 文件是 **codegen 的輸入來源**，執行 codegen 後會生成：

```
pnpm codegen
     │
  ├── 讀取 libs/data-access/schema.graphql
     ├── 掃描 src/graphql/**/*.graphql
     │
     └── 輸出 src/__generated__/graphql.ts
           ├── 所有型別定義（TypeScript interfaces）
           ├── Typed document nodes（TypedDocumentNode<...>）
           └── Fragment helper functions（getFragmentData）
```

目前 `libs/data-access/codegen.ts` 已設定：

- `schema: 'libs/data-access/schema.graphql'`（預設使用本地 schema 快照）
- `documentMode: 'documentNode'`（可直接給 urql 使用）
- `GeoJSON` scalar 映射到 `geojson#Geometry`

### 什麼時候需要重建 schema.graphql？

- 後端 GraphQL schema 有變更（新增欄位、改型別、調整 query/mutation）時
- 然後再跑一次 `pnpm codegen`

### 目前建議流程

1. 用 backend image 匯出最新 schema 到 `Frontend/libs/data-access/schema.graphql`
2. 在 Frontend 執行 `pnpm codegen`
3. 前端直接 import generated `*Document` 搭配 `@urql/next` 的 `useQuery/useMutation`

生成後，React 組件可以直接使用完整型別：

```tsx
import {
  GetStationsDocument,
  type GetStationsQuery,
} from '@rescue-frontend/data-access';

const [result] = useQuery<GetStationsQuery>({ query: GetStationsDocument });
//     ^-- 完整型別推導，包含 result.data.stations.items[0].uuid 等所有欄位
```

---

## 九、目前可用 GraphQL Service 清單（以 generated 檔為準）

以下清單來自 `libs/data-access/src/__generated__/graphql.ts` 的 `export const *Document`。
實務上可視為「前端目前可直接 import 使用的 GraphQL service」。

### Fragments

- `PageInfoFieldsFragmentDoc`
- `StationFieldsFragmentDoc`
- `ClosureAreaFieldsFragmentDoc`
- `TicketFieldsFragmentDoc`
- `TicketTaskFieldsFragmentDoc`

### Queries

- `GetStationsDocument`
- `GetStationDocument`
- `GetClosureAreasDocument`
- `GetClosureAreaDocument`
- `GetTicketsDocument`
- `GetTicketDocument`
- `GetTicketTasksDocument`

### Mutations

- `CreateStationDocument`
- `UpdateStationDocument`
- `DeleteStationDocument`
- `CreateStationPropertyDocument`
- `CreateCrowdSourcingDocument`
- `CreateTicketDocument`
- `UpdateTicketDocument`
- `CreateTicketTaskDocument`
- `UpdateTicketTaskDocument`
- `CreateTaskPropertyDocument`

## 十、快速參考：新增一個查詢

1. **在 `.graphql` 文件裡新增 query**（或新建一個 `*.graphql`）
2. **若後端 schema 有變化，先更新 `libs/data-access/schema.graphql`**
3. **執行 codegen**：`pnpm codegen`
4. **在 React 組件裡使用**：
   ```tsx
   import { MyNewQueryDocument } from '@rescue-frontend/data-access';
   const [result] = useQuery({ query: MyNewQueryDocument });
   ```

不需要手動寫任何 fetch 邏輯、型別宣告或 response 解析。

---

## 十一、urql 實際呼叫方式（現在可直接照做）

### 1. App 初始化：以 `@urql/next` 注入 client provider

```tsx
'use client';

import {
  createUrqlClient,
  createUrqlExchanges,
} from '@rescue-frontend/data-access';
import { useSession } from 'next-auth/react';
import { UrqlProvider, ssrExchange } from '@urql/next';
import { useEffect, useRef, useState } from 'react';

export function AppRoot() {
  const tokenRef = useRef<string | undefined>(undefined);
  const { data: session } = useSession();
  const [{ client, ssr }] = useState(() => {
    const ssr = ssrExchange({ isClient: typeof window !== 'undefined' });
    const client = createUrqlClient({
      getToken: () => tokenRef.current,
      exchanges: createUrqlExchanges(ssr),
      suspense: true,
    });

    return { client, ssr };
  });

  useEffect(() => {
    tokenRef.current = session?.accessToken;
  }, [session?.accessToken]);

  return (
    <UrqlProvider client={client} ssr={ssr}>
      <App />
    </UrqlProvider>
  );
}
```

### 2. RSC Query：server component 直接查資料

```tsx
import { GetStationsDocument } from '@rescue-frontend/data-access';
import { getServerUrqlClient } from '@/lib/urql-rsc';

export default async function StationListPage() {
  const client = await getServerUrqlClient();
  const result = await client.query(GetStationsDocument, {
    skip: 0,
    limit: 50,
    stationType: 'shelter',
  });

  return (
    <ul>
      {result.data?.stations.items.map((station) => (
        <li key={station.uuid}>{station.name ?? station.uuid}</li>
      ))}
    </ul>
  );
}
```

### 3. Client Query：使用 generated Document

```tsx
'use client';

import { useQuery } from '@urql/next';
import { GetStationsDocument } from '@rescue-frontend/data-access';

export function StationList() {
  const [{ data, fetching, error }] = useQuery({
    query: GetStationsDocument,
    variables: { skip: 0, limit: 50, stationType: 'shelter' },
  });

  if (fetching) return <div>Loading...</div>;
  if (error) return <div>{error.message}</div>;

  return (
    <ul>
      {data?.stations.items.map((s) => (
        <li key={s.uuid}>{s.name ?? s.uuid}</li>
      ))}
    </ul>
  );
}
```

### 4. Mutation：完成後 refresh RSC 資料

```tsx
'use client';

import { useMutation } from '@urql/next';
import { CreateTicketDocument } from '@rescue-frontend/data-access';
import { useRouter } from 'next/navigation';

export function CreateTicketButton() {
  const router = useRouter();
  const [, createTicket] = useMutation(CreateTicketDocument);

  const onClick = async () => {
    const result = await createTicket({
      input: {
        title: '需要飲用水',
        contactName: '王小明',
        geometry: { type: 'Point', coordinates: [121.56, 25.04] },
      },
    });

    if (result.error) {
      console.error(result.error);
      return;
    }

    router.refresh();
    console.log(result.data?.createTicket.uuid);
  };

  return <button onClick={onClick}>建立工單</button>;
}
```

### 5. 常見注意事項

- `libs/data-access/src/__generated__/` 為自動生成，不要手改
- GraphQL operation 一律寫在 `libs/data-access/src/graphql/**/*.graphql`
- 後端 schema 有變，先更新 `libs/data-access/schema.graphql` 再跑 `pnpm codegen`
- `GeoJSON` 型別在前端由 `geojson` 套件的 `Geometry` 表示
- 若要讓 authenticated RSC 生效，`demo` 需要透過 NextAuth 登入流程建立 session；server-side token 由 `getServerAuthSession()` 讀取，不再依賴瀏覽器同步 `access_token` cookie
