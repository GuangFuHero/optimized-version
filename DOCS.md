# 文件地圖 — 島嶼守望 Wanguard

本 repo 有多套歷史文件並存。**這頁是唯一入口**，說明哪份文件對哪件事有權威、哪些已凍結。

---

## 三層結構

| 層 | 位置 | 回答什麼 | 權威性 |
|---|------|----------|--------|
| **問題空間** | `Product/prd/XX-feature/user-stories.md` | 為誰、在什麼情境、想達成什麼價值 | ✅ 權威 |
| **產品規格** | `Product/prd/XX-feature/prd.md` | 系統該有什麼行為、什麼算完成 | ✅ 權威 |
| **工程規格** | `Backend/Spec/NNN-*/spec.md` | 如何實作、資料模型、API、任務拆解 | ✅ 權威（實作面） |

上層是下層的來源。工程規格若與 PRD 衝突，以 PRD 為準並回報差異；PRD 若與 user-stories 衝突，以 user-stories 為準。

**入口：**
- 產品需求 → [`Product/prd/README.md`](Product/prd/README.md)
- 跨 feature 旅程 → [`Product/user-journey.md`](Product/user-journey.md)
- 橫切權限定義 → [`Product/prd/_shared/04-rbac.md`](Product/prd/_shared/04-rbac.md)
- 工程規格閱讀指引 → [`Backend/Spec/Docs/specs-reading-guide.md`](Backend/Spec/Docs/specs-reading-guide.md)

---

## 追溯表：PRD ↔ 工程規格 ↔ 舊 mindmap

兩套編號體系互不相同，且是不同世代的產物（`Backend/Spec` 建於 2025-11，`Product/prd` 建於 2026-05 之後）。對應關係如下，**內容不保證同步**——有出入時以 PRD 為準。

| Product PRD | Backend/Spec | System_Design/mindmap（已過時） |
|---|---|---|
| [01-auth](Product/prd/01-auth/prd.md) | （散於 006） | — |
| [02-user-profile](Product/prd/02-user-profile/prd.md) | （散於 006） | — |
| [03-user-settings](Product/prd/03-user-settings/prd.md) | （散於 006） | — |
| [04-rbac](Product/prd/_shared/04-rbac.md)（橫切） | [Docs/rbac-permissions-design.md](Backend/Spec/Docs/rbac-permissions-design.md) | `06_system_admin` |
| [05-member-management](Product/prd/05-member-management/prd.md) | [006-backend-administration](Backend/Spec/006-backend-administration/spec.md) | `05_moderator_admin` |
| [06-map-decision-support](Product/prd/06-map-decision-support/prd.md) | [002-interactive-disaster-map](Backend/Spec/002-interactive-disaster-map/spec.md) | `01_map` |
| [07-resource-station](Product/prd/07-resource-station/prd.md) | [005-supply-management](Backend/Spec/005-supply-management/spec.md) | `03_delivery` |
| [08-ticket-management](Product/prd/08-ticket-management/prd.md) | [003-request-management](Backend/Spec/003-request-management/spec.md) · [004-volunteer-dispatch](Backend/Spec/004-volunteer-dispatch/spec.md) | `02_volunteer_tasks` |
| [09-emergency-announcement](Product/prd/09-emergency-announcement/prd.md) | [007-information-publishing](Backend/Spec/007-information-publishing/spec.md) | `04_info_page` |
| [10-guest-ticket-privacy](Product/prd/10-guest-ticket-privacy/prd.md) | （尚無；後端 `feature/pii-protection` 為部分實作） | — |

資料模型的實際狀態以 [`Backend/Spec/Docs/er-diagram.md`](Backend/Spec/Docs/er-diagram.md) 為準。

---

## 已凍結／不要引用

| 位置 | 狀態 | 說明 |
|------|------|------|
| `Product/_archive/` | 凍結 | 舊 user-stories 索引與過時內容 |
| `Product/prd/prd-manager-end-sucre.md` | 僅供追溯 | 舊版單檔總表，內容已拆分至 01–10 |
| `System_Design/mindmap/` | 過時 | 6 模組 × 4 面向的早期需求樹，已被 `Product/prd/` 取代 |
| `Spec/Docs/` （根目錄） | 孤兒 | 只有 map-tile-service 兩份，未被任何文件引用 |
| `Product/prd/08-ticket-management/grill-decisions.md` | 過程紀錄 | 設計討論產物，非規格 |

---

## PRD 模板覆蓋度

`_template/prd.md` 定義的必填章節，目前各 feature 的落實狀況。**空白處是待補的工作，不是可以省略的章節。**

| Feature | user-stories | 範圍與邊界 | UX Flow | 異常場景 | 成功指標 |
|---|:---:|:---:|:---:|:---:|:---:|
| 01-auth | ✅ | ✗ | ✗ | 在功能需求內 | ✗ |
| 02-user-profile | ✅ | ✗ | ✗ | ✗ | ✗ |
| 03-user-settings | ✅ | ✗ | ✗ | 在功能需求內 | ✗ |
| 05-member-management | ✅ | ✅ | ✗ | ✅ | ✗ |
| 06-map-decision-support | ✅ | ✗ | ✗ | ✗ | ✗ |
| 07-resource-station | ✅ | ✗ | ✗ | 在功能需求內 | ✗ |
| 08-ticket-management | ✅ | ✗ | ✗ | ✗ | ✗ |
| 09-emergency-announcement | ✅ | ✗ | ✗ | 在功能需求內 | ✗ |
| 10-guest-ticket-privacy | ✗ | ✗ | ✗ | ✗ | ✗ |

兩個系統性缺口：

- **UX Flow — 0/9。** 沒有一份 PRD 寫過「介面上逐步發生什麼」。設計師無法直接依 PRD 產出畫面，這是目前設計與規格脫鉤的根因。3 份有 `User Flow`（05/06/08），但那是跨模組旅程，不是介面互動。
- **成功指標 — 0/9。** 現有「驗收標準」全是布林 QA 條件。整套文件無法回答「這功能上線後算不算成功」。

補齊需逐 feature 做產品判斷，不是文件搬移，因此不併入結構整理。
