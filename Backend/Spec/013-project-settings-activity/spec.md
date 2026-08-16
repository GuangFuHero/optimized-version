# Design: Project Settings & Account Activity（專案起始資料設定 + 帳號登入/最後活動時間）

**Date**: 2026-08-16
**Feature**: 013-project-settings-activity
**Status**: Approved design, pending implementation
**Notion**: 補齊功能 →「後台 - 專案起始資料設定 + 帳號登入/最後活動時間」（backend-Popo，08-13~08-17）
**Depends on**: 動態欄位設定（`app/models/property_config.py`）、session 機制（`app/repositories/session_repository.py`）、admin API（`app/api/v1/endpoints/admin.py`）

---

## 1. 概述

這張票的兩半彼此無關，共通點只是「都屬於後台系統管理頁面」：

- **前半**：讓後台能設定「這場災害是哪些型別」，並據此決定動態欄位要顯示哪些。
- **後半**：讓後台看得到每個帳號的最後登入與最後活動時間。

### 目標
- 後台可設定專案名稱與**混合型災害的型別集合**（土石流 + 水災 + …）。
- 動態欄位可依災害型別**開關顯示**（火災才顯示「樓層救援」）。
- 後台使用者列表能看到最後登入時間、最後活動時間、目前登入裝置數。

### 非目標（YAGNI，明確排除）
- **project / disaster_event entity**：一個部署承載一場（混合型）災害，`tickets` / `stations` / `ticket_tasks` **不加事件外鍵**（ADR-090）。
- **災難欄位範本表與套用動作**：定義與啟用分離後，範本機制不再必要（ADR-091）。
- **動態欄位的寫入驗證**：config 是給前端渲染的定義，不做強制（ADR-092）。
- **精確到秒的活動時間**：粒度約 15 分鐘即可（ADR-093）。
- **範本的實際欄位內容**：PM-Scure 的「三種災難情境下的動態欄位」「泥石流範本先行」才是內容來源，本票只做承載機制。
- **BE-MULTI-1 的多災害 DB 分庫**：不在本票範圍。

---

## 2. 前半：專案起始資料設定

### 2.1 現況

codebase 裡**沒有 project / disaster event / campaign 之類的 entity**。唯一沾到的是 `tickets.disaster_type`（自由字串，`app/models/request.py:25`），沒有對應主檔。

現有的初始化機制是三個需人工執行的腳本：

```
scripts/seed_rbac.py            角色 × 權限矩陣預設值
scripts/bootstrap_admin.py      建立第一個 super_admin
scripts/seed_mock_scenarios.sql 假資料
```

### 2.2 「定義」與「啟用」分離

這是本設計的核心簡化。動態欄位設定裡混著兩個不同概念：

| 概念 | 內容 | 唯一性 |
|---|---|---|
| **定義** | 「樓層救援」是什麼資料型別、有哪些選項（`data_type` / `enum_options`） | **全域唯一**，每個 `(target_type, property_name)` 一份 |
| **啟用** | 哪些災害型別要顯示這個欄位 | 一個集合，如 `{fire}` |

拆開之後，「土石流範本說是 number、水災範本說是 enum」這類衝突**在結構上不可能發生**——定義只有一份，災害型別只決定要不要顯示。因此不需要範本表、套用動作或衝突偵測。

### 2.3 Schema

```sql
-- 單列全域設定
CREATE TABLE project_settings (
    uuid           UUID PRIMARY KEY,
    name           varchar(100) NOT NULL,
    disaster_types text[]       NOT NULL DEFAULT '{}',   -- 可複選：{landslide, flood}
    started_at     timestamptz,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);

-- 動態欄位設定：加「啟用於哪些災害型別」
ALTER TABLE station_property_config ADD COLUMN disaster_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE task_property_config    ADD COLUMN disaster_types text[] NOT NULL DEFAULT '{}';

-- 表單渲染必需的三個欄位（ADR-095）
ALTER TABLE station_property_config ADD COLUMN label      varchar(100);
ALTER TABLE station_property_config ADD COLUMN sort_order int     NOT NULL DEFAULT 0;
ALTER TABLE station_property_config ADD COLUMN is_active  boolean NOT NULL DEFAULT true;
ALTER TABLE task_property_config    ADD COLUMN label      varchar(100);
ALTER TABLE task_property_config    ADD COLUMN sort_order int     NOT NULL DEFAULT 0;
ALTER TABLE task_property_config    ADD COLUMN is_active  boolean NOT NULL DEFAULT true;

-- 補上應用層 upsert 本來就假設、DB 卻沒保證的唯一鍵
ALTER TABLE station_property_config ADD CONSTRAINT uq_station_prop UNIQUE (station_type, property_name);
ALTER TABLE task_property_config    ADD CONSTRAINT uq_task_prop    UNIQUE (task_type, property_name);
```

