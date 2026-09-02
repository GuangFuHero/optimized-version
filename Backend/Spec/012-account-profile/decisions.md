# Account Profile — ADR 全集（ADR-085~089、098、159~161）

**Date**: 2026-08-16
**Feature**: 012-account-profile
**Status**: 定案，已實作（實作對照見 `spec.md` §10）
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/011-resource-search/decisions.md`。

> **命名的優先順序（2026-08-20）**：ADR 編號是全域遞增的，**後續的 ADR 覆蓋先前的**——也覆蓋沒有 ADR 背書的既有程式碼寫法。本檔的 ADR-089 與 `Spec/010` 的 ADR-068/069 在 `identities` 一詞上曾經相撞，依此原則由 089 定奪（見該條）。

> **編號更正（2026-08-19）**：本票原編為 ADR-084~089，但 011 在 docker 驗證階段追加了自己的 ADR-084（「過短查詢維持拋錯」），造成撞號。因 011 已在 PR #35、013 已在 PR #36，兩者都不宜再動，故把本票的 ADR-084 挪到 **ADR-098**，其餘 085~089 不變。ADR 是全域序號，一份 spec 的編號不必連續（`Spec/010` 亦為 068~076 + 096~097）。

---

### ADR-098 contact 更換採 verify-then-replace；不做多筆 contact + primary，也不做先刪後加

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
| ② 通知舊管道 | ✅ 更換成功後寄送變更通知，新值部分遮蔽（`a***@***.com`，`mask_email` 連網域一併遮蔽） |
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

### ADR-089 `GET /users/me` 回傳 contacts 與 login_methods；`UserUpdate` 維持只有 name

**白話**：讓使用者看得到自己目前的信箱、手機，以及是用什麼方式登入的。

**Context**：`UserResponse` 目前只有 `name` / `credibility_score` / `uuid` / `created_at`（`app/schemas/auth.py:29-38`），前端做「個人資料設定」頁面連現值都拿不到；也無從判斷帳號是否 SSO-only，因而不知道該走哪種 step-up（ADR-085/086）。

**Decision**：`UserResponse` 增加 `contacts[]`（`type` / `value` / `verified` / `created_at`）與 `login_methods[]`（**只含 `provider`**）。看自己的資料不遮蔽。`UserUpdate` 維持只有 `name`。

> **命名更正（2026-08-20）**：本欄位初版叫 `identities`，與 `Spec/010` 的 `identities`（可切換的 RBAC 身分＝role + 選填 team）**同名不同義**——一個是「你能用什麼方式登入」，一個是「你能以什麼身分行動」。兩張票都往 `UserResponse` 放一個 `identities`，合併時 git 會擋下來，但解衝突的人若不知道差異、隨手留一個，被留下的那邊功能就壞了，而且 Pydantic 不會報錯、要到執行期才發現。
>
> **決定：本票的欄位改名為 `login_methods`**（schema 類別 `IdentityOut` → `LoginMethodOut`），`identities` 留給 010。
>
> **依據是「後續的 ADR 優先」**：
>
> | 命名 | 由誰決定 | 有無 ADR |
> |---|---|---|
> | `UserIdentity` / `user_identities` / `IdentityRepository`＝登入方式 | 2026-01-17 既有程式碼 | **無** |
> | `identities`＝可切換的 RBAC 身分 | ADR-068 / ADR-069 | 有 |
> | `login_methods`＝登入方式（本條） | **ADR-089** | 有 |
>
> 曾一度以為該反過來改 010——理由是 codebase 從 2026-01 起「identity」一直指登入方式，010 才是後來借用該詞的一方，所以本票沿用 model 命名才叫依循 codebase。**該理由不成立**：那個 model 命名背後沒有任何 ADR，只是既有寫法；而有 ADR 的兩者之中，本條（089）在 010 的身分命名（068/069）之後。後續的 ADR 覆蓋先前的，也覆蓋沒有 ADR 的既有寫法。
>
> 附帶效果是 API 層的名字比 model 名更精確：值就是 password / google / line，`login_methods` 直說了它是什麼。model 與 repository 維持既有名稱不動——本條只決定 API 契約，不改資料層。
>
> 前端當時尚未消費 `/users/me`，改名成本為零。

**Consequences**：
➕ 前端能顯示現值，也能正確選擇 step-up 方式。
➕ `identities` 不回 `provider_subject`——那是 SSO 供應商的內部識別碼，前端不需要，回傳只是擴大暴露面。
➖ `read_user_me` 需多載入兩個關聯（`User.contacts` / `User.identities` 的 relationship 已存在，`app/models/auth.py:28-29`）。
➖ 端點回應變大。以每帳號最多 2 個 contact + 少數 identity 而言可忽略。

**為何 `UserUpdate` 不加欄位**：Notion 的「姓名/電話/信箱」中，電話與信箱走 contacts 的驗證流程（不能像暱稱那樣直接改），profile 本體實際上只剩姓名。

---

## 補記（2026-08-27）：code review 後追加的 ADR-159~161

PR #39 的 review 用可執行腳本重現出兩條完整的帳號接管鏈，兩者都繞過本票 ADR-085 的 step-up。
**兩個漏洞都不是實作 bug——程式碼完全照 ADR-085/086/087 寫的，是那三條 ADR 的威脅模型有缺口。**
所以修法以新 ADR 記錄，依 ADR 優先序規則（後續覆蓋先前）修正 ADR-087 與 ADR-085 的範圍。

編號接續 `Spec/011-resource-search/decisions.md` 的 ADR-158（全域最大號）。

---

### ADR-159 刪除 contact 與更換 contact 適用同一道 step-up；刪除亦須通知

**白話**：刪掉自己的信箱／手機，跟換掉它一樣要先證明是本人。刪完也會發通知。

**Context**：ADR-085 把 step-up 掛在「更換」上，ADR-087 只給刪除一道「不得失去最後一個登入管道」的守門，沒有身分證明。但 step-up 的觸發條件是**當下還有沒有同型別的 contact**（`start_contact_change`：`if existing is not None:`）——刪除正好把這個條件清成 false。

於是「先刪再加」原封不動地重建了 ADR-085 要堵的攻擊，只多按一次 DELETE。實測（攻擊者只有 session、全程不知道密碼，受害者持有 email + phone）：

```
POST   /auth/contacts   無 step_up          -> 422 更換聯絡方式需要輸入密碼   ← 正門有守
DELETE /auth/contacts/email                 -> 204                          ← 側門沒守
POST   /auth/contacts   無 step_up          -> 202                          ← 條件被清掉了
POST   /auth/contacts/verify                -> 200
POST   /auth/forgot-password                -> 重設碼寄到 attacker@evil.com
```

`reset-password` 隨後 `revoke_all_for_user`，受害者連自己的 session 都被踢掉。

三個選項：

- **A. DELETE 也走 `_require_step_up`**。
- **B. step-up 的觸發條件改成「這個 type 是否曾經被驗證過」**（tombstone 或查 `audit_logs`），讓刪除無法重置狀態機。
- **C. A + B 兩層都做**。

**Decision**：採 A（2026-08-27 使用者拍板）。並在刪除成功後通知**存活的管道**；若一個都不剩（SSO-only 刪掉最後一個），改通知被刪掉的那個管道本身。

三道檢查的順序固定為 **404 → 409（最後管道）→ step-up**：

1. 沒有這個型別的 contact → 404。最便宜，而且為了刪一個不存在的東西而要求密碼是荒謬的。
2. 這是最後一個登入管道且無 SSO → 409。純拒絕，不改任何狀態，也不洩漏呼叫者無法從 `GET /users/me` 讀到的東西。先要求證明只會讓本人白驗一次密碼，然後被告知這操作本來就不可能。
3. step-up。**過了這裡的每一步都真的能移除一條回家的路。**

**Consequences**：
➕ 「先刪再加」這條路徑徹底關閉——攻擊者連第一步的 DELETE 都過不了。
➕ 刪除與更換的安全性對稱，日後不會有人只補其中一邊。
➕ 刪除不再是靜默操作；ADR-085 說通知是受害者唯一的偵測機制，刪除現在也有了。
➖ 單純想刪掉備用手機的使用者要多驗一次。這是刻意的：那支手機是登入識別。
➖ ADR-087 的「刪除只需守最後管道」被本條**取代**。

**否決 B 的理由**：需要新的資料模型（tombstone）或把 `audit_logs` 變成授權判斷的依賴。`audit_logs` 目前是純稽核用途，讓安全閘門去讀它，等於讓一張只有主鍵索引、39 張表往裡寫的表變成登入流程的相依。而 B 也沒有真正修掉「刪除本身不需證明身分」這件事——攻擊者仍然可以把受害者的手機刪光。

**否決 C 的理由**：A 已經在第一步就擋住。B 那層只在「未來有人新增第三條刪除路徑（管理員代刪、帳號合併）」時才有價值，而那時 B 的正確位置是在那條新路徑上，不是預先撒在這裡。YAGNI。

---

### ADR-160 `/auth/set-password` 完成後撤銷所有 session

> ⚠️ **本條的「足夠性」宣稱已被 ADR-215 推翻**（2026-08-31）。撤銷 session 本身保留、仍然有效，
> 但它**擋不住**這裡描述的接管——密碼比 session 活得久，攻擊者重新登入就繞過去了。
> 下面 Consequences 第一項「自造的密碼在同一個 request 內就失效」**不成立**，請讀 ADR-215。

**Context**：ADR-085 的 step-up 用「帳號有沒有 password identity」決定要驗密碼還是發碼到舊管道，並把「知道密碼」當成身分證明。但 `/auth/set-password` 對 SSO-only 帳號**只要有 session 就能建立第一組密碼，不檢查任何舊憑證**（這是它存在的意義——SSO 使用者本來就沒有舊密碼可驗）。

兩件事湊在一起，「知道密碼」就不再是證明。實測：

```
POST /auth/set-password  {"password":"attackerpw"}          -> 204
POST /auth/contacts      step_up.password = "attackerpw"    -> 202
   → 驗證碼寄到 attacker@evil.com（不是受害者的 sso@x.com）
