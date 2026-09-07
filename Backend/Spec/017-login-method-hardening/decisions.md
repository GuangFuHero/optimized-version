# 017 登入方式強化 — 決策記錄

> 全域 ADR 連號。本票是 217~219。前一號是 216（012 的第二輪 review）。

---

### ADR-217 連結 SSO 登入方式要出示與設定密碼相同的證明

**白話**：只有一個 session 的人，不可以把自己的 Google／LINE 掛到別人的帳號上。

**Date**: 2026-09-01

**Context**：`link/google` 與 `link/line` 原本只有 `Depends(get_current_user)`。provider 的 id_token
證明的是「呼叫端握有那個 Google 帳號」，**它完全沒有說呼叫端握有被連結的這個帳號**——而那正是缺口。

實測（Google SSO-only 受害者、攻擊者只有被竊 session）：

```
POST /auth/link/line  {"sub":"attacker-line"} -> 200   無門檻、無通知
POST /auth/sso/line   {"sub":"attacker-line"} -> 200   以受害者身分登入
```

同一個 session 在其他路徑上全部被擋（set-password 422、換聯絡方式 422、刪聯絡方式 422），
唯獨這條是開的。而且它拿到的東西最強：

- 改密碼、`logout-all`、換聯絡方式**都撤不掉**一個 linked identity
- 它沒有到期日
- ADR-160 的「憑證變更後撤銷所有 session」對它毫無作用

這是 ADR-215 已經診斷過的同一個病：**規則只要求「改動」出示證明，不要求「新增」。**

**Decision**：`link_identity` 在寫入 identity 之前呼叫 `auth_contact.require_channel_proof`，
`action="link_identity"`、`target=provider`。證明種類仍由帳號形狀決定（ADR-085）：有密碼驗密碼，
SSO-only 寄碼到既有聯絡方式。

`require_channel_proof` 是把 ADR-215 的 `require_step_up_for_first_password` 抽出來的通用版本，
兩邊共用；後者現在只是它的一個 `action`。**一個「證明你握有這個帳號」的答案，不是每個端點各一個。**

衝突檢查（provider 已被綁在別處／本帳號已有同 provider）跑在證明**之前**——為一個本來就不可能的
操作要求使用者認證，是 ADR-159 已經避開過的錯誤。

**Consequences**：
➕ 攻擊路徑 A 封死，且封在與 ADR-215 同一個閘門上，日後新增的「取得永久存取」操作接上去就有。
➕ 有密碼的帳號連結時要輸入密碼，等同 GitHub sudo mode 對「新增 SSH key」的處理。
➖ 正常使用者連結第三方帳號多一步。與換聯絡方式的體驗一致。
➖ `link` 的錯誤碼從「200/401/409」變成「200/401/409/422」，前端要處理 422 → 補 `step_up` 重送。

**否決「只在 SSO-only 帳號上要求證明」的理由**：有密碼的帳號同樣會被竊 session，而且它的證明成本
最低（輸密碼，不必等信）。針對性放寬只會製造第二條規則。

---

### ADR-218 登入方式可以被移除，而且每一次變動都通知擁有者

**白話**：受害者要有辦法把別人掛上去的東西拿掉，而且不該是最後一個知道的人。

**Date**: 2026-09-01

**Context**：兩個缺口。**第一**，原本沒有 unlink 端點——`/users/me` 一直列得出 `login_methods[]`，
但沒有任何方式移除其中一項，所以一個被掛上來的 provider 是永久的。**第二**，`link/*` 與
`change-password` 都完全靜默；ADR-085 對聯絡方式變更堅持「通知是唯一的偵測機制」，那條原則從來
沒有延伸到登入方式上。

對照 Microsoft：更換 security info 期間**持續通知原管道**並提供取消；Apple 的 Sign in with Apple
可以逐一列出並移除。兩件事這裡都缺。

**Decision**：
1. `DELETE /auth/link/{provider}`，走與連結相同的 step-up（`action="unlink_identity"`）。
2. 守門比照 ADR-087 的聯絡方式版本：**帳號至少保留一個可用登入方式**，否則 409。
   密碼 identity 要有 `password_hash` 才算數。
3. `link` / `unlink` / `change-password` 成功後通知帳號上**每一個**聯絡方式，
   走 BackgroundTasks + `_or_log`（ADR-162），寫入已 commit，寄送失敗不會反轉它。

