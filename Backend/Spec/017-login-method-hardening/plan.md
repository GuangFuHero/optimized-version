# 017 登入方式強化 — 實作計畫（完工後回填）

**Base**: `feat/account-profile-backend`（#39）——本票直接接在 ADR-215 的
`require_step_up_for_first_password` 上，那個函式只存在於 012 的分支。從 `main` 開會得自己
重寫一套 step-up，而且 #39 合併後會反過來撞。**合併必須排在 #39 之後。**

零 migration：`user_contacts.created_at` 與 `user_identities` 都已存在。

## Task 1: 把 step-up 閘門一般化 ✅

**Files:** Modify `app/services/auth_contact.py`

- [x] 抽出 `require_channel_proof(db, redis, *, actor, step_up, action, target, senders)`
- [x] `require_step_up_for_first_password` 改成它的一個 `action`（ADR-215 行為不變）
- [x] `_require_step_up` 密碼分支的錯誤訊息依 `action` 給（原本寫死「更換聯絡方式」）
- [x] 動作字彙集中成常數：`ACTION_REPLACE/REMOVE/SET_PASSWORD/LINK/UNLINK`

## Task 2: 證明管道的冷卻期（ADR-219）✅

**Files:** Modify `app/services/auth_contact.py`

- [x] `PROOF_COOLDOWN = 7 天`（取自 Google 的公開行為，見 ADR-219）
- [x] `_settled()` + `_proof_contact()` 改為 settled 優先、全部未滿則退回最舊的
- [x] 測試：新加的管道拿不到碼、全新帳號仍然可用

## Task 3: link / unlink 的 use-case 層（ADR-217/218）✅

**Files:** Create `app/services/auth_identity.py`

- [x] `link_identity()`：衝突檢查 → `require_channel_proof` → 寫入 → 通知
- [x] `unlink_identity()`：找不到 404 → 最後一個登入方式 409 → 證明 → 硬刪 → 通知
- [x] 錯誤型別 `IdentityConflict` / `IdentityNotFound` / `LastLoginMethod`
- [x] 新模組而不是塞進 `auth_contact.py`：後者已近 500 行，且這是另一個領域

## Task 4: 端點與 schema ✅

**Files:** Modify `app/api/v1/endpoints/auth/sso.py`, `app/schemas/auth.py`

- [x] `link/google`、`link/line` 改為呼叫 service，錯誤走 `_STATUS_BY_ERROR`（比照 contacts）
- [x] 新增 `DELETE /auth/link/{provider}`；未知 provider → 404
- [x] `LinkGoogleRequest` / `IdTokenRequest` 加 `step_up`；新增 `UnlinkIdentityRequest`
- [x] `StepUp` 定義搬到引用它的 model 之前（避免 forward reference）

## Task 5: 通知（ADR-218）✅

**Files:** Modify `app/messaging/email.py`, `app/messaging/sms.py`,
`app/api/v1/endpoints/auth/password.py`, `app/services/auth_contact.py`

- [x] step-up 文案新增 link/unlink 分支（標題改為「請確認登入方式變更」）
- [x] `build_login_method_changed_email/sms(added, provider)`
- [x] `build_password_set_*` 加 `changed=` 參數，`change-password` 接上通知
- [x] 全部走 BackgroundTasks + `_or_log`（ADR-162）

## Task 6: 測試 ✅

**Files:** Create `tests/test_login_method_hardening.py`；
Modify `tests/test_link_google.py`, `tests/test_link_line.py`, `tests/test_account_profile.py`

- [x] 12 支新測試：兩條攻擊鏈、擁有者路徑、密碼帳號路徑、衝突早於證明、
      unlink 的三種拒絕、最後一個登入方式、change-password 通知
- [x] 既有 link 測試改為攜帶 `step_up`（斷言意圖不變）；未登入的 401 測試維持不帶
- [x] `test_account_profile.py` 一支斷言改抓 `"Password set"`（文案因 `changed=` 而調整）
- [x] **RED 驗證**：把閘門對 link/unlink 短路 + 冷卻期歸零 → 6 支紅，含兩條攻擊鏈
- [x] **732 passed**；`ruff check` 全綠

## 不在本票

- session 的 recent-auth / sudo window（`session["created_at"]` 已現成，另開票）
- ADR-086 的「該型別第一個不設門檻」本身（屬於 012 的範圍）
- Microsoft 式的 pending + undo 窗口（見 spec §6 的否決理由）
