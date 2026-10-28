# Design: 身分收回不登出 Identity Reset

**Date**: 2026-10-28
**Feature**: 029-identity-reset
**Status**：設計中，尚未實作。
**Base**: `main` @ `48c3edaaf`，分支 `feat/identity-reset`
**來源**：前端 10/28 對後台「團隊／成員與權限」的提問第 6 項。
**Decisions**: `decisions.md`（ADR-402～405；資安檢查後補 ADR-415）
**部分取代**：ADR-096（Spec 010）、ADR-328（Spec 023）、ADR-357 第 4 點（Spec 026）。

## 概述

**身分被收回時不登出。** 現在使用者正在用的身分一被收回（例如他的團隊被暫停），
下一個請求就回 401 `identity_revoked`、清掉 cookie，人被踢回登入頁，沒有任何說明。
改成：把他的登入改回**預設身分**，回一個新的錯誤碼讓前端顯示提示，**不登出**。

> 2026-10-28：本 Spec 原本也含停用帳號（006 FR-050／051）。Carol 確定暫時不做，那部分移到分支
> `feat/account-disable` 保留（ADR-406～410、416 的號碼也留給它）。之後要做時，停用帳號會是
> 身分收回的唯一例外：被停用的人照樣登出。

「預設身分」就是重新登入時會落在的身分，一般是平台角色 `user`（ADR-069、ADR-290）。
在後台，請求帶 `X-WG-Realm: admin` 時，`user` 會自動換成他手上第一個後台身分（ADR-329），
所以一個同時在甲隊、乙隊的人，甲隊被暫停後，後台會自動改用乙隊的身分。

```
例：小明同時是甲隊、乙隊的成員，正在用「甲隊成員」身分

超管暫停甲隊
  └ 甲隊全員收到通知「甲隊已暫停」

小明的下一個請求（token 還是甲隊身分）
  ├ 現在：401 identity_revoked → 清 cookie → 跳登入頁
  └ 改後：session 改回預設身分 → 401 identity_reset（不清 cookie）→ 這個請求不執行
          前端 refresh → 拿到預設身分的 token → 後台自動用乙隊身分 → 顯示「你的甲隊成員身分已被收回」
```

## main 上的現況（2026-10-28 查證，@48c3edaaf）

| 項目 | 現況 | 位置 |
|---|---|---|
| 一般請求遇到失效身分 | 回 401 `identity_revoked` | `app/core/security.py::get_current_user` |
| refresh 遇到失效身分 | 回 401 `identity_revoked`，在 `rotate()` 之前判斷 | `app/services/auth_session.py::refresh_session` |
| `identity_revoked` 清 cookie | 在 `_SIGNED_OUT` 裡 | `app/main.py::_SIGNED_OUT`、`api_error_handler` |
| 身分怎麼判定失效 | 授予不存在、團隊被軟刪除、團隊不是 `active` | `app/repositories/active_identity_repository.py::_select_identities` |
| 團隊暫停 | 只改狀態、退回待審申請、通知那些申請人；**隊員不會收到通知** | `app/services/admin.py::set_team_status` |
| 停用帳號 | **沒有**。`users` 沒有任何停用欄位，所有遠端分支也沒有 | `app/models/auth.py::User` |
| 強制登出 | `POST /admin/users/{uuid}/revoke-sessions`，踢掉後馬上能再登入；不能對超管做 | `app/services/admin.py::revoke_user_sessions` |
| 三種登入方式 | 帳密驗過後都會呼叫 `record_login` | `endpoints/auth/session.py::login`、`endpoints/auth/browser_session.py`（密碼）、`endpoints/auth/oauth.py`（Google／LINE） |
| 依使用者踢掉所有登入 | 已有 | `app/repositories/session_repository.py::revoke_all_for_user` |

### 會讓身分失效的五種操作

| # | 操作 | 位置 |
|---|---|---|
| 1 | 團隊被暫停 | `POST /admin/teams/{uuid}/status` |
| 2 | 被移出團隊 | `DELETE /admin/teams/{uuid}/members/{user_uuid}` |
| 3 | 平台角色被換掉（例如稽核員改回 `user`） | `POST /admin/users/{uuid}/role` |
| 4 | 單一角色被撤銷 | `DELETE /rbac/users/{uuid}/role/{role_uuid}` |
| 5 | 角色整個被刪除 | `DELETE /rbac/roles/{uuid}` |

團隊角色的 `member` → `admin` 是先刪後加（ADR-096），舊的那筆消失，所以也算第 4 種。

## 目標

- 五種操作造成的身分失效，都**不登出**，改回預設身分，前端能顯示提示（ADR-402、403、404）。
- 團隊暫停時，該隊全員收到通知（ADR-405）。

## 非目標

- **五種操作中，只有團隊暫停發通知**。其他四種不發，只靠前端收到錯誤碼時的提示（ADR-405）。
- **團隊恢復不發通知**。
- **不做團隊內暫停單一成員**（10/28 決定不做）。
- **不做停用帳號**（006 FR-050／051）：Carol 10/28 確定暫時不做，見概述。
- **不改「使用者自己切換身分」**：本來就不會登出（`POST /auth/session/identity`）。
- **不改其他強制登出**：改密碼、設定或重設密碼、解除綁定 Google／LINE、登出所有裝置、管理員強制登出，照舊登出所有裝置。
- **不處理前端**：交接說明寫在 plan。

---

## 1. 身分收回：一般請求（ADR-402、404）

`get_current_user` 在 token 的身分查不到時：

- 查這個帳號的預設身分（`default_for_user`），寫進 session（`SessionRepository.set_identity`）。
- 回 **401 `identity_reset`**，`detail` 為 `"This identity is no longer yours"`。
- 帶 `WWW-Authenticate: Bearer`。
- **這個請求不執行**：不會用預設身分去做使用者原本想用團隊身分做的事。