移除也要 step-up 的理由與 ADR-159 相同：沒有這道門，session 持有者可以把擁有者真正的 provider
拆掉、只留下自己掛的那個。

**Consequences**：
➕ 攻擊路徑 A 從「永久且無法補救」變成「擋得下，就算擋不下也看得到、拿得掉」。
➕ `change-password` 的通知補上了這條原則最後一個缺口。
➖ 通知量增加。這些都是低頻的安全事件，不是產品噪音。
➖ 只剩一個登入方式時無法移除它，使用者必須先新增另一個。與 ADR-087 的取捨一致。

**否決「unlink 不需要 step-up」的理由**：移除是接管鏈的一環，不是收尾動作。

---

### ADR-219 剛加入的聯絡方式不能當作證明管道（7 天冷卻期）

**白話**：你三分鐘前自己加上去的信箱，不能拿來證明這個帳號是你的。

**Date**: 2026-09-01

**Context**：ADR-215 記錄了這個殘留缺口，本票把它補上。`start_contact_change` 對「該型別的**第一個**
聯絡方式」不設門檻（ADR-086），所以 session 持有者可以把自己的 email 掛到一個只有手機的帳號上；
而 `_proof_contact` 的順序是「email 優先」，於是 step-up 碼直接寄給攻擊者。實測全程重現，
最後 `POST /auth/login attacker@evil.com/attackerpw -> 200`。

**Decision**：`_proof_contact` 改成：

```
settled = 加入時間 ≥ PROOF_COOLDOWN(7 天) 的聯絡方式
pool    = settled or [最舊的那一個]
選擇    = pool 裡 email 優先，其次 phone
```

**7 天不是拍出來的**：Google 的官方說明頁寫「When you add or change your recovery phone number,
it may take up to 7 days for those changes to take effect」，並且變更後 7 天內仍會寄碼到舊管道。
本票直接沿用同一個數字與同一個道理。

**「全都在冷卻期內就退回最舊的」這個 fallback 是必要的**：全新帳號的唯一聯絡方式一定未滿 7 天，
規則若寫死就沒有人能設密碼或連結第二個登入方式。而它同時滿足安全面——攻擊者剛加的那個
**永遠不會是最舊的**。

**Consequences**：
➕ 攻擊路徑 B 封死，改動集中在一個函式。
➕ 不需要 migration：`user_contacts.created_at` 早就存在。
➖ 使用者換了聯絡方式之後 7 天內，step-up 碼仍寄到舊的那個。這正是 Google 的行為，也正是這條
   規則的重點——但如果舊管道真的失聯（換號碼、信箱停用），這 7 天會很難受。
➖ 攻擊者仍然可以把自己的聯絡方式掛上去（那是 ADR-086 的範圍），只是它 7 天內不會成為證明管道。

**否決「以驗證時間而非建立時間計算」的理由**：`replace_verified` 會就地更新既有列，時間語意會
變得依賴哪一條路徑寫的它。`created_at` 是這張表唯一穩定的時間。

**否決「不設冷卻期，改成一律寄到所有聯絡方式」的理由**：任何一組碼都能通過，等於以最弱的管道
為準——攻擊者掛上自己的管道之後反而更容易。

---

### ADR-220 新增聯絡方式也要出示證明，明確推翻 ADR-086 的「新增不設門檻」

**白話**：一個聯絡方式從被驗證的那一刻起就是救援目的地，所以掛上去跟換掉一樣敏感。

**Date**: 2026-09-01

**Context**：ADR-219 上線後重跑探測，發現冷卻期擋不到第三條路——因為
`forgot-password` / `reset-password` **根本不經過 `_proof_contact`**，它們直接用「哪個 contact 對得上」
找帳號。受害者是密碼帳號、只有手機沒有 email，攻擊者只有一個被竊 session：

```
POST /auth/contacts email=attacker@evil.com  -> 202  ← ADR-086：該型別第一個不設門檻
POST /auth/contacts/verify                   -> 200
POST /auth/forgot-password attacker@evil.com -> 202  ← 重設碼寄到 attacker@evil.com
POST /auth/reset-password                    -> 204
POST /auth/login attacker@evil.com/attackerpw -> 200
```

這條比 A、B 更難防守：session 只需要用一次（掛上信箱），之後隨時可以重設，不受 session 撤銷影響。

