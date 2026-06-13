# Demo Admin Sections 功能模組規劃（依目前後端實作）

> 目標：依照目前已存在的 schema、GraphQL/REST 與測試覆蓋，規劃未來實作在 `Frontend/apps/demo` 內的 admin sections。
>
> 判定原則：
>
> - 可立即開發：已有對應 API/GraphQL resolver + 測試佐證
> - 部分可開發：有資料模型與部分接口，但管理面功能不完整
> - 規格階段：Spec 有定義，但目前程式碼尚未提供完整後台接口
>
> 說明：本文件是未來 portal-hosted admin surfaces 的規劃，不代表目前 repo 仍維護獨立的 admin app。

---

## 1. 目前後端能力摘要

### 1.1 已有且可用的核心能力

1. 認證與基本使用者流程（REST）

- `/api/v1/auth/salt/{username}`
- `/api/v1/auth/register`
- `/api/v1/auth/login`
- `/api/v1/users/me`（讀取/更新個人資料）

2. RBAC 權限檢查機制

- `PermissionChecker(resource, action)` 與 GraphQL `check_permission(...)`
- 支援 `all / own / none` 範圍判定

3. 地圖資料域（GraphQL）

- 站點（Station）查詢/建立/更新/刪除（軟刪除）
- 封閉區域（ClosureArea）查詢/建立/更新
- 站點屬性（StationProperty）建立/更新
- 群眾評分（CrowdSourcing）建立（含 upsert）

4. 需求與任務資料域（GraphQL）

- 工單（Ticket）查詢/建立/更新
- 任務（TicketTask）查詢/建立/更新
- 任務屬性（TaskProperty）查詢/建立/更新
- 工單狀態轉換限制（`pending -> in_progress -> completed/cancelled`）

5. 屬性設定（GraphQL）

- StationPropertyConfig 查詢/upsert
- TaskPropertyConfig 查詢/upsert

6. 地圖圖磚服務（REST）

- tile proxy + attribution

### 1.2 現況缺口（與完整後台管理相比）

1. 尚無「管理者專用」使用者清單/編輯/停權 API
2. 尚無角色/群組/政策（Policy）的完整管理 API（CRUD + 指派 UI 需要的接口）
3. 尚無稽核日誌查詢/匯出 API
4. 尚無內容發布（Feature 007）管理 API
5. 尚無物資管理（Feature 005）完整後台 API
6. 尚無儀表板聚合統計 API（目前可由多查詢拼接，但非專用 dashboard endpoint）

---

## 2. Portal-hosted Admin 功能模組建議

以下以「可落地程度」分級，建議作為未來 `demo` admin sections 的導覽與頁面模組。

## A. 可立即開發（MVP 第一階段）

### A1. 登入與會話模組

功能：

1. 管理員登入（沿用現有 auth login）
2. token 保存/刷新策略（前端）
3. 目前使用者資訊（`/users/me`）
4. 個人資料編輯（名稱、密碼）

依賴後端：已具備。

---

### A2. 地圖資料管理模組

功能：

1. 站點列表（支援 bounds、stationType、分頁）
2. 站點建立/編輯/軟刪除
3. 站點詳情（含 secondary location、geometry）
4. 封閉區域列表/詳情/建立/編輯
5. 站點屬性維護（facility/supply/service）
6. 群眾評分檢視與提交（若後台需要審核流程可先做只讀）

依賴後端：已具備（GraphQL query + mutation 完整且有測試）。

---

### A3. 工單與任務管理模組

功能：

1. 工單列表（status/priority/bounds/分頁）
2. 工單詳情（聯絡資訊、位置、優先級、狀態）
3. 工單建立與狀態更新（遵守狀態機）
4. 任務列表（依 ticket）
5. 任務建立/更新（status、moderation_status、progress_note）
6. 任務屬性維護（TaskProperty）

依賴後端：已具備（GraphQL query + mutation 完整且有測試）。

---

### A4. 動態欄位設定模組（Config）

功能：

