# Design: Account Profile（姓名／電話／信箱設定 + 忘記密碼）

**Date**: 2026-08-16
**Feature**: 012-account-profile
**Status**: Approved design, pending implementation
**Notion**: 補齊功能 →「系統性 - Account Profile 設定（姓名/電話/信箱）+ 忘記密碼」（backend-Popo，08-13~08-17）
**Depends on**: 既有 auth 流程（`app/api/v1/endpoints/auth/`）、verification code 基礎設施（`app/repositories/verification_repository.py`）、messaging（`app/messaging/email.py`、`sms.py`）

---

## 1. 概述

讓使用者能自助維護自己的帳號資料：暱稱、電話、信箱。

### 現況盤點

**「忘記密碼」已完整實作，本票零改動。** `app/api/v1/endpoints/auth/password.py` 已具備：

| 端點 | 狀態 |
|---|---|
| `POST /auth/change-password` | ✅ 驗舊密碼、寫新 hash、撤銷所有 session |
| `POST /auth/set-password` | ✅ SSO-only 帳號首次設密碼 |
| `POST /auth/forgot-password` | ✅ 防列舉（所有分支回相同 202）、`BackgroundTasks` 讓回應時間恆定避免延遲側漏、SSO-only 帳號另發「請用第三方登入」通知 |
| `POST /auth/reset-password` | ✅ 消耗驗證碼、寫新密碼、撤銷所有 session |

**Account Profile 則有四個缺口：**

| 缺口 | 證據 |
|---|---|
| **換手機／換信箱做不到** | `add_contact` 檢查 `user_has_contact_type`，已有同型別即 409（`app/api/v1/endpoints/auth/contacts.py:38-41`），且無任何端點能取代或刪除既有 contact |
| **看不到自己的聯絡方式** | `UserResponse` 只有 `name` / `credibility_score` / `uuid` / `created_at`（`app/schemas/auth.py:29-38`），不含 contacts |
| **姓名以外不能改** | `UserUpdate` 只有 `name`（`app/schemas/auth.py:43-46`） |
| **無刪除 contact 的能力** | 全 codebase 無此端點 |

**鎖死風險**：contact **就是登入識別**——`/auth/login` 以 email/phone 查 `get_user_by_contact` 找人（`app/api/v1/endpoints/auth/session.py:45-51`）。失去最後一個 contact 且無 SSO identity 的帳號，將永久無法登入，連「忘記密碼」都沒有收件管道。

### 目標
- 使用者能更換 email / 手機，過程中**不存在無 contact 的空窗**。
- 更換恢復管道需通過 step-up 驗證，堵住「持有 session 即可接管帳號」的路徑。
- 使用者能讀到自己目前的聯絡方式與登入方式。
- 帳號永遠保有至少一個可用的登入管道。

### 非目標（YAGNI，明確排除）
- **同型別多筆 contact + primary 標記**：不做「公務信箱與私人信箱都能登入」（ADR-084）。本票的資料模型不擋日後擴充。
- **忘記密碼的任何改動**：已完整實作。
- **更換 contact 後撤銷所有 session**：換聯絡方式不等於憑證外洩（ADR-085）。
- **通用 step-up 憑證機制**：不抽獨立的 re-auth 端點與短效憑證。只有一個敏感操作時是過度設計（ADR-086）。
- **帳號刪除／停用**。
- **`sso.py` / `password.py` / `register.py` 的 service 層重構**：本票只抽 `contacts.py`（見 §7）。

---

## 2. 更換流程

### 2.1 判定樹

```
POST /auth/contacts { type, value, step_up? }
│
├─ 該帳號已有同型別 contact？
│   ├─ 否（首次新增）→ 不需 step-up，走現有流程
│   └─ 是（取代）→ 需要 step-up：
│        ├─ 帳號有 password identity → step_up.password 必填，驗證之
│        └─ SSO-only（無 password identity）→ 發碼到「舊管道」，
│             step_up.old_channel_code 必填，驗證之
│
└─ 發 6 位數驗證碼到「新值」

POST /auth/contacts/verify { type, value, code }
│
├─ 驗證碼正確
├─ 首次新增 → INSERT
└─ 取代 → 同一交易內 DELETE 舊列 + INSERT 新列（原子）
     └─ 成功後通知「舊管道」：聯絡方式已變更為 a***@example.com
```

