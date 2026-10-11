# Wan Guard 島嶼守望 — 設計原型（交付前端）

這個資料夾放的是**可直接用瀏覽器打開的互動原型**，不是正式程式碼。畫面上的資料全是假資料。
產品規格（PRD）在 Notion，不在這裡。欄位與 API 以 `main` 分支的 `Backend/Spec/Docs/er-diagram.md`、`Frontend/libs/data-access/src/graphql/schema.graphql` 為準。

## 怎麼打開

1. clone 本分支後，直接雙擊 `.html`，或在 `Design/` 底下跑 `npx serve .` 再用瀏覽器開
2. 需要連網（React／Babel／Lucide／Leaflet 從 unpkg 載入）
3. 改過 `js/` 後要強制重新整理（Mac：Cmd+Shift+R）

## 頁面一覽

| 資料夾 | 頁面 | 說明 |
|---|---|---|
| `前台/` | `登入 Login.html` | 登入／註冊。下方有三個示範帳號可一鍵登入；有後台身份的帳號登入後會進管理平台 |
| | `前台地圖 Site Map.html` | 公開地圖（站點／任務） |
| | `前台列表 Site List.html` | 公開列表，與地圖共用篩選狀態 |
| | `前台行前資訊 Site Briefing.html` | 志工看到的行前資訊（內容由後台「志工行前資訊」編輯） |
| `後台/` | `任務管理 Ticket Management.html` | 任務單列表／地圖、詳情、建單、指派、現場分區（2026-10-11 加入） |
| | `互助地圖 Mutual Aid Map.html` | 圈出危險區／責任區／標示區，責任區內的任務單批次指派（2026-10-11 加入） |
| | `設定 Settings.html` | 這次災害的基本資料、災害類型、表單欄位；只有超級管理員能改（2026-10-11 加入） |
| | `資源站點管理 Resource Station v2.html` | 站點列表／地圖視圖、審查、匯入匯出 |
| | `緊急公告 Emergency Announcements.html` | 發布前台／後台公告橫幅 |
| | `志工行前資訊 Volunteer Briefing.html` | 編輯並發布前台的行前資訊 |
| | `成員管理 Member Management.html` | 側欄的「團隊」與「成員與權限」**是這一頁的兩個分頁**（`#view=teams`／`#view=members`） |

每一頁標題旁的 **？** 是該頁的功能說明。

## 原型專用、不要照做的東西

- **後台頂端的深色「原型 · 角色視角」列**：用來切換示範角色看權限差異。正式版沒有這一列，身份來自登入
- **登入頁的示範帳號按鈕**：正式版是 next-auth
- 狀態（登入、身份切換、已讀）存在瀏覽器 localStorage，只是為了跨頁演出流程

## 尚未交付的頁面

總覽儀表板、AI 重複審核還沒有交付。後台側欄仍保留這兩項（它們是正式的資訊架構），
點下去會顯示「建置中」佔位頁。
前台的「前往管理平台」落在任務管理（`../後台/任務管理 Ticket Management.html`）。

各次交付的細節見 `前台/更新說明.md`、`後台/更新說明.md`。

## 兩個資料夾的共用檔

`前台/` 與 `後台/` 各有一份 `_ds/`（設計系統與字型）與 `js/`，彼此獨立、可以分開打開。
`js/admin/announce/an-*`（公告橫幅）、`js/admin/ticket/tk-locpicker.jsx`，以及 `js/shared/` 的 `wg-help.jsx`、`wg-photos.jsx`、`wg-bridge.js`、`wg-hazard.js` 兩邊都有，**內容相同**，改一邊要同步另一邊。
