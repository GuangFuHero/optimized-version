# Frontend — agent 守則

這個 repo 有一套設計系統。畫面長什麼樣子由設計師決定。設計在設計師的分支 `sucrelindesign` 的 `Design/`，
那個分支**不會合併進 `main`**，永遠讀它的最新版；`libs/ui/src/theme/design-tokens.ts` 是設計在程式裡的樣子。不要自己發明樣式。

分層原則見 `docs/frontend-working-principles.md`；文件索引見 `docs/README.md`。

## 動任何 UI 之前

1. 讀 `docs/design-system.md`（tokens、`libs/ui` 元件、按鈕規則、手機規則）。
2. 先 `git fetch origin sucrelindesign`，再看對應的原型畫面：民眾網站在 `Design/前台/`，管理平台在 `Design/後台/`，
   並讀那一側 `docs/` 裡相關的裁示。單一檔案用 `git show "origin/sucrelindesign:Design/<路徑>"`；
   要開原型 HTML，用唯讀 worktree：`git worktree add --detach <資料夾> origin/sucrelindesign`。
   **不要**把設計分支 merge 或 cherry-pick 進你的分支。找不到對應畫面就在 #uiux 問設計師。
3. 看設計分支的 `Design/CHANGELOG.md` 有沒有碰到這個畫面的「Frontend 待辦」；有就一起做，或在 PR 說明。

## 硬規則

- 顏色、圓角、字級、間距、陰影都從 `designTokens`（`@rescue-frontend/ui`）拿。
  頁面程式裡不寫 hex／`rgb()`／`rgba()`，`sx` 裡不寫數字的 `borderRadius`、`fontSize`。
  需要半透明就用 `withAlpha(token, alpha)`。
- 先用 `libs/ui` 的元件。缺某個 variant 就去 `libs/ui` 擴充，不要在頁面裡把 MUI 元件重新上色、改圓角。
- 按鈕一律用 `libs/ui` 的 `Button`，照 `docs/design-system.md` 的 BTN 規則；不要 import MUI 的 `Button`。
  標「未實作」的 BTN 規則：先用最接近的現有 variant，在 PR 說明註明；不要自己做，handoff `Button` 搬進來時會一起補上。
- 圖示：前台、後台都用 Lucide（`lucide-react`）；不要加別的圖示套件，`@mui/icons-material` 也不要加回來。
  新圖示加進 `libs/ui` 的 `Icons`（後台也可以直接 import `lucide-react`），站點類型用 `station/station-type-icon.tsx`。
  原型畫了哪個圖示就用同一個，保留 `iconSize` 與顏色 token。
- `design-tokens.ts` 比設計系統的 CSS 匯出新（設計師的裁示先寫進來了）。**不要為了跟 `semantic.css` 一致把它改回去。**
- 不要改 `../Design/`，也不要動設計分支；那是設計師的。她給的元件在設計分支的 `Design/handoff/`（目前在 `Design/components/`），搬法見 `docs/design-system.md`。

`pnpm lint` 會對 `libs/modules` 與 `apps` 報其中幾項（寫死的顏色、數字圓角與字級、MUI 的 `Button`；目前是 warning），其他規則 lint 抓不到，要自己對照。新寫的程式不可以增加這類 warning。

## 原型沒畫到的狀態

錯誤、空白、載入中、手機版、權限不足…原型沒畫到就**停下來問**，不要自己設計。
在 Discord #uiux 問設計師（sucrelin），把她的決定寫進 PR 說明；她會再補進設計分支。

## PR 說明要寫

- 對照的原型畫面（設計分支 `Design/` 底下的檔名）。
- 這個 PR 處理了設計分支 `CHANGELOG.md` 的哪一筆待辦（有的話）。
- 刻意和原型不同的地方，以及原因。
- `pnpm lint` 結果：沒有新增 design-system warning。

## 修既有偏差的任務

照 `docs/design-system-audit.md`：一次一個模組、規則與流程都寫在那裡。
