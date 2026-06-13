# Frontend 文件索引

本目錄收錄「島嶼守望」前端開發所需的架構說明、串接規則與規劃文件。專案總覽與啟動方式請見上層的 [`../README.md`](../README.md)。

## 建議閱讀順序

| #   | 文件                                                                               | 適合情境                                                                                                        |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [`frontend-working-principles.md`](frontend-working-principles.md)                 | 第一次貢獻前必讀：`apps` / `libs/ui` / `libs/modules` / `libs/data-access` 分層原則、依賴方向、檔案擺放判斷規則 |
| 2   | [`frontend-library-layering-inventory.md`](frontend-library-layering-inventory.md) | 對照「現在 `libs/modules` 實際長什麼樣」，搭配第 1 點的目標方向使用                                             |
| 3   | [`authentication.md`](authentication.md)                                           | 開發登入 / 註冊 / session 相關功能前必讀：NextAuth、BFF route、SSO、所需環境變數                                |
| 4   | [`data-access.md`](data-access.md)                                                 | 新增或修改 GraphQL 查詢、urql 使用方式、codegen 流程                                                            |
| 5   | [`site-map-interaction-architecture.md`](site-map-interaction-architecture.md)     | 開發前台地圖（`/map`、`/list`）相關功能前必讀：route / viewport / live data / Leaflet render 的狀態分層         |
| 6   | [`database-schema.md`](database-schema.md)                                         | 需要了解後端資料表結構、欄位定義或 ER 關係時查閱                                                                |
| 7   | [`admin-features.md`](admin-features.md)                                           | 後台（admin）功能規劃文件 — admin 尚在規劃階段，開發前請先確認規劃是否仍對應目前後端能力                        |
| 8   | [`known-issues.md`](known-issues.md)                                               | 開發前快速掃過：目前已知的死碼、重複邏輯、未完成功能與技術債，避免重複踩坑                                      |

## 文件維護原則

- 文件內容應反映「目前的程式碼狀態」；若文件描述與程式碼不一致，請於修改程式碼的同一個 PR 內更新對應文件。
- `frontend-working-principles.md` 描述的是目標方向與規則，`frontend-library-layering-inventory.md` 描述的是現況快照 — 重構時請兩者一併更新。
- 新發現的程式碼品質問題、死碼或重複邏輯，請補進 [`known-issues.md`](known-issues.md)；修復後從該文件移除對應項目。
- 目前的審查範圍以 `(auth)`、`(site)` 與對應 `libs/modules/src/auth`、`libs/modules/src/site` 為主；`admin` 尚在規劃階段，相關文件與程式碼暫不深入審查。