**ADR-086 的推理錯在哪**：它說「新增不是取代，沒有拿走任何東西，所以不需要額外門檻」。
前半是對的，結論是錯的——**新增一個救援目的地，跟換掉一個救援目的地，對攻擊者的價值一模一樣**。
ADR-219 的冷卻期只讓那個管道 7 天內不能當 **step-up 證明**，沒有讓它不能當**密碼重設目的地**。
一個修在證明層的規則，擋不住一條不經過證明層的路。

**Decision**：`start_contact_change` 在 `existing is None`（該型別的第一個）這條路上，
只要帳號**有任何可以拿來證明的東西**，就要求 `require_channel_proof(action="add_contact", target=新值)`：

| 帳號狀態 | 新增第一個某型別 contact |
|---|---|
| 有密碼 | 驗密碼 |
| 無密碼、有其他 contact | 寄碼到既有管道（依 ADR-219 挑 settled 的） |
| 無密碼、零 contact | **不設門檻** |

最後一列是刻意的：沒有任何可證明的東西，就沒有東西可以拿來證明；而那種帳號本來就沒有密碼重設
路徑可以被偷（`forgot-password` 對 SSO-only 只回制式通知，不發碼）。

**Consequences**：
➕ 三條實測過的接管路徑全部關閉，而且關在根因上而不是各自的出口。
➕ ADR-159 的「先刪再加」繞道現在兩端都封住：刪要證明（159），加也要（220）。
➕ ADR-219 退居縱深防禦——它現在防的是「證明管道被合法換過、但還太新」，不是防攻擊者掛管道。
➖ **這是本票唯一的行為破壞性變更**：新增第二種聯絡方式從 202 變成需要先 422 取得證明。
   前端要處理，六支既有測試連帶更新（斷言意圖不變，只是補上證明）。
➖ 密碼帳號新增 contact 要輸密碼。與 GitHub sudo mode 對「修改關聯 email」的處理一致。

**否決「只擋住 `forgot-password` 用新管道」的理由**：那是在出口補洞。同一個管道還能拿來收
ADR-215 的 step-up 碼、還能在 7 天後成為證明管道；每多一個消費點就要再補一次。ADR-215 已經
示範過修在產生端而不是消費端的價值。

**否決「新增後給該管道一段不可用於救援的冷卻期」的理由**：那是 ADR-219 的機制延伸到重設路徑，
確實可行，但它讓「攻擊者的管道已經掛在受害者帳號上」這個事實留著——擁有者會在 `/users/me`
看到一個不是自己的信箱，而系統當初讓它進來時什麼都沒問。

---

### ADR-233 這個 stack 把前端打壞了四條路徑，所以前端在這裡一起補齊

**白話**：後端把「設定密碼」和「新增聯絡方式」改成兩段式，但前端的表單沒有欄位可以填第二段——按鈕直接壞掉。

**Date**: 2026-09-07（PR #39 第四輪 review 後補）

**Context**：reviewer 在 PR #39 指出 `/auth/set-password` 有活的前端使用者，ADR-215 之後它一律回 422。
往下追之後發現**同一類問題在這個 stack 裡有四條**，不只一條：

| 端點 | 閘門 | 前端呼叫處 | 送出的 payload |
|---|---|---|---|
| `POST /auth/set-password` | ADR-215（#39） | `account-security.client.tsx` | `ISetPasswordPayload` 無 `step_up` |
| `POST /auth/contacts`（首次新增某型別） | **ADR-220** | `account-security.client.tsx` | `IAuthIdentifierPayload` 無 `step_up` |
| `POST /auth/link/google` | **ADR-217** | 只有 data-access 與 BFF，**沒有 UI** | `IIdTokenPayload` 無 `step_up` |
| `POST /auth/link/line` | **ADR-217** | 同上 | `IIdTokenPayload` 無 `step_up` |

`POST /auth/contacts` 那條的受眾比 set-password 大得多：ADR-220 的條件是
`_has_something_to_prove_with()`——帳號**有密碼或有任何既有 contact** 就要證明——所以
「已有 email 的人要加手機」也會 422。真正不受影響的只有零 contact 零密碼的全新帳號。

**Decision**：前端在**本 PR** 一次補齊，而不是留 ticket 或替四個端點各做一個相容旗標。

兩張 PR 是 stacked、一起合併的，所以前端會同時吃到四個 422；而相容旗標的做法要四組雙路徑、
八組測試、散在兩張 PR 裡，比直接把前端改對還貴。

三層改動：

1. **型別**：`IStepUp`，掛到 `ISetPasswordPayload`、新的 `IAddContactPayload`、
   新的 `ILinkIdTokenPayload`。link 的兩條沒有 UI，所以只補型別與轉發，不做表單。
