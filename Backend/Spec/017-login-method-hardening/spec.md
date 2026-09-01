# 017 — 登入方式強化（link/unlink 的 step-up、通知、管道冷卻期）

**Status**: 已實作
**Branch**: `feat/login-method-hardening`，base 指向 `feat/account-profile-backend`（#39）
**ADR**: 217~220（寫在本資料夾的 `decisions.md`）

---

## 1. 這張票在解什麼

PR #39 的 ADR-215 把「只有 session 的人不能鑄造密碼」修好了。收工後對整個認證面重跑一次探測，
發現**同一類漏洞還有兩條開著**，其中一條比原本那條更嚴重。兩條都在 `main` 上、都實測重現過。

### 攻擊路徑 A：link SSO —— 完整接管，不需要任何證明

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

### 攻擊路徑 C：用自帶的聯絡方式走密碼重設

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

### 攻擊路徑 B：自帶管道 —— ADR-215 自己記錄的殘留缺口

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

---

## 2. 結構性診斷

兩條是同一個缺陷：**現行規則只要求「改動既有憑證／既有管道」出示證明，不要求「新增」。**
ADR-085/086 當初把門檻綁在「已存在同型別的東西」上，而接管只需要新增，不需要改動。

本票把規則改成：**任何新增永久進入方式的操作，都要證明你握有這個帳號**，並且
**任何登入方式的變動都要通知擁有者**。

---

## 3. 範圍

| 做 | 不做 |
|---|---|
| `link/google`、`link/line` 走 step-up（ADR-217） | session 的 recent-auth / sudo window（另開票，見 §6） |
| 新增 `DELETE /auth/link/{provider}`（ADR-218） | Microsoft 式的 pending + undo 窗口（見 §6 否決） |
| 證明管道加 7 天冷卻期（ADR-219） | Microsoft 式的 pending + undo 窗口（見 §6 否決） |
| **新增聯絡方式也要證明，推翻 ADR-086（ADR-220）** | 風險引擎、裝置指紋 |

## 4. 端點

```
POST   /api/v1/auth/link/google     body: {id_token, step_up?}   422 → 帶 step_up 再送
POST   /api/v1/auth/link/line       body: {id_token, step_up?}
DELETE /api/v1/auth/link/{provider} body: {step_up?}              新增
```

證明種類由後端依帳號形狀決定，與 ADR-085 同一套：有密碼就驗密碼；SSO-only 就寄碼到帳號**既有**的
聯絡方式。驗證碼的 `action` 是 `link_identity` / `unlink_identity`，`target` 是 provider——所以換聯絡
方式的碼不能拿來連結帳號，連 google 的碼也不能拿來連 line（ADR-164 的金鑰綁定）。

## 5. 證明管道的挑選（ADR-219）

```
settled = 加入時間 ≥ 7 天的聯絡方式
pool    = settled or [最舊的那一個]      # 全新帳號的第一週仍然可用
選擇    = pool 裡 email 優先，其次 phone
```

「全部都在冷卻期內就退回最舊的」這條同時滿足兩件事：新註冊帳號的唯一 contact 用得了，而攻擊者
剛加上去的那個永遠不會是最舊的。

## 6. 已知缺口與後續票

- **零聯絡方式、零密碼的帳號**：沒有任何可證明的東西，所以新增第一個聯絡方式不設門檻（ADR-220），
  而 `link` 與 `set-password` 會 422 要求先新增聯絡方式。這種帳號也沒有密碼重設路徑可以被偷。
- **session 沒有 recent-auth 概念**。`session["created_at"]` 已經存在且 refresh 不會更新它，所以
  sudo window 幾乎零儲存成本；但它是**補強**不是替代（它縮短被竊 session 的有效窗口，而寄碼到
  既有管道要求的是攻擊者根本沒有的東西）。另開一張票。
- **否決 Microsoft 式的 pending + undo 窗口**（變更進入待決狀態、期間持續通知舊管道、可取消）：
  需要一個變更狀態機與排程，對目前階段過重。記在這裡是因為它確實是更強的設計。

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
