---
version: v1.0.0
status: definition
---

# v1.0.0 — 管理後台系統 (ManagerEnd)

**系統**：島嶼守望 Wanguard 管理後台
**範圍**：下列 9 個 feature + 橫切的 [`04-rbac`](../_shared/04-rbac.md)。目前尚無任何 feature 交付，全數處於規格定義階段。

撰寫規範、三層結構與版本規則見 [`../README.md`](../README.md)。

## Feature 列表

| # | Feature | 產品層 | 工程層 | 狀態 |
|---|---------|--------|--------|------|
| 01 | 身份認證 | [stories](01-auth/user-stories.md) · [prd](01-auth/prd.md) | — ¹ | Definition |
| 02 | 個人檔案 | [stories](02-user-profile/user-stories.md) · [prd](02-user-profile/prd.md) | — ¹ | Definition |
| 03 | 個人設定 | [stories](03-user-settings/user-stories.md) · [prd](03-user-settings/prd.md) | — ¹ | Definition |
| 05 | 成員管理 | [stories](05-member-management/user-stories.md) · [prd](05-member-management/prd.md) | [spec](05-member-management/engineering/spec.md) | Definition |
| 06 | 即時決策輔助 | [stories](06-map-decision-support/user-stories.md) · [prd](06-map-decision-support/prd.md) | [spec](06-map-decision-support/engineering/spec.md) · [plan](06-map-decision-support/engineering/plan.md) | Definition |
| 07 | 資源站管理 | [stories](07-resource-station/user-stories.md) · [prd](07-resource-station/prd.md) | [spec](07-resource-station/engineering/spec.md) | Definition |
| 08 | 任務管理 | [stories](08-ticket-management/user-stories.md) · [prd](08-ticket-management/prd.md) | [request-management](08-ticket-management/engineering/request-management/spec.md) · [volunteer-dispatch](08-ticket-management/engineering/volunteer-dispatch/spec.md) | Definition |
| 09 | 緊急公告系統 | [stories](09-emergency-announcement/user-stories.md) · [prd](09-emergency-announcement/prd.md) | [spec](09-emergency-announcement/engineering/spec.md) | Definition |
| 10 | 訪客端工單隱私 | [prd](10-guest-ticket-privacy/prd.md) ² | — ³ | **草稿** |

> 編號 04 保留給 RBAC，是橫切定義不是 feature，放在 [`../_shared/04-rbac.md`](../_shared/04-rbac.md)。

¹ 01/02/03 沒有獨立的工程規格。原 `Backend/Spec/006-backend-administration` 同時涵蓋這三者與 05，整份現位於 [`05-member-management/engineering/spec.md`](05-member-management/engineering/spec.md)。
² 10 尚無 `user-stories.md`。
³ 10 尚無工程規格；後端 `feature/pii-protection` 分支為部分實作。

## 已知缺口

模板必填章節中，**UX Flow（0/9）** 與 **成功指標（0/9）** 兩項全部從缺——沒有一份 PRD 寫過介面上逐步發生什麼，也沒有一份能回答「這功能上線後算不算成功」。逐 feature 的落實狀況見當時的根目錄文件地圖 `DOCS.md`（內容已併入 `specs/README.md`）。

補齊需逐 feature 做產品判斷，不是文件搬移。
