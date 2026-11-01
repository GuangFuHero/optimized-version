# 設計系統

前端畫面的樣式規則。動任何 UI 之前先讀這份；agent 的流程規則在 [`../CLAUDE.md`](../CLAUDE.md)。

## 來源與流向

```text
設計分支 sucrelindesign（最新的設計，不會合併進 main）
  Design/
  ├── 前台/、後台/          原型畫面（*.html）、裁示（docs/）、詳細說明（更新說明.md）
  ├── 前台/_ds/、後台/_ds/  設計系統匯出（tokens/*.css，兩份相同）
  ├── handoff/              給 libs/ui 的 TSX（目前在 components/）
  └── CHANGELOG.md          token 異動與「Frontend 待辦」
        │  工程師 fetch 後讀取、手動改或逐檔複製（不 merge、不 cherry-pick）
        ▼
main: Frontend/
                  libs/ui/src/theme/design-tokens.ts  ──▶  bridge.ts ──▶ theme.ts（MUI theme）
                                        │
                                        ▼
                         libs/ui 元件 ──▶ libs/modules、apps 的頁面
```

- 設計分支就是設計的真實來源，永遠讀它的最新版（不釘在某個 commit）。兩個分支互不合併：需要的檔案由工程師逐一複製，做法見 [`Design/GUIDE.md`](../../Design/GUIDE.md)。
- 讀法：先 `git fetch origin sucrelindesign`；單一檔案用 `git show "origin/sucrelindesign:Design/<路徑>"`；
  要開原型 HTML 就開唯讀 worktree：`git worktree add --detach <資料夾> origin/sucrelindesign`（更新：fetch 後 `git -C <資料夾> checkout --detach origin/sucrelindesign`）。
- 設計師不改 `Frontend/`；工程師不改設計分支。進度不在 CHANGELOG 打勾，記在 [`design-system-audit.md`](design-system-audit.md)，PR 說明寫出對應哪一筆待辦。
- 程式註解與 spec 裡的 `Design/前台/…`、`Design/後台/…` 路徑，指的都是設計分支上的檔案。
- 設計系統重新匯出時，設計師在設計分支的 `CHANGELOG.md` 列出每個 token 的「舊值 → 新值」，工程師照著改 `design-tokens.ts`，**只改這一支**，MUI theme 由 `bridge.ts` 推導。
- `design-tokens.ts` 目前**比 `semantic.css` 新**：設計師的幾個裁示（`fg.onSecondary`、`fg.muted`、`border.subtle` 等）已先寫進來、CSS 匯出還沒重做。不要把它改回去對齊 CSS；差異在檔案各處註解標明。

## Tokens

`designTokens`（`@rescue-frontend/ui`）分兩層：

| 層           | 內容                                                                                                                                              | 誰用                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `primitives` | 原始值：色階（`orange[400]`…）、px 刻度、字級、字重                                                                                               | **元件不要直接用**。只有語意層沒有對應時（例：`inverse*`）才在 `libs/ui` 內部用 |
| 語意層       | `color`（`brand`／`fg`／`bg`／`border`）、`radius`、`spacing`、`shadow`、`typography`、`textSize`、`iconSize`、`elevation`、`motion`、`focusRing` | 元件與頁面都用這一層                                                            |

常用的對照：

| 要什麼               | 用                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 文字色               | `color.fg.neutral.{default,subtle,muted}`；放在色塊上的字用 `color.fg.on*`                                                    |
| 底色                 | `color.bg.{primary,secondary,danger,success,warning,info}.{default,hover,subtle}`、`color.bg.neutral.{default,subtle,sunken}` |
| 框線                 | `color.border.{default,subtle,accent,disable}`                                                                                |
| 半透明               | `withAlpha(token, 0.2)`，不要寫 `rgba(...)`                                                                                   |
| 圓角                 | `radius.{sm 6, md 12, lg 20, xl 32, full}`                                                                                    |
| 間距                 | `spacing[1,2,3,4,6,8,12,…]`（4px 格；MUI 的 `theme.spacing()` 是 8px，表達不了 4／12／20）                                    |
| 後台與元件的字       | `typography.heading[600–900]`、`typography.{body,label,data}[300–500]`，整組展開進 `sx`                                       |
| 前台（民眾網站）的字 | `textSize[13]` 等，key 是原型 `site.css` 的 `--fs-13`；已是手機／桌機的響應式值                                               |
| 圖示大小             | `iconSize.{sm 14, md 18, lg 20}`；圖示不走 `textSize`                                                                         |
| 陰影、層級           | `shadow.{sm,md,lg}`、`elevation`、`elevationShadow`                                                                           |

