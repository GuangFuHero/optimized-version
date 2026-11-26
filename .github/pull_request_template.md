<!--
送 PR 前請先讀 CONTRIBUTING.md。不適用的段落可以刪掉。
第一次送 PR 的人，CLA Assistant 會在下面留言請你簽 CLA，簽一次就好。
-->

## 改了什麼、為什麼

<!-- 一兩句說清楚。連到對應的 issue、規格（Backend/Spec/…）或 ADR。 -->

## 怎麼驗證的

<!-- 跑了哪些測試、手動測了哪些畫面或 API；有畫面改動的附手機和桌機的前後對照截圖。 -->

## 影響

- [ ] 資料庫 migration（有的話寫 revision）
- [ ] 設定或環境變數（`.env.example`、`DEPLOY.md` 要跟著改）
- [ ] 權限（誰能看、誰能改）
- [ ] 對外的 REST／GraphQL API
- [ ] 都沒有

## 送出前

- [ ] 改了 REST API 或 GraphQL schema：已經跑 `pnpm --dir Frontend schemas:generate` 並 commit 產生的型別
- [ ] 改了 SQLAlchemy model：附了 Alembic migration，`alembic heads` 只有一個
- [ ] 文件跟著改了（README、DEPLOY.md、規格）
- [ ] 資安相關的修正：請維護者加上 `security` 標籤，會列進發版說明的「資安」
- [ ] 沒有放真實個資、密碼或金鑰