**step-up 是後端硬性判定**：後端自行查詢「是否已有同型別 contact」與「是否有 password identity」，據此決定是否要求 step-up。前端不帶或帶錯即 422，不依賴前端自律。

### 2.2 原子性

取代必須在**同一個交易**內完成 DELETE + INSERT。中途不得出現該使用者沒有任何 contact 的狀態——那一瞬間若交易失敗，帳號就失去登入管道。

`user_contacts` 有 DB unique 約束（`contacts.py:76-79` 的 `IntegrityError` 處理即為證據），競態由既有的 `IntegrityError → 409` 模式收斂。

### 2.3 舊列處理

**硬刪除**。`UserContact` 沒有 `TimestampMixin`（`app/models/auth.py:50`），無 `delete_at` 欄位；而 `user_contacts` 已在 `AUDITED_TABLES`（`app/db/triggers.py:9`），變更歷史由 `audit_logs` 完整保存。不為此新增軟刪除欄位。

---

## 3. 安全設計

### 3.1 要堵的攻擊路徑

攻擊者取得有效 session（借用未鎖裝置、XSS 竊取 token）→ 若更換 contact 無需額外驗證，直接把恢復管道換成自己的 → 登出後走「忘記密碼」重設 → **帳號永久易主，原主人失去所有救回管道**。

### 3.2 三項措施

| 措施 | 決定 | 理由 |
|---|---|---|
| **① step-up 驗證** | ✅ 採用 | 唯一真正擋住上述路徑的措施——攻擊者有 session 但沒有密碼、也不掌握舊管道 |
| **② 通知舊管道** | ✅ 採用 | 唯一能讓受害者**察覺**的機制。基礎設施已在（`app/messaging/email.py` / `sms.py`），只需新增 builder |
| **③ 撤銷所有 session** | ❌ 不採用 | 換手機號碼不代表憑證外洩。①② 已擋住攻擊路徑，把所有裝置踢掉是過度反應 |

### 3.3 SSO-only 帳號的 step-up

沒有密碼可驗（`set-password` 端點的存在證明這是常態帳號型態）。採**驗證舊管道**：發碼到舊 email/手機，通過才准更換。

語意一致——有密碼的證明「你知道密碼」，SSO-only 的證明「你仍握有舊管道」。舊管道已失效的使用者本應走管理員途徑，不由自助流程處理。

### 3.4 通知內容

新值**部分遮蔽**（`a***@example.com`、`09**-***-678`），足以讓本人辨識，不至於在信件被轉寄時完整外洩。

---

## 4. 刪除 contact

新增 `DELETE /auth/contacts/{type}`。

**守門條件**：刪除後若該使用者 `contacts == 0` **且** 無任何 SSO identity，回 409「帳號至少需保留一個登入管道」。

| 情境 | 刪除後 | 結果 |
|---|---|---|
| 有 email + phone + 密碼 | 剩 1 個 contact | ✅ 允許 |
| 只有 email + 密碼 | 0 個 contact，無 SSO | ❌ 409 |
| 只有 email + Google SSO | 0 個 contact，有 SSO | ✅ 允許（仍可用 Google 登入） |

---

## 5. `GET /users/me` 擴充

```json
{
  "uuid": "...", "name": "...", "credibility_score": 50.0, "created_at": "...",
  "contacts": [
    { "type": "email", "value": "me@example.com", "verified": true, "created_at": "..." }
  ],
  "identities": [ { "provider": "google" } ]
}
```

- 看自己的資料**不遮蔽**。
- `identities` **只回 `provider`，不回 `provider_subject`**——subject 是 SSO 供應商的內部識別碼，前端不需要。
- 前端需要這兩個欄位來（1）顯示現值、（2）判斷自己是否 SSO-only 以決定走哪種 step-up。

`UserUpdate` 維持只有 `name`——Notion 的「姓名/電話/信箱」中，電話與信箱走 contacts 流程，profile 本體只剩姓名。

---

## 6. 端點總覽

