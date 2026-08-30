# Session Revocation — ADR 全集（ADR-099~105、180~181、189~195）

**Date**: 2026-08-20
**Feature**: 014-session-revocation
**Status**: 定案，**已實作**（2026-08-20；ADR-180/181 為 2026-08-25 code review 後補；ADR-189~195 為 2026-08-30 PR #38 第二輪 review 後補，其中 ADR-190 推翻 ADR-180 的實作位置）
**慣例**: 沿用 `Spec/008-rbac-authorization/decisions.md` 的「每個決策一條編號 ADR」。編號接續 `Spec/012-account-profile/decisions.md` 的 ADR-098。

**前情**：本票源自 `Spec/010` 的 ADR-071（access token 撤銷 / fail-closed）。該 ADR 在 010 的改版中撤回並拆出，理由是它修的是一個與多 team 無關的既有安全洞。這裡是它的完整版本。

---

### ADR-099 每請求檢查 `session:{sid}` 是否存在；不做 denylist

**白話**：每次請求都去 Redis 確認「你這個登入還在不在」，不在就當場擋下來。不用另外維護一份黑名單。

**Context**：`get_current_user` 從不驗 `sid`（`app/core/security.py:214-236`），所以撤銷只殺得掉 refresh token，access token 仍可用滿 15 分鐘。三個選項：

- **A. 存在性檢查（fail-closed）**：每請求讀 `session:{sid}`，讀不到就 401。
- **B. denylist**：撤銷時寫 `denylist:{sid}`（TTL = access token 壽命），每請求查該 key，有就 401。
- **C. 兩者都做**：A 為主、B 補邊界。

**Decision**：採 A。

**Consequences**：
➕ **不需要新的資料結構，也不需要改任何撤銷路徑**。`revoke_session()` 已經在刪 `session:{sid}`（`app/repositories/session_repository.py:106`），所以 logout / logout-all / change-password / reset-password 全部自動變成即時生效。
➕ 語意是「有憑證才放行」而非「沒被列黑才放行」——漏改一條撤銷路徑的後果是「該撤的沒撤」，而不是「以為撤了其實沒撤」。前者查得出來，後者查不出來。
➕ session 的自然過期（14 天 TTL）也一併生效。
➖ 每個已認證請求多一次 Redis 往返。
➖ Redis 成為認證路徑的硬相依（見 ADR-100）。

**否決 B 的理由**：denylist 是「預設放行」的模型，每新增一條撤銷路徑都必須記得寫黑名單，漏寫不會有任何徵兆——測試會過、功能會動，只有安全性靜靜地缺一角。而且它處理不了「session 自然過期」：key 過期不會產生黑名單項，過期的 session 仍能用 access token 撐 15 分鐘。B 唯一的好處是省一次讀，但它讀的其實一樣多（查 denylist 也是一次 Redis 往返），只是 key 更小。**成本相同而保證更弱。**

**否決 C 的理由**：A 已經涵蓋 B 能擋的每一種情況——被列黑的 sid，它的 session 也已經被刪掉了。C 只是多一份要維護的一致性。

---

### ADR-100 Redis 不可用時回 401；不降級為只驗 JWT

**白話**：Redis 掛掉的時候，寧可讓所有人都登不進去，也不放行。

**Context**：ADR-099 讓認證路徑依賴 Redis。連不上時無法判斷 session 是否已被撤銷。

**Decision**：回 401。不提供 fail-open 降級，也不提供切換開關。

**Consequences**：
➕ 沒有「讓安全機制失效」的觸發條件可供攻擊者利用。
➕ 行為單一，測得完；不存在「開關在哪個狀態」造成的推理分支。
➖ **Redis 成為認證的單點故障**：Redis 掛 = 全站已認證請求皆 401。
➖ 未登入可讀的 GraphQL 查詢（Guest 路徑，ADR-025）不受影響，所以不是「全站不可用」，是「所有登入者不可用」。

**現階段可承受**：無正式使用者。這個代價要重新評估的時機是有正式流量之後，屆時的正解是讓 Redis 有備援，而不是把安全機制改成故障時自動關閉。

**否決 fail-open 的理由**：這條路徑存在的唯一理由就是「撤銷必須生效」。一個在 Redis 故障時自動失效的撤銷機制，等於告訴攻擊者「讓 Redis 不可用」就能繞過撤銷——而 Redis 不可用比一般人以為的容易觸發。

