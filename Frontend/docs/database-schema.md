# 後端資料庫結構說明

> 技術棧：PostgreSQL 16 + PostGIS 3.4 + SQLAlchemy 2.0（async）
> Migration 工具：Alembic
> 最後 Migration：`ecff746c61a6` — 新增 user_group_assign 唯一約束

---

## 一、全域設計規則

### 共用 Mixin

所有主要資料表都繼承以下 Mixin，提供共用欄位：

| Mixin            | 欄位                 | 說明                              |
| ---------------- | -------------------- | --------------------------------- |
| `UUIDPKMixin`    | `uuid` (PK, UUID v4) | 主鍵，自動生成                    |
| `TimestampMixin` | `created_at`         | 建立時間（server default: now()） |
|                  | `updated_at`         | 更新時間（自動 onupdate）         |
|                  | `delete_at`          | **軟刪除**時間戳（NULL = 未刪除） |

> **軟刪除機制**：所有刪除操作只設定 `delete_at`，不實際刪除資料列。
> 查詢時一律加上 `WHERE delete_at IS NULL` 過濾。

### 地理座標系統

- **坐標系統**：WGS84（EPSG:4326）
- **資料格式**：GeoJSON（透過 GeoAlchemy2 ↔ Shapely 轉換）
- **支援類型**：`GEOMETRY`（通用，可存 Point、Polygon、MultiPolygon 等）
- **空間索引**：PostGIS 自動建立 GiST 索引，支援 `ST_Intersects`、`ST_Within` 等空間查詢

---

## 二、資料表總覽

```
┌─────────────── 認證與權限 ────────────────┐
│  users                                   │
│  groups                                  │
│  policies                                │
│  user_group_assign    (user ↔ group)     │
│  policy_user_assign   (policy ↔ user)    │
│  policy_group_assign  (policy ↔ group)   │
└──────────────────────────────────────────┘

┌─────────── 地理空間（多型繼承）────────────┐
│  base_geometries      (父表 - 共用欄位)   │
│    ├── stations       (救災站點)          │
│    ├── closure_areas  (封閉區域)          │
│    └── tickets        (救援工單)          │
└──────────────────────────────────────────┘

┌─────────── 站點附屬資料 ───────────────────┐
│  secondary_locations  (地址/電桿詳細位置)  │
│  station_properties   (物資/設施/服務)    │
│  crowd_sourcing       (民眾評分)          │
└──────────────────────────────────────────┘

┌─────────── 工單附屬資料 ───────────────────┐
│  ticket_tasks         (任務)              │
│  task_properties      (任務結構化屬性)    │
│  task_assignments     (任務指派)          │
│  photos               (工單照片)          │
└──────────────────────────────────────────┘

┌─────────── 設定資料 ───────────────────────┐
│  station_property_config  (站點屬性 Schema)│
│  task_property_config     (任務屬性 Schema)│
└──────────────────────────────────────────┘

┌─────────── 路線 ───────────────────────────┐
│  routes               (站點間路線)         │
└──────────────────────────────────────────┘
```

---

## 三、詳細資料表說明

### 🔐 認證與權限

#### `users` — 使用者

| 欄位                | 型態         | 說明                                             |
| ------------------- | ------------ | ------------------------------------------------ |
| `uuid`              | UUID (PK)    | 主鍵                                             |
| `name`              | VARCHAR(100) | 顯示名稱                                         |
| `password`          | VARCHAR(512) | 格式：`<algo>$<iter>$<salt-fe>$<salt-be>$<hash>` |
| `credibility_score` | FLOAT        | 信譽分數（預設 50.0，用於群眾評分加權）          |
| `created_at`        | TIMESTAMPTZ  | 建立時間                                         |
| `updated_at`        | TIMESTAMPTZ  | 更新時間                                         |
| `delete_at`         | TIMESTAMPTZ  | 軟刪除                                           |

---

#### `groups` — 使用者群組 / 角色

| 欄位   | 型態         | 說明                                     |
| ------ | ------------ | ---------------------------------------- |
| `uuid` | UUID (PK)    | 主鍵                                     |
| `name` | VARCHAR(100) | 群組名稱（如：admin、volunteer、viewer） |

---

#### `policies` — RBAC 權限政策

