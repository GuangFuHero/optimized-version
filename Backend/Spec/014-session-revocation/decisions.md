# Session Revocation — ADR 全集（ADR-099~105）

**Date**: 2026-08-20
**Feature**: 014-session-revocation
**Status**: 定案，**已實作**（2026-08-20）
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
