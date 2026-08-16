# Account Profile — ADR 全集（ADR-084~089）

**Date**: 2026-08-16
**Feature**: 012-account-profile
**Status**: 定案，待實作
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/011-resource-search/decisions.md`（ADR-077~083）。

---

### ADR-084 contact 更換採 verify-then-replace；不做多筆 contact + primary，也不做先刪後加

**白話**：改手機號碼時，先發驗證碼到新號碼，驗過了才把舊的換掉。過程中帳號隨時都有一個可用的聯絡方式。

**Context**：目前每個帳號每種型別最多一個 contact——`add_contact` 檢查 `user_has_contact_type`，已有就 409（`app/api/v1/endpoints/auth/contacts.py:38-41`），而且**沒有任何端點能取代或刪除**。換號碼的使用者直接卡死。三個選項：

- **A. verify-then-replace**：驗證新值成功時原子取代舊值。
- **B. 多筆 contact + `is_primary`**：同型別可多筆，任一筆皆可登入。
- **C. 先刪後加**：`DELETE` 舊的再走現有 add 流程。

**Decision**：採 A。沿用既有的 verify-then-attach 流程，只把「已有同型別 → 409」改為 replace 語意。取代在**同一交易**內完成 DELETE + INSERT。

**Consequences**：
➕ 過程中不存在「沒有任何 contact」的空窗——這是關鍵，因為 contact 就是登入識別（`app/api/v1/endpoints/auth/session.py:45-51`）。
➕ 改動最小：發碼、限流、防重用、`IntegrityError → 409` 全部沿用。
➕ 資料模型不擋日後擴充為 B。
➖ 一個帳號仍只能有一組 email + 一組 phone。

**否決 C 的理由**：刪完舊的、新的還沒驗證成功之前，使用者登不進來。若此時 session 過期（新號碼還沒開通、人在國外收不到簡訊），帳號永久鎖死。這是會實際發生的失效模式。

**否決 B 的理由**：Notion 標題為「Account Profile 設定（姓名/電話/信箱）」，語意是「改自己的基本資料」，不是「多重身分登入」。B 需要 `is_primary` 欄位、決定哪筆收通知、重新檢視 `is_value_taken` 語意——是另一個功能而非本票。

---

### ADR-085 更換 contact 需 step-up 驗證並通知舊管道；不撤銷 session

**白話**：改聯絡方式時要再證明一次「你真的是本人」，而且要通知舊的信箱／號碼「你的資料被改了」。但不會把你其他裝置踢掉。

**Context**：要堵的攻擊路徑——攻擊者取得有效 session（借用未鎖裝置、XSS 竊 token）→ 更換恢復管道為自己的 → 登出後走「忘記密碼」重設 → **帳號永久易主，原主人失去所有救回管道**。這是帳號系統最常見的接管路徑。

codebase 已有相關慣例：`change_password` 要求帶 `old_password`（`app/api/v1/endpoints/auth/password.py:39`）；`change-password` / `reset-password` 完成後皆 `revoke_all_for_user`。

**Decision**：三項措施分別評估——

| 措施 | 決定 |
|---|---|
| ① step-up 驗證 | ✅ 有 password identity 者驗密碼；SSO-only 者發碼到**舊管道**驗證 |
| ② 通知舊管道 | ✅ 更換成功後寄送變更通知，新值部分遮蔽（`a***@example.com`） |
| ③ 撤銷所有 session | ❌ 不採用 |

**Consequences**：
➕ ① 是唯一真正擋住接管路徑的措施——攻擊者持有 session，但既不知道密碼、也不掌握舊管道。
➕ ② 是唯一能讓受害者**察覺**的機制，且成本極低（`app/messaging/email.py` / `sms.py` 的 sender 與 builder 基礎設施已在，只需新增一個 builder）。
➕ 部分遮蔽讓本人可辨識，又不至於在信件被轉寄時完整外洩。
➖ 使用者換聯絡方式多一道驗證。
➖ SSO-only 且舊管道已失效者無法自助更換，須走管理員途徑。這是刻意的——自助流程不該處理「兩個證明都提不出來」的情況。

**否決 ③ 的理由**：換手機號碼不代表憑證外洩，把所有裝置踢掉是過度反應。①② 已封住攻擊路徑，③ 只增加使用者困擾。（`change_password` 撤 session 是合理的，因為那裡憑證本身確實變了。）

**SSO-only 為何用「驗舊管道」而非「要求先設密碼」**：驗舊管道對兩種帳號型態語意一致——有密碼的證明「你知道密碼」，SSO-only 的證明「你仍握有舊管道」。要求先設密碼則是為了一個一次性操作而強加一個永久的憑證，門檻不對稱。

---

### ADR-086 復用既有 `/auth/contacts` 端點，step-up 憑證為條件必填；不抽通用 re-auth 機制

**白話**：不另外做一組「更換聯絡方式」的 API，就用原本那組，後端自己判斷這次是新增還是更換。

**Context**：step-up 只在「取代」時需要，「首次新增」不需要，所以請求內容會不同。三個選項：復用既有端點（step-up 選填）／另開 `/auth/contacts/change` 一組／拆出獨立的 re-auth 端點換短效憑證再帶入。

**Decision**：復用 `POST /auth/contacts` 與 `POST /auth/contacts/verify`。`step_up` 為條件必填欄位。

**判定完全在後端**：後端自行查詢「是否已有同型別 contact」與「是否有 password identity」，據此決定是否要求 step-up 及要求哪一種。前端未帶或帶錯即 422。

**Consequences**：
➕ 從使用者角度「設定我的手機號碼」就是一個動作，之前有沒有填過應由系統判斷，不該是兩條路。
➕ 端點數不變，發碼／限流／防重用／`IntegrityError` 處理不需複製一份。
➕ 前端本來就知道自己是哪種情況（`GET /users/me` 回傳現有 contacts，見 ADR-089）。
➖ 請求 schema 有條件必填欄位，OpenAPI 上表達不夠精確。這靠後端硬性檢查補足，不依賴前端自律。

**否決獨立 re-auth 機制的理由**：分層最乾淨，但在只有一個敏感操作時是過度設計。等未來出現第二、第三個需要 step-up 的操作（刪帳號、改綁 SSO），再抽出來——那時才知道憑證該長什麼樣、該存活多久。

---

### ADR-087 刪除 contact 的守門：帳號不得失去所有登入管道

**白話**：可以刪掉自己的信箱或手機，但不能把最後一個能用來登入的東西刪掉。

**Context**：contact **就是登入識別**——`/auth/login` 以 email/phone 查 `get_user_by_contact` 找人（`app/api/v1/endpoints/auth/session.py:45-51`）。失去最後一個 contact 且無 SSO identity 的帳號將永久無法登入，且「忘記密碼」也沒有收件管道可用。

**Decision**：新增 `DELETE /auth/contacts/{type}`。刪除後若該使用者 `contacts == 0` **且**無任何 SSO identity，回 409。

| 情境 | 結果 |
|---|---|
| 有 email + phone + 密碼 → 刪 email | ✅ 允許（尚餘 phone） |
| 只有 email + 密碼 → 刪 email | ❌ 409 |
| 只有 email + Google SSO → 刪 email | ✅ 允許（仍可用 Google 登入） |

**Consequences**：
➕ 自助流程不可能把自己鎖死。
➖ 需要在刪除前多查一次 contact 數與 identity 數。成本可忽略。

**舊列硬刪除，不做軟刪除**：`UserContact` 沒有 `TimestampMixin`（`app/models/auth.py:50`），無 `delete_at`。而 `user_contacts` 已在 `AUDITED_TABLES`（`app/db/triggers.py:9`），變更歷史由 `audit_logs` 完整保存——為此新增軟刪除欄位是重複記帳。

---

### ADR-088 contacts 邏輯抽至 `app/services/auth_contact.py`

**白話**：把「判斷要不要驗、驗哪一種、成功後怎麼換」這段邏輯從 API 端點搬到 service 層，這樣才測得動。

**Context**：ADR-013/014/022/047 訂的是「授權/驗證/業務邏輯/repo 收進 service，entrypoint 只做 input parse 與 response map」，`app/services/` 底下 12 個檔案皆遵守。**auth 整組是既有的偏離**：

```
app/api/v1/endpoints/auth/sso.py         196 行, 18 次 repository 直呼
app/api/v1/endpoints/auth/password.py    153 行,  9 次
app/api/v1/endpoints/auth/register.py    152 行,  5 次
app/api/v1/endpoints/auth/contacts.py    115 行,  7 次
app/api/v1/endpoints/auth/session.py     107 行,  3 次
```

`app/services/auth_account.py` 只有 `create_account` 一個函式，被抽出的唯一原因是 register 與 SSO 兩條路都要用（`register.py:25`、`sso.py:19`）。

本票會讓 `contacts.py` 從直線流程變成分支密集：新增/取代 × 有密碼/SSO-only 四種組合，每種失敗模式不同。

**Decision**：新增 `app/services/auth_contact.py`（扁平具名函式，對齊 ADR-047 風格），endpoint 只留 input parse 與 HTTP 狀態碼對應。**只抽 `contacts.py`**，其餘 auth 檔案不動。

**Consequences**：
➕ 分支密集的安全邏輯可直接單元測試，不必每個案例都跑一次 HTTP。
➕ 對齊既有慣例，不製造第三種風格。
➖ 本票 PR 同時包含功能與局部重構，diff 較大。
➖ auth 其餘檔案仍偏離慣例——**刻意不在本票處理**，建議另開重構票（`sso.py` 的 18 次 repository 直呼最嚴重）。

**為何不「只抽新邏輯」**：那會讓同一個檔案裡兩種風格並存，正是 ADR-047 當初重構要消滅的狀態，不該再製造一次。

---

### ADR-089 `GET /users/me` 回傳 contacts 與 identities；`UserUpdate` 維持只有 name

**白話**：讓使用者看得到自己目前的信箱、手機，以及是用什麼方式登入的。

**Context**：`UserResponse` 目前只有 `name` / `credibility_score` / `uuid` / `created_at`（`app/schemas/auth.py:29-38`），前端做「個人資料設定」頁面連現值都拿不到；也無從判斷帳號是否 SSO-only，因而不知道該走哪種 step-up（ADR-085/086）。

**Decision**：`UserResponse` 增加 `contacts[]`（`type` / `value` / `verified` / `created_at`）與 `identities[]`（**只含 `provider`**）。看自己的資料不遮蔽。`UserUpdate` 維持只有 `name`。

**Consequences**：
➕ 前端能顯示現值，也能正確選擇 step-up 方式。
➕ `identities` 不回 `provider_subject`——那是 SSO 供應商的內部識別碼，前端不需要，回傳只是擴大暴露面。
➖ `read_user_me` 需多載入兩個關聯（`User.contacts` / `User.identities` 的 relationship 已存在，`app/models/auth.py:28-29`）。
➖ 端點回應變大。以每帳號最多 2 個 contact + 少數 identity 而言可忽略。

**為何 `UserUpdate` 不加欄位**：Notion 的「姓名/電話/信箱」中，電話與信箱走 contacts 的驗證流程（不能像暱稱那樣直接改），profile 本體實際上只剩姓名。