| 欄位          | 型態                | 說明                              |
| ------------- | ------------------- | --------------------------------- |
| `uuid`        | UUID (PK)           | 主鍵                              |
| `name`        | VARCHAR(100) UNIQUE | 政策名稱（如：`map_full_access`） |
| `description` | VARCHAR(255)        | 說明                              |
| `category`    | VARCHAR(50)         | 分類（如：`map`, `request`）      |
| `read`        | VARCHAR(50)         | 讀取範圍：`all` / `own` / `none`  |
| `create`      | VARCHAR(50)         | 建立範圍：`all` / `own` / `none`  |
| `edit`        | VARCHAR(50)         | 編輯範圍：`all` / `own` / `none`  |
| `delete`      | VARCHAR(50)         | 刪除範圍：`all` / `own` / `none`  |

**Scope 值說明：**

- `all`：可操作任何人的資料
- `own`：只能操作自己建立的資料
- `none`：無任何權限（鎖定）

---

#### `user_group_assign` — 使用者 ↔ 群組

| 欄位         | 型態        | 說明   |
| ------------ | ----------- | ------ |
| `uuid`       | UUID (PK)   | —      |
| `user_uuid`  | FK → users  | 使用者 |
| `group_uuid` | FK → groups | 群組   |

> ⚠️ 唯一約束：`(user_uuid, group_uuid)` — 同一使用者不能重複加入同一群組

---

#### `policy_user_assign` — 政策 ↔ 使用者（直接指派）

| 欄位          | 型態          | 說明 |
| ------------- | ------------- | ---- |
| `user_uuid`   | FK → users    | —    |
| `policy_uuid` | FK → policies | —    |

---

#### `policy_group_assign` — 政策 ↔ 群組

| 欄位          | 型態          | 說明 |
| ------------- | ------------- | ---- |
| `group_uuid`  | FK → groups   | —    |
| `policy_uuid` | FK → policies | —    |

---

### 🗺️ 地理空間（多型繼承）

> **設計說明**：`base_geometries` 是父表（Joined Table Inheritance）。
> `stations`、`closure_areas`、`tickets` 都繼承它，共用地理座標與時間戳欄位，
> 並各自用 `property_name` 欄位作為多型識別字（`polymorphic_identity`）。

#### `base_geometries` — 地理實體父表

| 欄位            | 型態                 | 說明                                             |
| --------------- | -------------------- | ------------------------------------------------ |
| `uuid`          | UUID (PK)            | 主鍵                                             |
| `property_name` | VARCHAR(50)          | 多型識別：`station` / `closure_area` / `request` |
| `geometry`      | GEOMETRY (SRID 4326) | 地理座標（PostGIS）                              |
| `created_by`    | FK → users           | 建立者                                           |
| `created_at`    | TIMESTAMPTZ          | —                                                |
| `updated_at`    | TIMESTAMPTZ          | —                                                |
| `delete_at`     | TIMESTAMPTZ          | 軟刪除                                           |

---

#### `stations` — 救災站點

繼承 `base_geometries`（共用 geometry、created_by、時間戳）。

| 欄位                  | 型態                      | 說明                                            |
| --------------------- | ------------------------- | ----------------------------------------------- |
| `uuid`                | FK (PK) → base_geometries | —                                               |
| `type`                | VARCHAR(50)               | 站點類型（shelter / supply / medical / ...）    |
| `name`                | VARCHAR                   | 站點名稱                                        |
| `description`         | VARCHAR                   | 描述                                            |
| `op_hour`             | VARCHAR(100)              | 營運時間（文字描述）                            |
| `level`               | INTEGER                   | 優先等級（預設 0）                              |
| `comment`             | VARCHAR                   | 備註                                            |
| `source`              | VARCHAR(50)               | 資料來源（`user` / `official`）                 |
| `visibility`          | VARCHAR(50)               | 可見性（`public` / `private`）                  |
| `verification_status` | VARCHAR(50)               | 驗證狀態（`pending` / `verified` / `rejected`） |
| `confidence_score`    | FLOAT                     | 信心分數（去重複時使用）                        |
| `is_duplicate`        | BOOLEAN                   | 是否為重複資料                                  |
| `dedup_group_id`      | VARCHAR                   | 去重複群組 ID                                   |
| `is_temporary`        | BOOLEAN                   | 是否為臨時站點                                  |
| `expires_at`          | TIMESTAMPTZ               | 臨時站點到期時間                                |
| `is_official`         | BOOLEAN                   | 是否為官方資料                                  |
| `priority_score`      | FLOAT                     | 優先分數（排序用）                              |
| `updated_by`          | FK → users                | 最後更新人                                      |
| `child_station_uuid`  | FK → stations             | 子站點（站點階層）                              |