**`property_name` 是鍵，不可變**（ADR-095）。`station_properties.property_name` / `task_properties.property_name` 是**以字串**對應到 config，沒有外鍵（`app/models/station_property.py:16`、`app/models/ticket_task.py:47`）——改名會讓既有資料變成孤兒。顯示文字改用 `label`（`label IS NULL` 時前端回退顯示 `property_name`）。

`disaster_types = '{}'`（空陣列）代表**不分災害型別，一律啟用**——沿用 `station_type = 'all'` 的既有慣例（`app/repositories/config_repository.py:17-26`）。

**單列保證**：`project_settings` 恆定一列，以固定 PK 或 `CHECK`／唯一部分索引達成，落地時決定。

### 2.4 查詢

`list_by_type` 追加災害型別過濾：

```sql
WHERE (station_type = :station_type OR station_type = 'all')
  AND (disaster_types = '{}' OR disaster_types && :current_disaster_types)
```

`&&` 是 PostgreSQL 的陣列交集運算子——混合災害天然支援，不需要迴圈或多次查詢。

停用的欄位不回傳：查詢一律追加 `AND is_active = true`。排序改為 `ORDER BY sort_order, property_name`——目前完全沒有 `ORDER BY`（`app/repositories/config_repository.py:17-26`），前端拿到的順序不保證穩定。

當前災害型別集合從 `project_settings.disaster_types` 讀取，每次請求查一次（單列表，可快取於 request scope）。

---

## 3. 後半：帳號登入／最後活動時間

### 3.1 現況

| 項目 | 狀況 |
|---|---|
| 最後登入時間 | 欄位與寫入都有（`users.last_login_at`，寫於 `app/api/v1/endpoints/auth/session.py:59`、`sso.py:83`/`:163`），但**後台讀不到**——`AdminUserListItem` 只有 `uuid` / `name` / `team_uuid` / `platform_role` / `team_role`（`app/schemas/admin.py:9-16`） |
| 最後活動時間 | **完全不存在。** Redis session 有 `last_used_at`，但只在 refresh token 輪替時更新（`app/repositories/session_repository.py:96`），且 14 天 TTL 到期即消失 |

### 3.2 設計

`users` 新增 `last_activity_at`，**在 refresh token 輪替時寫入**——`session_repository.rotate()` 本來就在更新 session 記錄，順手多寫一次 DB。

access token TTL 為 15 分鐘（`ACCESS_TOKEN_EXPIRE_MINUTES`），活躍使用者大約每 15 分鐘輪替一次，因此 `last_activity_at` 的誤差在 15 分鐘內。後台用途是判斷「這個帳號還活著嗎、該不該回收權限」，這個粒度綽綽有餘。

### 3.3 後台欄位

`AdminUserListItem` 增加：

| 欄位 | 來源 |
|---|---|
| `last_login_at` | `users.last_login_at`（已有，只是沒曝露） |
| `last_activity_at` | `users.last_activity_at`（新增） |
| `active_session_count` | Redis `user_sessions:{uuid}` set 的 size——目前有幾台裝置登入中 |

---

## 4. 逐檔改動

