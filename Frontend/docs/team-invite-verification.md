# 團隊邀請與完整名單驗證

後台 `/teams` 使用 `SITE_APP_URL`（例如 `https://wan-guard.com`）產生公開網站的 `/invites/{token}`。
本機開發未設定時預設 `http://localhost:3000`；正式環境必須設定。設定由 Server Component 傳入，
不需要 `NEXT_PUBLIC_` 前綴，也不會把後台網域當作公開網域。網址不接受非 HTTP(S) 協定或帳密。

公開邀請頁位於 demo app 的 `(invite)` 路由群組，使用既有 SiteProviders，但不掛一般前台的管理申請抽屜，
避免 LINE 手機再驗證返回時兩個表單同時消費草稿。讀取與送出邀請走 demo 的 API proxy，沿用 site realm。
登入與註冊保留邀請頁的 callbackUrl；手機使用既有 ApplicantSection／usePhoneVerification。
申請與撤回後重新讀取邀請狀態，404／409 不自動重送寫入請求，邀請有效性由後端決定。

## 自動檢查

在 `Frontend/` 執行：

```sh
pnpm exec vitest run --config libs/modules/vitest.config.ts
pnpm exec vitest run --config libs/data-access/vitest.config.ts
pnpm exec tsc --noEmit -p libs/modules/tsconfig.lib.json
pnpm exec tsc --noEmit -p libs/data-access/tsconfig.lib.json
pnpm exec tsc --noEmit -p apps/admin/tsconfig.json
pnpm exec tsc --noEmit -p apps/demo/tsconfig.json
```

完整名單測試包含 403 人（管理員在最後一頁）、整頁邊界及後續頁失敗時不回傳半份名單。

## 瀏覽器走查

先啟動 demo app，再以提供 Playwright 的環境執行：

```sh
pnpm --filter @rescue-frontend/demo exec next dev --webpack --port 3320
# 另一個終端；Playwright 與 Chromium 需已安裝在驗證環境
TEAM_INVITE_TEST_URL=http://localhost:3320 node scripts/verify-team-invite.mjs
```

環境有共用 Playwright 安裝時可用 `PLAYWRIGHT_MODULE` 指定其模組路徑，`CHROMIUM_EXECUTABLE`
指定瀏覽器路徑；`TEAM_INVITE_SCREENSHOT` 可指定手機表單截圖的儲存位置。

腳本以模擬 API 驗證實際 Next.js 頁面，涵蓋：訪客的登入與註冊返回、必填驗證／送出／撤回、
另一筆待審申請的撤回、邀請失效、已是成員、手機驗證、LINE 返回草稿及 409 衝突後更新狀態。
每個情境使用獨立瀏覽器 context、375px 視窗與 reduced motion，檢查頁面錯誤及水平溢出。

這些走查不會傳送真實 SMS、連線 LINE，也不會寫入正式資料。真實登入、SMS、LINE 與跨網域 cookie
仍需在已設定前後台網址的整合環境驗收。

## 2026-10-26 實際結果

| 檢查 | 結果 |
|---|---|
| modules 全套 Vitest | 74 個檔案、628 個測試通過 |
| data-access 分頁 Vitest | 3 個測試通過 |
| modules、data-access、admin、demo TypeScript | 通過 |
| 變更檔案 ESLint／Prettier | 通過；Nx 模組邊界規則因沒有 cached ProjectGraph 而跳過 |
| 前台／後台 Next.js 16.4.2 production build（webpack） | 兩者通過；另修正既有地圖與清單頁的 Promise 參數型別 |
| production build 啟動後的公開邀請頁 | 上述 8 個瀏覽器情境通過，沒有 page error 或手機水平溢出 |
| production build 啟動後的後台額外走查 | QR 指向設定的公開網域；203 人團隊讀取第二頁並顯示最後一頁管理員 |

建置驗證使用暫存 Google Fonts 回應，避免驗證依賴外網字型下載；沒有修改正式字型設定。
保留既有地圖 dynamic import 的 webpack warning。隔離 worktree 共用已安裝依賴，standalone tracing
對 worktree 外的依賴會發出提示，因此此處確認的是編譯、型別、頁面產生與 Next server 操作，
未宣稱已驗證獨立容器部署產物。
