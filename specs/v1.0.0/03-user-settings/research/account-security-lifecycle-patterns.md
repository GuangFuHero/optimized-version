# 研究 — 帳號安全與生命週期模式（Account Security & Lifecycle）

> **目的**：03-user-settings 列了「停用 / 忘記密碼 / 變更密碼 / 改聯絡方式 / 角色升等申請」，但每一項在成熟產品都有一套防呆與防濫用的細規，PRD 目前停在功能名稱層級。本研究回答：
> 1. 忘記密碼 / 變更密碼的安全細節（連結有效期、是否登出其他 session、是否通知）。
> 2. 改 Email / 手機這種「敏感變更」要怎麼驗證？只驗新的還是新舊都驗？
> 3. 帳號「停用」到底是什麼？停用 / 刪除 / 凍結的差別？可不可恢復？資料怎麼辦？
> 4. 角色升等申請的狀態機與重複申請、撤回、被拒後重送的規則。
> **日期**：2026-06-10
> **關聯**：[`prd.md`](../prd.md)（03-user-settings）、[[01-auth]]、[[05-member-management]]、[[02-user-profile]]
> **狀態**：研究參考，供決策用（PRD 內以「🟡 建議」回填）

---

## 1. 問題拆解

帳號設定頁是「使用者自助修改安全敏感資料」的地方，因此每個操作都要在**便利**與**防接管**之間拿捏。三大類各有成熟範式：

1. **憑證類**（密碼）：OWASP Forgot Password Cheat Sheet。
2. **敏感識別資料變更**（Email / 手機）：業界普遍要求「雙邊驗證 + 變更通知」。
3. **帳號生命週期**（停用 / 刪除 / 凍結）：涉及法遵（個資保留與刪除權）與可恢復性。

---

## 2. 密碼相關

### 2.1 忘記密碼（OWASP 範式）

| 項目 | 業界作法 | 🟡 對 Wanguard 建議 |
|---|---|---|
| 入口輸入 | Email 或手機 | 兩者皆可（對應 01-auth 多管道） |
| **防枚舉** | 無論帳號是否存在都回「若帳號存在已寄出重設連結」 | 採之（與 [[01-auth]] 防枚舉一致） |
| 重設連結 / 碼有效期 | 連結 15–60 分鐘、OTP 5–10 分鐘 | 連結 30 分鐘、簡訊碼 5 分鐘 |
| 一次性 | 用過即失效，且只允許最新一封有效 | 採之 |
| 重設成功後 | **登出其他所有 session** + 寄「密碼已變更」通知 | 採之（防接管後的駐留） |

### 2.2 變更密碼（已登入狀態）

- 要求輸入**舊密碼**（或近期重新驗證 step-up）才能改新密碼。
- 改完同樣**登出其他 session**並通知。
- 🟡 社群登入 / SSO 帳號**沒有平台密碼**——此功能對 Google/Line/SSO 帳號應隱藏或導向「至原 provider 修改」。

---

## 3. 敏感識別資料變更（Email / 手機）

這是帳號接管的高風險點：若只驗「新 Email」，攻擊者拿到 session 後可直接把帳號 Email 換成自己的。業界（Google、GitHub、Stripe）共識：

| 規則 | 說明 |
|---|---|
| **驗新的** | 對新 Email/手機寄 OTP / 確認連結，驗證確實持有 |
| **通知舊的** | 對**舊** Email/手機寄「您的聯絡方式正被變更，若非本人請點此撤銷」通知 |
| **變更前 step-up** | 變更前要求重新輸入密碼或 OTP（近期未驗證的話） |
| **冷靜期（高安全產品）** | 部分產品變更後 24h 內可由舊信箱一鍵撤回 |

> 🟡 **建議**：Wanguard 採「驗新 + 通知舊 + 變更前 step-up」三件套；冷靜期視成本，列為 v2 可選。改暱稱屬非敏感，不需 OTP（與 03 既有「修改暱稱」一致對待）。

---

## 4. 帳號生命週期：停用 / 凍結 / 刪除