2. **狀態要傳得到前端**。原本 `parse-json-response-async.ts` 丟的是 `new Error(detail)`——
   **狀態碼在這裡就掉了**；BFF 的 catch 又把每一種失敗都寫成 `400`。兩層加起來，瀏覽器
   永遠看不到 422。改成 `RequestError` / `FrontendRequestError` 帶 `status`，BFF 的 catch
   用上游的狀態。**沒有這一步，兩段式流程只能靠比對錯誤訊息字串來判斷，那是會碎的。**
3. **表單**：422 顯示 `severity="info"` 的提示（用後端原本的訊息）加上證明欄位，填完再按一次同一顆按鈕。

**`set-password` 一個欄位、`contacts` 兩個欄位**，理由不同而非不一致：
`set-password` 的帳號依定義是 SSO-only（已有密碼會 409），所以證明**必定**是管道驗證碼；
`contacts` 的帳號可能有密碼也可能沒有，而**決定要哪一種證明的是後端不是 client**，
所以兩個欄位都給，填了哪個就送哪個，後端訊息會說是哪一個。密碼欄位一樣先做前端雜湊，
與 change-password 的 `old_password` 同一條路。

**Consequences**：
➕ 合併之後前端不會壞，也不需要一個「暫時關掉保護」的旗標。
➕ 狀態碼傳得到前端，之後任何需要分辨 401/409/422 的流程都不必再猜訊息字串。
➖ 本 PR 從純 Backend 變成跨前後端。這是刻意的：閘門是這個 stack 加的，破壞也是。
➖ `contacts` 的兩欄位對使用者稍微囉嗦。後端訊息會指明要哪一個；用 client 猜的版本會在
   猜錯時給出更糟的體驗。

**否決「四個端點各加相容旗標、預設走舊的單段流程」的理由**：能讓前端不壞，但那等於在合併之後
把 ADR-215/217/220 全部關掉——接管鏈重新打開，而且是在四個入口。旗標要有人記得打開，
前端改對則不需要。

---

### ADR-234 綁定的第三方登入本身就是「可以拿來證明的東西」

**白話**：ADR-220 說「什麼都沒有的帳號不設閘門」，但它沒把已連結的 provider 算成「有東西」——而 provider 是這個系統發出最強的憑證。

**Date**: 2026-09-07（PR #45 第一輪 review 後補）

**Context**：`_has_something_to_prove_with()` 只數密碼與 contact，不數 SSO 身分。而「有 provider、沒密碼、沒 contact」這個形狀**是到得了的**：LINE 首次登入在 provider 沒回傳 email、或該 email 已被占用時，`auth/sso.py:171-179` 就不會附上任何 contact。

那個豁免不是中性的，因為它放進來的 contact **馬上就變成其他所有操作的證明管道**。實測完整重現（攻擊者只持有一個被竊的 session）：

```
[shape] line identity only — no contact, no password
[1] POST /auth/contacts {email: attacker@evil}  -> 202  無閘門
[2] POST /auth/contacts/verify                  -> 200  _notify_contact_added 沒有既有管道可通知
[2] mail recipients so far: ['attacker@evil.com']
[3] POST /auth/set-password                     -> 422，而 step-up 碼寄到 attacker@evil.com
[3] POST /auth/set-password (帶碼)               -> 204   密碼鑄成、owner sessions 撤銷
[3] POST /auth/login as attacker@evil.com       -> 200
[4] DELETE /auth/link/line                      -> 204   owner 唯一的登入方式被移除
[final] contacts=[('email','attacker@evil.com')]  login_methods=['password']
[final] every mail this run sent went to: ['attacker@evil.com']
```

**而且救不回來。**受害者拿自己真正的 LINE 登入：

```
[D] owner signs in with their real LINE -> 200
[D] ...lands on uuid=5e3979d4-…  (原本是 ef137b08-…)   ← 一個全新的空帳號
```

機制定位到兩個地方：

```
[A] _has_something_to_prove_with(line-only) = False   ← 只數 password + contacts
[B] _settled(...) = []                                ← ADR-219 的冷卻期,沒有 contact 通過
[B] _proof_contact(...) = 'attacker@evil.com'         ← `or [min(…, key=created_at)]` 蓋過冷卻
```

對照組確認閘門本身沒壞：有 contact 的帳號、有密碼的帳號，同一個呼叫都是 422。**問題在豁免條件，不在閘門。**