**否決設定開關的理由**：開關本身就是要被測的兩條分支，而且真出事時沒有人會在半夜做出正確的切換判斷。**這個決定要現在做，不要留給故障當下的人。**

**但必須留 log**：故障造成的 401 對外與「token 無效」無法區分（不洩漏內部狀態），所以內部一定要有 error log 帶原因。否則 Redis 掛掉的現象是「所有人突然登不進去，而且查不出為什麼」——這個排查成本比故障本身還高。

---

### ADR-101 沒有 `sid` 的 token 一律 401；並比對 session 的 `user_uuid` 與 token 的 `sub`

**白話**：token 上沒寫「屬於哪個登入」的，直接拒絕；有寫的，還要確認那個登入真的是這個人的。

**Context**：`create_access_token` 的 `sid` 是選填參數（`app/core/security.py:169`），但正式流程只有 `issue_token_pair` 一個入口，它一定會帶（`app/api/v1/endpoints/auth/deps.py:28-30`）。所以無 `sid` 的 token 只可能來自測試自造、或某條沒走 `issue_token_pair` 的路徑。

**Decision**：`sid` 缺失 → 401。另外，讀到 session 後比對其 `user_uuid` 是否等於 token 的 `sub`，不符 → 401。

**Consequences**：
➕ 不留「不帶 `sid` 就跳過檢查」的繞道——那會讓整個機制形同虛設。
➕ `user_uuid` 比對的成本是零（session 記錄本來就讀進來了），換到一層防禦深度。
➖ **所有直接用 `create_access_token` 造 token 的既有測試都會 401**。這是本票最大的工程成本（見 ADR-105）。

**`user_uuid` 比對防的是什麼**：JWT 已簽名，`sub` 與 `sid` 都不可偽造，所以這個比對在目前的設計下擋不到已知攻擊。做它的理由是它讓「sid 與 sub 必須配對」成為一條被測試釘住的不變量——日後若有人加了一條「複用 sid」或「換 sub 重簽」的路徑，測試會擋下來，而不是安靜地放行。

---

### ADR-102 redis 作為顯式參數傳進 `get_current_user`；不靠 `app.state`

**白話**：把 Redis 連線當成參數傳進認證函式，不要讓它自己去全域抓。

**Context**：`get_current_user` 有兩個呼叫路徑，形狀不同：

| 路徑 | 怎麼呼叫 |
|---|---|
| REST | `Depends(security.get_current_user)`，FastAPI 填參數 |
| GraphQL | `await get_current_user(db=db, token=token)` 直接呼叫（`app/graphql/context.py:44`） |

而 `get_redis` 讀的是 `request.app.state.redis`（`app/core/redis.py:6`），測試的 `client` fixture 只 override 了 `get_redis` 這個依賴、**沒有設 `app.state.redis`**（`tests/conftest.py:200`）。GraphQL 路徑至今沒碰過 redis，所以這個落差一直無害。

**Decision**：`get_current_user` 增加一個 redis 參數，REST 以 `Depends(get_redis)` 供應，GraphQL context 自己取得後顯式傳入。

**Consequences**：
➕ 兩條路徑用同一個 client，測試的 override 對兩者都有效。
➕ 認證函式沒有隱藏的全域相依，可直接單元測試。
➖ GraphQL context 需要自己拿到 redis——它有 `request`，所以拿得到。

**否決「在 `get_current_user` 內部讀 `app.state`」的理由**：那需要函式自己拿到 `Request`，GraphQL 那一路得再傳一次 request，等於同樣要改，卻換來一個測不動的全域相依。

**測試的 `client` fixture 仍要補上 `app.state.redis`**：即使本票讓 GraphQL 顯式傳入，`app.state.redis` 缺失是一個會在別處再次咬人的既有落差，順手補齊成本為零。

**實作補充（2026-08-20）**：`SessionRepository` 的匯入必須寫在函式內，不能放模組頂層——`app/repositories/session_repository.py:8` 反過來從 `app.core.security` 匯入 token hashing，頂層匯入會把循環閉合。這只是一個 import 位置的限制，不影響本 ADR 的決策。

---

### ADR-103 踢人端點用 `Perm.USER_EDIT`，不新增專用 permission

**白話**：管理員強制某人登出，沿用「編輯使用者」這個權限，不另外開一個。

**Context**：`Spec/010` 的 spec.md §7 明列踢人由本票提供，但目前沒有任何端點。權限有兩條路：復用 `Perm.USER_EDIT`（`app/core/permissions.py:54`），或新增 `user.revoke_sessions`。

