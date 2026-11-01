# 設計系統偏差追蹤

頁面程式裡違反設計系統的地方，一個模組一列。接修正任務的 agent 照這份做。
規則本身見 [`design-system.md`](design-system.md)；lint 規則在 `../eslint.config.mjs` 的 `designSystemGuardrail`。

## 第 0 項（先做，其他模組才有元件可換）

元件在設計分支：`origin/sucrelindesign` 的 `Design/handoff/Button/index.tsx`（目前在 `Design/components/Button/index.tsx`），設計稿是 `Design/後台/元件 Components.html` 第 2、3 節。

| 項目                                                                                                                                         | 負責人 | PR  | 狀態 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- | ---- |
| 把設計師的 handoff `Button` 搬進 `libs/ui`（加 neutral、tone、loading、iconOnly、selected、count），照 `design-system.md`「搬 handoff 元件」 |        |     |      |

## 模組

數字是 `pnpm lint` 的 design-system warning 數（顏色＝hex／rgb／rgba；圓角、字級＝寫死的數字；Button＝從 MUI import），在 `main` 的 `dab23743` 上算的。之後 `main` 新加的程式可能會多幾個；接任務時先跑一次 lint 看該模組現在的數字。
依序處理；路徑在 `libs/modules/src/` 底下，`apps/*` 除外。

⚠️ 數字**不含**模組專屬調色盤：`libs/ui/src/theme/tokens.ts` 的 `moduleColorSchemes`（auth、adminShell、adminPanels、stationList、stationDetail、ticket、mapOverlay）有大量寫死的 hex，模組透過 `getRescueColorScheme(theme)` 讀取。`libs/ui` 不在 lint 範圍內，所以例如 `admin/user` 只顯示 4 個顏色 warning，真正的偏差在調色盤裡。

| #   | 模組                           | 顏色 | 圓角 | 字級 | Button | 合計 | 負責人 | PR  | 狀態 |
| --- | ------------------------------ | ---- | ---- | ---- | ------ | ---- | ------ | --- | ---- |
| 1   | `ticket/admin`（後台任務管理） | 94   | 18   | 34   | 1      | 147  |        |     |      |
| 2   | `admin/user`                   | 4    | 8    | 9    | 0      | 21   |        |     |      |
| 3   | `admin/field-configuration`    | 4    | 5    | 11   | 0      | 20   |        |     |      |
| 4   | `admin/invite-side-sheet`      | 3    | 7    | 11   | 0      | 21   |        |     |      |
| 5   | `auth`                         | 10   | 11   | 14   | 7      | 42   |        |     |      |
| 6   | `shell`                        | 0    | 7    | 22   | 1      | 30   |        |     |      |
| 7   | `station`                      | 3    | 13   | 7    | 1      | 24   |        |     |      |
| 8   | `map`                          | 8    | 14   | 4    | 1      | 27   |        |     |      |
| 9   | `apps/admin`                   | 11   | 2    | 3    | 0      | 16   |        |     |      |
| 10  | `briefing`                     | 8    | 0    | 5    | 1      | 14   |        |     |      |
| 11  | `ticket/help-request`          | 0    | 0    | 10   | 4      | 14   |        |     |      |
| 12  | `ticket/needs`                 | 0    | 0    | 10   | 0      | 10   |        |     |      |
| 13  | `role-request`                 | 0    | 1    | 3    | 4      | 8    |        |     |      |
| 14  | `ticket/my-claims`             | 0    | 0    | 8    | 0      | 8    |        |     |      |
| 15  | `admin/dashboard`              | 0    | 1    | 5    | 0      | 6    |        |     |      |
| 16  | `ticket/photos`                | 0    | 0    | 4    | 2      | 6    |        |     |      |
| 17  | `building`                     | 0    | 1    | 3    | 1      | 5    |        |     |      |
| 18  | `route`                        | 0    | 0    | 5    | 0      | 5    |        |     |      |
| 19  | `admin/shared`                 | 1    | 2    | 1    | 0      | 4    |        |     |      |
| 20  | `notification`                 | 0    | 0    | 4    | 0      | 4    |        |     |      |
| 21  | `list`                         | 0    | 0    | 3    | 0      | 3    |        |     |      |
| 22  | `point-share`                  | 0    | 1    | 1    | 1      | 3    |        |     |      |
| 23  | `session`                      | 0    | 0    | 3    | 0      | 3    |        |     |      |
| 24  | `ticket/task-match`            | 0    | 1    | 2    | 0      | 3    |        |     |      |
| 25  | `apps/demo`                    | 0    | 0    | 2    | 0      | 2    |        |     |      |
| 26  | `admin/announcement`           | 0    | 0    | 1    | 0      | 1    |        |     |      |
|     | **合計**                       | 146  | 92   | 185  | 24     | 447  |        |     |      |

`brand/`（logo 與吉祥物的圖形顏色）不在 lint 範圍內。

## 修正任務的規則

1. **一個 PR 只修一個模組**，在上表填負責人、PR、狀態。
2. 修掉該模組**所有** warning，並打開設計分支上對應的原型畫面（`Design/前台/`、`Design/後台/`，讀法見 `design-system.md`）逐一對照。
3. **不改行為**：只動樣式，不改資料流、文案、互動。
4. PR 附修改前後的截圖（桌機與手機寬度各一張）。
5. 找不到對應 token 的顏色（例：任務管理頁的 `#564337`、`#151C22`、`#954900`、`#17212B`、`#E7EFF7`、`#667085`）是**設計師要回答的問題**：在 #uiux 問，不要自己新增 token，也不要挑一個「差不多」的。等答案時先留著，PR 說明列出來。
6. 模組有用到 `moduleColorSchemes` 的調色盤時，把那份調色盤也一起改成語意 token（或改成直接用 `designTokens`），算在同一個 PR；不再用的項目刪掉。
7. 圖示的 `fontSize` 改用 `designTokens.iconSize`；文字改用 `typography` 或（前台）`textSize`。
8. 同一個 PR 把這個模組的 lint 升成 error，之後不會再退回去。在 `../eslint.config.mjs` 的最後加一行（`apps/*` 則加在該 app 的 eslint 設定，路徑相對於 app）：

   ```js
   designSystemGuardrail(['libs/modules/src/ticket/admin/**/*.ts', 'libs/modules/src/ticket/admin/**/*.tsx'], 'error'),
   ```

9. `pnpm lint` 通過、該模組 0 個 design-system warning，才算完成。

## 圖示（已統一）

前台和後台都用 Lucide（見 `design-system.md`「圖示」）。整個前端已經沒有程式 import `@mui/icons-material`，
`package.json` 也拿掉了這個依賴。沒有圖示的 lint 規則，review 時留意有沒有人把它加回來。

## lint 抓不到的（review 時要看）

- 巢狀的響應式值：`fontSize: { mobile: 14, tablet: 16 }`。
- JSX 屬性：`<Typography fontSize={14}>`、`<Box borderRadius={2}>`。
- 變數或常數裡的數字：`const R = 12; … borderRadius: R`。
- CSS 字串（template literal）裡的圓角與字級；顏色會抓到。
- 單一角的圓角：`borderTopLeftRadius: 8` 等。
- 加了引號的 key：`'fontSize': 14`。
- `libs/ui` 裡的值，包括上面說的 `moduleColorSchemes`。

可能誤報的：字串裡剛好像 hex 的片段（例：「#123」這種編號）。遇到就在那一行加 `// eslint-disable-next-line no-restricted-syntax` 並註明原因。