```

攻擊者不用刪任何東西，自己造一把鑰匙就開了門。

三個選項：

- **A. `set-password` 完成後 `revoke_all_for_user`**。
- **B. step-up 只採信「password identity 的建立時間早於本次 session」**。
- **C. 有 SSO identity 就一律走舊管道碼，不看 password identity**。

**Decision**：採 A（2026-08-27 使用者拍板）。`set_password` 取得 `redis` 依賴，在 identity 建立成功後呼叫 `SessionRepository.revoke_all_for_user`。

**Consequences**：
➕ ~~自造的密碼在同一個 request 內就失效——攻擊者的 session 跟著死，拿不到後續 step-up 的機會。實測第二步直接 401（`Could not validate credentials`），根本走不到步驟判定。~~
   **這一項是錯的（ADR-215 更正）**：失效的只有 session。密碼留著，攻擊者 `POST /auth/login` 就拿到新的 session。當時的實測之所以看起來成立，是因為測試沒有重新登入——同一個盲點也寫進了測試裡（見 ADR-215）。
➕ 與 `/auth/change-password` 對齊。後者一直都撤銷（ADR-085 的 Context 就引用了這個慣例），`set-password` 不撤本身就是不對稱，只是先前沒有人把它當成安全決策。
➕ 修在憑證產生端，而不是在每一個消費「有沒有密碼」的地方各補一次判斷。日後新增的敏感操作自動受惠。
➖ 正常使用者設完密碼會被登出，前端要處理重新登入。這與 change-password 的既有體驗一致。
➖ 本票原本宣稱 `password.py` 零改動（見 `spec.md` §10.2 的回歸佐證），本條**取消該宣稱**；`spec.md` 同步更新。

**否決 B 的理由**：要把 session 建立時間傳進 service，多一層時間比較與時鐘假設，而且它只補了「contact step-up」這一個消費點——`set-password` 本身「設完不撤 session」的不對稱仍在，下一個把「有密碼」當證明的功能會再踩一次。

**否決 C 的理由**：SSO 使用者事後正常設了密碼，之後每次換 contact 仍被迫收驗證碼，體驗較差，且與 ADR-085「有 password identity 就驗密碼」的表述直接矛盾——那需要改寫 085 而非補充它。
（2026-08-31 補充：C 在第二輪 review 被重新提出，仍然否決，但理由換了——見 ADR-215。C 治的是症狀：它擋住「自造密碼當 step-up」，卻擋不住「自造密碼直接登入」。）

---

### ADR-161 step-up 憑證放在 DELETE 的 request body，不改動詞、不進 URL

**白話**：刪除要帶密碼，密碼放在請求的 body 裡，不放在網址上。

**Context**：ADR-159 讓 `DELETE /auth/contacts/{type}` 需要 step-up 憑證，但這個端點在 ADR-087 定案時沒有 body。三個放法：

- **A. DELETE 帶 optional JSON body**。
- **B. 改成 `POST /auth/contacts/{type}/delete`**。
- **C. 放 query string**。

**Decision**：採 A。新增專用的 `DeleteContactRequest`（只有 `step_up`），且 body 為 optional。

**Consequences**：
➕ 端點的動詞、路徑、`204/404/409` 契約全部不動，既有呼叫端與測試不必改寫語意。
➕ **body 被中間層剝掉是 fail-closed**：`step_up` 讀成 `None`，等同沒帶證明，答 422。剝掉 body 不會變成放行，這是選 A 的關鍵理由。
➕ optional 是刻意的——SSO-only 帳號的第一次呼叫本來就該不帶 body，那一次正是「後端決定要哪種證明並把碼寄出去」的時機。
➖ HTTP 規範未定義 DELETE body 的語意，少數 proxy／client 會剝除。前述 fail-closed 讓後果侷限在「使用者收到 422」而非「守衛失效」。
➖ httpx 的 `.delete()` 不收 `json=`，測試需改用 `client.request("DELETE", ...)`。已於 `tests/test_account_profile.py` 的 `_delete()` helper 封裝。

**否決 B 的理由**：`POST .../delete` 是用路徑名稱補動詞語意，和本 codebase 其餘 REST 端點的風格不一致，且要同時維護新舊兩條路徑或做破壞性更名。

**否決 C 的理由**：密碼會進入 URL，而 URL 會落在 access log、proxy log、瀏覽器歷史與 Referer。直接出局。

---

### 不在本次修補範圍（review 有記錄，未動手）

以下三項在同一份 review 中提出並附重現證據，經確認**不構成權限繞過**，故未隨本次一起修：

| 項目 | 位置 | 現況 |
|---|---|---|
| SSO-only 路徑每次呼叫都重發碼，無聲作廢使用者手上那組 | `auth_contact.py:102-109` | 使用者拿第一封信的碼作答會得到「錯誤或已過期」。建議改為「已有未過期 pending 就回 422，重發走 `/contacts/resend`」 |
| `_as_http` 用精確型別查表，遇到未登錄的 `ContactError` 子類會 `KeyError` → 500 | `contacts.py:45` | 目前五個子類都在表內，尚未觸發 |
| 舊管道通知在 `replace_verified` commit 之後才寄，寄失敗即無第二次機會 | `auth_contact.py:190-196` | ADR-085 說通知是唯一偵測機制，值得補 retry 或告警 |

`/contacts/resend` 沿用 `AddContactRequest`、因而收下並忽略 `step_up` 一事，隨 ADR-161 新增 `DeleteContactRequest` 的方向一併記錄，但本次未改（不影響安全性：resend 需要 pending 已存在，而 pending 是 step-up 通過後才建立的）。

---

### ADR-162 變更通知走 BackgroundTasks，寄送失敗只記 log 不拋

**白話**：換掉聯絡方式之後那封「你的信箱被換了」的通知，如果寄不出去，不會把整個請求弄壞——但也不會就這樣消失，會留在 log 裡。

**Date**: 2026-08-30（PR #39 code review 後補）

**Context**：`commit_contact_change` 在 `replace_verified()` 就已經 commit 了，通知才寄。原本的寫法是**在請求路徑上同步寄、沒有 try/except**：寄送一旦拋例外，contact 已經換掉並寫進資料庫，請求卻以未處理的例外收場，通知既不會重試也不會留下紀錄。

review 在本分支實測：讓 email sender 拋例外，DB 裡的 contact 已經是 `new@x.com`，而**舊地址從頭到尾沒收到任何東西**。

這件事的嚴重性來自 ADR-085 自己的定位——那封通知是「唯一能讓受害者察覺的機制」。照原本的寫法，一次暫時性的 SMTP／SMS 故障就會**關掉這個偵測手段，同時仍然放行變更**。同專案的 `forgot_password`（`password.py`）早就用 `BackgroundTasks` 派送並寫明了理由，這裡沒跟上。

**Decision**：兩件事一起做，缺一不可。

1. **`_send_email_or_log` / `_send_sms_or_log`**：包住寄送，`except Exception` 記 `logger.exception` 後吞掉。已經 commit 的變更不該死在通知這一步。
2. **`_notify(dispatch, fn, *args)`**：HTTP 路徑傳 `BackgroundTasks.add_task`，把 provider 延遲移出請求路徑；service 層呼叫者不傳就退回 inline 執行，這是單元測試要的行為。

**否決的替代方案**：
- **只加 try/except，不動同步寄送**：解決了「變更被通知拖垮」，但 provider 逾時仍然卡在回應前面。
- **改成 commit 前先寄**：寄成功但 commit 失敗會通知一個沒發生的變更，比漏通知更難解釋。
- **引入重試佇列**：本專案沒有 worker，為了一封通知引進一個是 YAGNI；log 已經讓失敗可查。

**Consequences**：
➕ 通知失敗不再讓一個已經成功的變更以 500 收場。
➕ provider 延遲離開請求路徑。
➖ 通知從「同步保證送出」降級為「盡力送出 + 失敗留 log」。這是刻意的：ADR-085 要的是偵測，而偵測失敗必須看得見，不是讓變更連帶失敗。
➖ 失敗只在 log 裡，沒有告警。要接告警是另一張票。

---

### ADR-163 contact 異動在擁有者的 user 列上取 row lock

**白話**：同時發兩個刪除請求（一個刪信箱、一個刪手機），原本兩邊都會覺得「還會剩一個」而放行，結果帳號一個登入管道都不剩。現在會排隊，只有一個過得去。

**Date**: 2026-08-30（PR #39 code review 後補）

**Context**：ADR-087 的守門是 read-then-write：先 `count_by_user()`，再 `delete`，中間沒有鎖，資料庫層也沒有對應的 invariant。兩個 `DELETE` 同時抵達一個「2 個 contact、沒有 SSO 身分」的帳號——一個刪 `email`、一個刪 `phone`——各自讀到 `count = 2`、各自算出 `remaining = 1`，兩個都放行。帳號最後**零 contact、零 SSO 身分：沒有登入識別、沒有密碼重設目的地，永久鎖死**。那正是 ADR-087 存在的理由。

**測試套件抓不到這個**：`tests/conftest.py` 把 `get_db` 換成單一共用的 `AsyncSession`，`client` 底下的請求會序列化到同一條連線上，那個交錯根本不可能發生。uvicorn 底下每個請求有自己的 session 與連線。

**Decision**：`contact_repository.lock_owner()` 對 `users` 的那一列取 `SELECT ... FOR UPDATE`，把同一個帳號的 contact 異動序列化。

鎖的是**擁有者**而不是 contact 列，因為這條規則是關於 contact 的**集合**——要插入或刪除的那一列在被選出來之前根本鎖不到。

**兩個順序決定，都是刻意的**：

- **409 檢查跑兩次。** 第一次不帶鎖，用來決定「要不要為這件事去煩使用者要證明」；第二次在鎖底下，那次才是真正成立的。只留第二次會讓一個從一開始就不可能的操作先要求使用者認證。
- **鎖在 step-up 之後才取。** 於是**不會有任何資料庫鎖跨在寄信或簡訊上**。反過來寫的話，一個慢的 SMTP 就會把該帳號的所有 contact 異動卡住。

**否決的替代方案**：
- **資料庫層的 CHECK / partial unique**：「至少剩一個登入管道」跨 `contacts` 與 `user_identities` 兩張表，不是單表約束表達得出來的。
- **應用層鎖（Redis）**：Redis 已經在認證路徑上（Spec 014），再讓它變成資料完整性的相依對象，換來的是同一個交易邊界問題還沒解決。
- **樂觀鎖 + 重試**：要在 `users` 加版本欄位並讓所有寫入者遵守，成本高於一行 `with_for_update()`。

**Consequences**：
➕ ADR-087 的規則在併發下成立，不再只是循序下成立。
➕ 鎖的持有時間就是交易本身，且不含任何外部 I/O。
➖ 同一帳號的 contact 異動被序列化。使用者自己的操作本來就不會併發，這個代價只在攻擊或重複送出時付。
➖ ~~**這個 bug 用現行的測試 fixture 寫不出回歸測試**（單一共用 session）。已在 ADR 記錄，要真的測得寫成跑真 uvicorn 的整合測試，另開票。~~
   **這一項是錯的（2026-08-31 更正，PR #39 第二輪 review 指出）**。單一共用 session 只是 `client` 那條 HTTP 路徑的限制；service 本身可以直接呼叫，兩次 `create_async_engine` 就有兩條真連線在同一個 event loop 裡。回歸測試已補上——
   `tests/test_account_profile.py::test_two_concurrent_deletes_cannot_strand_the_account`：
   用 `asyncio.Barrier(2)` 把 `_require_step_up` 換成「兩邊一起抵達鎖」，再 `asyncio.gather` 兩個
   `delete_contact`（一個刪 email、一個刪 phone），各自跑在自己的 session 上。
   把 `lock_owner` 改成 no-op 之後這個測試會紅（零個拒絕、帳號被清空），有鎖時是「剛好一個拒絕、剩一個 contact」。
   **教訓**：「測不出來」在寫進 ADR 之前要先確認那是被測的東西的性質，還是只是某條測試路徑的性質。

---

### ADR-164 step-up 驗證碼有自己的文案，且金鑰綁定「這次要授權的動作與目標」

**白話**：寄給你的那組驗證碼，訊息會直接說「這是要用來刪掉／換掉你這個信箱的」，並且說換成哪一個。之前它借用「請驗證你的信箱」那封，說的是相反的事。

**Date**: 2026-08-30（PR #39 code review 後補）

**Context**：`_deliver_code` 直接沿用 `build_contact_verification_email`，內文寫的是「驗證您的電子郵件／Enter it to verify this email address」，結尾還加「若您並未提出此請求，請忽略本郵件」。但收件人實際上被要求授權的是**把這個地址從帳號上拿掉**。

兩個後果：

1. session 被盜的受害者收到這封信，**看不出有人正在動他的帳號**——而這是整條流程裡唯一一個「警告他就能阻止變更」的時刻，其他通知都只能事後告知。
2. 一封「給我驗證碼、但不說要做什麼」的訊息，正好是電話詐騙「把剛剛收到的碼唸給我」需要的形狀。

另外，Redis 金鑰原本是 `stepup_old_channel:{user_uuid}:{type}:{old_value}`——**只綁舊值**。那組碼因此可以授權換成**任何**新值，所以連仔細讀信的使用者也無從確認自己批准了什麼。

**Decision**：

1. **`build_step_up_code_email` / `build_step_up_code_sms`**：專屬文案，說明這組碼授權的是什麼動作（刪除／更換），更換時一併帶上遮蔽後的新值。
2. **金鑰改為 `{user_uuid}:{type}:{value}:{action}:{target}`**：碼與它授權的那一次動作、那一個目標綁死。批准一個變更不會授權另一個。

**否決的替代方案**：在既有的驗證信上加一句話。文案共用會讓下一個改動再度發散，而且它的主旨與結尾都得改，等於實質上就是另一封信。

**Consequences**：
➕ 收件人看得到自己在批准什麼，警告因此可能真的擋下變更而不只是事後告知。
➕ 碼不能被挪用到另一個目標。
➖ 多兩組文案要維護（email + SMS）。
➖ 金鑰含 `target`，所以換不同的新值會各自要一組碼。這正是要的效果。

---

### ADR-165 step-up 驗證碼有每帳號寄送上限，且已存在的碼不重發

**白話**：拿著偷來的 session 的人，不能靠一直呼叫這個端點來對受害者的信箱／手機轟炸簡訊。

**Date**: 2026-08-30（PR #39 code review 後補）

**Context**：SSO-only 帳號上，每一次不帶 `step_up` 的 `POST /auth/contacts` 都會產一組新碼、寄給**既有的** contact。這個呼叫**預期就是會失敗（422）**，所以沒有任何「完成條件」能終止它——持有被盜 session 的人可以拿它對受害者的地址隨意發信，`phone` 的話每一次都是一筆真實的簡訊費用。

端點上的 `get_rate_limiter(3, 60)` 擋不住這件事：它用 fastapi-limiter 的 `default_identifier`，key 是**來源 IP + path**，不是帳號。換 IP 就重新計算。

**Decision**：把上限放在**收訊的那個人**身上，不是放在發送者身上。

- `stepup_sends:{user_uuid}:{type}`，一個 OTP 視窗內最多 `MAX_STEPUP_SENDS_PER_WINDOW = 3` 次。
- 已經有一組碼還活著時回 `"pending"`、**不重發**。重發會默默作廢使用者手上那組，而且每一次重發都是又一則訊息送到他那裡。

**否決的替代方案**：
- **把端點的 rate limit 改成以帳號為 key**：方向對，但那個 limiter 是全端點共用的既有機制，改它會影響這張票以外的端點——而且真正要保護的對象是「收訊者」，那不見得等於「呼叫者的帳號」。
- **不寄、直接回 422**：那 SSO-only 帳號就永遠拿不到 step-up 碼，等於把 ADR-086 的流程整個廢掉。

**Consequences**：
➕ 訊息數量的上限綁在收訊者身上，換 IP 沒有用。
➕ 「pending 不重發」讓使用者手上那組碼不會被無聲作廢。
➖ 同一個 OTP 視窗內，真正的使用者若自己重試超過 3 次也會被擋，得等視窗過。以「保護的是被轟炸的那個人」來說這個取捨可以接受。
➖ 上限是每帳號每 type，不是每帳號。這是刻意的：email 被轟炸不該讓使用者連手機的 step-up 都拿不到。

---

### ADR-166 `step_up.password` 採用與其他密碼欄位相同的契約

**白話**：這個欄位收的跟其他密碼欄位是同一種東西（前端已雜湊過的值），所以長度下限和說明也要一樣。

**Date**: 2026-08-30（PR #39 code review 後補）

**Context**：`StepUp.password` 原本是 `min_length=1`，欄位與 class docstring 都沒說值必須是**前端已雜湊**的。

API 上每一個同類欄位都寫明了、且下限是 6：`ChangePasswordRequest.old_password`、`RegisterRequest.password`（`# already frontend-hashed`）、`SetPasswordRequest.password`、`ResetPasswordRequest.new_password`。