**Decision**：復用 `Perm.USER_EDIT`，**checkpoint 1 only**。端點為 `POST /admin/users/{uuid}/revoke-sessions`，回 204。

**Consequences**：
➕ 不動 seed、不動權限矩陣、不需要前端在權限管理頁多顯示一個項目。
➕ 語意站得住：能編輯一個使用者的帳號，就能終止他的 session；反過來說，只能看（`USER_VIEW`）的人踢不了人。
➕ 與 `assign_role` 對 `rbac.assign` 的處理同形（`app/services/admin.py:58`），不製造第二種模式。
➖ 無法把「踢人」單獨授予給不能改帳號的角色。**YAGNI**：現在沒有這種角色，真出現時再拆一個 permission 出來，成本只有一次 seed 變更。

> **更正（2026-08-20，實作時發現）**：本 ADR 初版寫「沿用既有 scope 判定，所以 team admin 能踢的範圍與他能編輯的範圍一致」。**那是錯的**——`Spec/010` 之後使用者已經沒有單一 team（成員資格是他的授予各自指向哪些 team），所以「目標使用者」這個 resource 上根本沒有 team 可供 checkpoint 2 比對。改為 checkpoint 1 only。
>
> 實務影響是零：現行 seed 裡 `user.edit` 只有 `super_admin` 持有（`scripts/seed_rbac.py:85`），本來就沒有 team admin 能走到這個端點。真要讓 team admin 踢自己隊員，需要的是「以什麼定義目標的 team」這個設計決策，那是另一張票。

**回應不帶撤銷數量**：回 204 而非「撤掉了 N 個」。N 會洩漏該使用者有幾台裝置在線，對呼叫端也沒有用處。數量寫進 log 即可。

**冪等**：沒有任何 session 的使用者也回 204，不是 404。呼叫端要的是「這個人現在沒有活著的 session」這個結果狀態，不是「我剛剛撤掉了東西」這個事件。

> **後續收斂：見 ADR-181（2026-08-25）。** 上面「實務影響是零」的推論只在現行 seed 下成立，而 RBAC 矩陣是執行期可改的。踢人端點已改為明確要求 `Scope.ALL`。

---

### ADR-104 只讀不寫：不在請求路徑上更新 `last_used_at`

**白話**：每次請求會去看一眼 session，但不會順手記下「你剛剛用過」。

**Context**：session 記錄裡有 `last_used_at`（`app/repositories/session_repository.py:50`），目前只在 `rotate()` 時更新。既然每請求都要讀 session，看起來「順便寫一下」很自然。

**Decision**：只讀，不寫。

**Consequences**：
➕ 讀是可以無腦擴充的（副本、快取），寫不是。把每請求一次的讀變成每請求一次的寫，是完全不同量級的 Redis 負載。
➕ 請求路徑保持無副作用，重試安全。
➖ `last_used_at` 的精度仍是「最後一次 refresh」，最多落後 15 分鐘。

**這個精度足夠**：`last_used_at` 的用途是 session 管理頁顯示「上次活動」，15 分鐘的誤差在那個場景沒有意義。真需要每請求精度時（例如閒置逾時），該做的是另一套機制，不是把它塞進認證路徑。

---

### ADR-105 測試改造：`token_for` 同時建立 session，不用 monkeypatch 繞過檢查

**白話**：讓測試用的 token 也真的有一個對應的登入紀錄，而不是想辦法讓檢查對測試失效。

**Context**：13 個測試檔、30 處直接呼叫 `create_access_token`，這些 token 都沒有對應的 session，本票落地後會全部 401。兩條路：

- **A. `token_for` 順便建 session**：`tests/conftest.py:110` 的 helper 在簽 token 前先 `create_session()`。
- **B. 測試環境跳過檢查**：用設定或 monkeypatch 讓 session 檢查在測試下不生效。

**Decision**：採 A。

**Consequences**：
➕ 測試裡的 token 與正式簽出的 token 形狀一致——本來就該一致。
➕ **撤銷相關的測試才有意義**：能建 session 才能撤掉它、才能斷言撤掉後真的 401。B 會讓本票的核心斷言變成無法測試。
➕ `token_for` 是 010 才引入的集中 helper，多數測試已經在用它，改一處即可覆蓋大部分。
➖ `token_for` 需要 redis fixture，簽名要變（目前是純函式），沒用 `token_for` 而直呼 `create_access_token` 的地方要逐一改。
➖ 這是本票最花時間的部分，不是 bug。

