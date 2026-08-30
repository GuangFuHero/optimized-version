# Design: Account Profile（姓名／電話／信箱設定 + 忘記密碼）

**Date**: 2026-08-16
**Feature**: 012-account-profile
**Status**: 已實作（見 §10 實作對照）；`plan.md` 為完工後回填
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
- **同型別多筆 contact + primary 標記**：不做「公務信箱與私人信箱都能登入」（ADR-098）。本票的資料模型不擋日後擴充。
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
     └─ 成功後通知「舊管道」：聯絡方式已變更為 a***@***.com
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

新值**部分遮蔽**（`a***@***.com`、`09*****678`，即 `app/graphql/masking.py` 的 `mask_email` / `mask_phone` 實際輸出），足以讓本人辨識，不至於在信件被轉寄時完整外洩。

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

> **2026-08-27 修訂（ADR-159）**：本節原本只有「不得失去最後一個登入管道」一道守門，沒有身分證明。
> Review 實測出「先刪再加」可完整繞過 §3 的 step-up（刪掉舊 contact 之後，更換流程的觸發條件
> `existing is not None` 就變成 false，整段 step-up 不會執行）。
> 現在刪除**與更換適用同一道 step-up**，檢查順序為 404 → 409（最後管道）→ step-up，
> 且刪除成功後會通知存活的管道（一個都不剩時通知被刪掉的那個）。憑證放在 DELETE 的
> optional body（ADR-161），body 被剝掉即視為沒帶證明，答 422。

## 5. `GET /users/me` 擴充

```json
{
  "uuid": "...", "name": "...", "credibility_score": 50.0, "created_at": "...",
  "contacts": [
    { "type": "email", "value": "me@example.com", "verified": true, "created_at": "..." }
  ],
  "login_methods": [ { "provider": "google" } ],
  "identities": [ ... ], "active_identity": { ... }   // ← 這兩個是 Spec/010 的 RBAC 身分
}
```

- 看自己的資料**不遮蔽**。
- `login_methods` **只回 `provider`，不回 `provider_subject`**——subject 是 SSO 供應商的內部識別碼，前端不需要。
- **欄位叫 `login_methods` 不叫 `identities`**：`identities` 已被 `Spec/010`（ADR-068/069）用於「可切換的 RBAC 身分」，同名會讓合併的人踩雷。由**後續的 ADR-089** 定奪——資料層的 `UserIdentity` / `user_identities` 維持原名不動，本條只決定 API 契約（見 ADR-089 的命名更正）。
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
| `GET /users/me` | 回應加 `contacts[]` / `login_methods[]` | — |
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
| `app/schemas/auth.py` | `AddContactRequest` 加 `step_up`；`UserResponse` 加 `contacts[]` / `login_methods[]`；新增 `ContactOut` / `LoginMethodOut` |
| `app/repositories/auth_repository.py` | `contact_repository` 加 `get_by_user_and_type()`、`replace_verified()`（同交易 DELETE+INSERT）、`count_by_user()`；`identity_repository` 加 `list_by_user()` |
| `app/messaging/email.py` | 新增 `build_contact_changed_email()` |
| `app/messaging/sms.py` | 新增 `build_contact_changed_sms()` |
| `app/api/v1/endpoints/users.py` | `read_user_me` 改為載入 contacts / login_methods |

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
| 功能 | `GET /users/me` 回傳 contacts 與 login_methods，且 `login_methods` **不含** `provider_subject` |
| 迴歸 | 忘記密碼四個端點行為完全不變 |

---

## 10. 實作對照（2026-08-20 回填，2026-08-27 依 ADR-159~161 更新）

本節在實作完成後補上，讓 reviewer 能逐條驗證「設計說要做的」與「程式碼實際做的」是否一致。
分支 `feat/account-profile-backend`，兩個 commit：`5ab9a3569`（spec + ADR）、`cd70b0795`（實作）。

### 10.1 設計 → 程式碼落點

