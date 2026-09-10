# Design: 通報單災害動態欄位 — Ticket Disaster-Type Dynamic Fields

**Date**: 2026-09-09
**Feature**: 018-ticket-disaster-fields
**Status**: Implemented
**Depends on**: `Spec/013-project-settings-activity/spec.md`（動態欄位機制）
**Stacked on**: PR #48（`feat/er-diagram-update`）→ PR #49（`feat/briefings`）→ `main`

## 概述

`tickets.disaster_type` 目前是自由字串,不影響任何行為:不論水災或地震,通報表單長得一模一樣。
PM 已交付六種災害各自的欄位清單(共 14 欄),加上兩個通報者傷檢旗標與五個空間欄位。

功能 013 已經把這套機制做過兩次(`station_property_config`、`task_property_config`,ADR-091/092/095),
所以通報單是第三個、也是最後一個目標,直接沿用既有的 repository helper。但本功能有三點超出 013:

1. **一張通報單可同時屬於兩種災害** → `disaster_type` 改為陣列,欄位解析變成陣列交集。
2. **維運人員要能自行新增災害型別與欄位** → 詞彙不能寫死成 enum,改為 `disaster_types` 主檔。
3. **`data_type` 要在 DB / GraphQL / 前端使用同一套詞彙** → 連帶重寫既有兩張設定表的值。

## 目標

- 通報單依其災害型別集合,動態顯示對應欄位;兩種災害取聯集,共用欄位只出現一次。
- 維運人員可透過 GraphQL 新增災害型別、新增/停用每種災害的欄位,不需要重新部署。
- 所有動態欄位設定表與值表都自動進稽核軌跡。
- 通報單可以記錄地址(在此之前只有站點可以)。

## 非目標（YAGNI，明確排除）

- **不做前端動態表單渲染。** `ticket-create-drawer.tsx` 仍是靜態表單,本功能只提供後端契約。
- **不做欄位值驗證。** 沿用 ADR-092:設定表只是渲染提示,後端不檢查寫入值的型別或選項。
- **不做 `min_value` / `max_value`。** 既然沒有任何東西會驗證,「>=0」留在 `hint` 文字即可。
- **不做通報單地址的讀取端。** 寫入端已補齊,但 `TicketType` 不曝露 `secondaryLocation` —
  通報者的地址是其住家,要曝露需要一個本功能沒有做的 PII 決策(ADR-146)。
- **不做郵遞區號與鄰。** PR #44 的 parser 認得但不儲存,應在該 PR 處理,不在此補。
- **不改 `station_property_config` / `task_property_config` 的鍵。** 只改 `data_type` 值與新增 `unit`。

## Schema

```sql
-- 1. 災害型別詞彙（ADR-244）
CREATE TABLE disaster_types (
    uuid      UUID PRIMARY KEY,
    key       VARCHAR(50) NOT NULL UNIQUE,   -- flood / landslide / epidemic / radiation / fire / earthquake
    label     VARCHAR(50) NOT NULL,          -- 水災 / 土石流 / 疫情 / 核／輻射 / 火災 / 地震
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- 2. 通報單災害欄位定義（ADR-247）—— 沒有第一維型別欄,property_name 本身就是鍵
CREATE TABLE ticket_property_config (
    uuid           UUID PRIMARY KEY,
    property_name  VARCHAR(100) NOT NULL UNIQUE,
    data_type      VARCHAR(50)  NOT NULL,     -- ADR-245 的新詞彙
    enum_options   JSON,
    unit           VARCHAR(20),               -- cm / mm，僅 number 欄位
    disaster_types VARCHAR[] NOT NULL DEFAULT '{}',
    label          VARCHAR(100),
    hint           VARCHAR(200),              -- 填寫提示與安全警語
    is_active      BOOLEAN NOT NULL DEFAULT true
);

-- 3. 值（ADR-247）—— 一個選項一列,multi_select 自然就是 N 列
CREATE TABLE ticket_disaster_details (
    uuid          UUID PRIMARY KEY,           -- 代理鍵,不是自然複合鍵：稽核 trigger 寫死 NEW.uuid
    ticket_uuid   UUID NOT NULL REFERENCES tickets(uuid),
    property_name VARCHAR(100) NOT NULL,      -- 字串參照 ticket_property_config，無外鍵
    value         TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    delete_at     TIMESTAMPTZ,
    UNIQUE (ticket_uuid, property_name, value)
);

-- 4. 通報單（ADR-246）
ALTER TABLE tickets ADD COLUMN disaster_types VARCHAR[] NOT NULL DEFAULT '{}';
UPDATE tickets SET disaster_types = ARRAY[CASE disaster_type
    WHEN 'mudslide' THEN 'landslide' ELSE lower(trim(disaster_type)) END]
  WHERE disaster_type IS NOT NULL AND trim(disaster_type) <> '';
ALTER TABLE tickets DROP COLUMN disaster_type;
ALTER TABLE tickets ADD COLUMN person_trapped_reported   VARCHAR(20);  -- NULL = 沒問過
ALTER TABLE tickets ADD COLUMN immediate_danger_reported VARCHAR(20);

-- 5. 空間欄位（ADR-249）
ALTER TABLE secondary_locations
    ADD COLUMN building_section  VARCHAR(50),
    ADD COLUMN space_description VARCHAR(100),
    ADD COLUMN victim_space      VARCHAR(100),
    ADD COLUMN access_status     VARCHAR(20),
    ADD COLUMN landmark_note     TEXT;

-- 6. data_type 詞彙統一（ADR-245）+ unit
ALTER TABLE station_property_config ADD COLUMN unit VARCHAR(20);
ALTER TABLE task_property_config    ADD COLUMN unit VARCHAR(20);
-- String→text, Text→long_text, Integer/Float→number, Boolean→boolean,
-- Enum→single_select, Array→multi_select（共 46 列）
```

