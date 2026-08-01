# 文件地圖 — 島嶼守望 Wanguard

本 repo 有多套歷史文件並存。**這頁是唯一入口**，說明哪份文件對哪件事有權威、哪些已凍結。

---

## 規格都在 `specs/`

產品需求與工程規格已合併為單一規格樹，依「發布版本 → feature → 文件層」組織：

```
specs/<version>/<NN-feature>/
├── user-stories.md   問題空間 — 為誰、在什麼情境、想達成什麼價值
├── prd.md            產品規格 — 系統該有什麼行為、什麼算完成
├── research/         決策依據 — 成熟產品怎麼做、為什麼這樣選
└── engineering/      工程規格 — 如何實作、資料模型、API、任務拆解
```

上層是下層的來源。工程規格若與 PRD 衝突，以 PRD 為準並回報差異；PRD 若與 user-stories 衝突，以 user-stories 為準。

**入口：** [`specs/README.md`](specs/README.md) — 結構、版本規則與撰寫規範
**目前版本：** [`specs/v1.0.0/`](specs/v1.0.0/README.md)（9 個 feature，全數規格定義中） · [`specs/v2.0.0/backlog.md`](specs/v2.0.0/backlog.md)（延後項目索引）
**橫切定義：** [`specs/_shared/04-rbac.md`](specs/_shared/04-rbac.md) · [`specs/_shared/user-journey.md`](specs/_shared/user-journey.md) · [`specs/_shared/engineering/`](specs/_shared/engineering/)

資料模型的實際狀態以 [`specs/_shared/engineering/er-diagram.md`](specs/_shared/engineering/er-diagram.md) 為準。

---

## 舊路徑對照

`Product/`、`Backend/Spec/`、根目錄 `Spec/` 三棵樹已全部併入 `specs/`。舊連結對照如下：

| 舊位置 | 新位置 |
|---|---|
| `Product/prd/XX-feature/` | `specs/v1.0.0/XX-feature/` |
| `Product/prd/_shared/` · `Product/user-journey.md` | `specs/_shared/` |
| `Product/prd/_template/` | `specs/_template/` |
| `Product/_archive/` · `Product/prd/prd-manager-end-sucre.md` | `specs/_archive/` |
| `Backend/Spec/002-interactive-disaster-map` | `specs/v1.0.0/06-map-decision-support/engineering/` |
| `Backend/Spec/003-request-management` | `specs/v1.0.0/08-ticket-management/engineering/request-management/` |
| `Backend/Spec/004-volunteer-dispatch` | `specs/v1.0.0/08-ticket-management/engineering/volunteer-dispatch/` |
| `Backend/Spec/005-supply-management` | `specs/v1.0.0/07-resource-station/engineering/` |
| `Backend/Spec/006-backend-administration` | `specs/v1.0.0/05-member-management/engineering/` |
| `Backend/Spec/007-information-publishing` | `specs/v1.0.0/09-emergency-announcement/engineering/` |
| `Backend/Spec/Docs/` | `specs/_shared/engineering/` |
| `Backend/Spec/TODO.md` | `specs/_archive/backend-spec-todo.md` |
| `Spec/Docs/map-tile-service-*.md` | `specs/v1.0.0/06-map-decision-support/engineering/` |
| `Backend/.specify/` | `.specify/`（repo root） |

**兩套編號體系已統一為 Product 的 01–10。** 舊的 `Backend/Spec/NNN-*` 三位數編號不再使用；01/02/03 沒有各自的工程規格，原 006 同時涵蓋這三者與 05，整份現位於 `specs/v1.0.0/05-member-management/engineering/`。

---

## 已凍結／不要引用

| 位置 | 狀態 | 說明 |
|------|------|------|
| `specs/_archive/` | 凍結 | 舊 user-stories 索引、舊版單檔 PRD 總表、舊工程待辦清單 |
| `System_Design/mindmap/` | 過時 | 6 模組 × 4 面向的早期需求樹，已被 `specs/` 取代。內含的 GitHub 連結指向舊 `Backend/Spec/` 路徑，未更新 |
| `specs/v1.0.0/08-ticket-management/decisions.md` | 過程紀錄 | 設計討論產物，非規格 |

舊 mindmap 模組與現行 feature 的粗略對應（**內容不保證同步，有出入以 PRD 為準**）：
`01_map`→06、`02_volunteer_tasks`→08、`03_delivery`→07、`04_info_page`→09、`05_moderator_admin`→05、`06_system_admin`→04-rbac。

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