| 端點 | 變更 | 限流 |
|---|---|---|
| `POST /auth/contacts` | 「已有同型別 → 409」改為 replace 語意；新增條件必填的 `step_up` | 3/60（沿用） |
| `POST /auth/contacts/verify` | 取代時在同交易內 DELETE + INSERT；成功後通知舊管道 | 10/60（沿用） |
| `POST /auth/contacts/resend` | 不變 | 2/60（沿用） |
| `DELETE /auth/contacts/{type}` | **新增**，含登入管道守門 | 5/60 |
| `GET /users/me` | 回應加 `contacts[]` / `identities[]` | — |
| `PATCH /users/me` | 不變（僅 `name`） | — |

---

## 7. Service 層抽取

新增 **`app/services/auth_contact.py`**，endpoint 只留 input parse 與 HTTP 狀態碼對應。

**理由**：本票新增的正是分支密集的安全邏輯——新增/取代 × 有密碼/SSO-only 四種組合，每種失敗模式不同。這類邏輯需要能直接單元測試，不該只能透過 HTTP 驗證。

**既有偏離（本票不處理，建議另開重構票）**：auth 整組 endpoint 未對齊 ADR-013/047 的 service 慣例——業務邏輯寫在 endpoint 裡直接呼叫 repository：

```
app/api/v1/endpoints/auth/sso.py         196 行, 18 次 repository 直呼   ← 最嚴重
app/api/v1/endpoints/auth/password.py    153 行,  9 次
app/api/v1/endpoints/auth/register.py    152 行,  5 次
app/api/v1/endpoints/auth/contacts.py    115 行,  7 次   ← 本票抽出
app/api/v1/endpoints/auth/session.py     107 行,  3 次
```

`app/services/auth_account.py` 只有 `create_account` 一個函式，因為 register 與 SSO 兩條路都要用才被抽出（`register.py:25`、`sso.py:19`）。

---

## 8. 逐檔改動

| 檔案 | 改動 |
|---|---|
| `app/services/auth_contact.py` | **新檔**：`add_or_replace_contact()` / `verify_and_commit_contact()` / `delete_contact()`，含 step-up 判定與登入管道守門 |
| `app/api/v1/endpoints/auth/contacts.py` | 瘦身為 input parse + 狀態碼對應；新增 `DELETE /contacts/{type}` |
| `app/schemas/auth.py` | `AddContactRequest` 加 `step_up`；`UserResponse` 加 `contacts[]` / `identities[]`；新增 `ContactOut` / `IdentityOut` |
| `app/repositories/auth_repository.py` | `contact_repository` 加 `get_by_user_and_type()`、`replace_verified()`（同交易 DELETE+INSERT）、`count_by_user()`；`identity_repository` 加 `list_by_user()` |
| `app/messaging/email.py` | 新增 `build_contact_changed_email()` |
| `app/messaging/sms.py` | 新增 `build_contact_changed_sms()` |
| `app/api/v1/endpoints/users.py` | `read_user_me` 改為載入 contacts / identities |

---

## 9. 測試計畫

| 類型 | 案例 |
|---|---|
| 安全 | **持有 session 但無密碼／無舊管道碼 → 無法更換 contact**（422），這是本票的核心防護 |
| 安全 | step-up 密碼錯誤 → 401，且不消耗新管道的驗證碼 |
| 安全 | SSO-only 帳號未帶舊管道驗證碼 → 422 |
| 安全 | 更換成功後**舊管道收到通知**，且通知中新值為部分遮蔽 |
| 安全 | 更換成功後其他 session **仍有效**（明確驗證不撤銷） |
| 功能 | 首次新增 contact **不需** step-up（不得誤加門檻） |
| 功能 | 取代為原子操作：驗證碼正確時舊列消失、新列出現；模擬 INSERT 失敗時舊列仍在 |
| 功能 | 取代後可用**新** email 登入、**舊** email 登入失敗 |
| 功能 | 刪除最後一個 contact 且無 SSO → 409 |
| 功能 | 刪除最後一個 contact 但有 SSO identity → 成功 |
| 功能 | 刪除其中一個（尚有另一型別）→ 成功 |
| 功能 | `GET /users/me` 回傳 contacts 與 identities，且 `identities` **不含** `provider_subject` |
| 迴歸 | 忘記密碼四個端點行為完全不變 |
