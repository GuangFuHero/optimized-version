# 017 — 登入方式強化（link/unlink 的 step-up、通知、管道冷卻期）

**Status**: 已實作
**Branch**: `feat/login-method-hardening`（PR #45）。base 為 `main`（2026-09-07 由 `feat/session-revocation-backend` 改接），內含 `feat/account-profile-backend`（#39）的全部 commit；合併本 PR 即合併兩者
**PRD**: `prd.md`（使用者故事、驗收條件、前端錯誤碼契約）
**ADR**: 217~220、233~237（寫在本資料夾的 `decisions.md`；233 已被 237 推翻）
**前一票**: `Spec/012-account-profile`——本票推翻了它的 ADR-086「新增聯絡方式不設門檻」

---

## 1. 這張票在解什麼

PR #39 的 ADR-215 把「只有 session 的人不能鑄造密碼」修好了。收工後對整個認證面重跑一次探測，
發現**同一類漏洞還有三條開著**，其中一條比原本那條更嚴重。三條都在 `main` 上、都實測重現過。
PR #45 第一輪 review 又找到第四條（路徑 D）。

### 攻擊路徑 A：link SSO —— 完整接管，不需要任何證明 → 修正：ADR-217、218

受害者是 Google SSO-only 帳號、有一個 email；攻擊者只有一個被竊的 session：

```
POST /auth/set-password (無碼)               -> 422  ← ADR-215 擋下
POST /auth/login 自造密碼                     -> 401  ← 擋下
DELETE /auth/contacts/email (無 step-up)      -> 422  ← 擋下
POST /auth/contacts email=attacker@evil.com   -> 422  ← 擋下

POST /auth/link/line  {"sub":"attacker-line"} -> 200  ← 無門檻、無通知
POST /auth/sso/line   {"sub":"attacker-line"} -> 200  ← 以受害者身分登入
```

`link/google` 與 `link/line` 原本只有 `Depends(get_current_user)`。而**連結出來的身分是這個系統
發出的最強憑證**：改密碼動不到它、`logout-all` 動不到它、換聯絡方式動不到它，而且它沒有到期日。
更糟的是原本**完全沒有 unlink 端點**——受害者在 `/users/me` 看得到攻擊者掛上去的 LINE，卻拿它沒辦法。

受害者已有 google 時 `link/google` 回 409，但 LINE 是另一個 provider，照樣通得過。

### 攻擊路徑 B：自帶管道 —— ADR-215 自己記錄的殘留缺口 → 修正：ADR-219，根因由 ADR-220 關閉

受害者是 SSO-only、只有手機沒有 email：

```
POST /auth/contacts email=attacker@evil.com  -> 202  ← ADR-086：該型別的第一個不設門檻
   驗證碼寄到 attacker@evil.com
POST /auth/contacts/verify                   -> 200  ← 攻擊者的 email 掛上帳號
POST /auth/set-password (無碼)               -> 422  ← step-up 碼寄到 attacker@evil.com
POST /auth/set-password (帶那組碼)            -> 204
POST /auth/login attacker@evil.com/attackerpw -> 200  ← 接管
```

`_proof_contact` 的順序是「email 優先」，而攻擊者剛把 email 這個位置佔走。

### 攻擊路徑 C：用自帶的聯絡方式走密碼重設 → 修正：ADR-220

受害者是密碼帳號、只有手機沒有 email：

```
POST /auth/contacts email=attacker@evil.com  -> 202  ← ADR-086：該型別第一個不設門檻
POST /auth/contacts/verify                   -> 200
POST /auth/forgot-password attacker@evil.com -> 202  ← 重設碼寄到 attacker@evil.com
POST /auth/reset-password                    -> 204
POST /auth/login attacker@evil.com/attackerpw -> 200  ← 接管
```

冷卻期（ADR-219）擋不到它，因為 `forgot-password` / `reset-password` 不經過 `_proof_contact`。
這條只需要用 session 一次，之後隨時可重設，不受 session 撤銷影響。

### 攻擊路徑 D：只有 SSO、沒有聯絡方式的帳號 → 修正：ADR-234

受害者只有一個 LINE 身分（LINE 首次登入沒回 email，或 email 已被佔用時就會是這個形狀），沒有密碼也沒有聯絡方式。
ADR-220 把「什麼都沒有的帳號」豁免在閘門外，但沒有把已綁定的 SSO 算成「有東西」：

```
POST /auth/contacts email=attacker@evil   -> 202   無閘門
POST /auth/contacts/verify                -> 200
POST /auth/set-password                   -> 422，step-up 碼寄到 attacker@evil
POST /auth/set-password (帶碼)             -> 204
DELETE /auth/link/line                    -> 204   擁有者唯一的登入方式被移除
```

擁有者之後用自己的 LINE 登入，會落到一個全新的空帳號。完整重現見 ADR-234。

---

## 2. 結構性診斷