| 設計條目 | ADR | 落點 |
|---|---|---|
| verify-then-replace，同交易原子取代 | 098 | `app/repositories/auth_repository.py:309` `replace_verified()` |
| step-up 判定完全在後端，依帳號形狀決定驗哪一種 | 085/086 | `app/services/auth_contact.py:61` `_require_step_up()` |
| 有 password identity → 驗密碼 | 085 | `app/services/auth_contact.py:80-86` |
| SSO-only → 發碼到舊管道並驗證 | 085 | `app/services/auth_contact.py:88-102`；碼的存取為獨立 key prefix，`app/repositories/verification_repository.py:114` / `:121` |
| 首次新增不設門檻 | 086 | `app/services/auth_contact.py:127`（`existing is None` 直接跳過 step-up） |
| 更換成功後通知舊管道，新值部分遮蔽 | 085 | `app/services/auth_contact.py:177-183`；builder 在 `app/messaging/email.py:231` / `app/messaging/sms.py:51` |
| 不撤銷 session | 085 | 反向證據：`auth_contact.py` 全檔無 `SessionRepository` 引用 |
| 刪除守門：不得失去最後一個登入管道 | 087 | `app/services/auth_contact.py:187` `delete_contact()`；計數與 SSO 判定在 `auth_repository.py:304` / `:379` |
| 舊列硬刪除，歷史交給 `audit_logs` | 087 | `app/repositories/auth_repository.py:332` `delete_contact()` |
| 邏輯抽到 service，endpoint 只留 parse 與狀態碼對應 | 088 | `app/services/auth_contact.py`（新檔）；`app/api/v1/endpoints/auth/contacts.py:33` 的 `_STATUS_BY_ERROR` 是唯一的映射點 |
| `GET /users/me` 回 `contacts[]` / `login_methods[]`，不回 `provider_subject` | 089 | `app/api/v1/endpoints/users.py` 的 `_profile()`（與 010 的身分清單同住一個函式）；schema 為 `ContactOut` / `LoginMethodOut` |
| `DELETE /auth/contacts/{type}` 新端點 | 087 | `app/api/v1/endpoints/auth/contacts.py:114` |
| `step_up` 條件必填 | 086 | `app/schemas/auth.py:167` `StepUp`、`:179` `AddContactRequest` |
| **刪除與更換適用同一道 step-up；順序 404 → 409 → step-up** | **159** | `app/services/auth_contact.py` 的 `delete_contact()`（`_require_step_up()` 在最後管道守門之後呼叫） |
| **刪除成功後通知存活管道，無存活者則通知被刪的管道** | **159** | `app/services/auth_contact.py` 的 `_notify_contact_removed()`；builder 在 `app/messaging/email.py` `build_contact_removed_email()` / `app/messaging/sms.py` `build_contact_removed_sms()` |
| **`set-password` 完成後撤銷所有 session** | **160** | `app/api/v1/endpoints/auth/password.py` `set_password()` 末行 `revoke_all_for_user` |
| **DELETE 的 step-up 憑證走 optional request body** | **161** | `app/schemas/auth.py` `DeleteContactRequest`；`app/api/v1/endpoints/auth/contacts.py` `delete_contact()` 的 `body: DeleteContactRequest | None = None` |

### 10.2 §9 測試計畫 → 測試函式

