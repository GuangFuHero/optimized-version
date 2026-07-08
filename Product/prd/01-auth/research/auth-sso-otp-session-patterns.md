# 研究 — 多管道登入、帳號連結、OTP 與 Session 安全模式

> **目的**：01-auth 的 v1.0 只列了「Email / SMS / Google / Line / 究平安 SSO」五個入口，但沒有回答幾個成熟身份系統都必須處理的問題：
> 1. 同一個人用 Google 又用 Line 又用 SMS，**是同一個帳號還是三個帳號**？怎麼合併？
> 2. SMS / Email OTP 怎麼防刷、防猜、防簡訊轟炸？
> 3. 登入失敗幾次要鎖定？鎖多久？
> 4. Session 怎麼管理？多裝置？後台 SSO 的 Session 與前台社群登入的 Session 規則一樣嗎？
> 5. 後台 SSO 失敗、SSO 帳號在平台沒有對應 RBAC 時，怎麼處理？
> **日期**：2026-06-10
> **關聯**：[[../prd]]（01-auth）、[[../../04-rbac/prd]]、[[../../03-user-settings/prd]]
> **狀態**：研究參考，供決策用（PRD 內以「🟡 建議」回填，未拍板）

---

## 1. 問題拆解

身份認證表面是「四顆登入按鈕」，但成熟產品真正花力氣的是登入**之後與之間**的狀態管理。Wanguard 的特殊性在於**兩個身份來源並存**：

- **前台**：自有帳號（Email / SMS）＋ 社群登入（Google / Line）→ 低信任、高流量、自助。
- **後台**：究平安 SSO → 企業級、需對應 RBAC、低流量、高權限。

兩套不該混用同一條登入路徑，但**同一個人可能兩邊都是**（例如某 NGO 志工先用 Line 註冊成為一般使用者，之後升等為後台 NGO 角色——見 [[../../03-user-settings/prd]] 升等流程）。這就是「帳號連結 / 身份統一」必須先想清楚的原因。

---

## 2. 帳號識別與連結（Identity & Account Linking）

### 2.1 業界三種策略

| 策略 | 說明 | 代表產品 | 風險 |
|---|---|---|---|
| **A. 以 Email 為主鍵自動合併** | 不同 provider 但回傳相同已驗證 Email → 視為同一帳號 | Google、Atlassian、Slack | Email 未驗證時可被冒用「帳號接管」 |
| **B. 永不自動合併，逐一手動連結** | 每個 provider 各自獨立帳號，使用者登入後在設定頁手動「連結其他登入方式」 | GitHub、Notion | 使用者易產生重複帳號 |
| **C. 折衷：已驗證 Email 相符才提示合併，需二次驗證** | 偵測到相同已驗證 Email，要求使用者用既有方式登入一次確認後才連結 | Auth0、Firebase Auth（"account linking with verification"） | 體驗稍長但最安全 |

> **業界主流＝C**。Auth0 與 Firebase 都明確警告「以未驗證 Email 自動合併」是常見的帳號接管漏洞（pre-account-takeover）。Line 的問題在於**不保證回傳 Email**（使用者可拒絕授權 Email scope），手機 SMS 則根本沒有 Email → 不能單靠 Email 當主鍵。

### 2.2 對 Wanguard 的建議

- 內部以一個**穩定的 internal user_id（UUID）** 為主鍵，Google / Line / SMS / Email 各自是掛在底下的 **identity（provider + provider_uid）**。
- **首次登入**：找不到任何相符 identity → 建新帳號（對應 01-auth 既有驗收標準「第三方登入帳號自動建立」）。
- **合併**：偵測到「相同且已驗證的 Email 或手機」→ 走策略 C（要求用既有方式登入一次再連結），不自動靜默合併。
- **Line 無 Email** 的情境：以手機號碼當輔助識別，或乾脆視為獨立新帳號、之後在設定頁手動連結。

---

## 3. SMS / Email OTP 安全（業界最佳實務）

OTP 是最常被攻擊的環節（簡訊轟炸、暴力猜碼、SIM swap）。彙整 OWASP、NIST SP 800-63B、Twilio Verify、Auth0 的共識：

| 項目 | 業界常見值 | 說明 |
|---|---|---|
| **碼長度** | 6 位數字 | NIST 建議至少 6 位 |
| **有效期** | 5–10 分鐘 | 過短體驗差、過長風險高；簡訊建議 5 分鐘、Email 10 分鐘 |
| **嘗試次數** | 同一碼最多 3–5 次錯誤即作廢 | 防暴力猜碼 |
| **重送間隔** | 30–60 秒才能重送 | 防簡訊轟炸（SMS pumping） |
| **單號碼頻率上限** | 每手機每小時 ≤ 5 則、每日 ≤ 10 則 | 防成本攻擊與騷擾 |
| **單 IP 頻率上限** | per-IP rate limit | 防自動化大量發送 |
| **一次性** | 用過即作廢，不可重放 | |
| **不可枚舉** | 「驗證碼錯誤」與「此號碼不存在」回傳相同訊息 | 防帳號枚舉 |

> ⚠️ **SMS Pumping（簡訊計費詐騙）** 是 2023–2024 新興攻擊：攻擊者用 bot 觸發大量發送到特定電信號段抽成，曾讓 X(Twitter) 損失千萬美元。**緩解**：CAPTCHA/裝置指紋擋 bot、地區號碼白名單、單號碼/單 IP 限流。Wanguard 主要服務台灣 → 建議**限制 +886 號段**，境外號碼需額外驗證。