這幾條是同一個缺陷：**現行規則只要求「改動既有憑證／既有管道」出示證明，不要求「新增」。**
ADR-085/086 當初把門檻綁在「已存在同型別的東西」上，而接管只需要新增，不需要改動。

本票把規則改成：**任何新增永久進入方式的操作，都要證明你握有這個帳號**，並且
**任何登入方式的變動都要通知擁有者**。

---

## 3. 範圍

| 做 | 不做 |
|---|---|
| `link/google`、`link/line` 走 step-up（ADR-217） | session 的 recent-auth / sudo window（另開票，見 §6） |
| 新增 `DELETE /auth/link/{provider}`，並通知擁有者（ADR-218） | Microsoft 式的 pending + undo 窗口（見 §6 否決） |
| 證明管道加 7 天冷卻期（ADR-219） | 只撤銷由被移除 provider 取得的 session（ADR-236：session 沒記錄來源） |
| **新增聯絡方式也要證明，推翻 ADR-086（ADR-220）** | 風險引擎、裝置指紋 |
| 已綁定的 SSO 算作可證明的東西，並新增第三種證明：出示帳號自己的 `id_token`（ADR-234） | 前端表單（ADR-237，見 §6） |
| unlink 的最後登入方式守門要取鎖（ADR-235） | |
| unlink 成功後撤銷所有 session（ADR-236） | |

## 4. 端點

```
POST   /api/v1/auth/link/google     body: {id_token, step_up?}   422 → 帶 step_up 再送
POST   /api/v1/auth/link/line       body: {id_token, step_up?}
DELETE /api/v1/auth/link/{provider} body: {step_up?}              新增
```

證明種類由後端依帳號形狀決定，依序為：

| 順序 | 證明 | 何時輪到 |
|---|---|---|
| 1 | `step_up.password` | 帳號有密碼 |
| 2 | `step_up.old_channel_code`（寄到依 §5 挑出的聯絡方式） | 帳號有聯絡方式 |
| 3 | `step_up.id_token`（subject 必須已經綁在這個帳號上） | 帳號沒有任何聯絡方式（ADR-234） |

驗證碼的 `action` 是 `link_identity` / `unlink_identity`，`target` 是 provider——所以換聯絡
方式的碼不能拿來連結帳號，連 google 的碼也不能拿來連 line（ADR-164 的金鑰綁定）。

### 守門與檢查順序

- **link**：衝突檢查在證明**之前**（ADR-217）。provider 已綁在別的帳號，或本帳號已有同一個 provider → 409 `sso_already_linked`。
- **unlink**：
  1. provider 名稱不認得 → 404 `sso_provider_unknown`（在 endpoint 就擋，路徑參數不是拿去查 identities 表的自由字串）；帳號沒有綁這個 provider → 404 `sso_not_linked`
  2. 移除後帳號沒有任何登入方式 → 409 `last_login_method`。只數 `user_identities`：其他 SSO provider，以及**有 hash 的**密碼 identity；`create_account` 寫的那列 `provider="password"`、hash 為 NULL 的**不算**，聯絡方式本身也**不算**（`auth_identity.py` 的 `_remaining_login_methods()`，ADR-218）。此時不要求證明、不寄任何信
  3. 要求證明（慢的事情在鎖外做）
  4. 取 `users` 列的鎖後**重新**檢查第 2 步，通過才刪除（ADR-235）
  5. 刪除後撤銷該帳號所有 session（ADR-236）
- 成功的 link / unlink / `change-password` 都會透過 BackgroundTasks 通知帳號每一個聯絡方式；寄送失敗不會回滾變更（ADR-218，沿用 ADR-162）。

錯誤碼（PR #41 的 `code` 合約）與前端應對方式見 `prd.md` §5。

## 5. 證明管道的挑選（ADR-219）

```
settled = 加入時間 ≥ 7 天的聯絡方式
pool    = settled or [最舊的那一個]      # 全新帳號的第一週仍然可用
選擇    = pool 裡 email 優先，其次 phone
```

「全部都在冷卻期內就退回最舊的」這條同時滿足兩件事：新註冊帳號的唯一 contact 用得了，而攻擊者
剛加上去的那個永遠不會是最舊的。

**邊界**：判定式是 `now(UTC) - user_contacts.created_at >= 7 days`（`app/services/auth_contact.py` 的 `PROOF_COOLDOWN` 與 `_settled()`）。剛好滿 7×24 小時就算已過冷卻期。時間以 `created_at` 計算，不用驗證時間（理由見 ADR-219）。

## 6. 已知缺口與後續票

- **零聯絡方式、零密碼、零 SSO 的帳號**：沒有任何可證明的東西，所以新增第一個聯絡方式不設門檻（ADR-220），
  而 `link` 與 `set-password` 會 422 `no_proof_channel` 要求先新增聯絡方式。這種帳號也沒有密碼重設路徑可以被偷。
  有 SSO 的帳號不屬於這一類（ADR-234）。