而 `_require_step_up` 是拿 `verify_password(step_up.password, identity.password_hash)` 去比對——那個 hash 是從**前端雜湊值**推導出來的。所以一個送明文密碼的 client 拿到的是 401，跟「密碼打錯」**完全無法區分**：它會去查一個不存在的密碼問題，而不是去修自己少做了一步雜湊。

目前沒有人撞到，只因為前端還沒有串 `/users/me`（PR 描述已載明）。

**Decision**：`min_length=6`，並在欄位與 docstring 寫明值是前端已雜湊的、以及它會被怎麼消費。

**Consequences**：
➕ 送明文的 client 拿到 422 並被指到 `step_up.password`，而不是一個誤導的 401。
➕ 讀 schema 的人不必反推 `_require_step_up` 才知道要送什麼。
➖ **行為變更**：`step_up.password` 少於 6 字元從 401 變成 422。真實的前端雜湊值遠長於 6，所以只有手刻的呼叫會遇到。
➖ 兩個既有測試用 `"wrong"`（5 字元）當「錯誤密碼」的哨兵值，會變成 422 而不是 401。哨兵值已改成 `"wrongpw"`——否則那兩個測試證明的是長度檢查，不是密碼比對。

---

### ADR-215 `/auth/set-password` 本身要 step-up；ADR-160 的撤銷不足以擋帳號接管

