# Frontend 文件索引

本目錄收錄 `Frontend` monorepo 目前實作對應的說明文件。啟動方式與 workspace 指令請看 [`../README.md`](../README.md)。

## 建議閱讀順序

| # | 文件 | 適合情境 |
| --- | --- | --- |
| 1 | [`frontend-working-principles.md`](frontend-working-principles.md) | 先理解 `apps/demo`、`libs/ui`、`libs/modules`、`libs/data-access` 的責任邊界 |
| 2 | [`frontend-library-layering-inventory.md`](frontend-library-layering-inventory.md) | 對照 `libs/modules/src` 目前實際目錄與 capability 分層 |
| 3 | [`authentication.md`](authentication.md) | 修改登入、註冊、NextAuth session、BFF auth route 前先讀 |
| 4 | [`data-access.md`](data-access.md) | 新增或調整 GraphQL / REST client、urql client、codegen 時查閱 |
| 5 | [`site-map-interaction-architecture.md`](site-map-interaction-architecture.md) | 修改前台 `/map`、`/list`、分享 metadata 或 viewport/live-data 流程前先讀 |
| 6 | [`admin-features.md`](admin-features.md) | 了解目前 repo 內 admin 頁面與 modules 的實作狀態，以及哪些部分仍未接通 |
| 7 | [`database-schema.md`](database-schema.md) | 快速查看前端目前依賴的後端資料契約摘要 |
| 8 | [`known-issues.md`](known-issues.md) | 先掃一遍目前已知的死碼、未串接功能與技術債 |

## 維護原則

- 文件要反映目前 repo 內實際存在的程式碼，不寫「理想上可能會這樣」但尚未落地的內容。
- 規劃中的內容若仍值得保留，必須明確標示為「未接通 / 未啟用 / 僅有模組尚未掛路由」。
- 調整分層、路由、API contract 或重要流程時，應在同一個 PR 一起更新對應文件。
- `frontend-working-principles.md` 描述規則，`frontend-library-layering-inventory.md` 描述現況；兩者用途不同，重構時通常要一起更新。