**否決 B 的理由**：讓安全檢查在測試環境失效，等於這條路徑從來沒有被測過。本票的整個價值就在那個檢查上。

**專案已有先例**：`get_rate_limiter` 確實在測試環境繞過（`app/api/v1/endpoints/auth/deps.py:38-49`）。差別是限流是**噪音**——它跟被測行為無關，繞過它不影響任何斷言的意義；session 檢查是**被測行為本身**。這兩者不該用同一個標準。

---

### ADR-180 `get_current_session` 也要做同一個 live-session 檢查

**白話**：登出端點原本只解 JWT、不看 session 死活，所以一張已經被撤銷的 token 還是打得動它。現在同一個檢查也放進去。

**Date**: 2026-08-25（PR #38 code review 後補）

**Context**：ADR-099 把檢查放在 `get_current_user`。但認證路徑上有**第二道門**：`get_current_session`（`app/core/security.py:313`），它只呼叫 `_decode_access_payload` 就回傳 `(sub, sid)`，刻意不查 DB。三個端點用它：

| 端點 | 當時的防護 |
|---|---|
| `POST /auth/switch-identity` | 同時掛了 `get_current_user` → **有**被檢查 |
| `POST /auth/logout` | 只有 `get_current_session` → **沒有** |
| `POST /auth/logout-all` | 只有 `get_current_session` → **沒有** |

當時的判斷是「登出是冪等的，重複呼叫無害」。**那個判斷是錯的**，因為它只看了「對呼叫者無害」，沒看「對被害者有害」：

一個持有已撤銷 token 的入侵者，可以持續呼叫 `/auth/logout-all`。受害者每次重新登入，都會被那張死 token 立刻踢出去——直到它自然過期（最多 15 分鐘）。也就是說，本票原本要修的問題（撤銷後仍有 15 分鐘的空窗）在這條路徑上不但沒被修掉，還被放大成一個可被主動利用的騷擾手段。

review 時以測試實證：撤銷 → `/users/me` 回 401（token 確實死了），但 `/auth/logout-all` 仍回 204，且受害者剛建立的新 session 被踢掉。同一組測試中 `/auth/switch-identity` 回 401，證明 401 在該環境是可達的——兩個 204 純粹來自漏檢查。

**Decision**：把 `_require_live_session` 放進 `get_current_session`，它多收一個 `redis=Depends(get_redis)` 參數。三個端點都不用改。

**否決的替代方案**：讓 logout / logout-all 改掛 `get_current_user`。語意上一致，但每次登出多一次 DB 查詢 + identity 解析，而 `get_current_session` 存在的理由就是「不碰 DB」；而且它只修了今天這兩個端點，未來任何新端點用了這個 dependency 一樣會漏。**修 dependency 而不是修呼叫端**，是因為問題出在 dependency 的保證不完整，不是出在誰用了它。

**Consequences**：
➕ 一處修好三個端點，未來用到 `get_current_session` 的端點自動被保護。
➕ 仍然沒有 DB 查詢——只多一次 Redis GET，與 ADR-099 對請求路徑的成本評估一致。
➖ **行為變更**：沒有 `sid` 的 token 呼叫 `/auth/logout` 從「204 no-op」變成 401。這是刻意的，理由與 ADR-101 相同——如果「不帶 sid」能繞過檢查，那檢查就不成立。`app/api/v1/endpoints/auth/session.py:163` 的 docstring 已同步更正。
➖ `/auth/switch-identity` 現在一個請求讀兩次 Redis（`get_current_session` 一次、`get_current_user` 一次）。兩次都是同一個 key 的 GET，可忽略；真要消除得引進 request-scoped 快取，成本高於收益（YAGNI）。

> **⚠️ 實作位置已被 ADR-190 推翻（2026-08-30）。** 本 ADR 對威脅的判斷成立，但把檢查放進
> `get_current_session` 讓 `/auth/logout` 變成非冪等（第二次呼叫 401），撞上前端在 401
> 攔截器裡呼叫 logout 的常見寫法。檢查已移到 `logout_all`，攻擊被擋得更徹底（不是回 401，
> 而是根本不執行 revoke）；上面那條「沒有 sid 的 token 呼叫 logout 回 401」的 ⚠️ 也一併撤回。
> **實作以 ADR-190 為準。**

---

### ADR-181 踢人端點明確要求 `Scope.ALL`

**白話**：只要有「編輯使用者」這個權限就能踢人——不管那個權限的範圍寫的是 own 還是 team。現在明確要求範圍必須是 all。

