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