字型：`fontStack` 已接上 `next/font` 載入的字型；家族名稱以 `fonts.css` 為準，不用 `primitives.css` 的那一組（設計師裁示）。

## `libs/ui` 元件

| 元件                                 | 什麼時候用                                                                                   | 對應設計稿                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `Button`                             | 所有按鈕。`variant`：primary／secondary／outline／ghost／danger；`size`：sm 36／md 44／lg 52 | 元件設計稿第 2 節，規則見下方 BTN                  |
| `RowAction`                          | 列表或卡片列上的小動作（編輯、刪除），`tone="danger"` 為破壞性                               | —                                                  |
| `TextInput`                          | 表單欄位，12px 圓角                                                                          | 第 4 節「輸入框」                                  |
| `Badge`                              | 狀態、類型等小標籤                                                                           | 第 6 節定義的是 handoff 的 `Tag`（尚未在 libs/ui） |
| `CountBadge`                         | 數字膠囊（未讀數、待處理數）                                                                 | 類似 BTN-110 的計數，但不是同一個                  |
| `Callout`                            | 頁內提示框（info／warning…）                                                                 | —                                                  |
| `AnnouncementBanner`                 | 緊急公告橫幅                                                                                 | `前台/js/admin/announce/an-banner.jsx`             |
| `Card`                               | 卡片外框                                                                                     | 第 1 節（卡片 12px）                               |
| `Dialog`                             | 確認對話框：標題、說明、取消／確認（`confirmTone="danger"` 為刪除）                          | —                                                  |
| `Modal`                              | 內容較多的對話框（表單、清單），可自訂 footer                                                | —                                                  |
| `Sheet`／`SheetFrame`／`SheetLayout` | 側邊抽屜；窄螢幕自動變底部抽屜。`variant="admin"` 是後台抽屜                                 | 後台 `station-drawer.jsx`、`wg-profile.jsx`        |
| `SegmentedTabs`、`Tabs`              | 分段切換、分頁                                                                               | BTN-114 分段切換                                   |
| `SelectionCard`                      | 帶說明的選項卡片（`aria-pressed`）                                                           | 類似第 5 節 RadioCards，但不是同一個元件           |
| `SidebarItem`                        | 後台側欄項目                                                                                 | 後台 `js/admin/shell/`                             |
| `DataTable`、`ListPagination`        | 後台列表與分頁                                                                               | 後台各管理頁                                       |
| `MetadataTable`                      | 詳情頁的「欄位：值」表                                                                       | —                                                  |
| `Timeline`、`TimelineChange`         | 異動紀錄                                                                                     | —                                                  |
| `EmptyState`                         | 空白狀態                                                                                     | —                                                  |
| `Avatar`                             | 頭像（沒圖時顯示姓名首字）                                                                   | —                                                  |
| `MapMarker` 系列                     | 地圖上的站點、任務、建築、叢集標記                                                           | 前台地圖、後台地圖                                 |
| `Markdown`、`MarkdownEditor`         | 顯示／編輯 Markdown（行前資訊等）                                                            | 後台 `js/admin/brief/`                             |
| `Icons`                              | 共用圖示集（目前是 Lucide；前台要不要用見「圖示」）                                          | —                                                  |

「第 N 節」指設計分支的 `Design/後台/元件 Components.html`；表中其他原型路徑也都在設計分支的 `Design/` 底下。缺 variant 時擴充這裡的元件，不要在頁面裡改 MUI 元件的樣子。

## 按鈕規則（BTN）

摘自設計師的按鈕（設計分支的 `Design/後台/js/shared/wg-button.css` 與 handoff 的 `Button/index.tsx`，同編號）。
標「未實作」的是目前 `libs/ui` 的 `Button` 還沒有、要等 handoff 版搬進來。