**Date**: 2026-08-25（PR #38 code review 後補）

**Context**：ADR-103 把踢人定為 **checkpoint 1 only**，理由正確：feature 010 之後使用者沒有單一 team，目標身上沒有 team 可供 checkpoint 2 比對。

但 `require_scope` 在不傳 `resource` 時，只要 scope != `NONE` 就放行（`app/services/authz.py:29-38`）。所以 **`own` / `team` / `zone` 全部等同 `all`**。ADR-103 的更正段落寫「實務影響是零，因為現行 seed 裡 `user.edit` 只有 `super_admin` 持有」——seed 屬實，但**這個推論站不住**：

feature 009 的 RBAC 矩陣是**執行期可改**的（`app/schemas/rbac_admin.py:13-16` 接受任何 `Scope` 值寫進任何 role×permission 格子）。哪天為了「讓 team admin 能改隊員資料」把 `user.edit` 設成 `team`，那個角色就同時默默拿到了**踢全站任何人**的能力，而且權限矩陣畫面上完全看不出來。「目前的 seed 長什麼樣」不是端點可以依賴的性質。

review 時以測試實證：`user.edit = own` 的角色踢一個毫無關係的使用者，回 204 且對方確實被登出；對照組（完全沒有 `user.edit`）回 403，證明權限閘門本身是通的。

**Decision**：踢人端點明確要求 `Scope.ALL`，否則 403。

```python
scope = await require_scope(actor, Perm.USER_EDIT, db)
if scope != Scope.ALL:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission Denied.")
```

**否決的替代方案**：新增專用 permission `user.revoke_sessions`。語意最乾淨，但要動 seed、權限矩陣、前端顯示，而且 ADR-103 已經論證過 YAGNI。真的出現「能踢人但不能改帳號」的角色需求時再拆，這個決定不會擋路。

**Consequences**：
➕ 把 ADR-103 那句「這個 resource 上沒有 team 可比對」從**文字裡的假設**變成**程式裡的強制**。
➕ 對現行 seed 零影響：`super_admin` 本來就是 `all`。
➕ 未來真要開放 team admin 踢自己隊員時，會在這三行撞到，被迫先回答「目標的 team 怎麼定義」——那正是 ADR-103 說「那是另一張票」的那個設計決策。不會靜靜地放行。
➖ 這是 ADR-103 的收斂而非推翻：權限沿用 `USER_EDIT` 的決定不變，只是補上範圍條件。

**與 ADR-103 的關係**：ADR-103 仍然有效，本 ADR 只補上它遺漏的範圍條件。依專案慣例（後續 ADR 勝），實作以本 ADR 為準。

---

## PR #38 第二輪 code review 後補（2026-08-30，ADR-189~195）

reviewer 在 PR #38 上留了 7 條，全部屬實。以下七條 ADR 是逐條的裁定，其中 ADR-190 明確**推翻 ADR-180 的實作位置**（依專案慣例：後續 ADR 勝）。

---

### ADR-189 change-password 一併登出「改密碼的那台裝置」，這是預期流程

**白話**：改完密碼你自己也會被登出，要重新登入。這是刻意的，不是 bug。

**Date**: 2026-08-30

**Context**：`change-password` 呼叫 `revoke_all_for_user`（`app/api/v1/endpoints/auth/password.py:57`），revoke 的範圍包含**發出這個請求的那個 session**。ADR-099 之後，呼叫者的 access token 在下一個請求就死了；`revoke_session` 同時刪掉 `refresh:{current_rt_hash}`，所以 refresh token 也沒了——除了重新登入沒有別的路。

本功能之前 access token 還能撐 15 分鐘，把這件事蓋住了。`decisions.md` 只寫了 change-password「自動變成即時生效」，沒有任何一句說明呼叫者也在範圍內，測試也只斷言**別台裝置**拿到 401。

**Decision**：行為維持不變（全部登出，含呼叫者），並且**明文記錄 + 用測試釘住**。使用者裁定：「更改密碼，輸入舊密碼跟新密碼，成功後登出」就是預期流程。

**否決的替代方案**：保留呼叫者的 session（revoke 除了當前 `sid` 以外的全部）。這是多數產品的做法，體感較好，但它把「改密碼」從一個乾淨的「所有既有憑證失效」事件變成有例外的事件——而改密碼最重要的使用情境正是「我懷疑帳號被盜」，此時保留任何一條既有憑證都需要額外論證「那條一定是本人的」。不做。