**白話**：只拿到一個 session 的人，不可以自己造一把「session 死了還在用」的鑰匙。

**Date**: 2026-08-31（PR #39 第二輪 review 後補）

**Context**：ADR-160 挑了選項 A（設完密碼撤銷所有 session），並宣稱「自造的密碼在同一個 request 內就失效」。**那句話不成立**——失效的是 session，密碼是永久憑證。review 實測（SSO-only 帳號）：

```
GET  /users/me                                    -> 讀到 sso@x.com
POST /auth/set-password {"password":"attackerpw"} -> 204（session 全撤）
GET  /users/me           (舊 token)               -> 401   <- ADR-160 如設計般運作
POST /auth/login  sso@x.com / attackerpw          -> 200   <- 而且被直接繞過
POST /auth/contacts step_up.password=attackerpw   -> 202
POST /auth/contacts/verify                        -> 200   聯絡方式已變成 attacker@evil.com
```

ADR-160 的判斷錯在**把憑證的生命週期跟 session 的生命週期當成同一件事**。撤銷 session 只拿掉了「已經在手上的那把鑰匙」，沒有拿掉「剛剛新配的那把」。

**Decision**（2026-08-31 使用者拍板）：把證明移到**憑證產生之前**。`set_password` 先呼叫
`auth_contact.require_step_up_for_first_password`，寄一組 step-up 碼到帳號自己的聯絡方式，
第一次呼叫回 422 要碼，帶碼的第二次才真的建立 password identity。三件事同時成立：

