# PRD：求助單與站點的異動歷史（016 Resource History）

**Feature**：016-resource-history　**PR**：#43（2026-09-13 已合併進 #42 的分支，隨 #42 一起進 main）
**Status**：後端已實作、已驗證；前端未做
**Notion**：系統性 - Ticket/Resource Station History（版本歷史）
**技術設計**：`spec.md`　**決策**：`decisions.md`（ADR-127~145、198、202~203）

---

## 1. 問題

系統其實已經記錄了每一筆資料異動（`audit_logs`，39 張表都有 trigger），但沒有任何介面讀得到。要回答「這張求助單被誰改過、誰接了任務」，目前只能直接下 SQL。

## 2. 使用者

| 角色 | 看得到誰的歷史 | 額外看得到 |
|---|---|---|
| 報案人（一般使用者） | 只有**自己的**求助單 / 站點 | 自己那張單的聯絡資料明碼 |
| team admin / member | 自己 WorkZone 內的 | 有 `view_pii` 時看得到聯絡資料 |
| data_auditor / super_admin | 全部 | 聯絡資料 + 審核欄位 + 原始異動紀錄 |
| 訪客 | 無 | — |

## 3. 使用者故事

### US-1 報案人查看自己求助單的處理歷程（P1）

身為報案人，我想知道我的求助單什麼時候被審核、被誰接了、狀態怎麼變的。

**驗收條件**
1. **Given** 自己的求助單，**When** 打開歷史，**Then** 看到時間由新到舊的事件：建立、更新、指派、取消指派、刪除、還原。
2. **Given** 別人的求助單，**Then** 回 403。
3. **Then** 每個事件顯示「誰做的」：一般使用者顯示名字；系統自動處理顯示 `system`；由爬蟲 / 政府 / NGO 建立的顯示對應來源。
4. **Given** 操作者帳號已被刪除，**Then** 仍顯示名字，並標示 `is_removed: true`。
5. **Then** 審核備註（`review_note`、`moderation_status`）**看不到**。

### US-2 工作人員查看轄區資源的異動軌跡（P1）

**驗收條件**
1. **Given** 區域內的站點，**Then** 看得到站點本身、地址、動態欄位的所有變更。
2. **Given** 區域外的資源，**Then** 回 404（不透露它存在）。
3. **Given** 某個指派已經被取消（資料列已硬刪），**Then** 時間軸上仍然看得到「取消指派」事件。
4. **Given** 求助單的座標被移動，**Then** 只顯示「位置已變更」，**不顯示座標值**；沒有 `view_pii` 的話，連這個事件都看不到。

### US-3 稽核人員查看原始紀錄（P2）

**驗收條件**
1. **Given** 持有 `audit.view`（scope 必須是 all），**Then** 每個事件額外帶 `raw[]`，也就是每一筆原始 audit 列的 old/new values。
2. **Then** 原始紀錄裡**永遠不會**出現密碼 hash。
3. **Given** `audit.view` 的 scope 比 all 窄，**Then** 不給 `raw`（ADR-198）。

### US-4 分頁（P2）

**驗收條件**
1. **When** 帶 `limit`（1~上限）和 `offset`，**Then** 回傳該頁事件，`meta.total` 是全部事件數。
2. **Given** offset 超過總數，**Then** 回空陣列，不是錯誤。
3. **Given** 資源的 audit 列超過 2000 筆，**Then** `meta.truncated: true`（ADR-139）。

## 4. 功能需求

- **FR-001**：同一次交易產生的多筆異動，必須合併成一個事件（ADR-134）。
- **FR-002**：時間軸必須涵蓋資源本身、地址、子任務、動態欄位、任務指派（含已硬刪的指派）。
- **FR-003**：欄位可見度分四層：一般 / PII / 稽核 / 原始。每個欄位都必須被歸類或明確排除，否則測試失敗（ADR-144）。
- **FR-004**：外鍵、`search_text`、去重與評分欄位不出現在變更清單（ADR-143）。
- **FR-005**：只列出真的有變動的欄位。
- **FR-006**：後端不做中文化，`event_type` / `actor.kind` / `field` 都是英文代碼，由前端翻譯（ADR-145）。

## 5. 前端契約

```
GET /api/v1/history/tickets/{uuid}?limit=50&offset=0
GET /api/v1/history/stations/{uuid}?limit=50&offset=0
```

| HTTP | 意義 | 前端應該做什麼 |
|---|---|---|
| 200 | `{ success, data: Event[], meta: { total, truncated, limit, offset } }` | 渲染時間軸；`truncated` 為 true 時提示「只顯示最近的紀錄」 |
| 401 | 未登入 | 導去登入 |
| 403 | 沒有 `*.view_history`，或不是自己的（own scope） | 隱藏歷史入口 |
| 404 | 不存在，或在區域外 | 「找不到這筆資料」 |
| 422 | limit / offset 超出範圍 | 程式錯誤，不應發生 |

前端需要翻譯的代碼：
- `event_type`：`CREATED` / `UPDATED` / `DELETED` / `RESTORED` / `ASSIGNED` / `UNASSIGNED`
- `actor.kind`：`user` / `system` / `crawler` / `gov` / `ngo`
- `entity`：`ticket` / `station` / `ticket_task` / `task_property` / `task_assignment` / `station_property` / `secondary_location` / `base_geometry`
- `changes[].field`：spec §5 白名單裡的欄位名

⚠️ 404/403 目前**沒有 `code`**，只有 `detail`。

## 6. 範圍外

- 還原到某個版本（MVP 是唯讀）
- 跨資源查詢（「李四這個月改過什麼」）
- 匯出歷史成檔案
- `crowd_sourcing` / `station_update_suggestions` / `photos` 的歷史（沒有 trigger）
- 「任務改排到另一條路線」（外鍵被排除）

## 7. 成功指標

- **SC-001**：Notion 點名的三件事——誰建立（含爬蟲 / NGO / GOV）、誰編輯、誰配對任務——都能在時間軸上直接看到，不需要 SQL。
- **SC-002**：100 萬筆 audit 列的資料量下，單一資源的時間軸查詢在 10 ms 等級（實測 4.9 ms，ADR-133）。
- **SC-003**：沒有任何角色能透過歷史看到他在 GraphQL 上看不到的 PII。

## 8. 待決問題

1. **Notion 卡片的「AI 爬取來源是否要專屬 badge」**：後端以 `actor.kind = crawler` 區分，要不要 badge 是前端設計決定。建議回覆「後端已區分，badge 由前端決定」。
2. **歷史的地址可見度比 GraphQL 嚴**（ADR-142）：GraphQL 那側的修正要開票給誰？
3. **部署**：建索引時會短暫鎖住所有寫入（ADR-203）。上線時資料量若已經很大，要排離峰時段。