**Consequences**：
➕ 「改密碼 = 所有既有憑證失效」沒有例外，這條規則不需要附註。
➕ 測試 `test_change_password_signs_the_changing_device_out_as_well` 釘住呼叫者拿 401，這件事不會再靠讀程式碼才知道。
➖ **前端相依**：`Frontend/apps/demo/src/lib/` 目前沒有 401 handling 也沒有 `signOut`，所以今天改完密碼會停在一個壞掉的畫面。這與 PR #38 描述裡「移除後台權限」的前端缺口是**同一張票**，不是新的一張。

---

### ADR-190 live-session 檢查移出 `get_current_session`，改由 `logout_all` 承擔

**白話**：連續按兩次登出，第二次不該回錯誤。但「已經被撤銷的 token」還是不准去踢別人的 session。

**Date**: 2026-08-30

**Context**：ADR-180 把 `_require_live_session` 放進 `get_current_session`，讓 `/auth/logout` 與 `/auth/logout-all` 都擋掉已撤銷的 token。它擋住的攻擊是真的（見 ADR-180），但**位置選錯了**，代價是 `/auth/logout` 變成非冪等：第一次 204，之後每次 401。

`POST /auth/logout` 要的是**終局狀態**「這台裝置已登出」。第二次呼叫時那個狀態已經成立，回 401 是在報告一個沒有發生的失敗。它同時撞上前端最常見的寫法——在 401 攔截器裡呼叫 logout——變成 `401 → logout → 401`。ADR-180 的 ⚠️ 只提了「沒有 sid 的 token」那一種，而這一種影響的是**前端真的持有的 token**。

**Decision**：`get_current_session` 回到「只解 token，不讀 Redis」。改由端點各自決定「session 不在」是什麼意思：

- `logout`：什麼都不做，回 204（`revoke_session` 本來就對不存在的 session 無動作）。
- `logout-all`：**先確認呼叫者自己的 session 還活著**，不活著就什麼都不 revoke，一樣回 204。
- `switch-identity`：本來就自己檢查並回 401（ADR-183），不動。

ADR-180 要擋的攻擊由 `logout_all` 的那個檢查擋下來，而且擋得更徹底——不是「回 401 所以攻擊者知道失敗了」，而是**根本不執行 revoke**。

```python
user_uuid, sid = session
repo = SessionRepository(redis)
if sid is None or await repo.get_session(sid) is None:
    return          # 204，什麼都沒撤
await repo.revoke_all_for_user(user_uuid)
```

**否決的替代方案**：維持 401、把「重複 logout 會 401」寫進文件讓前端自己防。這是把一個伺服器端的語意錯誤外包給每一個 client；而且 401 攔截器呼叫 logout 是預設寫法，不是特例。

**Consequences**：
➕ `/auth/logout`、`/auth/logout-all` 都變成冪等，`401 → logout` 的攔截器寫法可用。
➕ ADR-180 的 ⚠️「沒有 sid 的 token 呼叫 logout 回 401」**撤回**——現在回 204 no-op。這是往回收斂，不會有 client 受影響。
➕ 新測試 `test_a_sid_less_token_cannot_sign_anyone_out_of_anything` 釘住另一半：沒有 sid 的手工 token 也不能透過 `logout-all` 把別人踢下線。
➖ 「未來新端點用了 `get_current_session` 就自動被保護」這個 ADR-180 的好處沒了。代價可接受：這個 dependency 明確只回「token 說它是誰」，需要「而且這個 session 還活著」的端點請用 `get_current_user`——docstring 已寫明。

**與 ADR-180 的關係**：ADR-180 對威脅的判斷完全成立，本 ADR 只搬動實作位置並修掉它造成的冪等性回歸。**實作以本 ADR 為準。**

---

### ADR-191 踢人要留稽核，而且不能踢自己或踢 super_admin

**白話**：管理員把人踢下線這件事，現在會寫進稽核表（誰踢了誰、踢掉幾個）。另外不能踢自己，也不能踢 super_admin。

**Date**: 2026-08-30

**Context**：`POST /admin/users/{uuid}/revoke-sessions` 是整個 admin router 上**唯一不碰任何資料表**的動作（session 在 Redis），所以 audit trigger 不會觸發，稽核表裡一列都沒有。唯一的紀錄是一行 log，而那行 log 只寫了目標、沒寫操作者。結果是：**沒有任何地方記得是誰把人踢下線的**，而且 log 檔活不過一次容器重啟。