| 編號    | 規則                                                                                                | libs/ui                               |
| ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| BTN-101 | 按鈕一律膠囊，圓角只在元件裡定義；呼叫端不在 `sx` 寫 `borderRadius`                                 | 已是膠囊（theme）；呼叫端覆寫還擋不住 |
| BTN-102 | variant：primary／secondary／outline／ghost／danger（＋ neutral）。**一個畫面最多一顆 primary**     | 五種已有                              |
| BTN-103 | `tone="danger"` 配 outline／ghost＝紅字的次要破壞性動作；實心紅只給確認對話框裡真正執行刪除那一顆   | 未實作                                |
| BTN-104 | sm 36px 的可點範圍補到 44px 高（視覺不變）                                                          | 未實作                                |
| BTN-105 | `loading`：轉圈、不能再點、寬度不變；不用 MUI 的 disabled 樣子                                      | 未實作                                |
| BTN-106 | `iconOnly`：正方形，一定要給 `aria-label`                                                           | 未實作                                |
| BTN-107 | `selected`：切換／分段用（`aria-pressed`），不是另一種 variant                                      | 未實作                                |
| BTN-108 | 鍵盤焦點：兩圈外框（白＋品牌深藍），所有 variant 一致                                               | 目前是 theme 的單圈 3px 外框          |
| BTN-109 | 工具鈕（篩選、審查、匯出、開啟空間）用 `variant="neutral"`：白底灰框；橘色留給「新增」              | 未實作                                |
| BTN-110 | `count`：按鈕內的小數字（篩選＝套用幾個條件；審查＝待處理幾筆，黃）。0 不顯示；不要寫成「篩選 (2)」 | 未實作                                |
| BTN-111 | 會展開東西的按鈕帶 `aria-expanded`；打開時淡橘底＋橘框                                              | 未實作                                |
| BTN-112 | 拆分按鈕「新增 ▾」：主體做最常用的事，箭頭才開選單                                                  | 未實作（handoff `SplitButton`）       |
| BTN-113 | 工具列一律 md 44px：按鈕、搜尋框、拆分按鈕同高                                                      | 尺寸已有                              |
| BTN-114 | 分段切換：灰底膠囊容器＋裡面 ghost sm 的 selected 按鈕                                              | `SegmentedTabs` 做法不同              |

## 其他已裁示的規則

- **圓角**：按鈕、Chip、Badge、搜尋框是膠囊；輸入框、下拉、文字區 12px（`radius.md`）；卡片、對話框、抽屜 12px，大面積 20px；內嵌小標籤 6px。（元件設計稿第 1 節）
- **藍底黑字**：`fg.onSecondary`、`fg.onInfo` 是黑色，白字在 `#2592B9` 上對比不足。真正深色的底才用 `fg.inverse`。
- **muted 文字**是 neutral-500，不要放在 `bg.neutral.sunken` 上（對比不足）。
- **警告文字**用 `fg.warning`（amber-900），不是 amber-700。
- **hover 是實色**：每個狀態都有自己的 `hover` token，不要用 alpha 疊出 hover。
- **分隔線**用 `border.subtle`；它和 `bg.disable` 同值但用途不同，不要合併。
- **浮層**：有遮罩的一律 45% 遮罩；沒有遮罩的（Menu、Popover）自己畫細框。已在 theme 設好，新的浮層用 MUI 元件就會繼承。
- **z 軸 base 沒有陰影**；卡片的 `shadow.md` 跟著卡片走。
- **前台字級**：民眾在戶外用手機看、很多是長輩，所以**手機的字比桌機大**（`textSize`），與設計系統自己的 `typographyMobile`（手機縮小）方向相反，兩者不要混用。
- **handoff 元件的規則**（搬進來之前也照做）：Tag（TAG-101〜106，說明用、不能點，24px）、Progress（PRG-101〜104，膠囊、一定有數字）、SearchField（INP-103，工具列的搜尋框是膠囊 44px）、設定元件（SET-101〜104，立即生效用 Switch、要儲存才生效用 Checkbox）、站點圖示（ICON-101〜103；原型畫的是 Lucide，產品裡跟著顯示的那一側：前台 MUI、後台 Lucide，見「圖示」）。全文在各 handoff 檔案開頭。

## 圖示

