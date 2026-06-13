# 已知問題 / 技術債清單

> 本文件記錄目前 Frontend 程式碼中已發現、但尚未處理的程式碼品質、重複邏輯與一致性問題。範圍以 `apps/demo` 與 `libs/modules/src` 的 runtime code 為主。
>
> 最後更新：2026-06-13

## 如何使用本文件

- 開發前先掃過一遍，避免重複引入相同問題、或在不知情的情況下重新實作已存在但未串接的功能。
- 修復後請從本文件移除對應項目（或移到文末「已處理」區塊），並在 PR 描述中註明。
- 新增發現時請依下列分類補充，並附上檔案路徑與（若適用）行號。

---

## 1. 死碼 / 未使用的 exports

### 1.1 `LoginAudienceSwitch` 與 `audience` query 參數邏輯為孤兒程式碼

- **位置**：`libs/modules/src/auth/login/components/login-audience-switch/index.tsx`
- **現況**：元件實作了完整的「audience 切換」UI 與 `audience` query 參數讀寫（`resolveLoginAudience`），但唯一引用點是 `login-form/index.tsx:210` 中被註解掉的 `{/* <LoginAudienceSwitch ... /> */}`，且未在 `auth/login/index.ts` 對外匯出。
- **建議**：確認是否仍需要 audience 切換功能；需要則重新串接並補上對應測試與文件，不需要則移除整個元件與相關邏輯。

### 1.2 `AuthFooterLinks` 未使用

- **位置**：`libs/modules/src/auth/login/components/auth-footer-links/index.tsx`
- **現況**：透過 `auth/login/index.ts` 對外匯出於 `@rescue-frontend/modules`，但唯一使用點 `apps/demo/src/app/(auth)/login/page.tsx:37` 被註解掉。
- **建議**：確認登入頁是否需要 footer links；需要則啟用並補上實際連結內容，否則移除 export。

### 1.3 `AuthBrandHeader` 的 `brandHeaderText.subtitle` 為死資料

- **位置**：`libs/modules/src/auth/login/components/auth-brand-header/index.tsx:9-12, 35-43`
- **現況**：`brandHeaderText.subtitle`（`'登入'`）對應的渲染 JSX 被整段註解掉。
- **建議**：決定是否顯示頁面副標題；不需要則移除 `subtitle` 欄位。

### 1.5 `SiteUserMenu` 內未使用的 `useRouter` 與被註解的「帳號安全」選單項目

- **位置**：`libs/modules/src/site/shell/user-menu.tsx`（約第 35 行 `const router = useRouter()`、約 40-43 行、約 100-103 行）
- **現況**：`useRouter()` 回傳值僅在被註解的程式碼中使用；該段註解的選單項目導向 `/account/security`，該頁面**已存在**（`apps/demo/src/app/(site)/account/security/page.tsx`）。
- **建議**：此功能看起來是「已實作但尚未串接到選單」，建議評估後啟用該選單項目（`useRouter` 未使用的問題會隨之解決），而非單純刪除程式碼。

---

## 2. 重複邏輯

> 本分類目前無待處理項目

---

## 3. 尚未完成的功能（含 TODO）

> 本分類目前無待處理項目

---

## 4. 命名一致性

> 本分類目前無待處理項目

---

## 5. 架構 / 分層

> 本分類目前無待處理項目

---

## 6. 工具鏈 / 設定

> 本分類目前無待處理項目

---

## 已處理

### 2026-06-13 Capability-first 重整

- `Point Share` 的 route metadata resolver 已改為真實 GraphQL 單筆查詢，不再讀取 mock marker；前台 (`map` / `list` / `point-share`) 目前已無任何 mock data 依賴。
- `libs/modules/src` 已改為 capability-first 結構，主要共用能力收斂到 `map`、`list`、`route`、`point-share`、`shell`、`station`、`ticket`，不再由 `site` 直接依賴 `admin/**`。
- `libs/modules/src/shared/station-type-options` 已搬移到 `libs/modules/src/station/type-options.ts`，移除根層模糊的 `shared` runtime 模組。
- `eslint.config.mjs` 與各 project `tags` 已補上 `type:*` module boundary 約束，開始實際限制 `apps -> modules/ui/data-access`、`modules -> ui/data-access` 的依賴方向。