回應內容：

```json
{
  "detail": "This identity is no longer yours",
  "code": "identity_reset",
  "revoked_identity": {"role": "member", "team": "甲隊"}
}
```

`revoked_identity` 是 token 原本那個身分的角色名稱和團隊名稱，讓前端可以寫出「你的甲隊成員身分已被收回」。
角色或團隊已經被刪掉、查不到名稱時，對應欄位是 `null`。

**不清 cookie**：`identity_reset` 不在 `_SIGNED_OUT` 裡。cookie 要留著給下一步的 refresh 用。

**之後的請求**：session 的身分已經改了，舊 token 的身分跟 session 對不上，
其他分頁或並行請求會收到既有的 `access_token_stale`，前端照常 refresh，不會再收到 `identity_reset`。
所以每次收回，提示只會出現一次。

## 2. 身分收回：refresh（ADR-403）

`refresh_session` 在 session 的身分（或呼叫端指定的身分）查不到時：

1. 把 session 的身分改成預設身分，回 **401 `identity_reset`**（內容同 §1），**不 rotate**。
2. 客戶端**不帶身分**再 refresh 一次 → session 的身分現在是預設身分，正常換發。

判斷仍然放在 `rotate()` 之前（ADR-096 的硬性約束不變）：還沒燒掉 refresh token，所以第二次 refresh 拿同一把 token 是正常的，
不會被當成重複使用。

**Bearer 客戶端**（`POST /auth/refresh` 帶 `identity`）：收到 `identity_reset` 後要**丟掉自己記住的身分**，
第二次 refresh 不帶 `identity`。帶著同一個已失效的身分重試，會一直收到 `identity_reset`。

**瀏覽器**（`POST /auth/session/refresh`）不能指定身分，只看 session，第二次 refresh 一定成功。

**只有 session 自己的身分失效、而且是現役的 refresh token，才會改 session、才會回名稱**（ADR-415）：

| 情況 | 回應 | 改 session | `revoked_identity` |
|---|---|---|---|
| 現役 token，session 的身分失效 | 401 `identity_reset` | 改成預設身分 | 那個身分的角色、團隊名稱 |
| 現役 token，session 的身分還在，呼叫端自己帶的 `identity` 失效（或根本是別隊的） | 401 `identity_reset` | 不改 | 都是 `null` |
| 已經換發過的舊 token | 交給 `rotate()`：寬限期內拿到新 token，超過寬限期判定為盜用、撤銷整個 session | 寬限期內：session 的身分還在就保留，失效才改成預設 | — |

舊 token 在 Redis 裡的紀錄要等過期才消失。如果舊 token 也能改 session、帶出名稱，拿到舊 token 的人就能把對方的
身分改掉、拿任意團隊 uuid 查隊名（2026-10-28 實測）。所以舊 token 一律交給 `rotate()`，跟沒有身分失效時一樣判斷
它是不是被盜用；呼叫端帶的 `identity` 對舊 token 不起作用。

改 session 時如果 Redis 連不上，回 **503 `session_store_unavailable`**，不清 cookie（跟 ADR-328 第 3 點一致）。
身分仍然是失效的，Redis 恢復後的下一個請求會再走一次這個流程。

## 3. 團隊暫停通知（ADR-405）

`set_team_status` 改成 `suspended` 時，commit 之後發通知，照既有寫法：失敗只記 log，不回滾暫停。

| 類型 | 對象 | 標題 | 內容 |
|---|---|---|---|
| `team_suspended` | 在該隊持有任何團隊角色的人（含管理員），每人一則 | 「<團隊名稱>」已暫停 | 「你在「<團隊名稱>」的身分暫時無法使用，恢復後會自動回來。」 |

- `ref_type = "team"`、`ref_uuid` = 團隊。
- 操作的超管本人不收（`NotificationService.dispatch` 本來就會排除 actor）。
- 一個人在同一隊持有多個角色，只收一則。
- 原本就退回待審申請、通知申請人的部分不變（`role_request_rejected`）。申請人不是隊員，不會重複。
- 恢復（`active`）不發通知。

## 4. 錯誤碼總覽（更新 ADR-328 的表）

| code | HTTP | 什麼時候 | 客戶端要做什麼 | 清 cookie |
|---|---|---|---|---|
| `identity_reset`（新） | 401 | token 或 session 的身分已失效，session 已改回預設身分 | 丟掉記住的身分 → 不帶身分 refresh → 顯示提示；**不要自動重送原本的請求** | 否 |
| `session_store_unavailable`（既有） | 503 | 改回預設身分時 Redis 連不上 | 稍後重試，不要當成登出 | 否 |
| `identity_revoked` | 401 | **後端不再回這個碼**。保留定義，讓舊前端不會壞 | — | 是 |

## 5. 邊界情況

- **身分收回和自己切換身分同時發生**：兩邊都寫 session 的身分，後寫的贏。
  最壞的情況是剛切換好的身分被改回預設，使用者再切一次即可。不加鎖。
- **`member` → `admin`（先刪後加）**：舊身分消失 → `identity_reset` → 回到預設身分，要自己切到新的 `admin` 身分。
  跟現在比，從「被登出」變成「留在站上」。
- **帳號沒有任何平台角色**（ADR-185 讓 API 做不到，只防萬一）：預設身分是 `None`，session 寫成沒有身分，
  跟沒有 `act` 的舊 token 走同一條路。
- **後台、帳號只剩 `user`**：refresh 後後台回 403 `back_office_identity_required`（既有行為），
  前端顯示「這個帳號還沒有管理權限」頁，不登出。
