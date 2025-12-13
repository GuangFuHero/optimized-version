# 光復超人 2.0 - 心智圖編輯器

> 災難救援系統設計工具 - 把規格文件變成互動式心智圖 ٩(◕‿◕｡)۶

## 這是什麼？

**光復超人 2.0** 是一個災難救援系統的設計專案。我們用一個創新的方式來管理系統規格：

- 所有規格都寫在 **Markdown 文字檔**（人人都能編輯）
- 自動產生**互動式心智圖**（一目瞭然）
- 支援**即時雙向編輯**（改文字 ↔ 改心智圖，自動同步）

簡單說：**文字檔就是唯一真相來源**，心智圖只是讓你更容易看懂。

---

## 快速上手 - 你想做什麼？

### 「我只想看設計」(´･ω･`)

不需要安裝任何東西！

1. 打開 `exports/mindmap.html` - 互動式心智圖（可展開收合）
2. 或看 [原始設計圖 (Whimsical)](https://whimsical.com/design-doc-QnVuXXmtPDQ3e2nLLC9cDf)

### 「我想編輯規格」

只需要一個文字編輯器！

1. 到 `mindmap/` 資料夾
2. 找到你要改的模組（例如 `01_map/content.md`）
3. 直接編輯 Markdown 檔案
4. 存檔，完成！

### 「我想重新產生心智圖」

編輯完規格後，執行：

```bash
uv run python scripts/export_mindmap.py
```

這會更新 `exports/` 裡的檔案（HTML 心智圖、PDF 文件等）。

### 「我想跑互動編輯器」

需要一點技術設定，請看 **[詳細安裝指南](docs/GETTING-STARTED.md)**

---

## 專案結構

```
光復超人 2.0/
│
├── mindmap/                   ← 規格文件（這裡是重點！）
│   ├── 01_map/                  地圖站點模組
│   ├── 02_volunteer_tasks/      志工任務模組
│   ├── 03_delivery/             配送模組
│   ├── 04_info_page/            資訊頁面模組
│   ├── 05_moderator_admin/      審核後台模組
│   └── 06_system_admin/         系統管理模組
│
├── editor/                    ← 互動編輯器（網頁版）
│   ├── server.py                伺服器程式
│   └── static/                  網頁介面
│
├── exports/                   ← 匯出檔案
│   └── mindmap.html             獨立心智圖網頁
│
└── [原始設計圖 (Whimsical)](https://whimsical.com/design-doc-QnVuXXmtPDQ3e2nLLC9cDf)
```

---

## 模組一覽

| 模組 | 說明 | 功能需求編號 |
|------|------|-------------|
| 地圖站點 | 災難地圖視覺化，顯示站點與災情 | FR-MAP-01 ~ 13 |
| 志工媒合 | 志工任務管理與配對 | FR-TASK-01 ~ 10 |
| 配送媒合 | 物資與人員配送調度 | FR-DELIVERY-01 ~ 07 |
| 資訊頁 | 公開資訊發布與查詢 | FR-INFO-01 ~ 06 |
| 資料審核後台 | 內容審核與管理 | FR-MOD-01 ~ 05 |
| 工程師後台 | 系統管理與監控 | FR-ADMIN-01 ~ 05 |

---

## 規格文件格式

每個功能需求（FR）都包含四個維度：

```markdown
## FR-MAP-01: 即時地圖顯示

### UI/UX
- 使用者打開首頁即看到互動式地圖
- 地圖標記分類顯示（需求點、避難所、物資站）

### Frontend
- 使用 Leaflet.js 地圖套件
- WebSocket 即時更新標記

### Backend
- API 端點: GET /api/map/markers
- 支援地理邊界查詢

### AI & Data
- 標記聚合演算法（避免畫面太擠）
```

---

## AI 協作模式 (・∀・)

這個專案使用「AI 聊天室」模式，讓多個 AI 一起協作。

詳細的命名規則與使用方式請參考 [`.claude/CLAUDE.md`](.claude/CLAUDE.md)。

---

## 技術資訊（給工程師）

| 類別 | 使用技術 |
|------|---------|
| 後端 | FastAPI, Python 3.11+ |
| 前端 | 原生 JavaScript, Markmap.js |
| 即時通訊 | WebSocket |
| AI | Claude Agent SDK（選配） |
| 套件管理 | uv |
| 測試 | Playwright（端對端測試） |

詳細技術文件請看 `editor/` 資料夾。

---

## 貢獻指南

歡迎一起完善這個專案！

1. **改規格**：編輯 `mindmap/` 裡的 Markdown 檔案，遵循 FR-XXX 格式
2. **改編輯器**：修改 `editor/` 裡的程式碼
3. **寫測試**：在 `editor/tests/` 新增測試

---

## 授權

MIT License - 詳見 [LICENSE](../LICENSE)

---

## 致謝

- **光復超人團隊** - 原始災難救援系統設計
- **AI 助手們**：
  - Claude Code（架構設計、程式實作）
- **開源專案**：
  - [Markmap](https://markmap.js.org/) - 心智圖視覺化
  - [FastAPI](https://fastapi.tiangolo.com/) - 網頁框架
  - [uv](https://github.com/astral-sh/uv) - 套件管理器

---

**備註**：這是一個設計規格專案，實際的災難救援系統會另外開發。這個專案專注於維護清晰、可執行的規格文件。

有問題歡迎開 Issue！ (ﾉ´ヮ`)ﾉ*: ・゚✧