- **session 沒有 recent-auth 概念**。`session["created_at"]` 已經存在且 refresh 不會更新它，所以
  sudo window 幾乎零儲存成本；但它是**補強**不是替代（它縮短被竊 session 的有效窗口，而寄碼到
  既有管道要求的是攻擊者根本沒有的東西）。另開一張票。
- **否決 Microsoft 式的 pending + undo 窗口**（變更進入待決狀態、期間持續通知舊管道、可取消）：
  需要一個變更狀態機與排程，對目前階段過重。記在這裡是因為它確實是更強的設計。
- **前端未跟上**（ADR-237）：`set-password`、`contacts`、`link` 的表單要能處理 422 `step_up_required`，
  並提供密碼、驗證碼、`id_token` 三種證明欄位（ADR-234 待辦）。前端不進本 PR，需要一張前端票。
- **舊管道失聯的使用者**：換了聯絡方式之後 7 天內，step-up 碼仍寄到舊的那個（ADR-219 的取捨）。
  舊號碼或信箱已經停用的人，目前沒有自助救援路徑。

## 7. 依據

本票的做法不是自創，對照過的一手來源：

| 做法 | 來源 |
|---|---|
| 敏感操作前要重新認證／二次驗證 | OWASP ASVS 4.0 **3.7.1** |
| 新增憑證屬於敏感操作 | GitHub sudo mode 涵蓋「新增 SSH key」「建立 PAT」，有效期 2 小時 |
| 重新認證有時限 | NIST SP 800-63B：AAL2 每 12 小時、閒置 30 分鐘 |
| **新增的 recovery 管道有冷卻期** | Google：「it may take up to 7 days for those changes to take effect」、變更後 7 天內仍寄碼到舊管道 |
| 通知發給**變更前**的管道，並給擁有者撤銷窗口 | Microsoft：更換 security info 需等 30 天，期間持續通知原管道，且可 cancel |
| 使用者能自行解除外部連結 | Apple：Sign in with Apple 可列出並移除 |

7 天的冷卻期直接取自 Google 的公開行為，不是拍腦袋的數字。

## 8. 測試對照

`tests/test_login_method_hardening.py`：

| 案例 | ADR | 測試 |
|---|---|---|
| 只有 session 不能綁定攻擊者的 provider（路徑 A） | 217 | `test_a_stolen_session_cannot_link_the_attackers_provider` |
| 帶碼綁定成功並通知 | 217/218 | `test_linking_succeeds_with_the_code_and_notifies` |
| 有密碼的帳號用密碼綁定 | 217 | `test_a_password_account_links_with_its_password` |
| 密碼錯誤不綁定 | 217 | `test_a_wrong_password_does_not_link` |
| 衝突在要求證明之前回應 | 217 | `test_a_conflict_is_answered_before_any_proof_is_demanded` |
| 剛加入的聯絡方式不被當成證明管道（路徑 B） | 219 | `test_a_freshly_added_contact_is_not_used_as_the_proof_channel` |
| 全新帳號仍能證明自己 | 219 | `test_a_brand_new_account_can_still_prove_itself` |
| 解綁需要相同證明並通知 | 218 | `test_unlinking_needs_the_same_proof_and_notifies` |
| 最後一個登入方式不能解綁 | 218 | `test_the_last_login_method_cannot_be_unlinked` |
| 解綁沒有綁定的 provider → 404 | 218 | `test_unlinking_something_the_account_does_not_have_is_404` |
| 未知 provider → 404 | 218 | `test_an_unknown_provider_is_404` |
| 改密碼通知帳號 | 218 | `test_changing_a_password_notifies_the_account` |
| 只有 session 不能加聯絡方式再走密碼重設（路徑 C） | 220 | `test_a_session_cannot_attach_a_contact_and_reset_the_password_through_it` |
| 擁有者仍能新增第二種聯絡方式 | 220 | `test_the_owner_can_still_add_a_second_contact_type` |
| SSO-only 帳號在既有管道上證明新增 | 220 | `test_an_sso_only_account_proves_the_add_on_its_existing_channel` |
| 只有 provider 的帳號，session 不能直接加聯絡方式（路徑 D） | 234 | `test_a_provider_only_account_cannot_have_a_contact_attached_by_a_session` |
| 擁有者自己的 provider token 可以通過 | 234 | `test_the_owners_own_provider_token_lets_the_add_through` |
| 攻擊者自己的合法 token 不能證明這個帳號 | 234 | `test_the_attackers_own_provider_token_does_not_prove_this_account` |
| 只有 provider 的帳號不能用 session 設定密碼 | 234 | `test_a_provider_only_account_cannot_mint_a_password_from_a_session` |
| 兩個同時的解綁不會把帳號清空 | 235 | `test_two_concurrent_unlinks_cannot_strand_the_account` |
| 解綁撤銷所有 session | 236 | `test_unlinking_revokes_every_session` |

012 既有測試因 ADR-220/234 連帶改寫的部分，見 `Spec/012-account-profile/spec.md` §10.2、§10.5。