這正好是 ADR-181 論證過的情境——RBAC 矩陣執行期可改，所以「改了授權再踢人」這個序列必須事後可重建，而現在不行。

另外沒有任何限制擋住踢自己、踢同儕 admin、踢 super_admin。

**Decision**：三件事一起做。

1. **手寫一列 `AuditLog`**，形狀比照 trigger 寫出來的列：`table_name="users"`、`row_id` = 目標、`user_uuid` = 操作者、`new_values={"revoked_sessions": n}`，`client_ip` / `context` 取自 trigger 讀的同一組 contextvar。`action` 用 **`REVOKE_SESSIONS`** 而非三個 DML 動詞之一——它不是 DML 事件，不該被當成 DML 統計。用 `table_name="users"` + `row_id`= 目標，是為了讓「這個使用者身上發生過什麼」維持一次查詢。
2. **log 行補上操作者**，作為稽核列的維運回聲。
3. **拒絕兩種目標**：踢自己 → 409（那是 `/auth/logout-all`；走 admin capability 只會讓稽核讀起來像是對別人帳號的管理行為）；目標持有 `super_admin` → 403（否則 `user.edit=all` 就足以一次登入踢一次，把平台最高權限永久關在門外）。

**否決的替代方案**：只補 log 不寫 DB。log 檔不是稽核來源，且與本專案「每個 admin 動作都有持久化軌跡」的既有性質不一致。

**Consequences**：
➕ 踢人成為唯一一個「手寫稽核列」的動作，且與 trigger 列同形、同歸因來源。
➕ 踢自己 / 踢 super_admin 由測試釘住。
➖ 服務層現在會 `commit()`（要寫稽核列）。端點必須在呼叫**之前**把 `current_user.uuid` 讀出來——session 是 `expire_on_commit`，commit 之後在 logging 呼叫裡碰 `.uuid` 會觸發 lazy reload 而 `MissingGreenlet`。這個坑已在端點註解裡寫明（與 015 grill 記錄的同一類陷阱）。
➖ `action` 多了一個非 DML 值。任何假設 `action IN ('INSERT','UPDATE','DELETE')` 的查詢會漏掉它——這是刻意的，把它算進 DML 統計才是錯的。

---

### ADR-192 dev 的 Redis 設定對齊 staging（`appendonly` + `noeviction`）

**白話**：開發用的 Redis 之前設成「記憶體不夠就丟掉舊資料、重開就全清空」。功能 014 之後那等於「隨機把使用者登出」。

**Date**: 2026-08-30

**Context**：`docker-compose.yml:20` 跑 `--maxmemory-policy allkeys-lru` 且沒有 volume。ADR-099 之前 `session:{sid}` 只在 `/auth/refresh` 讀，掉了頂多要求重新登入一次；之後它是**每個已認證請求都會讀的認證狀態**。於是：LRU 淘汰掉一把 session key = 當場登出那些人；容器重啟 = 一次登出所有人。

而 fail-closed 的 401 依 ADR-100 是**刻意與無效 token 無法區分**的，所以這種 401 從外面看不出跟真正的撤銷有什麼差別。

`docker-compose.staging.yml:33` 早就是 `--appendonly yes --maxmemory-policy noeviction`，註解寫的正是這個理由；dev 檔沒跟上。

**Decision**：dev 對齊 staging：`--appendonly yes --maxmemory 512mb --maxmemory-policy noeviction`，並掛 `./.redis:/data`（比照同檔 db service 的 bind mount 風格，不引入 named volume）。`.gitignore` 補 `.redis/`。

**Consequences**：
➕ 開發環境重啟不再把所有人登出，省掉一整類「查不出原因的 401」。
➖ 記憶體壓力下 Redis 會回錯誤而不是默默丟資料。這是要的：認證 key 被默默丟掉，比寫入失敗更難查。

---

### ADR-193 `session_is_live` 併回 `get_session`

**白話**：兩個方法內容一模一樣，只留一個。

**Date**: 2026-08-30

**Context**：`session_is_live`（`app/repositories/session_repository.py:144`）的函式體與 `get_session`（同檔 :70）完全相同：`return self._load(await self.redis.get(self.SESSION + sid))`。它 docstring 裡那句用來區分兩者的「Deliberately does NOT catch connection errors」，對 `get_session` 也一樣成立——它也沒有 catch。而 `switch_identity`（`app/api/v1/endpoints/auth/session.py:178`）本來就是用 `get_session` 在問同一個問題。