1. 站點屬性設定查詢（依 stationType）
2. 任務屬性設定查詢（依 taskType）
3. 屬性設定 upsert（property_name/data_type/enum_options）

依賴後端：已具備（GraphQL query + mutation）。

---

### A5. 地圖圖磚來源管理（輕量版）

功能：

1. 圖磚來源可用性檢視（來源清單、授權資訊）
2. 來源 attribution 顯示設定頁
3. 圖磚預覽測試（z/x/y + layer for sinica）

依賴後端：已具備（REST map endpoint），但這比較偏「工具頁」。

---

## B. 部分可開發（MVP 第二階段）

### B1. RBAC 可視化模組（先讀取，後管理）

可先做：

1. 以目前登入者權限做 UI 功能開關（route guard / button guard）
2. 顯示「目前角色推導出的可用操作」

待後端補齊後再做：

1. 群組/政策清單
2. 角色權限編輯
3. 使用者角色指派

備註：資料模型已存在（Group / Policy / Assign tables），但缺對應管理 API。

---

### B2. Dashboard（拼接版）

可先做：

1. 以多個 GraphQL query 聚合基本數字（station/ticket/task 數量、狀態分布）
2. 地圖範圍內案件統計

待後端補齊後再做：

1. 專用 `/admin/stats` 或 GraphQL dashboard resolver
2. 時間序列與稽核維度指標

---

## C. 規格階段（先不排進當前 sprint）

1. 使用者管理中心（全域 user CRUD、停權、重設）
2. 角色與權限管理中心（完整 RBAC Admin）
3. 稽核日誌與匯出
4. 內容發布管理（公告、審核、發布流程）
5. 物資管理與配送後台
6. 系統效能監控與告警

這些在 Spec 文件中有規劃，但目前程式碼尚未提供完整可串接接口。

---

## 3. 建議的 portal admin 資訊架構（IA）

建議左側主選單：

1. Dashboard
2. 地圖管理
3. 工單管理
4. 任務管理
5. 欄位設定
6. 圖磚來源
7. 帳號設定
8. 權限檢視（Beta）

各模組對應資料來源：

- 地圖管理：GeoQuery + GeoMutation + StationPropertyMutation
- 工單/任務：RequestQuery/Mutation + TicketTaskQuery/Mutation
- 欄位設定：PropertyConfigQuery + PropertyConfigMutation
- 圖磚來源：`/api/v1/map/tile/*` + `/api/v1/map/attribution/*`
- 帳號設定：`/api/v1/users/me`

---

## 4. 實作優先序（建議）

### Phase 1（可直接開工）

1. 登入與權限閘道（route-level）
2. 地圖管理（列表 -> 詳情 -> 編輯）
3. 工單管理（列表 -> 詳情 -> 狀態流轉）
4. 任務管理（ticket 子頁）

### Phase 2（提升可用性）

1. 欄位設定管理（Config）
2. Dashboard 拼接版
3. 圖磚來源工具頁

### Phase 3（需後端擴充）

1. RBAC 管理中心
2. 使用者管理中心
3. 稽核與報表

---

## 5. 前端實作注意事項

1. 權限錯誤（403）要有統一處理與提示，區分「未登入」與「無權限」。
2. 工單狀態更新必須遵守後端狀態機，前端按鈕只顯示合法下一步。
3. 所有列表查詢預設只看未軟刪除資料（目前後端 repository 已處理）。
4. 地理資料編輯要在前端先做基本 GeoJSON 驗證（Point/Polygon 型別與座標範圍）。
5. Config upsert 需限制欄位型別選項，避免送出不合法 enum/data_type。

---

## 6. 結論

就目前後端實作來看，未來掛載在 `demo` 內的 admin sections 最適合先做「地圖管理 + 工單任務管理 + 設定管理 + 帳號與權限閘道」四大核心。

完整的「後台管理中心（使用者、RBAC 編輯、稽核、內容、物資）」仍需後端補齊管理 API，建議先以可串接的 MVP 模組在 `demo` 內逐步上線，並把 Spec 的管理能力列為下一階段擴充。
