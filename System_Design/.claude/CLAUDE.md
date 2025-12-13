# 光復超人 2.0 - Claude Code 專案設定

## 專案概述

這是「光復超人 2.0」災難救援系統的設計規格專案。使用 Markdown + 檔案系統作為 Single Source of Truth。

## 目錄結構

```
mindmap/              # 規格文件 - 這是 Single Source of Truth
├── 01_map/           # 地圖站點
├── 02_volunteer_tasks/   # 志工模組
├── 03_delivery/      # 配送模組
├── 04_info_page/     # 資訊頁面
├── 05_moderator_admin/   # 審核後台
└── 06_system_admin/      # 系統管理
```

## 編輯指南

### 修改規格時：
1. 編輯 `mindmap/` 下對應模組的 `.md` 檔案
2. 保持 FR-XXX 編號格式
3. 維護四個維度：UI/UX, Frontend, Backend, AI & Data

### 新增功能需求時：
1. 找到對應模組的 `requirements.md`
2. 新增 FR-XXX 條目
3. 更新對應維度的說明

### 導出時：
```bash
uv run python scripts/export_mindmap.py
```

## 命名規則

- 模組目錄：`NN_module_name/` (e.g., `01_map/`)
- 功能需求：`FR-MODULE-NN` (e.g., `FR-MAP-01`)
- SPEC 連結：`SNN-spec-name` (e.g., `S01-request-management`)

## 原始 Mindmap

- `source_mindmap_6829x7999.png` - 原始設計圖（來自 Whimsical）

原始設計包含 6 個核心模組和詳細的功能需求。

## AI 協作區

`ai_chatroom/` 是 AI agents 的工作空間。

**追蹤（會 commit）**：研究報告、分析文件（`*_summary_cld.txt`, `*_detail_cld.md`）

**不追蹤**：工作日誌、臨時草稿（放在 `work_logs/` 或用 `tmp_` 開頭）

**清理**：專案告一段落時，有價值的整理到 `docs/`，其餘刪除。

## Editor 架構

### Markdown 4-Layer Structure
requirements.md 檔案使用 4 層階層：
```
# Module Name (Layer 1: User Story)
## FR-XXX: Description (Layer 2: Functional Requirement)
### UI/UX | Frontend | Backend | AI & Data (Layer 3: Delegate/Dimension)
#### SPEC Links (Layer 4)
```

### Configuration System
- `editor/config/features.json` - 可配置的 mindmap 限制
- `/api/config` endpoint 提供前端設定
- 預設限制：maxFrItems=100, maxDimensionItems=100, maxDescriptionLength=200

### Server
- `editor/server.py` 使用 FastAPI + uvicorn
- 綁定 `127.0.0.1:3000`（僅 localhost）
- 支援可選的 AI 功能（需要 ANTHROPIC_API_KEY 環境變數）

### Testing
- Playwright e2e tests 在 `editor/tests/test_ui.py`
- 執行：`uv run pytest editor/tests/test_ui.py -v --browser chromium`

## 開發注意事項

### Parser 格式依賴
- `loadAllMarkdown()` in `editor/static/editor.js` 依賴特定 markdown 格式（4-layer heading）
- 如果新增模組，必須放在 `mindmap/` 目錄下並遵循現有結構
- 表格格式的 markdown 不會被正確解析

## 不要做的事

- 不要直接修改 `source_mindmap_6829x7999.png`