**Decision**：刪掉 `session_is_live`，`_require_live_session` 改呼叫 `get_session`；`session_is_live` docstring 裡有價值的那兩段（ADR-099 的請求路徑語意、ADR-100 不吞連線錯誤的契約）併進 `get_session`。

**Consequences**：
➕ 一個行為一個名字。兩個同體不同契約的方法遲早會漂移，而改了其中一個不會傳達到另一個的呼叫端。
➕ ADR-190 之後 `get_session` 的呼叫端變多（`logout_all` 也用），單一入口更重要。

---

### ADR-194 踢人路徑的 Redis 故障回 503，不要炸成 500

**白話**：Redis 掛掉時踢人，回一個講得清楚的 503，而不是丟 traceback 的 500。

**Date**: 2026-08-30

**Context**：`app/services/admin.py` 的 `smembers` 與其後的 `revoke_all_for_user` 都沒有保護，Redis 故障時 `RedisError` 直接穿出端點成為未處理的 500。本功能加的**其他每一處** Redis 觸點都是 fail-closed 且有處理的：`_require_live_session` 接住 `RedisError`、回 401、把原因寫進 log（ADR-100）。只有這條沒有。

**Decision**：接住 `RedisError`，記 log，回 **503** 並附 `"no sessions were revoked"`。

選 503 而非 401/500：401 會謊稱是呼叫者的憑證有問題；500 什麼都沒說，且留下「到底撤掉了沒」的歧義。503 說的是事實——什麼都沒撤、值得重試。

**Consequences**：
➕ 這個功能對「Redis 不可用」的回應在所有路徑上一致。
➕ `logout` / `logout-all` 也一併補上同樣的處理（ADR-190 讓它們自己讀 Redis 了）：那裡回 204 等於告訴使用者「你登出了」，而 session store 根本沒收到請求——那是登出端點唯一不能說的謊。

---

### ADR-195 `sid` 也要 pin 到 `act`，不只 pin 到 `sub`

**白話**：切換身分之後，切換前的那張舊 token 立刻失效，不能再用剩下的 15 分鐘切回去。

**Date**: 2026-08-30

**Context**：ADR-101 把 `sid` 釘到 `sub`，但沒釘到 `act`——也就是這張 token 宣稱正在扮演的身分。

`/auth/switch-identity` 用新的 `act` 重新簽一張 access token，並把 `act` 寫進 session 紀錄（ADR-188）。但**被它取代的那張舊 token 帶著同一組 `sid` / `sub`**，所以在請求路徑上照樣通過，直到它自己過期為止（最多 15 分鐘）。

後果有兩個。一是**刻意的降權在檢查點上沒有被執行**：super_admin 切到 team 身分之後，重放舊 token 就把平台權限撿回來了。二是**稽核歸因錯誤**：那段期間做的事會被記在切換前的身分底下。

這不是權限提升——切換本來就只能在使用者已持有的身分之間移動，這也是它在 switch 本身的 review 裡活下來的原因。但 ADR-188 已經表明「切換必須活得比它發出的那張 token 久」（session 存 `act` 正是為了讓後續 refresh 不能默默取消它）；在請求路徑上它卻可以被取消。

**Decision**：`_require_live_session` 多比一行——**session 紀錄是「這個 session 正在扮演哪個身分」的唯一真值來源**，token 與它不符就是過期的 token，回 401。

```python
if session.get("act") != payload.get("act"):
    raise _credentials_exception()
```

**Consequences**：
➕ 切換在「發放」與「檢查」兩端一致。ADR-188 的保證從「refresh 不能取消」擴大到「重放也不能取消」。
➕ 稽核不會再把切換後的行為記在切換前的身分上。
➖ **所有發 token 的路徑都必須讓 session 與 token 的 `act` 一致**。production 路徑本來就一致（`issue_token_pair` 一次寫兩邊、`refresh` 寫回 session、`switch-identity` 兩邊都更新），但 review 時抓到**兩個測試 helper 不一致**：`tests/test_graphql/conftest.py` 與 `tests/test_graphql/test_station_photo.py` 建 session 時沒帶 `act`，token 卻帶了。兩處都已修正——這正是 ADR-105（測試 token 要跟 production 同形，不要讓測試繞過檢查）想避免的漂移。
➖ 前端若同時持有切換前後兩張 token（例如兩個分頁），舊的那張會 401。正確的處理是把 access token 併進已存的 pair（ADR-070 已經寫過這件事）。
