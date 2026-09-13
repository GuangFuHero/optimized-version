# Design: Ticket/Resource Station History（版本歷史）

**Date**: 2026-08-23
**Feature**: 016-resource-history
**Status**: 已實作、已驗證
**Notion**: 補齊功能 →「系統性 - Ticket/Resource Station History（版本歷史）」（backend-Popo，排 08-18~08-22）
**Depends on**: `feat/bulk-import-export-backend`（PR #42）。時間軸要涵蓋 `station_properties` 與 `task_properties` 的異動，而這兩張表的 audit trigger 只在 015 的分支上（ADR-140）。
**ADR**: `decisions.md`，ADR-127~145

---

## 1. 概述

### 現況

`audit_logs` 從 RBAC v1 就存在，39 張表都掛了 trigger，是 append-only 的資料異動總帳。但**沒有任何 API 讀它**——`Perm.AUDIT_VIEW` 註冊了卻零使用（`app/core/permissions.py:102`），`Perm.USER_DELETE` 也是同樣的空殼。

所以今天要回答「這張單被誰改過什麼」，只能直接下 SQL。

### 目標

- 前台：報案人看得到自己那張求助單的處理歷程。
- 後台：工作人員看得到轄區內資源的完整異動軌跡，稽核角色看得到原始紀錄。
- 涵蓋 Notion 點名的三件事：**誰建立**（含 AI 爬取／NGO／GOV 來源）、**誰編輯**、**誰配對任務**。

### 非目標

- **回溯還原（restore / revert）**。MVP 是唯讀時間軸。
- **跨資源的稽核查詢**（「李四這個月改過哪些東西」）。本票只做「單一資源的歷史」。
- **修好 `task_assignments` 硬刪**（ADR-132）、**`source` 的值域**（ADR-137）、**GraphQL 側的地址 PII 閘門**（ADR-142）。三者都另開票。
- **替 `crowd_sourcing` / `station_update_suggestions` / `photos` 補 trigger**。
- **匯出歷史成檔案**。

---

## 2. 核心流程

```
GET /api/v1/history/tickets/{uuid}?limit=50&offset=0
GET /api/v1/history/stations/{uuid}?limit=50&offset=0

  ① 授權      require_scope(actor, *.view_history, resource=該資源)
  ② 解析      算出這筆資源涵蓋哪些 row_id（零跳／一跳／兩跳）
  ③ 查詢 A    WHERE row_id IN (...)                        ← 主體與現存子列
  ④ 查詢 B    WHERE table_name='task_assignments'
                AND COALESCE(new_values,old_values)->>'task_uuid' IN (...)
                                                            ← 已硬刪的指派
  ⑤ 合流      A ∪ B，去重（現存指派兩邊都會撈到）
  ⑥ 合併      同 (row_id, created_at) 併成一個事件
  ⑦ 推導      event_type、actor.kind、欄位變更
  ⑧ 過濾      依 caller 權限套用四層白名單
  ⑨ 切片      排序後 [offset:offset+limit]
```

### 一個事件代表什麼

**一次交易**。PostgreSQL 的 `now()` 是交易開始時間，所以同一個請求裡寫出的所有 audit 列 `created_at` 完全相同——這既是合併的依據，也讓交易內排序不可能（ADR-134）。

---

## 3. 資料來源

### 涵蓋的表與跳數

```
ticket(uuid)  ─ base_geometries.uuid                  零跳
              ─ tickets.uuid                          零跳
              ─ secondary_locations.geometry_uuid     一跳
              ─ ticket_tasks.ticket_uuid              一跳
                  ─ task_properties.task_uuid         兩跳
                  ─ task_assignments.task_uuid        兩跳（含 JSONB 反查）

station(uuid) ─ base_geometries.uuid                  零跳
              ─ stations.uuid                         零跳
              ─ secondary_locations.geometry_uuid     一跳
              ─ station_properties.station_uuid       一跳
```

station 沒有兩跳。

### 為什麼指派需要第二條查詢

`unassign_task_actor` 走的是硬刪（`app/services/ticket.py:294` → `app/infrastructure/repository/base.py:102`），而 `TaskAssignment` 沒有 `delete_at` 欄位，結構上不可能軟刪。指派被取消後那列從 `task_assignments` 消失，`audit_logs.row_id` 存的 assignment uuid 就再也推導不出來——只能從 audit 負載的 `task_uuid` 反查（ADR-132）。