---

## 4. 登入失敗與帳號鎖定（Account Lockout）

| 模式 | 說明 | 代表 | 取捨 |
|---|---|---|---|
| **固定次數硬鎖** | N 次失敗鎖定 M 分鐘 | 多數企業系統（如 5 次鎖 15 分） | 簡單，但可被用於 DoS（惡意鎖別人帳號） |
| **指數退避（throttling）** | 每次失敗拉長下次可嘗試的等待時間 | Google、Apple | 體驗較好、抗 DoS |
| **風險式（adaptive / step-up）** | 偵測異常（新裝置、異地、異常頻率）才要求額外驗證 | Auth0 Adaptive MFA、Microsoft Entra | 最佳但最複雜 |

> NIST SP 800-63B 建議「限流 + 退避」優於「永久鎖定」，因為永久鎖定本身就是一種 DoS 面。**Wanguard 建議**：前台採指數退避 + 多次失敗後上 CAPTCHA；後台 SSO 鎖定交由究平安 SSO 端統一控管，平台只接受/拒絕其結果。

---

## 5. Session 與 Token 管理

| 議題 | 業界常見作法 | 對 Wanguard 建議 |
|---|---|---|
| **Token 形式** | 短期 access token（15 分–1 小時）+ 長期 refresh token（滾動更新） | 採之；後台高權限 access token 更短 |
| **Session 長度** | 一般 SaaS：閒置 14–30 天；高敏感（金融/醫療）：閒置 15–30 分 | **前台**：可記住 30 天；**後台高權限**：閒置逾 30–60 分要求重新驗證（建議） |
| **多裝置** | 允許多 session 並存，設定頁可列出並逐一登出 | 後台應提供「登出所有其他裝置」 |
| **RBAC 變更生效** | 04-rbac 已定「下次刷新生效、不強制登出」 | 與本檔一致：靠短 access token 讓新權限自然在 token 刷新時生效 |
| **登出** | 本地登出 vs SSO 全域登出（Single Logout） | 後台 SSO 登出建議連動究平安 Single Logout，避免「平台登出但 SSO 仍在」 |

---

## 6. 後台 SSO 的關鍵邊界情境

究平安 SSO 是外部身份提供者，平台必須處理「SSO 認得這個人、但平台不知道該給什麼權限」的灰色地帶：

| 情境 | 業界作法（SAML/OIDC JIT Provisioning） | 對 Wanguard 建議 |
|---|---|---|
| SSO 登入成功，但平台無此人帳號 | **JIT（Just-In-Time）佈建**：依 SSO 回傳的群組/屬性自動建帳號並給對應角色 | 建議支援 JIT，但**預設給最低權限**，未對應到角色者落入「待 Super Admin 指派」 |
| SSO 回傳的角色屬性平台沒有對應 | 拒絕登入或給 fallback 最小角色 | 給最小權限 + 通知 Super Admin，不直接拒絕（避免應變期卡人） |
| SSO 端帳號被停用 | 平台應在下次 token 驗證時同步失效 | 短 token + 每次刷新向 SSO 驗證狀態 |
| SSO 服務中斷 | 是否提供 break-glass 後備登入？ | 🟡 待確認：災害時 SSO 掛掉怎麼辦？建議至少保留 1 組平台原生的緊急 Super Admin 帳號（見 [[../../04-rbac/prd]] 雙簽/break-glass 討論） |

---

## 7. 待決問題（供 PRD 回填）

- [ ] **帳號連結策略**：採策略 C（已驗證 Email/手機相符才提示合併、需二次驗證）？
- [ ] **Line 無 Email**：視為獨立帳號 + 設定頁手動連結，還是用手機當輔助主鍵？
- [ ] **OTP 參數**：採 6 碼 / 5 分鐘 / 3 次錯誤作廢 / 60 秒重送 / 每號碼每日 10 則？
- [ ] **境外手機號碼**：是否限制非 +886 號段需額外驗證以防 SMS pumping？
- [ ] **後台 SSO JIT 佈建**：未對應角色者給最小權限 + 待指派，而非拒絕登入？
- [ ] **SSO 中斷的 break-glass 後備帳號**：災害時若究平安 SSO 不可用，是否保留緊急原生帳號？
- [ ] **後台閒置逾時**：高權限後台是否 30–60 分閒置即要求重新驗證？

---

## 8. 參考來源

- NIST SP 800-63B — Digital Identity Guidelines (Authentication & Lifecycle)：https://pages.nist.gov/800-63-3/sp800-63b.html
- OWASP — Authentication Cheat Sheet：https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP — Forgot Password / Credential Stuffing Prevention Cheat Sheets
- Auth0 — Account Linking：https://auth0.com/docs/manage-users/user-accounts/user-account-linking
- Firebase — Link multiple auth providers / account-takeover warning：https://firebase.google.com/docs/auth/web/account-linking
- Twilio Verify — OTP best practices & SMS pumping fraud：https://www.twilio.com/docs/verify
- LINE Login — Email scope 非必得回傳：https://developers.line.biz/en/docs/line-login/
- Microsoft Entra ID — SAML/OIDC JIT user provisioning：https://learn.microsoft.com/en-us/entra/identity/