**GraphQL 可查詢的篩選條件：**

- `bounds: BoundsInput` — 地理邊界框（`ST_Intersects`）
- `stationType: String` — 站點類型完全匹配

---

#### `closure_areas` — 封閉區域

繼承 `base_geometries`（geometry 為 Polygon/MultiPolygon）。

| 欄位                 | 型態                      | 說明                                    |
| -------------------- | ------------------------- | --------------------------------------- |
| `uuid`               | FK (PK) → base_geometries | —                                       |
| `status`             | VARCHAR(50)               | 封閉狀態（`active` / `resolved` / ...） |
| `information_source` | VARCHAR                   | 資訊來源（官方公告、民眾回報等）        |
| `comment`            | VARCHAR                   | 備註                                    |

---

#### `tickets` — 救援工單

繼承 `base_geometries`（geometry 為事發地點 Point）。

| 欄位                  | 型態                      | 說明                                             |
| --------------------- | ------------------------- | ------------------------------------------------ |
| `uuid`                | FK (PK) → base_geometries | —                                                |
| `title`               | VARCHAR(200)              | 工單標題                                         |
| `description`         | VARCHAR                   | 詳細描述                                         |
| `contact_name`        | VARCHAR(100)              | 聯絡人姓名                                       |
| `contact_email`       | VARCHAR(100)              | 聯絡信箱（可選）                                 |
| `contact_phone`       | VARCHAR(50)               | 聯絡電話（可選）                                 |
| `status`              | VARCHAR(50)               | 狀態（見下方狀態機）                             |
| `priority`            | VARCHAR(20)               | 優先級（`low` / `medium` / `high` / `critical`） |
| `task_type`           | VARCHAR(50)               | 主要任務類型                                     |
| `visibility`          | VARCHAR(50)               | 可見性（`public` / `private`）                   |
| `verification_status` | VARCHAR(50)               | 驗證狀態                                         |
| `review_note`         | VARCHAR                   | 審核備注                                         |

**工單狀態機：**

```
pending → in_progress → completed
       ↘              ↘
         cancelled      cancelled
```

**GraphQL 可查詢的篩選條件：**

- `bounds: BoundsInput` — 地理邊界框
- `status: String` — 狀態精確匹配
- `priority: String` — 優先級精確匹配

---

### 📍 站點附屬資料

#### `secondary_locations` — 詳細地址 / 電桿位置

| 欄位              | 型態                 | 說明                                   |
| ----------------- | -------------------- | -------------------------------------- |
| `uuid`            | UUID (PK)            | —                                      |
| `geometry_uuid`   | FK → base_geometries | 關聯的地理實體                         |
| `location_type`   | VARCHAR(50)          | `address`（門牌地址）或 `pole`（電桿） |
| `county`          | VARCHAR(50)          | 縣市                                   |
| `city`            | VARCHAR(50)          | 鄉鎮市區                               |
| `lane`            | VARCHAR(20)          | 巷                                     |
| `alley`           | VARCHAR(20)          | 弄                                     |
| `no`              | VARCHAR(20)          | 號                                     |
| `floor`           | VARCHAR(20)          | 樓                                     |
| `room`            | VARCHAR(20)          | 室                                     |
| `pole_id`         | VARCHAR(50)          | 電桿編號                               |
| `pole_type`       | VARCHAR(50)          | 電桿類型                               |
| `pole_photo_uuid` | VARCHAR              | 電桿照片 UUID                          |
| `pole_note`       | VARCHAR              | 電桿備注                               |

---

#### `station_properties` — 站點屬性（物資 / 設施 / 服務）

| 欄位            | 型態          | 說明                                       |
| --------------- | ------------- | ------------------------------------------ |
| `uuid`          | UUID (PK)     | —                                          |
| `station_uuid`  | FK → stations | 所屬站點                                   |
| `property_type` | VARCHAR(50)   | 類型：`facility` / `supply` / `service`    |
| `property_name` | VARCHAR(100)  | 屬性名稱（如：「飲水」、「床位」）         |
| `quantity`      | INTEGER       | 數量（可選）                               |
| `comment`       | VARCHAR       | 備注                                       |
| `status`        | VARCHAR(50)   | 狀態：`pending` / `confirmed` / `depleted` |
| `weightings`    | FLOAT         | 群眾評分加權係數（預設 1.0）               |
| `created_by`    | FK → users    | 回報者                                     |
| `created_at`    | TIMESTAMPTZ   | —                                          |
| `delete_at`     | TIMESTAMPTZ   | 軟刪除                                     |

