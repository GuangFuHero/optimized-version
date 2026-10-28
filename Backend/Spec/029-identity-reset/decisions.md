# Decisions: 029-identity-reset

ADR 全域連號，本 Spec 從 **ADR-402** 開始（2026-10-28 掃描所有本機與遠端分支，最大號 401）。
Spec 編號 029：`Backend/Spec/` 在所有分支最大是 028。
commit 前再掃一次，避免與其他 open PR 撞號。

---

> **2026-10-28 拆分**：原本本 Spec 也含停用帳號（ADR-406～410、416）。Carol 確定停用帳號暫時不做，
> 那部分移到分支 `feat/account-disable` 保留，這些 ADR 號碼保留給它，本 Spec 不使用。

---

## ADR-402：身分失效時不登出，session 改回預設身分；部分取代 ADR-096、ADR-328、ADR-357

**Date**: 2026-10-28　**Status**: Accepted（Popo，10/28；前端 10/28 提問第 6 項）

**背景**：ADR-096 規定身分失效時一般請求和 refresh 都回 401，結果就是登出。
當時也考慮過「自動退回 platform 身分」，否決理由是**靜默降權**：當事人不知道自己的權限變了。
ADR-328 把這個情況命名為 `identity_revoked` 並清 cookie；ADR-357 把團隊暫停也歸進同一條路。

前端回報實際情況：一個同時在兩隊的人，其中一隊被暫停，他就被踢回登入頁，沒有任何說明，
明明他還有另一隊的身分。10/28 查證，會這樣的不只團隊暫停，共有五種操作（spec「會讓身分失效的五種操作」）。

**決定**：
- 五種操作造成的身分失效，一律**不登出**：後端把 session 的身分改成預設身分（`default_for_user`），
  回 401 `identity_reset`，不清 cookie。
- **當下那個請求不執行**。
- `identity_revoked` 保留在 `ErrorCode` 裡，後端不再回。

**為什麼這次不算「靜默降權」**：
1. 不是靜默：一定會先收到 `identity_reset`，前端必須顯示提示，回應裡帶著被收回的是哪個身分（ADR-404）。
2. 不會用別的身分偷偷做事：當下那個請求不執行，使用者看到提示後自己決定要不要重做。

ADR-096 否決的是「繼續執行、權限默默變小」，這兩點都避開了。

**取代範圍**：
- ADR-096 的 Decision 表（兩路都 401 → 登出）：對這五種操作不再適用。「驗證在 `rotate()` 之前」的硬性約束**仍然有效**。
- ADR-328 表格 `identity_revoked` 那一列：改由 `identity_reset` 取代。
- ADR-357 第 4 點表格 `suspended` 那一列「a token acting as it answers 401, as a revoked identity does」：
  改成照本 ADR。其他（不能切換到暫停的團隊、不能申請、邀請 404、可恢復）不變。

---

## ADR-403：refresh 遇到失效身分，改 session 後回 `identity_reset`，不 rotate

**Date**: 2026-10-28　**Status**: Accepted

**背景**：使用者可能先打到 refresh（access token 剛好過期），而不是一般請求。
如果 refresh 直接換發預設身分的 token，瀏覽器版的 refresh 回 204、沒有內容，前端不會知道身分被收回，
提示就不會出現。

**決定**：
- refresh 遇到失效身分：把 session 的身分改成預設身分，回 401 `identity_reset`（內容同 ADR-404），**不 rotate**。
- 客戶端不帶身分再 refresh 一次，就會正常換發。
- 判斷在 `rotate()` 之前（ADR-096 約束），refresh token 還沒燒掉，第二次用同一把是正常的。
- Bearer 客戶端在 body 指定了失效身分時，也是同樣處理；它必須丟掉記住的身分再 refresh，否則會一直收到 `identity_reset`。

**理由**：不管先打到哪一條路，收回後的第一個回應都是 `identity_reset`，前端只要處理一種情況。

---

## ADR-404：`identity_reset` 不清 cookie，回應帶被收回的身分

**Date**: 2026-10-28　**Status**: Accepted

**決定**：
- `identity_reset` 不加進 `app/main.py::_SIGNED_OUT`，cookie 驗證的請求收到時不清 cookie。
- 回應多一個 `revoked_identity: {"role": str | null, "team": str | null}`：token（或 session）原本身分的角色名稱、團隊名稱。
  名稱查不到（角色或團隊已刪除）時該欄位為 `null`。用 `ApiError.extra` 帶。
- 帶 `WWW-Authenticate: Bearer`，跟其他 401 一致。

**理由**：cookie 要留給下一步的 refresh。前端要知道被收回的是哪個身分，才寫得出有用的提示。

---

## ADR-405：只有團隊暫停發通知，對象是該隊全員

**Date**: 2026-10-28　**Status**: Accepted（Popo，10/28）

**背景**：ADR-357 暫停團隊時只通知被退回申請的申請人，隊員什麼都收不到。
五種收回操作都要通知的話，要改五個地方。

**決定**：
- 只有 `set_team_status` 改成 `suspended` 時發通知，類型 `team_suspended`。
- 對象：在該隊持有任何團隊角色的人（含管理員），每人一則。這些人就是受影響的人，不另外「通知個人」，不會重複。
- commit 後發送，失敗只記 log，不回滾。
- 其他四種收回操作、團隊恢復，都不發通知。

---

## ADR-415：refresh 只能用現役 token 改 session，只回 session 自己的身分名稱

**Date**: 2026-10-28　**Status**: Accepted（Popo，10/28 資安檢查後）

**背景**：資安檢查時實測：refresh token 換發後，舊的那一把在 Redis 的紀錄要等過期才消失
（`SessionRepository.rotate()` 只寫新紀錄）。ADR-403 的「改回預設身分」寫在 `rotate()` 之前，結果：

1. 拿已經換發過的舊 token 打 `POST /auth/refresh`，就能把對方的 session 改成預設身分，
   `rotate()` 的被盜偵測完全沒有被觸發。
2. `identity` 是呼叫端自己帶的。帶別隊的 uuid，回應的 `revoked_identity` 就是那一隊的名稱，
   等於拿 uuid 查隊名，繞過 `team.view`。不用偷 token，自己的 refresh token 就能查。

main 上同樣的請求只回 `identity_revoked`，不寫入、不帶名稱。

**決定**：refresh 遇到解析不到的身分時：
- **只有 session 自己的身分失效**（呼叫端帶的就是它，或 session 的身分本身解析不到），
  **而且送來的是 session 目前那一把 refresh token**（`SessionRepository.is_current`），才改 session、才回名稱，
  名稱取自 session 的身分。
- 其他情況（舊 token、呼叫端帶的身分不是 session 的）一律回 `identity_reset`，`revoked_identity` 兩欄都是 `null`，
  不寫入任何東西。
- 一般請求的路徑不變：名稱取自簽過章的 token，呼叫端改不了。

**理由**：改 session 和回名稱都只發生在「現役 token、session 自己的身分」，攻擊者自己能控制的輸入都碰不到。
舊 token 留給 `rotate()` 判斷。

---

