# Shared Icon Pipeline

這個目錄把 shared UI icon 拆成三層：

- `source/`: 保留原始 SVG source，作為設計資產與可讀來源。
- `generated/`: 放 repo-managed 的 React/TSX icon component，供 runtime 真正使用。
- `index.tsx`: 提供穩定的 `Icons.*` 與 `UiIcon` 入口，讓呼叫端不需要知道底層檔案位置。

## 使用方式

- 優先從 `Icons.*` 使用共享 icon，例如 `<Icons.search />`。
- 若需要動態以名稱選擇 icon，可使用 `UiIcon`。
- icon 會透過 MUI `SvgIcon` 封裝，因此可沿用 `sx`、`color`、`fontSize` 等常見 props。

## 新增或更新 icon 的流程

1. 將原始 SVG 放到 `source/`。
2. 在 `generated/` 建立對應的 React/TSX component。
3. 在 `index.tsx` 註冊到 `Icons.*` 入口。
4. 若既有 shared component 需要採用該 icon，優先接到 `Icons.*`，避免直接引用 source 檔。

這條流程刻意不讓 shared UI runtime 直接依賴 bundler 專屬的 raw `.svg` React import，目的是讓不同建置環境都能消費同一份普通 React component。
