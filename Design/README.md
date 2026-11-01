# Design — 設計原型與設計系統

這個資料夾放設計師的**互動原型**與**設計系統匯出**，不是正式程式碼。
`main` 上的內容就是目前的設計；設計師在自己的分支工作，用 PR 合併進來。

| 路徑 | 內容 |
| --- | --- |
| `前台/` | 民眾看到的網站：原型頁面（`*.html`）、`js/`、`docs/`（裁示與規格）、`_ds/`（設計系統匯出） |
| `後台/` | 管理平台，結構同 `前台/`；`元件 Components.html` 是共用元件的設計稿 |
| `handoff/` | 給工程師搬進 `Frontend/libs/ui` 的 TSX |
| `CHANGELOG.md` | 每次合併的變更、token 異動與「Frontend 待辦」 |

## 怎麼打開原型

1. 直接用瀏覽器打開 `.html`，或在 `Design/` 底下跑 `npx serve .` 再開。
2. 需要連網：React、Babel 等從 CDN 載入。
3. 改過 `js/` 之後要強制重新整理（Mac：Cmd+Shift+R）。

原型裡的示範資料、示範帳號、localStorage 狀態都只是為了演出流程，不是規格；欄位與 API 以 `Backend/Spec/Docs/er-diagram.md` 與 GraphQL schema 為準。

## 給 agent

- 設計師的 agent：照 [`CLAUDE.md`](CLAUDE.md)。
- 前端工程師的 agent：照 [`../Frontend/CLAUDE.md`](../Frontend/CLAUDE.md)；設計系統說明在 [`../Frontend/docs/design-system.md`](../Frontend/docs/design-system.md)。