**現存的指派兩條查詢都會撈到**，合流時要用 `audit_logs.uuid` 去重。

---

## 4. 授權

### 新增的 capability

```python
TICKET_VIEW_HISTORY  = "ticket.view_history"
STATION_VIEW_HISTORY = "station.view_history"
```

### RBAC 矩陣

| capability | Guest | user | data_auditor | super_admin | admin(team) | member(team) |
|---|---|---|---|---|---|---|
| `ticket.view_history` | — | own | all | all | zone | zone |
| `station.view_history` | — | own | all | all | zone | zone |

與現有 `ticket.view_pii` 同形。**團隊角色用 `zone` 不是 `team`**——ADR-049 把 `team_uuid` 從 `base_geometries` 拿掉了，`team` scope 對地理資源永遠不成立（ADR-128）。

### 兩個檢查點

檢查點 1（capability）與檢查點 2（物件 scope）都由 `require_scope` 一次做完，`resource` 傳被查的 ticket / station 本身。子列不另外授權——能看這筆資源的歷史，就看得到它底下所有子列的歷史。

---

## 5. 欄位可見度：四層

| 層級 | 內容 | 解鎖條件 |
|---|---|---|
| **一般** | 業務欄位 | `*.view_history` |
| **PII** | `contact_*`、詳細地址、精確座標 | `ticket.view_pii` 且 in scope，否則遮罩 |
| **稽核** | `review_note`、`moderation_status` | `audit.view` |
| **RAW** | 整列 `old_values` / `new_values` | `audit.view` |

`super_admin` 與 `data_auditor` 同時持有 `audit.view=all` 與 `ticket.view_pii=all`，自動看得到四層全部，無需特例（ADR-130）。

### 白名單（一般層）

| 表 | 欄位 |
|---|---|
| `tickets` | title, description, status, priority, task_type, visibility, verification_status, disaster_type |
| `stations` | type, name, description, op_hour, level, comment, source, visibility, verification_status, is_temporary, expires_at, is_official |
| `ticket_tasks` | task_type, task_name, task_description, quantity, status, source, progress_note, visibility |
| `task_properties` | property_name, property_value, quantity, status, comment |
| `task_assignments` | actor_uuid（解析成人名）, role, status |
| `station_properties` | property_type, property_name, quantity, comment, status |
| `base_geometries` | geometry（只報「已變更」，ADR-141） |

### PII 層

`contact_name` / `contact_email` / `contact_phone` 走 `app/graphql/masking.py` 現有的 `mask_name` / `mask_email` / `mask_phone`；`secondary_locations` 的 `county/city/lane/alley/no/floor/room/pole_*` 與 `geometry` 的座標值同層（ADR-142）。

### 明確排除（不屬於任何層）

`uuid`、所有外鍵（`ticket_uuid`/`task_uuid`/`station_uuid`/`geometry_uuid`/`created_by`/`updated_by`/`route_uuid`/`child_station_uuid`/`pole_photo_uuid`）、`created_at`/`updated_at`（就是事件時間本身）、`delete_at`（是事件不是欄位，ADR-135）、`property_name`（`base_geometries` 的 polymorphic 判別欄）、`search_text`、`is_duplicate`/`dedup_group_id`/`confidence_score`/`priority_score`/`weightings`（ADR-143）。

排除清單每一項在 `history_fields.py` 裡都要寫理由；未分類的欄位會讓 `test_every_column_is_classified` 紅燈（ADR-144）。

---

## 6. 回應格式

```json
{
  "success": true,
  "data": [
    { "event_type": "CREATED",
      "at": "2026-08-19T10:00:00Z",
      "actor": { "uuid": null, "name": null, "kind": "crawler", "is_removed": false },
      "entity": "station",
      "changes": [ { "field": "name", "before": null, "after": "光復國小避難所" } ] },

    { "event_type": "UPDATED",
      "at": "2026-08-21T09:12:00Z",
      "actor": { "uuid": "...", "name": "李四", "kind": "user", "is_removed": true },
      "entity": "station",
      "changes": [
        { "field": "op_hour", "before": "0800-1700", "after": "24h" },
        { "field": "geometry", "before": null, "after": null, "changed": true }
      ] },

    { "event_type": "UNASSIGNED",
      "at": "2026-08-21T15:00:00Z",
      "actor": { "uuid": "...", "name": "李四", "kind": "user", "is_removed": false },
      "entity": "task_assignment",
      "changes": [ { "field": "actor_uuid", "before": "張三", "after": null } ] }
  ],
  "meta": { "total": 137, "truncated": false, "limit": 50, "offset": 0 }
}
```

