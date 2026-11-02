# Design CHANGELOG

給工程師的簡短待辦清單；詳細說明在各側的 `更新說明.md` 或 `docs/`。每次交付在最上面加一筆。

## 2026-11-03 管理平台通知鈴鐺分兩組

**影響畫面**：`後台/任務管理 Ticket Management.html` 等後台各頁頂欄的鈴鐺（網址加 `?demo=1` 看示範通知）

**詳細說明**：`後台/更新說明.md` 的 2026-11-03 一節、`後台/docs/通知鈴鐺.md`

### Token 異動
無

### Frontend 待辦
- 管理平台頂欄的鈴鐺接上後端通知（`GET /notifications`），照 `後台/docs/通知鈴鐺.md`：分兩組（等你處理／你的團隊）、空白畫面、點了去對應頁面
- 站點營運狀態更新（`resource_station_updated`）不算進鈴鐺數字
- 句子先顯示後端的 `title`、`body`；後端給 `params` 欄位後改由前端依 `type` 組句子