| §9 案例 | 測試 |
|---|---|
| 持有 session 但提不出證明 → 無法更換 | `test_replacing_a_contact_without_step_up_is_refused`（`tests/test_account_profile.py:63`） |
| step-up 密碼錯 → 401 且不消耗新管道的碼 | `test_replacing_with_a_wrong_password_is_refused_and_burns_no_code`（`:74`） |
| SSO-only 未帶舊管道碼 → 422 | `test_sso_only_account_gets_a_code_on_the_old_channel`（`:99`） |
| 更換成功後舊管道收到通知，新值遮蔽 | `test_replacement_notifies_the_old_channel_with_a_masked_value`（`:167`） |
| 其他 session 仍有效 | `test_replacement_does_not_revoke_other_sessions`（`:183`） |
| 首次新增不需 step-up | `test_first_contact_of_a_type_needs_no_step_up`（`:88`） |
| 取代為原子操作 | `test_replacement_swaps_the_row_atomically`（`:137`）— **僅成功路徑，見 10.3** |
| 取代後新值可登入、舊值不可 | `test_after_replacement_the_new_address_logs_in_and_the_old_does_not`（`:149`） |
| 刪最後一個且無 SSO → 409 | `test_deleting_the_last_contact_without_sso_is_refused`（`:202`） |
| 刪最後一個但有 SSO → 成功 | `test_deleting_the_last_contact_is_allowed_with_an_sso_identity`（`:212`） |
| 刪其中一個（尚有另一型別）→ 成功 | `test_deleting_one_of_two_contacts_is_allowed`（`:222`） |
| `/users/me` 回 contacts / login_methods，不含 `provider_subject` | `test_users_me_returns_contacts_and_login_methods`、`test_users_me_never_exposes_provider_subject` |
| 忘記密碼流程行為不變 | `forgot-password` / `reset-password` / `change-password` 仍為零改動；**`set-password` 已於 2026-08-27 依 ADR-160 改動**（見下），故原先「`password.py` 全檔零改動」的宣稱作廢 |

### 10.4 2026-08-27 code review 後追加的迴歸測試（ADR-159/160/161）

方向與 review 的重現腳本相反：腳本斷言「漏洞存在」，這些斷言「已被擋下」。

| 案例 | 測試（`tests/test_account_profile.py`） |
|---|---|
| 刪除未帶證明 → 422 | `test_deleting_a_contact_without_step_up_is_refused` |
| 刪除帶錯密碼 → 401，contact 保留 | `test_deleting_with_a_wrong_password_is_refused` |
| 刪除帶對密碼 → 204 | `test_deleting_with_the_password_succeeds` |
| SSO-only 刪除需舊管道碼 | `test_sso_only_delete_needs_the_old_channel_code` |
| 刪除後存活管道收到遮蔽通知 | `test_deleting_notifies_the_remaining_channel` |
| 最後管道守門排在 step-up 之前 | `test_the_last_channel_guard_runs_before_step_up` |
| **「先刪再加」不再能繞過 step-up** | `test_delete_then_add_still_requires_step_up` |
| `set-password` 撤銷所有 session | `test_set_password_revokes_every_session` |
| **自造的密碼不能當 step-up** | `test_a_self_minted_password_cannot_be_used_as_step_up` |

既有測試連帶更新三支（改為攜帶 step-up 憑證，斷言意圖不變）：
`test_deleting_the_last_contact_is_allowed_with_an_sso_identity`、
`test_deleting_one_of_two_contacts_is_allowed`、
`tests/test_set_password.py::test_set_password_twice_409`（第二次呼叫需要重新取得 session）。

完整審查報告與重現腳本：`Backend/PR39_review.md`、`Backend/PR39_review_probe.py`。

**超出 §9 的補充測試**：`test_sso_only_account_replaces_with_the_old_channel_code`（`:112`，SSO-only 的成功路徑）、`test_deleting_a_contact_type_the_user_does_not_have`（`:236`，404）、`test_users_me_does_not_mask_your_own_contacts`（`:271`）；以及 `tests/test_add_contact.py` 三條改寫——原本斷言「第二個 email → 409」的案例改為斷言「422 要求 step-up，且新地址收不到任何碼」（`:89`、`:104`、`:131`）。

### 10.3 已知缺口

**§9 的「模擬 INSERT 失敗時舊列仍在」沒有對應測試。** `test_replacement_swaps_the_row_atomically` 只驗成功路徑（舊列消失、新列出現），沒有注入失敗來證明交易會整個回捲。

不補的理由：`replace_verified()` 的 DELETE + INSERT 走同一個 `AsyncSession`，回捲由 SQLAlchemy 的交易邊界保證，測它等於測 SQLAlchemy。真正該擋的失效模式——「先刪後加，中間空窗」——在 ADR-098 就被設計否決了，程式碼裡不存在那條路徑。**記在這裡而非默默略過**，因為它是 §9 明列卻沒交付的一條。
