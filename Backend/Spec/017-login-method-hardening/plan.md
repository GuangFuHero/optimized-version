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

## Task 6: 新增聯絡方式的閘門（ADR-220）✅

**Files:** Modify `app/services/auth_contact.py`, `app/messaging/email.py`, `app/messaging/sms.py`

第三條攻擊鏈是收工後重跑探測才發現的：冷卻期擋不到 `forgot-password`，因為那條路不經過
`_proof_contact`。修在根因。

- [x] `_require_step_up` 拆成 `_password_proof` + `_old_channel_proof`，兩個入口共用
      （原本 `require_channel_proof` 會先要 contact，導致「有密碼但零 contact」的帳號誤判 422）
- [x] `_has_something_to_prove_with()`：有密碼 or 有任何 contact
- [x] `start_contact_change` 的 `existing is None` 分支接上 `require_channel_proof`
- [x] `ACTION_ADD` 的 step-up 文案（含目標值遮蔽）

## Task 7: 測試 ✅

**Files:** Create `tests/test_login_method_hardening.py`；
Modify `tests/test_link_google.py`, `tests/test_link_line.py`, `tests/test_account_profile.py`

- [x] 16 支新測試：兩條攻擊鏈、擁有者路徑、密碼帳號路徑、衝突早於證明、
      unlink 的三種拒絕、最後一個登入方式、change-password 通知
- [x] 既有 link 測試改為攜帶 `step_up`（斷言意圖不變）；未登入的 401 測試維持不帶
- [x] `test_account_profile.py` 一支斷言改抓 `"Password set"`（文案因 `changed=` 而調整）
- [x] **RED 驗證**：閘門對 link/unlink 短路 + 冷卻期歸零 → 6 支紅；ADR-220 的閘門關掉 → 再 2 支紅。
      三條攻擊鏈都在其中
- [x] ADR-220 是行為破壞性變更，六支既有測試連帶更新（`test_add_contact.py` 三支、
      `test_account_profile.py` 三支，含把 `test_first_contact_of_a_type_needs_no_step_up`
      改名為 `..._is_gated_too` 並反轉斷言——那支測試的前提被 ADR-220 推翻了）
- [x] **737 passed**；`ruff check` 全綠

## 不在本票

- session 的 recent-auth / sudo window（`session["created_at"]` 已現成，另開票）
- Microsoft 式的 pending + undo 窗口（見 spec §6 的否決理由）

## Docker 完整驗證（2026-09-01）

隔離 stack（`-p pr017verify`、無 bind mount 的 db/redis、backend 開 8001），
`alembic upgrade head` + `seed_rbac.py` 之後對真 uvicorn 實測。

**透過 socket（:8001，完全未改動的 app）**

| 案例 | 結果 |
|---|---|
| 攻擊鏈 C：只有 session 掛 `attacker@evil.com` | **422**「新增聯絡方式需要輸入密碼」 |
| 接著 `forgot-password attacker@evil.com` | 202（制式回應），**log 裡寄給 attacker@evil.com 的信 = 0 封** |
| 擁有者路徑：同一個新增帶密碼 | 202，驗證碼寄到新值 |
| `DELETE /auth/link/google`（帳號沒有） | 404 |
| `DELETE /auth/link/facebook`（未知 provider） | 404 |
| `change-password` 的 BackgroundTasks 通知 | 回應後才送達（before=0 → after=1） |

**透過真 uvicorn 但把外部 provider 換掉（:8002）**——真的 LINE/Google id_token 在這裡造不出來，
所以只換掉驗證器，DB / Redis / uvicorn / 中介層全部是真的：

| 案例 | 結果 |
|---|---|
| 攻擊鏈 A：只有 session 連結攻擊者的 LINE | **422**「新增登入方式需要輸入密碼」，受害者 `login_methods` 維持 `['password']` |
| 攻擊者拿同一個 token 打 `sso/line` | 200，但**建出的是另一個新帳號**，不是受害者的 |
| 錯密碼（≥6 字元，真的走到閘門） | **401**「密碼錯誤」 |
| 擁有者帶密碼連結 → unlink 無證明 → 帶密碼 unlink | 200 → 422 → 204 |
| SSO-only 帳號連結：碼寄到哪 | 422 且**寄到帳號自己的 `ssoowner@x.com`**；帶該碼再送 → 200 |
| link / unlink 通知 | log 中「登入方式已新增」x2、「登入方式已移除」x2，皆在回應之後 |

**順帶確認**：連結端點自己的 rate limit（5/60）會生效——驗證過程中打太快真的收到 429。
ADR-165 的「不重發活著的碼」也在實測中出現（第二次要碼回「請使用先前收到的那一組」）。

**冷卻期（ADR-219）沒有在 docker 驗**：它需要跨 7 天，單元測試用直接改 `created_at` 覆蓋。