---

#### `crowd_sourcing` — 群眾評分

| 欄位                     | 型態                    | 說明                            |
| ------------------------ | ----------------------- | ------------------------------- |
| `uuid`                   | UUID (PK)               | —                               |
| `station_uuid`           | FK → stations           | 所屬站點                        |
| `item_uuid`              | FK → station_properties | 評分的具體屬性（可選）          |
| `user_uuid`              | FK → users              | 評分者                          |
| `user_credibility_score` | FLOAT                   | 評分時的信譽分數（快照）        |
| `rating`                 | VARCHAR(20)             | 評分：`up` / `neutral` / `down` |
| `n_updates`              | INTEGER                 | 此使用者更新評分的次數          |
| `distance_from_geometry` | FLOAT                   | 評分時距離站點的距離（公尺）    |

> **設計說明**：同一使用者對同一 `item_uuid` 只保留一筆評分記錄，
> 重複評分時用 UPDATE 取代，並遞增 `n_updates`。

---

### 🎫 工單附屬資料

#### `ticket_tasks` — 工單任務

| 欄位                | 型態         | 說明                                                 |
| ------------------- | ------------ | ---------------------------------------------------- |
| `uuid`              | UUID (PK)    | —                                                    |
| `ticket_uuid`       | FK → tickets | 所屬工單                                             |
| `route_uuid`        | FK → routes  | 關聯路線（可選）                                     |
| `task_type`         | VARCHAR(50)  | 任務類型（`rescue` / `supply` / `hr` / ...）         |
| `task_name`         | VARCHAR(200) | 任務名稱                                             |
| `task_description`  | VARCHAR      | 詳細描述                                             |
| `quantity`          | INTEGER      | 數量（人數、物資量等）                               |
| `status`            | VARCHAR(50)  | 狀態（同工單狀態機）                                 |
| `source`            | VARCHAR(50)  | 來源（`user` / `official`）                          |
| `progress_note`     | VARCHAR      | 執行進度備注                                         |
| `confidence_score`  | FLOAT        | 信心分數                                             |
| `is_duplicate`      | BOOLEAN      | 是否重複                                             |
| `moderation_status` | VARCHAR(50)  | 審核狀態：`pending_review` / `approved` / `rejected` |
| `visibility`        | VARCHAR(50)  | 可見性                                               |
| `review_note`       | VARCHAR      | 審核備注                                             |

**GraphQL 可查詢的篩選條件：**

- `ticketUuid: String!` — 必填，依工單查詢
- `status: String` — 狀態精確匹配

---

#### `task_properties` — 任務結構化屬性

| 欄位             | 型態              | 說明                                         |
| ---------------- | ----------------- | -------------------------------------------- |
| `uuid`           | UUID (PK)         | —                                            |
| `task_uuid`      | FK → ticket_tasks | 所屬任務                                     |
| `property_name`  | VARCHAR(100)      | 屬性鍵（如：`required_skill`、`cargo_type`） |
| `property_value` | VARCHAR           | 屬性值                                       |
| `quantity`       | INTEGER           | 數量（可選）                                 |
| `status`         | VARCHAR(50)       | 狀態                                         |
| `comment`        | VARCHAR           | 備注                                         |
| `created_by`     | FK → users        | 建立者                                       |

---

#### `task_assignments` — 任務指派

| 欄位          | 型態              | 說明                          |
| ------------- | ----------------- | ----------------------------- |
| `uuid`        | UUID (PK)         | —                             |
| `task_uuid`   | FK → ticket_tasks | 所屬任務                      |
| `actor_uuid`  | FK → users        | 被指派的使用者                |
| `role`        | VARCHAR(100)      | 角色（如：`lead`、`support`） |
| `assigned_at` | TIMESTAMPTZ       | 指派時間                      |

---

#### `photos` — 照片

| 欄位         | 型態         | 說明                                    |
| ------------ | ------------ | --------------------------------------- |
| `uuid`       | UUID (PK)    | —                                       |
| `ref_uuid`   | VARCHAR      | 關聯對象的 UUID（Polymorphic，不用 FK） |
| `ref_type`   | VARCHAR(50)  | 關聯類型：`ticket` / `pole`             |
| `url`        | VARCHAR(500) | 圖片 URL                                |
| `created_by` | FK → users   | 上傳者                                  |
| `created_at` | TIMESTAMPTZ  | —                                       |
| `delete_at`  | TIMESTAMPTZ  | 軟刪除                                  |