1. **證明在前**：沒有信箱／手機的人造不出密碼，`login` 那一步就走不到。
2. **撤銷保留**（ADR-160 的 A 不撤回，只是不再被當成足夠）：與 `/auth/change-password` 對齊，
   而且看著密碼被設定的那個 session 不會靠它繼續活著。
3. **事後通知**：`notify_password_set` 告訴帳號上的每個聯絡方式。SSO-only 帳號多一把永久鑰匙
   這件事不可以無聲發生——如果那組碼曾經被唸給誰聽，這封信是擁有者唯一會看到的痕跡。

驗證碼的 `action` 是獨立值 `set_password`（ADR-164 的金鑰綁定），所以換聯絡方式的碼不能拿來設密碼，
反之亦然；文案也各自成篇（「請確認密碼設定」而不是「請確認聯絡方式變更」）。

**寄到哪一個聯絡方式**：email 優先，其次 phone，由後端決定而不是由呼叫端指定——理由與
`_require_step_up` 自己決定證明種類相同：讓客戶端挑管道，等於讓攻擊者挑他控制的那個。

**Consequences**：
➕ reviewer 的驗收標準真的成立了：只有 session 的呼叫端造不出比 session 活得久的憑證。
➕ 修在憑證產生端，ADR-160 想要的那個性質（不用在每個「有沒有密碼」的消費點各補一次）仍然保留。
➖ SSO 使用者第一次設密碼多一步：先收碼再送出。與換聯絡方式的體驗一致。
➖ **一個聯絡方式都沒有的帳號設不了密碼**，回 422 要求先新增聯絡方式。這種帳號存在（ADR-087 允許
   在有 SSO 身分時刪掉最後一個 contact），沒有可證明的管道就沒有可證明的東西。

