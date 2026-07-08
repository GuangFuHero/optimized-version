# PRD 索引 — 管理後台系統 (ManagerEnd)

**系統**：島嶼守望 Wanguard 管理後台  
**來源文件**：`prd-manager-end.md`

---

## Feature 列表

| # | Feature | 資料夾 | 說明 |
|---|---------|--------|------|
| 01 | 身份認證 | [01-auth](./01-auth/prd.md) | Email/SMS/Google/Line 登入、後台 SSO 整合 |
| 02 | 個人檔案 | [02-user-profile](./02-user-profile/prd.md) | 基本資訊、通知、系統使用習慣 |
| 03 | 個人設定 | [03-user-settings](./03-user-settings/prd.md) | 帳號安全、聯繫資訊變更、角色申請 |
| 04 | 角色權限管理 | [04-rbac](./04-rbac/prd.md) | RBAC 角色職掌與各模組權限總表 |
| 05 | 成員審核功能 | [05-member-management](./05-member-management/prd.md) | 用戶列表、邀請、Audit Log、審核佇列 |
| 06 | 即時決策輔助 | [06-map-decision-support](./06-map-decision-support/prd.md) | 電線桿圖層、災害預警圖層 |
| 07 | 資源站管理 | [07-resource-station](./07-resource-station/prd.md) | Table/地圖視圖、修改建議審查、CRUD |
| 08 | 任務管理 | [08-ticket-management](./08-ticket-management/prd.md) | 統計、劃區指派、AI 重複偵測、立刻救援 |
| 09 | 緊急公告系統 | [09-emergency-announcement](./09-emergency-announcement/prd.md) | 前台置頂公告、後台協調公告、預覽 |
| 10 | 訪客端工單隱私 | [10-guest-ticket-privacy](./10-guest-ticket-privacy/prd.md) | **草稿** · 公開前台工單揭露分級：存取控制 + 欄位揭露 + 位置降精度（跨 04/06/08） |

---

## v2.0 重大更新（2026-05-28）

針對 **Team 概念、地圖繪製、災害類型欄位群組、Ticket 群組化、直立救援** 的設計大幅擴充：

* **[05-member-management](./05-member-management/prd.md) v2.0** — 加入 Team Admin / Team Member 兩層角色、Team CRUD、Team QRCode 邀請、跨 Team 資料隔離
* **[06-map-decision-support](./06-map-decision-support/prd.md) v2.0** — 加入 5 種繪圖工具、Assignment Zone / Hazard Zone 雙類型、繪製狀態機、即時範圍預覽、5 秒 Undo、圖層管理
* **[08-ticket-management](./08-ticket-management/prd.md) v2.0** — 災害類型欄位群組（聯集邏輯）、Disaster Activation、直立救援三層觸發（災害 / Ticket / 建築）、Building Anchor 群組化
* **[04-rbac](./04-rbac/prd.md) v2.0** — Team 級權限、資料可見性矩陣、PostgreSQL RLS 建議

---

## v3 拆細更新（2026-06-10）

> 全部 9 個 feature 進行「邏輯/場景拆細」：偏薄的 PRD（01/02/03/07/09）大幅展開異常場景與規格，較成熟的（04/05/06/08）補強並回填開放問題。**所有變更皆以「🟡 建議 / 待確認」標註，未推翻既有定案**，且每個 feature 在自己的 `research/` 夾下新增一份「成熟產品作法」研究檔。