**Decision**：兩件事。

1. **`_has_something_to_prove_with` 把 SSO 身分算進去。**
2. **新增第三種證明 `_sso_proof`**：出示一個 **subject 已經在這個帳號上** 的新 id_token。`StepUp` 加 `id_token` 欄位。

`require_channel_proof` 因此變成三段，順序就是重點：

| 順序 | 證明 | 何時輪到 |
|---|---|---|
| 1 | 密碼 | 帳號有密碼 |
| 2 | 已定著的 contact 收驗證碼 | `_proof_contact` 找得到 |
| 3 | 帳號自己的 provider | 帳號一個 contact 都沒有 |

verifier 用一個 `get_sso_verifiers` 依賴帶進四個端點（contacts / set-password / link / unlink）。它由既有的 per-provider 依賴組成，所以測試注入 fake 用的 `dependency_overrides` 原樣可用。

**「token 驗得過」不等於「token 屬於這個帳號」**——那正是 ADR-217 修過的錯誤，只是往上一層。所以 `_sso_proof` 比對的是 `provider_subject` 是否已在此帳號上，攻擊者用自己那個合法的 LINE token 會拿到 401。

**試過並推翻的做法：連 `_proof_contact` 的 unsettled fallback 一起拿掉。**
第一版這樣寫，**12 個測試變紅**。原因不是測試寫壞：每個 contact 在頭 7 天都是 unsettled，拿掉 fallback 等於把管道證明從**每一個新帳號**手上收走——正是 ADR-219 當初加那個 fallback 要保護的情境。那是真實的使用者傷害，不是測試債。

所以 fallback 保留。它之所以危險，是因為攻擊者能**製造**它會挑中的那一列；SSO 身分算進閘門之後，新增 contact 本身就要證明，那一列不可能是攻擊者的。`_proof_contact` 唯一的行為改變是：**完全沒有 contact 時回 None 而不是 raise**，好讓呼叫者往下掉到 provider 證明——它原本在這裡 raise，正是為什麼零 contact 這個形狀當初必須被整個豁免掉。

**Consequences**：
➕ 上面那條鏈在第 1 步就斷，後面三步不存在。實測 422，且一封信都沒寄出。
➕ 合法的 LINE 使用者不必等——用他本來就有的 provider 重新驗證一次即可，體驗上比等 email 驗證碼還直接。
➖ `StepUp` 多一個欄位，前端四條路徑之一（`contacts`）之後可能要處理第三種證明。目前 `set-password` 表單只給驗證碼欄位（ADR-233），因為那個帳號依定義沒有 provider 以外的東西——**這點在本 ADR 之後不再成立**，`set-password` 的表單需要能填 id_token，記在下面的待辦。
➖ 「什麼都沒有」的 `ContactNotFound` 分支變成幾乎到不了的 backstop。它用 service 層的測試釘住，不透過 HTTP——`create_account` 會寫一列 hash 為 NULL 的 `provider="password"`，所以 `/set-password` 會先回 409，用那條路由斷言會變成「測試因為它名字沒提到的理由而通過」，也就是 ADR-231 講的那個陷阱。

**推翻的既有測試**：`test_an_account_with_nothing_to_prove_with_can_add_its_first_contact` 斷言 202，**把這條接管路徑釘成了預期行為**——與 ADR-231 同一種毛病。改寫成四支：閘門擋下、owner 自己的 token 通過、攻擊者自己的合法 token 被 401、`set-password` 那一步也擋。

---

### ADR-235 unlink 的守門要拿鎖，而且不能用會 `scalar_one()` 的通用刪除

**白話**：兩個 unlink 同時進來，兩個都看到「還剩一個登入方式」，兩個都放行——帳號剩零個，而且救不回來。

**Date**: 2026-09-07（PR #45 第一輪 review 後補）

**Context**：`unlink_identity` 的 docstring 寫著它 mirrors ADR-087 的 contact 守門，但**只抄了守門，沒抄鎖**。這個 invariant 是 read-then-write，形狀跟 ADR-163 修掉的完全一樣：

```
帳號有 google + line、沒有密碼
req A: DELETE /auth/link/google  -> remaining = [line]    -> 放行
req B: DELETE /auth/link/line    -> remaining = [google]  -> 放行
兩個都完成 -> 零個登入方式
```