03 只寫「帳號停用」，但業界把帳號終止拆成數種狀態，含義與可逆性差很多：

| 狀態 | 觸發者 | 可逆 | 資料 | 代表 |
|---|---|---|---|---|
| **Deactivate（自行停用 / 休眠）** | 使用者自己 | ✅ 可隨時重新啟用 | 全保留 | Twitter/X 30 天、Instagram |
| **Suspend（停權 / 凍結）** | 管理者（非自願） | ✅ 由管理者恢復 | 全保留 | 多數平台違規處置 |
| **Delete（刪除）** | 使用者請求 | ❌（過寬限期後不可逆） | 寬限期後清除/匿名化 | GDPR「被遺忘權」 |

> **重要區分**：03 寫的是使用者**自行**「停用」→ 對應 **Deactivate（可逆休眠）**，不是 Delete。管理者端的 **Suspend** 已在 [[05-member-management]]（Team 內暫停 / 整帳號暫停）定義，兩者應對齊用語避免混淆。
>
> 🟡 **建議**：
> - 自助「停用」＝可逆休眠：登出全部 session、不再收通知，重新登入即自動恢復（或顯示「重新啟用」按鈕）。
> - 若要提供**刪除**（個資法/GDPR 刪除權），建議 **30 天寬限期 + 軟刪除**，期間可撤回，期滿才匿名化；但**最後一位 Super Admin 不可刪除**（與 [[05-member-management]] E8 一致）。
> - 災害應變期間的後台人員自助停用，建議若其為 Team 唯一 Admin 須先指派接班（與 [[05-member-management]] E1 一致）。

---

## 5. 角色升等申請（狀態機）

03 寫「申請送出進入審核佇列」，但缺申請的完整生命週期。對齊 [[05-member-management]] F5（加入 Team → Team Admin 審；平台角色 → Super Admin 審）後，建議狀態機：

```
draft → submitted → under_review → approved
                               └→ rejected(附理由) → (可重送)
submitted/under_review → withdrawn(使用者主動撤回)
```

| 規則 | 🟡 建議 |
|---|---|
| **重複申請** | 同類型已有 pending 申請時，不可重複送出（顯示「已有待審申請」） |
| **撤回** | 審核前使用者可主動撤回 |
| **被拒後重送** | 允許，但建議冷卻期（如 24h）或要求補充理由，避免騷擾審核者 |
| **同時兩種申請** | 加入 Team 與升平台角色互不相依、可並行（已由 [[05-member-management]] F7 / E4 定案） |
| **通知** | 每次狀態轉移皆透過 [[02-user-profile]] 站內通知告知申請人 |
| **進度可視** | 設定頁顯示目前狀態與時間軸 |

---

## 6. 待決問題（供 PRD 回填）

- [ ] 忘記密碼：連結 30 分 / 簡訊碼 5 分、重設後登出其他 session + 通知？
- [ ] 社群登入 / SSO 帳號的「變更密碼」是否隱藏並導向原 provider？
- [ ] 敏感變更採「驗新 + 通知舊 + step-up」？是否加 24h 撤回冷靜期（v2）？
- [ ] 自助「停用」明確定義為可逆休眠（≠刪除）？用語與 05 的 suspend 對齊？
- [ ] 是否提供帳號刪除（個資法刪除權）？30 天寬限軟刪除？
- [ ] 升等申請狀態機（draft→submitted→review→approved/rejected/withdrawn）與重複/重送/冷卻規則？

---

## 7. 參考來源

- OWASP — Forgot Password Cheat Sheet：https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- OWASP — Session Management Cheat Sheet（變更密碼後失效其他 session）
- NIST SP 800-63B — Authenticator lifecycle
- Google Account Help — Change/recover email, security notifications
- GitHub Docs — Changing your primary email / verifying email
- GDPR Art.17 — Right to erasure（被遺忘權）、軟刪除與寬限期實務
- 與本 repo 既有：[[05-member-management]]（suspend / 最後一位 Admin/Super Admin 約束）