| Feature | 版本 | 本次重點 | 新增研究檔（該 PRD 的 `research/`） |
|---|---|---|---|
| [01-auth](./01-auth/prd.md) | v1.1 | 帳號識別/連結、OTP 防濫用、Session、SSO 邊界、8 異常場景 | `auth-sso-otp-session-patterns.md` |
| [02-user-profile](./02-user-profile/prd.md) | v1.1 | 通知中心（兩段式輪詢、三態已讀、防洗版、deep link）、偏好持久化 | `in-app-notification-patterns.md` |
| [03-user-settings](./03-user-settings/prd.md) | v1.1 | 密碼/敏感變更安全、升等申請狀態機、停用語義、6 異常場景 | `account-security-lifecycle-patterns.md` |
| [04-rbac](./04-rbac/prd.md) | v2.1 | 回填全部開放問題（唯讀角色、混合角色優先序、雙簽、RLS、break-glass） | `multitenancy-rls-breakglass-patterns.md` |
| [05-member-management](./05-member-management/prd.md) | v3.2 | QR/邀請安全（強制 OTP、撤銷輪替、檢視/接受分離、pending 清理） | `qr-invitation-security-patterns.md` |
| [06-map-decision-support](./06-map-decision-support/prd.md) | v2.1 | 效能/聚合（質疑 ≤500 markers）、繪製幾何正確性、離線/弱網 | `map-performance-offline-geometry-patterns.md` |
| [07-resource-station](./07-resource-station/prd.md) | v1.1 | 修改建議 proposal/diff、樂觀並發衝突、軟刪除/rollback、營運狀態快速通道 | `crowdsourced-poi-moderation-patterns.md` |
| [08-ticket-management](./08-ticket-management/prd.md) | v2.1 | 優先級 4 級+SLA+升級、志工媒合模型、USAR 欄位精簡 | `priority-sla-volunteer-matching-patterns.md` |
| [09-emergency-announcement](./09-emergency-announcement/prd.md) | v1.1 | 對齊 CAP：嚴重度分級、排程/到期、分眾、已讀回執、6 異常場景 | `emergency-alert-cap-patterns.md` |

**跨 feature 一致性質疑（已標於各 PRD，待對齊）**：
- 03 與 05：升等申請審核者分流（加入 Team→Team Admin；平台角色→Super Admin）。
- 07 與 04：資源站對 NGO 的可見性（07 寫「僅指派區檢視」vs 04 矩陣「全可見」）。
- 09 與 04：公告發佈者範圍（09 寫「唯一 Super Admin」vs 04 權限表含 Government / Team Admin）。
- 04 與 05：表頭應拆「平台 RBAC」與「Team 內角色」正交兩維、補「一般使用者/訪客」列。

### 對應 Research 文件

設計依據來自 `../../research/competitive/` 的競品研究：

| 議題 | Research 文件 |
| --- | --- |
| 整體競品矩陣 | [competitive/competitor-overview.md](../../research/competitive/competitor-overview.md) |
| Team / 組織模型 | [patterns/team-organization-patterns.md](../../research/competitive/patterns/team-organization-patterns.md) |
| 地圖繪製 UX | [patterns/map-drawing-ux-patterns.md](../../research/competitive/patterns/map-drawing-ux-patterns.md) |
| 動態表單 / 災害欄位群組 | [patterns/dynamic-form-patterns.md](../../research/competitive/patterns/dynamic-form-patterns.md) |
| Ticket 群組化 | [patterns/incident-grouping-patterns.md](../../research/competitive/patterns/incident-grouping-patterns.md) |
| 直立救援 / USAR | [patterns/vertical-rescue-usar.md](../../research/competitive/patterns/vertical-rescue-usar.md) |
| Crisis Cleanup 深度分析 | [competitor-details/crisis-cleanup.md](../../research/competitive/competitor-details/crisis-cleanup.md) |
| Sahana Eden 深度分析 | [competitor-details/sahana-eden.md](../../research/competitive/competitor-details/sahana-eden.md) |
| ArcGIS Workforce 深度分析 | [competitor-details/arcgis-workforce.md](../../research/competitive/competitor-details/arcgis-workforce.md) |
| Ushahidi 深度分析 | [competitor-details/ushahidi.md](../../research/competitive/competitor-details/ushahidi.md) |
| 台灣市場分析 | [market/market-analysis.md](../../research/market/market-analysis.md) |