| 畫面                                           | 新程式用                       |
| ---------------------------------------------- | ------------------------------ |
| 前台（民眾網站：`apps/demo` 與模組的前台部分） | MUI 圖示 `@mui/icons-material` |
| 後台（`apps/admin` 與模組的 `admin/` 部分）    | Lucide `lucide-react`          |

- 前台之後也會改用 Lucide，時間未定；在那之前新程式照用 MUI 圖示。
- 兩個套件都已安裝，不要再加別的圖示套件。
- 原型畫的是另一套的圖示時，用這一側最接近的圖示；大小用 `iconSize`、顏色用 token。
- 既有程式不因這條規則搬遷；目前各區的數量見 [`design-system-audit.md`](design-system-audit.md)。
- **尚未決定**：兩邊共用的 `libs/ui` 元件（目前 9 個元件檔 import Lucide，包括 `Icons`）該用哪一套，或改成由呼叫端傳入圖示，等設計師與 HC 決定。`libs/ui/src/components/Icon/README.md` 說「新圖示加進 `Icons`、不要 import `@mui/icons-material`」，寫在這條規則之前；前台的新程式以本節為準。

## 手機

| 規則                                                                                        | 在哪裡實作                                                                                        |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 手機上輸入框至少 16px，iOS 才不會整頁放大                                                   | `IOS_NO_ZOOM_INPUT_PX`，`theme.ts` 的 `MuiInputBase`（`down('tablet')`）                          |
| 貼著螢幕底部的東西（底部抽屜最後一列、浮動按鈕、地圖下方列）要讓出 iPhone 的 home indicator | `safeAreaBottom(space)`（`theme/safe-area.ts`），`Sheet` 與各頁的 `pb`／`bottom`                  |
| 可點範圍至少 44px                                                                           | `Button` md 44、`SelectionCard`、`Markdown` 的目錄按鈕；sm 按鈕補到 44 的 BTN-104 未實作          |
| 前台字級手機放大                                                                            | `textSize`（`displayTextSize`），切換點 767px（`DISPLAY_SCALE_MOBILE_MEDIA`）                     |
| 前台的 `typography.label[400]`（導覽、分頁、小按鈕）手機 18px                               | `:root` 變數 `LABEL_400_SIZE_VAR`（預設 14px），由前台的 `SiteTextScale` 在 767px 以下設定        |
| 設計系統元件字級手機縮小                                                                    | `typographyMobile`（切換點 600px，`MOBILE_BREAKPOINT_PX`）只是鏡像，目前沒有任何元件或 theme 套用 |
| 斷點                                                                                        | `theme.ts`：`mobile` 0、`tablet` 768、`desktop` 1200（另有 MUI 預設 `sm` 600、`md` 900）          |

**待設計師決定的問題**（不要自己選，答案請設計師寫進設計分支那一側的 `docs/`）：

1. 斷點不一致：原型用 `max-width: 600px`（設計系統字級）、`767px`（前台 `site.css`）、`900px`（登入頁主視覺），前端用 tablet 768、desktop 1200。哪幾個是正式斷點？後台的手機版以哪個為準？
2. 前端登入欄位有瀏覽器自動填入（autofill）的底色與字色，原型沒有定義。要用什麼顏色？

另外一個工程端的缺口：目前兩個 app 都沒有設定 `viewport-fit=cover`，所以 `safeAreaBottom` 的 inset 實際上是 0。

## 搬 handoff 元件

1. fetch 設計分支後，把 `Design/handoff/<元件>/index.tsx`（目前在 `Design/components/`）的內容複製到 `libs/ui/src/components/<元件>/index.tsx`，
   例：`git show "origin/sucrelindesign:Design/components/Button/index.tsx" > libs/ui/src/components/Button/index.tsx`。
   檔頭的規則註解一起留著，在 `libs/ui/src/index.ts` 匯出。
   檔頭若建議放別處（例：站點圖示放 `libs/modules/src/station/`），照檔頭。
2. 加 `*.stories.tsx`（`pnpm dev:ui` 看 Storybook）與 `index.spec.ts(x)` 測試，涵蓋檔頭列出的規則。
3. 本文件的表格把「未實作」改掉。
4. PR 說明寫出對應設計分支 `CHANGELOG.md` 的哪一筆；進度記在 `design-system-audit.md`。
