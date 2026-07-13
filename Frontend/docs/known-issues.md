# 已知問題 / 技術債清單

> 範圍以 `apps/demo` 與 `libs/modules/src` 的 runtime code 為主。
>
> 最後更新：2026-06-14

## 使用方式

- 開發前先掃過一遍，避免重複引入相同問題。
- 修復後請直接從本文件移除對應項目。

## 1. 死碼 / 未使用的 exports

### 1.1 `LoginAudienceSwitch` 與 `audience` query 參數仍是孤兒程式碼

- 位置：`libs/modules/src/auth/login/components/login-audience-switch/index.tsx`
- 現況：元件存在，但在 `login-form/index.tsx` 仍被註解掉，且未成為實際登入流程一部分。

### 1.2 `AuthFooterLinks` 仍未接回登入頁

- 位置：`libs/modules/src/auth/login/components/auth-footer-links/index.tsx`
- 現況：元件有 export，但 `apps/demo/src/app/(auth)/login/page.tsx` 仍把 `FOOTER_LINKS` 與 `<AuthFooterLinks />` 整段註解。

### 1.3 `AuthBrandHeader` 的 `subtitle` 仍是死資料

- 位置：`libs/modules/src/auth/login/components/auth-brand-header/index.tsx`
- 現況：`brandHeaderText.subtitle` 還在，但對應 JSX 仍被註解。

### 1.4 `SiteUserMenu` 的帳號安全入口仍未開啟

- 位置：`libs/modules/src/shell/site/user-menu.tsx`
- 現況：`useRouter()` 與導向 `/account/security` 的 menu item 仍被註解；但 `/account/security` 頁面本身已存在且可用。

## 2. 尚未接通的功能

### 2.1 `/admin/*` 路由被 layout 全域 redirect

- 位置：`apps/demo/src/app/admin/layout.tsx`
- 現況：admin page 檔案與對應 modules 都存在，但 layout 直接 `redirect('/map')`，導致整個 admin route tree 實際停用。

## 已處理

### 2026-06-13 Capability-first 重整

- `Point Share` 已改為用真實 GraphQL 單筆查詢，不再依賴 mock marker。
- `libs/modules/src` 已改為 capability-first 結構，主要能力收斂到 `map`、`list`、`route`、`point-share`、`shell`、`station`、`ticket`。
- 舊的根層 `shared/station-type-options` 已搬到 `station/type-options.ts`。
- 已補上 module boundary 約束，開始限制 `apps -> modules/ui/data-access` 與 `modules -> ui/data-access` 的依賴方向。