**已知殘留缺口（不在本條範圍）**：帳號缺某一型別的聯絡方式時，`start_contact_change` 對「該型別的
第一個」不設門檻（ADR-086）——所以只有 phone 的帳號，攻擊者可以先無門檻加一個自己的 email，
再讓 step-up 碼寄到那裡。這條路在本 ADR 之前就存在，且與 set-password 無關（它同樣打穿換／刪聯絡
方式的 step-up）。**應該另開一張票**：ADR-086 的「第一個不設門檻」在帳號已有其他型別聯絡方式時，
需要重新檢視。

**否決「只加通知」的理由**：那是 reviewer 寫的最低要求，讓擁有者事後知道，但漏洞照樣成立——
攻擊者仍然拿到永久存取，通知只是把接管從無聲變成有聲。

**否決 ADR-160 當初的 C（有 SSO identity 就一律走舊管道碼）的理由**：它只擋住「自造密碼當 step-up」
這一條消費路徑，攻擊者仍然可以用自造的密碼登入取得永久存取。它治的是症狀不是病灶，而病灶是
「一個 session 就能鑄造憑證」。

---

### ADR-216 沒寄出去的 step-up 碼不算 pending；但寄送次數照扣

**白話**：簡訊寄失敗，不該讓使用者接下來十分鐘都不能改聯絡方式。

