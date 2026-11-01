/**
 * 共用元件（給 Frontend/libs/ui 用的 TSX）—— 2026-11-01
 *
 * 長相看設計稿：Design/後台/元件 Components.html（用瀏覽器打開，第 1〜9 節）。
 * 每支檔案開頭寫了規則（BTN-／TAG-／PRG-／SET-／ICON-），規則就寫在程式碼裡，PRD 不另寫。
 *
 * 怎麼搬：
 *   1. 整個資料夾的子資料夾搬到 Frontend/libs/ui/src/components/（import 已經寫成 '../../theme'，搬過去就能用）
 *      - Button/index.tsx 是「取代」現有的 Button：API 相同，往上加 neutral、tone、loading、iconOnly、selected、count
 *      - 其他都是新的：SplitButton、SearchField、Tag、Progress、SettingControls（SettingRow／RadioCards／NativeSelect）
 *   2. StationTypeIcon 建議放到 libs/modules/src/station/（type-options.ts 旁邊），
 *      下個版本用它取代 type-options.ts 的 MUI 圖示（STATION_TYPE_ICONS → STATION_TYPE_LUCIDE_ICONS）
 *   3. 在 libs/ui 的 index.ts 匯出
 *
 * 已驗證：TypeScript 5.9、@mui/material 9.5、React 19、lucide-react 0.577、staging 的 design-tokens.ts，tsc --strict 無錯誤；
 *         每個元件都用 renderToString 跑過一次。沒有在 staging 畫面裡實際跑過。
 *
 * 圓角、高度、顏色全部來自 designTokens，不要在呼叫端用 sx 覆寫 borderRadius（BTN-101）。
 */
export * from './Button';
export * from './SplitButton';
export * from './SearchField';
export * from './Tag';
export * from './Progress';
export * from './SettingControls';
export * from './StationTypeIcon';