而這個帳號**永久救不回來**：`reset_password` 在沒有 password identity 時拒絕（`auth/password.py:196`），所以 `forgot-password` → `reset-password` 也鑄不出密碼，而且沒有任何登入方式可以用。

另外 `identity_repository.remove` 是通用的 `GenericRepository.remove`，結尾是 `RETURNING` 那一列的 `scalar_one()`——競態中輸的那一方拿到的是 500，不是守門想給的 409。

**Decision**：順序完全照 `delete_contact`：

```python
await require_channel_proof(...)               # 慢的事情先做完,不在鎖裡寄信

await contact_repository.lock_owner(db, user_uuid)   # 鎖 users 那一列
if not await _remaining_login_methods(db, user_uuid, identity):
    await db.rollback()                              # 主動釋放,不留給 request teardown
    raise LastLoginMethod("帳號至少需保留一個登入方式")
await identity_repository.delete_identity(db, identity=identity)
```

- **重用 `contact_repository.lock_owner`，不另做一個。**它鎖的是 `users` 那一列，兩個守門要保護的是同一個帳號，順帶讓 unlink 與 delete_contact 互相序列化。我試著構造跨守門的漏洞但**沒有構造出來**，所以這是便宜的保險，不宣稱是第二個 bug。
- **鎖之前那次檢查保留**，理由與 ADR-163 相同：便宜的那次決定要不要麻煩使用者出示證明，拿著鎖的那次才是真正成立的。
- **新增 `identity_repository.delete_identity()`** 用 `db.delete()`，比照 `contact_repository.delete_contact`。**不動共用的 `GenericRepository.remove`**——其他呼叫者依賴它的回傳值。

**Consequences**：
➕ 併發 unlink 不可能把帳號清空。
➕ 輸的那一方拿到 409，不是 500。
➖ unlink 多一次 `SELECT … FOR UPDATE` 與一次重讀。相對於它前面剛做完的證明可以忽略。

**回歸測試**：`test_two_concurrent_unlinks_cannot_strand_the_account`，recipe 與 ADR-163 那條相同——兩個 `create_async_engine` 連線在同一個 event loop，證明用 `asyncio.Barrier(2)` stub 掉讓兩個 task 同時抵達鎖。**把 `lock_owner` 那行拿掉會紅**：`expected exactly one refusal, got [None, None]`。

---

### ADR-236 移除登入方式要撤銷所有 session

**白話**：受害者把攻擊者掛上去的 provider 拔掉了，但攻擊者透過那個 provider 拿到的 session 還在跑。

**Date**: 2026-09-07（PR #45 第一輪 review 後補）

**Context**：`change-password` 與 `set-password` 在認證素材改變時都會 `revoke_all_for_user`，unlink 不會。

而這個端點存在的理由**就是**「provider 是攻擊者掛上去的」——ADR-218 的原話是「受害者能在 `/users/me` 看到攻擊者的 provider 卻什麼都不能做」。拔掉之後對方的 session 繼續有效到自然過期，期間仍能操作帳號，等於這個端點只做了一半。

**Decision**：刪除 identity 之後 `await SessionRepository(redis).revoke_all_for_user(user_uuid)`，與密碼那兩條路一致。

**Consequences**：
➕ 「移除一個登入方式」現在真的移除了透過它取得的存取權。
➖ 呼叫者自己的 session 也會斷，與 `change-password` 一致。unlink 目前沒有前端 UI（ADR-233 查證過），所以不影響任何既有畫面。

**已考慮、暫不做：per-identity 撤銷。**只撤掉「由被移除的那個 provider 鑄出來的 session」更精準，但 session 沒有記錄自己是被哪個 identity 鑄出來的。加那個欄位是 session 模型的改動，屬於另一張票。整帳號撤銷是既有的先例，先取一致。

**`link_identity` 不加撤銷**：連結是多一把鑰匙，沒有讓既有的失效，而且 ADR-218 的通知已經涵蓋。

**回歸測試**：`test_unlinking_revokes_every_session`。**把撤銷那行拿掉會紅**：`assert 200 == 401`。

---

## 待辦（本 PR 不做）

- **`set-password` 的前端表單要能填 `id_token`。**ADR-233 給它單一驗證碼欄位，理由是「set-password 的帳號依定義是 SSO-only，證明必定是管道驗證碼」。ADR-234 之後這句話不再成立：零 contact 的 SSO 帳號要出示 provider token。`contacts` 的表單同理。這是 ADR-233 前端工作的延伸，需要一張自己的票。