## 查詢

```sql
-- 一張通報單該顯示哪些欄位
SELECT * FROM ticket_property_config
 WHERE (cardinality(disaster_types) = 0                      -- 通用欄位
        OR disaster_types && :ticket_disaster_types)          -- 陣列交集
   AND is_active
 ORDER BY property_name, uuid;
```

**空陣列的語意與 station/task 相反,這是刻意的。** 那兩張表的空陣列代表「部署未設定」,所以不過濾、
全部顯示。通報單的空陣列代表「這張單還沒分類」,若比照辦理會一次跳出十四個問題(六種災害的題目全上),
比什麼都不顯示更糟 —— 所以只回傳通用欄位。

## 逐檔改動

| 檔案 | 改動 |
|---|---|
| `app/models/disaster_type.py` | **新增** `DisasterType` |
| `app/models/ticket_disaster_detail.py` | **新增** `TicketDisasterDetail` |
| `app/models/property_config.py` | 新增 `TicketPropertyConfig`;兩張既有表加 `unit` |
| `app/models/request.py` | `disaster_type` → `disaster_types`;加兩個傷檢欄位 |
| `app/models/secondary_location.py` | 加五個空間欄位;`search_text` 不變 |
| `app/models/__init__.py` | 註冊兩個新 model |
| `app/core/disaster_types.py` | `normalize_*` 改為排序;新增 `validate_disaster_types` |
| `app/db/triggers.py` | `AUDITED_TABLES` 加五張表(含兩張既有設定表) |
| `app/repositories/config_repository.py` | 新增 `TicketPropertyConfigRepository`;`_optional_config_fields` 加 `unit`/`hint` |
| `app/repositories/project_settings_repository.py` | 新增 `DisasterTypeRepository` |
| `app/repositories/tickets_repository.py` | 新增 `TicketDisasterDetailRepository` |
| `app/services/config.py` | 新增 `upsert_ticket_property_config` |
| `app/services/project_settings.py` | 詞彙驗證;新增 `list/upsert_disaster_type` |
| `app/services/ticket.py` | 陣列驗證;`set_ticket_disaster_details`;`create_ticket` 收 `secondary_location` |
| `app/services/ticket_analytics.py` | 重複判定改為陣列相等 |
| `app/graphql/shared.py` | 新增 `FieldDataType`/`TriState`/`AccessStatus`;`SecondaryLocationInput` 從 geo 搬來 |
| `app/graphql/config/{types,queries,mutations}.py` | 通報單設定 + 災害型別的讀寫 |
| `app/graphql/tickets/{types,mutations}.py` | 陣列、傷檢欄位、`disasterDetails`、地址 |
| `app/graphql/geo/{types,mutations}.py` | 空間欄位;改用共用 mapper |
| `app/graphql/loaders.py` | `disaster_details_by_ticket` |
| `alembic/versions/e7b249d0af31_*.py` | **新增** 本功能的 migration |
| `scripts/seed_mock_scenarios.sql` | `mudslide` → `landslide` |

## 已知風險

1. **`AUDITED_TABLES` 是文件不是接線。** 只加 Python list 不會有任何效果,真正掛 trigger 的是
   migration;而測試 fixture 會在執行期依那份 list 自行掛 trigger,所以漏寫 migration 的話
   **整套測試照樣全綠,正式環境卻一列稽核都不會寫**。本功能的 migration 用凍結快照掛好了五張表。
2. **PR #42 會無聲地破壞 `data_type` 重新命名。** `app/services/bulk_columns.py` 把舊詞彙寫死成
   模組常數,而那些檔案全是 #42 **新增**的 —— git 會乾淨地合併,然後匯入匯出把每個動態欄位都判錯型別。
   合併時必須一併更新該檔常數。
3. **PR #43 的守門測試會因為本功能的欄位變更而失敗。** `test_every_column_is_classified` 會走訪
   每個 model 欄位;`disaster_type` 改名、兩個傷檢欄位、五個空間欄位都需要在 `FIELD_TIERS` /
   `EXCLUDED` 補分類。
4. **PR #44 會改寫 `secondary_locations`**(`city`→`town`,新增 `village`/`road`/`section`)。
   本功能的五個空間欄位與其不衝突,但兩者都動同一個檔案。
6. **downgrade 對雙災害通報單是有損的。** 純量欄位裝不下兩個值,只保留第一個。

## 測試計畫

| 類型 | 案例 |
|---|---|
| 功能 | 兩種災害取聯集,`access_blocked` 只出現一次 |
| 功能 | 單一災害只回自己的欄位;空陣列只回通用欄位(**不是**全部) |
| 功能 | 未知/已停用的災害型別在通報單與設定兩條路徑都被拒絕 |
| 功能 | `multi_select` 存成多列並去重;整批取代而非合併 |
| 功能 | 清空後重選同一個值不會撞唯一鍵(硬刪除而非軟刪除) |
| 功能 | 維運人員新增災害型別 + 欄位後,表單立刻出現,不需部署 |
| 功能 | 傷檢欄位 NULL(沒問過)與 `unknown`(問了答不出來)是兩件事 |
| 迴歸 | 既有 46 列設定的 `data_type` 全數轉換,無殘留舊詞彙 |
| 迴歸 | seed 的 30 筆 `mudslide` 變成 `{landslide}` |
| 迴歸 | 五個新空間欄位不進 `search_text`(ADR-146/250) |
| 迴歸 | `alembic downgrade -1` 後再 `upgrade head` 可還原 |
| 稽核 | `ticket_disaster_details` 的寫入有 `audit_logs` 紀錄 |
| 稽核 | `tickets` 的 INSERT 仍記錄 `disaster_types` |
