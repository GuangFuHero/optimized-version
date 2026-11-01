# Frontend — agent 守則

這個 repo 有一套設計系統。畫面長什麼樣子由設計師決定，`main` 上的 `../Design/` 是設計的真實來源，
`libs/ui/src/theme/design-tokens.ts` 是它在程式裡的樣子。不要自己發明樣式。

分層原則見 `docs/frontend-working-principles.md`；文件索引見 `docs/README.md`。

## 動任何 UI 之前

1. 讀 `docs/design-system.md`（tokens、`libs/ui` 元件、按鈕規則、手機規則）。
2. 打開對應的原型畫面：民眾網站在 `../Design/前台/`，管理平台在 `../Design/後台/`（`*.html`，瀏覽器直接開），
   並讀那一側 `docs/` 裡相關的裁示。
3. 看 `../Design/CHANGELOG.md` 有沒有還沒做的「Frontend 待辦」碰到這個畫面；有就一起做或在 PR 說明。

## 硬規則

- 顏色、圓角、字級、間距、陰影都從 `designTokens`（`@rescue-frontend/ui`）拿。
  頁面程式裡不寫 hex／`rgb()`／`rgba()`，`sx` 裡不寫數字的 `borderRadius`、`fontSize`。
  需要半透明就用 `withAlpha(token, alpha)`。
- 先用 `libs/ui` 的元件。缺某個 variant 就去 `libs/ui` 擴充，不要在頁面裡把 MUI 元件重新上色、改圓角。
- 按鈕一律用 `libs/ui` 的 `Button`，照 `docs/design-system.md` 的 BTN 規則；不要 import MUI 的 `Button`。
- `design-tokens.ts` 比設計系統的 CSS 匯出新（設計師的裁示先寫進來了）。**不要為了跟 `semantic.css` 一致把它改回去。**
- 不要改 `../Design/` 底下的檔案；那是設計師的。唯一例外：做完待辦後在 `../Design/CHANGELOG.md` 打勾。
  她給的元件在 `../Design/handoff/`，搬法見 `docs/design-system.md`。

`pnpm lint` 會對 `libs/modules` 與 `apps` 報上面這些違規（目前是 warning）。新寫的程式不可以增加這類 warning。

## 原型沒畫到的狀態

錯誤、空白、載入中、手機版、權限不足…原型沒畫到就**停下來問**，不要自己設計。
在 Discord #uiux 問設計師（sucrelin），把她的決定寫進 PR 說明；她會再補進 `../Design/`。

## PR 說明要寫

- 對照的原型畫面（`../Design/` 底下的檔名）。
- 刻意和原型不同的地方，以及原因。
- `pnpm lint` 結果：沒有新增 design-system warning。

## 修既有偏差的任務

照 `docs/design-system-audit.md`：一次一個模組、規則與流程都寫在那裡。