---

### ⚙️ 設定資料表

#### `station_property_config` — 站點屬性 Schema 設定

| 欄位            | 型態         | 說明                                      |
| --------------- | ------------ | ----------------------------------------- |
| `uuid`          | UUID (PK)    | —                                         |
| `station_type`  | VARCHAR(50)  | 站點類型（`shelter` / `all`）             |
| `property_name` | VARCHAR(100) | 屬性名稱                                  |
| `data_type`     | VARCHAR(50)  | 資料型態（`string` / `integer` / `enum`） |
| `enum_options`  | JSON         | 列舉選項（`data_type = enum` 時使用）     |

> `station_type = "all"` 表示適用所有站點類型的通用屬性。

---

#### `task_property_config` — 任務屬性 Schema 設定

| 欄位            | 型態         | 說明     |
| --------------- | ------------ | -------- |
| `uuid`          | UUID (PK)    | —        |
| `task_type`     | VARCHAR(50)  | 任務類型 |
| `property_name` | VARCHAR(100) | 屬性名稱 |
| `data_type`     | VARCHAR(50)  | 資料型態 |
| `enum_options`  | JSON         | 列舉選項 |

---

### 🗺️ 路線

#### `routes` — 站點間路線

| 欄位               | 型態                 | 說明 |
| ------------------ | -------------------- | ---- |
| `uuid`             | UUID (PK)            | —    |
| `origin_uuid`      | FK → base_geometries | 起點 |
| `destination_uuid` | FK → base_geometries | 終點 |

---

## 四、分頁參數說明

GraphQL 中有分頁的 Query 一律使用 **Offset Pagination**：

| 參數    | 型態 | 預設值 | 說明                 |
| ------- | ---- | ------ | -------------------- |
| `skip`  | Int  | `0`    | 跳過的筆數（偏移量） |
| `limit` | Int  | `50`   | 每次回傳的最大筆數   |

**回傳的 Connection 結構：**

```graphql
{
  items: [...]       # 本次查詢的資料陣列
  pageInfo: {
    totalCount: Int      # 符合條件的總筆數（未分頁）
    hasNextPage: Boolean # 是否還有下一頁
    hasPreviousPage: Boolean # 是否有上一頁
  }
}
```

**支援分頁的 Query 清單：**

| Query                    | 分頁         | 預設 limit |
| ------------------------ | ------------ | ---------- |
| `stations`               | ✅           | 50         |
| `closureAreas`           | ✅           | 50         |
| `tickets`                | ✅           | 50         |
| `ticketTasks`            | ✅           | 50         |
| `stationPropertyConfigs` | ❌（無分頁） | —          |
| `taskPropertyConfigs`    | ❌（無分頁） | —          |

---

## 五、ER Diagram（簡化版）

```
users ──────────────────────────────────────────────────────────┐
  │                                                             │
  ├── user_group_assign ── groups ── policy_group_assign ──┐   │
  │                                                        │   │
  └── policy_user_assign ─────────────────────────────── policies
  │
  └── (created_by)
         │
base_geometries ────────────────────────────────────────────────┐
  │   (geometry: SRID 4326)                                      │
  ├── stations ──── station_properties ──── crowd_sourcing       │
  │      └────────── secondary_locations                         │
  │                                                              │
  ├── closure_areas                                              │
  │                                                              │
  └── tickets ─────── ticket_tasks ───── task_properties         │
                           │ └───────── task_assignments         │
                           │                                     │
                       routes ─────────────────────────── (FK) ─┘
  │
  └── photos  (ref_uuid + ref_type, polymorphic)
```

---

## 六、Migration 歷史紀錄

| ID             | 名稱                                | 說明                                                                                                                                                 |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `60fa7227481a` | initial_schema                      | 初始建表（users, groups, policies, geo, tickets, stations, crowd_sourcing）                                                                          |
| `a2a8e4d8c51d` | ticket_tasks_and_property_configs   | 新增 ticket_tasks, task_properties, task_assignments, station_property_config, task_property_config, routes, photos; 重構 stations 加入驗證/去重欄位 |
| `5c6103762349` | add_salt_fields_to_user             | users.password 欄位擴展支援 salt                                                                                                                     |
| `4d87b614aece` | consolidate_password_fields         | 合併 password 欄位格式                                                                                                                               |
| `ecff746c61a6` | add_unique_constraint_to_user_group | `user_group_assign(user_uuid, group_uuid)` 加上唯一約束                                                                                              |
