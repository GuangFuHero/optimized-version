# User Stories 索引目錄

本資料夾收集了 **島嶼守望 Wanguard** 管理後台系統 (ManagerEnd) 各功能模組的 User Stories。

這些 User Stories 是各功能模組的根基文件。

> 🔄 **結構調整中(2026-06-15 起)**:User Stories 正逐一**遷移為 co-located**——改放在各特性自己的資料夾(`product/prd/XX-feature/user-stories.md`),與該特性的 `prd.md` 並排,作為推導規格的根基。本集中式資料夾的舊檔將隨遷移逐步汰換,最終此頁僅作為索引。已遷移者以 ✅ 標示並指向新位置。

---

## 模組列表與 User Stories 連結

| # | 功能模組 | User Story 檔案 | 描述 / 主要角色 |
|---|---------|----------------|----------------|
| 01 | 身份認證 | [01-auth.md](./01-auth.md) | Email/SMS/Google/Line 登入與 SSO |
| 02 | 個人檔案 | [02-user-profile.md](./02-user-profile.md) | 提醒通知、基本資訊、使用習慣記住 |
| 03 | 個人設定 | [03-user-settings.md](./03-user-settings.md) | 帳號安全、升等申請、聯繫資訊變更 |
| 05 | 成員管理 | ✅ [../prd/05-member-management/user-stories.md](../prd/05-member-management/user-stories.md) | 團隊與成員 CRUD、QR 邀請、審核佇列(已 co-located) |
| 06 | 即時決策輔助 | [06-map-decision-support.md](./06-map-decision-support.md) | 地圖繪製與 Zone 指派、電線桿與災害圖層定位 |
| 07 | 資源站管理 | [07-resource-station.md](./07-resource-station.md) | 資源站 Table/地圖視圖、修改建議審核 |
| 08 | 任務管理 | [08-ticket-management.md](./08-ticket-management.md) | 災害欄位、直立救援、Ticket 群組化、任務分配 |
| 09 | 緊急公告系統 | [09-emergency-announcement.md](./09-emergency-announcement.md) | 前後台公告編輯、預覽、發佈與下架 |

*註：`04-rbac`（角色權限管理）為純粹的權限定義與資料隔離矩陣，無定義獨立 User Story，故未在此列出。*