`event_type`：`CREATED` / `UPDATED` / `DELETED` / `RESTORED` / `ASSIGNED` / `UNASSIGNED`

`actor.kind`：`user` / `system` / `crawler` / `gov` / `ngo`
（後三者**只在 INSERT 事件**且 `user_uuid IS NULL` 時，由 `new_values->>'source'` 細分——ADR-137）

持有 `audit.view`（**必須是 `Scope.ALL`**，ADR-198）時每個事件另帶 `raw: [ { old_values, new_values }, … ]`——**一筆 audit 列一個元素**，因為一個事件是一次交易折疊出來的，可能橫跨多張表（ADR-134）。

後端不做中文化（ADR-145）。

---

## 7. Migration

`audit_logs` 目前**只有主鍵一個索引**（`alembic/versions/71bd05e07df3_create_audit_system.py:51-62`），任何讀取都是全表掃描。本票補三個：

```sql
CREATE INDEX ix_audit_logs_row_id_created_at ON audit_logs (row_id, created_at DESC);
CREATE INDEX ix_audit_logs_assign_task ON audit_logs
  ((COALESCE(new_values->>'task_uuid', old_values->>'task_uuid')))
  WHERE table_name = 'task_assignments';
```

原本還有第三個 `ix_audit_logs_table_created_at`，**review 後移除**（ADR-202）：本功能沒有任何查詢用得到它。
時間軸是先把資源展開成一組 `row_id` 才去查 `audit_logs`，所以過濾鍵是 `row_id`；`table_name` 進到 SQL
只有上面那個 partial 條件，其餘用途是撈出列**之後**在 Python 裡判斷「這列怎麼解讀」。

**部署注意**：`CREATE INDEX` 會對 `audit_logs` 取 SHARE 鎖，而 39 張表的 trigger 都在寫它——建置期間
全站寫入（含登入）阻塞。表小的時候是毫秒等級，長大之後要排低峰執行（ADR-203）。

實測（996k 列 / 1.5 GB）：聚合查詢 737 ms → **4.9 ms**，JSONB 反查 415 ms → **0.95 ms**。寫入每列多約 15 µs，空間 +3.2%（ADR-133）。

無 schema 變更、無新表。

---

## 8. 檔案清單

```
新增
  app/services/history_fields.py        分層白名單 + 排除清單（含理由）
  app/services/history.py               聚合、合流、合併、事件推導
  app/schemas/history.py                回應 schema
  app/api/v1/endpoints/history.py       兩個 REST 端點
  alembic/versions/xxxx_audit_indexes.py
  tests/test_history_fields.py          分類守衛
  tests/test_history_service.py         聚合／合併／推導
  tests/test_history_permissions.py     四層可見度 × scope

修改
  app/core/permissions.py               + 2 個 Perm
  scripts/seed_rbac.py                  + 各角色的 grant
  RBAC_RESOURCE_ROLE_MATRIX.md          + 2 列
  app/api/v1/api.py                     掛 router
```

---

## 9. 已知限制

- **歷史從 trigger 建立那天起算**。`crowd_sourcing` / `station_update_suggestions` / `photos` 沒有 trigger，這三類活動永遠不會出現。
- **超過 2000 列會截斷**，靠 `meta.truncated` 告知（ADR-139）。
- **交易內無法排序**。同一次操作的多列已合併成一個事件，所以這個限制不外顯；但若未來要拆開顯示，需要先把 trigger 的 `now()` 換成 `clock_timestamp()`。
- **「任務改排到另一條路線」看不到**（外鍵被排除，ADR-143）。
- **歷史的地址可見度比 GraphQL 嚴**。這是刻意的（ADR-142），不一致要靠另開的票從 GraphQL 側修。