**Date**: 2026-08-31（PR #39 第二輪 review 後補）

**Context**：`issue_old_channel_step_up` 先寫 Redis key，之後才在 `_deliver_step_up_code` 寄送。
寄送失敗時 request 500，但 key 留著。接下來十分鐘每一次重試都走進 ADR-165 的 `"pending"` 分支，
告訴使用者「請使用先前收到的那一組」——而那一組從來沒寄出去。實測：

```
DELETE /auth/contacts/email   (SMTP raise)  -> 500，什麼都沒寄出
DELETE /auth/contacts/email   (重試)        -> 422「驗證碼已寄至原聯絡方式，請使用先前收到的那一組」
```

使用者既前進不了也重來不了。ADR-165 的「不重發」本身是對的，是**先發後寄**這個順序把
provider 的一次抖動變成十分鐘硬鎖。

**Decision**：`_deliver_step_up_code` 包 try/except，失敗時呼叫新的
`VerificationRepository.discard_old_channel_step_up` 刪掉那組碼，再把例外原樣拋出去（request 仍然失敗
——ADR-164 說得對，不能叫使用者去填一組沒寄出的碼）。

**寄送次數不退回**（2026-08-31 使用者裁定）：`STEPUP_SENDS` 的計數是保護**收訊的那個人**的
（ADR-165），不是保護呼叫端的。一個每次都失敗的 provider 如果連計數都退，就變成無上限的重試迴圈。
所以刻意不對稱：**碼刪掉，因為沒人收到；計數保留，因為嘗試確實發生過**。

**Consequences**：
➕ 一次寄送失敗之後，使用者馬上可以重試並拿到一組真的寄出去的碼。
➕ ADR-165 的兩個保護都還在：不重發活著的碼、每帳號每管道有寄送上限。
➖ provider 連續失敗 `MAX_STEPUP_SENDS_PER_WINDOW` 次之後，使用者要等一個 OTP 視窗。這是刻意的——
   那個上限保護的是收訊者，不因為寄送失敗而放寬。

**否決「寄送成功才寫 key」的理由**：沒有補償邏輯看起來更乾淨，但寄送成功、寫 key 失敗時，
使用者手上那組碼會驗不過——把失敗窗口從「沒收到碼」換成「收到了卻沒用」，後者更難理解。