| 檔案 | 改動 |
|---|---|
| `alembic/versions/<new>.py` | 建 `project_settings`；兩張 config 表加 `disaster_types` / `label` / `sort_order` / `is_active` 與 UNIQUE 約束；`users` 加 `last_activity_at` |
| `app/models/project_settings.py` | **新檔**：`ProjectSettings` |
| `app/models/property_config.py` | 兩個 config model 加 `disaster_types` / `label` / `sort_order` / `is_active` |
| `app/models/auth.py` | `User` 加 `last_activity_at` |
| `app/repositories/config_repository.py` | `list_by_type` 加災害型別過濾；`upsert` 支援 `disaster_types` |
| `app/repositories/project_settings_repository.py` | **新檔**：讀取／更新單列設定 |
| `app/repositories/session_repository.py` | `rotate()` 回傳資訊供上層寫 `last_activity_at`（或直接注入 db session，落地時決定） |
| `app/services/config.py` | `upsert_*_property_config` 加 `disaster_types` 參數 |
| `app/services/project_settings.py` | **新檔**：讀取／更新專案設定（`super_admin` only） |
| `app/graphql/config/{queries,types,mutations}.py` | 曝露 `disaster_types` |
| `app/api/v1/endpoints/admin.py` | 新增 `GET`/`PATCH /admin/project-settings`；`list_users` 補三個欄位 |
| `app/schemas/admin.py` | `AdminUserListItem` 加三欄；新增 `ProjectSettingsResponse` / `ProjectSettingsUpdate` |
| `app/db/triggers.py` | `project_settings` 加入 `AUDITED_TABLES` |

---

## 5. 已知風險與既有狀況（經決策維持現狀）

**動態欄位設定目前形同虛設。** 寫入 property 的兩條路徑從不查 config 表：

```
app/services/station.py:106-137   create_station_property   → 直接寫入，不驗 data_type / enum_options
app/services/ticket.py:207-231    create_task_property      → 同上
```

設定 `data_type="enum"` 且 `enum_options=["A","B"]`，後端照樣接受任意字串。config 的唯一消費者是 GraphQL 查詢 `stationPropertyConfigs` / `taskPropertyConfigs`（`app/graphql/config/queries.py:24-49`），拿去渲染表單。兩張 config 表目前是空的（`seed_rbac.py` 與 `seed_mock_scenarios.sql` 各建 0 列）。

**經決策維持現狀**（ADR-092）。代價是 BI 統計時會拿到自由格式的值（「有」／「1台」／「Y」／「發電機×2」），屆時需在 BI 層自行正規化，或回頭補寫入驗證。

**易混淆點**：`app/graphql/suggestions/fields.py` 有一份寫死在 code 裡、**確實有驗證**的 `SUGGESTABLE_FIELDS`（`:49-56` 驗 integer 與 enum）。專案裡「有強制力的欄位定義」與「動態欄位設定」是兩套不同機制，讀 code 時容易誤以為是同一套。

**為何不每個請求更新活動時間**：`users` 在 `AUDITED_TABLES` 裡（`app/db/triggers.py:7`），每請求寫一次 `users` 會讓 **`audit_logs` 每請求多一列**，稽核表會被活動記錄淹沒。這個副作用容易被忽略，明確記錄於此。

---

## 6. 測試計畫

| 類型 | 案例 |
|---|---|
| 功能 | `project_settings` 恆只有一列——嘗試插入第二列失敗 |
| 功能 | 混合災害：設定 `{landslide, flood}` 時，兩種型別的欄位都回傳，且同名欄位只出現一次 |
| 功能 | `disaster_types = '{}'` 的欄位在任何災害型別下都回傳 |
| 功能 | 火災專屬欄位在 `{flood}` 設定下**不**回傳 |
| 功能 | 災害型別變更後，欄位清單即時反映（無需套用動作） |
| 功能 | UNIQUE 約束：同 `(station_type, property_name)` 重複 upsert 為更新而非新增（既有 `tests/test_graphql/test_mutations.py:1015` 已測，需確認加約束後仍通過） |
| 功能 | `is_active = false` 的欄位不出現在查詢結果 |
| 功能 | 回傳依 `sort_order` 排序；`sort_order` 相同時依 `property_name` 穩定排序 |
| 功能 | `label IS NULL` 時回傳 `property_name` 作為顯示文字 |
| 功能 | upsert 傳入不同 `property_name` 為**新增**而非改名（既有資料的關聯不受影響） |
| 功能 | 專案設定僅 `super_admin` 可改，其他角色 403 |
| 功能 | `last_activity_at` 於 refresh 後更新；未 refresh 時不變 |
| 功能 | `AdminUserListItem` 回傳三個新欄位；`active_session_count` 反映實際 Redis session 數 |
| 迴歸 | 動態欄位寫入行為不變——`data_type="enum"` 時任意字串仍可寫入（明確驗證未誤加驗證） |
| 稽核 | `project_settings` 變更會寫入 `audit_logs` |
