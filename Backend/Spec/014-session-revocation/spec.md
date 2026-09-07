# Design: Session Revocation（access token fail-closed）

**Date**: 2026-08-20
**Feature**: 014-session-revocation
**Status**: 定案，**已實作**（2026-08-20；驗收見 `plan.md`）
**Notion**: 補齊功能 →「移除後台權限，回去原有登入狀態」（backend-Popo，08-18~08-22）——本票交付該子票缺的最後一塊
**來源**: `Spec/010-multi-team-membership/decisions.md` 的 ADR-071 撤回時拆出
**Depends on**: `feat/multi-team-membership-backend`（PR #37）。本票改的 `get_current_user` 正是 010 大幅改寫過的函式，基於 `main` 會保證衝突。

---

## 1. 概述

### 現況：撤銷只殺得掉 refresh token

`get_current_user` 解 JWT、撈 user、解析 `act` 身分，**從不檢查這個 token 所屬的 session 是否還活著**（`app/core/security.py:214-236`）。session 只在 `/auth/refresh` 的路徑上被查（`app/repositories/session_repository.py:65` `rotate()`）。

後果是每一條撤銷路徑都留下一個最長 15 分鐘的空窗（`ACCESS_TOKEN_EXPIRE_MINUTES = 15`，`app/core/config.py:24`）：

| 撤銷動作 | 現在的效果 | 空窗 |
|---|---|---|
| `POST /auth/logout`（`app/api/v1/endpoints/auth/session.py:165`） | 刪 session + refresh token | 手上的 access token **仍可用滿 15 分鐘** |
| `POST /auth/logout-all`（`:179`） | 刪該使用者所有 session | 同上，**所有裝置都是** |
| `POST /auth/change-password`（`app/api/v1/endpoints/auth/password.py:57`） | `revoke_all_for_user` | 改密碼後舊裝置還能操作 15 分鐘 |
| `POST /auth/reset-password`（`:153`） | `revoke_all_for_user` | **帳號被盜後重設密碼，攻擊者還有 15 分鐘** |
| 管理員踢人 | **端點不存在** | — |

最後兩列是本票真正的動機。`reset-password` 的使用情境就是「帳號可能已被入侵」，而目前那條路徑撤不掉入侵者手上的 access token。

### 已經成立、本票不必處理的

`Spec/010` 讓「權限與身分」層面的撤銷已是即時的：權限每請求從 DB 解析、不烘進 JWT；`act` 身分若已不存在，一般請求與 `/auth/refresh` 雙路 401（ADR-096）。

**所以本票補的不是「角色變更要多久生效」，而是「怎麼強制讓一個 session 立刻失效」**——前者已經解決，後者還沒有任何機制。

### 目標
- 任何一條撤銷路徑執行後，**下一個請求就 401**，沒有 15 分鐘空窗。
- 管理員能主動終止某個使用者的所有 session。
- Redis 不可用時，拒絕通過認證（不是放行）。

### 非目標
- **改 access token 壽命**。15 分鐘不變——本票讓撤銷即時，壽命就不再是安全參數。
- **每請求刷新 session 的 `last_used_at`**：讀是每請求一次，寫不是（ADR-104）。
- **列出／選擇性終止單一裝置的 session 管理頁**：需要 session 清單 API 與裝置命名，是另一張票。
- **refresh token 機制的任何改動**：`rotate()` 的重用偵測已完整。

---

## 2. 核心設計：每請求驗 session 存在

`get_current_user` 在解出 JWT 之後、撈 user 之前，多做一次 Redis 查詢：

```
token 解碼成功
  → sid = payload["sid"]
  → sid 不存在（None / 缺欄位）        → 401
  → redis 讀 session:{sid}
      ├─ 讀不到                        → 401（已撤銷、或已過 14 天 TTL）
      ├─ 讀得到但 user_uuid ≠ token.sub → 401（防禦深度，見 ADR-101）
      ├─ 讀得到但 act ≠ token.act        → 401（切換身分前的舊 token，見 ADR-195）
      └─ 讀得到且相符                  → 繼續既有流程（撈 user、解析 act）
  → redis 連不上                       → 401（ADR-100）
```

**撤銷不需要新資料結構。** `revoke_session()` 已經在刪 `session:{sid}`（`app/repositories/session_repository.py:106`），`revoke_all_for_user()` 已經在對每個 sid 呼叫它（`:114`）。本票只是讓請求路徑開始「看」這個既有事實，所以**現存的每一條撤銷路徑都自動變成即時生效**，不必逐一改寫。

順帶生效的還有 session 自然過期：session 的 Redis TTL 是 14 天（`REFRESH_TOKEN_EXPIRE_DAYS`），到期後 key 消失，access token 隨之失效。

---

## 3. Redis 不可用時：401

連不上 Redis 就無法判斷 session 是否已被撤銷，兩條路都有代價：放行等於在故障期間讓所有撤銷失效，拒絕等於 Redis 成為認證的單點故障。

**本票選拒絕**（ADR-100）。理由是這條路徑的目的就是「撤銷必須生效」，一個在故障時自動失效的安全機制等於給了攻擊者一個觸發條件。現階段無正式使用者，可用性代價可承受。

**要留下可觀測性**：Redis 故障造成的 401 與「token 無效」的 401 對外回應相同（不洩漏內部狀態），但**必須寫一筆 error log 並帶上原因**，否則 Redis 掛掉時的現象是「所有人突然登不進去且查不出為什麼」。

---

## 4. 邊界

### 4.1 `sid` 缺失的 token → 401

`create_access_token` 的 `sid` 參數可為 `None`（`app/core/security.py:169`），而 `issue_token_pair` 一定會帶（`app/api/v1/endpoints/auth/deps.py:28-30`）。所以正式流程簽出的 token 必有 `sid`；沒有 `sid` 的只可能是測試自己造的、或某條沒走 `issue_token_pair` 的路徑。

**一律 401**（ADR-101）。放行等於留下一個「不帶 sid 就跳過檢查」的繞道。

> **例外：`logout` / `logout-all`（ADR-190）。** 這兩個端點問的是終局狀態「已登出」，沒有 `sid`
> 就是沒有東西可撤，回 204 而非 401。它們不會因此變成繞道：`logout-all` 在真的撤銷之前，
> 仍要求呼叫者自己的 session 活著，所以手工造的 token 一樣踢不動任何人。

### 4.2 GraphQL 路徑必須一起改

`app/graphql/context.py:44` **直接呼叫** `get_current_user(db=db, token=token)`，不經過 FastAPI 的依賴注入。所以：

- 把 redis 做成 `Depends(get_redis)` 參數是不夠的——GraphQL 那一路不會填它。
- `get_redis` 讀的是 `request.app.state.redis`（`app/core/redis.py:6`），而測試的 `client` fixture 只 override 了 `get_redis` 依賴、**沒有設 `app.state.redis`**（`tests/conftest.py:200`）。GraphQL 路徑目前完全沒碰 redis，所以這個落差至今無害；本票一加檢查就會變成 `AttributeError`。

解法見 ADR-102：redis 作為**顯式參數**傳進 `get_current_user`，REST 由 `Depends(get_redis)` 供應，GraphQL context 自己取得後傳入，測試的 override 對兩條路都有效。

### 4.3 `/auth/refresh` 不受影響

refresh 不帶 access token，走的是 `rotate()`，本來就會查 session。

---

## 5. 管理員踢人

新增 `POST /admin/users/{uuid}/revoke-sessions`，效果等同該使用者的 `logout-all`。

`Spec/010` 的 spec.md §7 明列「一般 access token 的撤銷（登出／**踢人**）由 `Spec/014` 提供」，所以踢人在本票範圍內。

- **權限**：`Perm.USER_EDIT`，checkpoint 1 only，且**範圍必須是 `Scope.ALL`**（ADR-103 定權限、ADR-181 補範圍條件——初版寫「沿用既有 scope 判定」，實作時更正為 checkpoint 1 only，2026-08-25 review 再補上 `ALL` 的要求）。
- **回應**：204，並回報撤掉幾個 session 於 log。不回報數量給呼叫端——那會洩漏該使用者有幾台裝置在線。
- **冪等**：對沒有任何 session 的使用者回 204，不是 404。

---

## 6. 逐檔改動

| 檔案 | 改動 |
|---|---|
| `app/repositories/session_repository.py` | 沿用既有的 `get_session(sid) -> dict \| None`；連線失敗不吞，讓例外往上（原本新增的 `session_is_live` 與它同體，已於 ADR-193 併回）|
| `app/core/security.py` | `get_current_user` 增加 redis 參數與 session 檢查；Redis 故障的 log。`get_current_session` 同樣加上（ADR-180，2026-08-25） |
| `app/graphql/context.py` | 取得 redis 並傳入 `get_current_user` |
| `app/api/v1/endpoints/admin.py` | 新增 `POST /users/{uuid}/revoke-sessions` |
| `app/services/admin.py` | 踢人的 use-case 函式 |
| `tests/conftest.py` | `token_for` 改為同時在 Redis 建立對應 session；`client` fixture 設 `app.state.redis` |

**不改**：`session_repository` 的撤銷函式、`logout` / `logout-all` / `change-password` / `reset-password` 四個端點——它們刪 session 的行為已經正確，本票只是讓那個行為開始被看見。

> **2026-08-25 更正**：`logout` / `logout-all` 的**函式本體**確實沒改，但它們依賴的 `get_current_session` 加上了檢查（ADR-180）——原本那兩個端點是撤銷後唯一還打得動的路徑。docstring 一併更正。

> **2026-08-30 再更正**：檢查已從 `get_current_session` 移出（ADR-190）。`logout` 對已消失的
> session 回 204 no-op（冪等），`logout-all` 則先確認呼叫者自己的 session 還活著，否則什麼都不撤。
> ADR-180 要擋的攻擊仍被擋住，而且擋得更徹底——不是回 401，是根本不執行 revoke。
> 這兩個端點的**函式本體這次真的改了**。

---

## 7. 效能

每個已認證請求多一次 Redis 往返。同一個請求內只查一次（`get_current_user` 每請求執行一次），不需要額外的 request-scoped 快取——快取一個「本來就只讀一次」的值沒有意義。

相較之下，同一條路徑上已經有的 DB 查詢是：撈 user 一次、解析 `act` 身分一次、權限解析一次。多一次 Redis `EXISTS`/`GET` 在這個數量級下不是瓶頸。

---

## 8. 測試計畫

| 類型 | 案例 |
|---|---|
| 安全 | `logout` 後，**同一把 access token** 立刻 401（本票的核心斷言） |
| 安全 | `logout-all` 後，**另一台裝置**的 access token 立刻 401 |
| 安全 | `change-password` 後，舊 access token 立刻 401 |
| 安全 | `reset-password` 後，舊 access token 立刻 401 |
| 安全 | 管理員踢人後，被踢者的 access token 立刻 401 |
| 安全 | 沒有 `sid` 的 token → 401（`logout` / `logout-all` 除外：204 no-op，ADR-190）|
| 安全 | `sid` 存在但 session 的 `user_uuid` 與 token 的 `sub` 不符 → 401 |
| 安全 | Redis 不可用 → 401（不是 200），且留下 error log |
| 安全 | **GraphQL 路徑同樣受檢**：logout 後的 token 打 GraphQL 也 401 |
| 功能 | 未撤銷的 session 正常通過，且不因多一次查詢而改變任何既有行為 |
| 安全 | 切換身分後，**切換前的那把 access token** 立刻 401（ADR-195）|
| 安全 | 已撤銷的 token 打 `logout-all` → **204 但什麼都不撤**，使用者新開的 session 不受影響（ADR-190）|
| 安全 | 管理員踢自己 → 409；踢 super_admin → 403（ADR-191）|
| 安全 | 踢人留下一列 `AuditLog`（`action=REVOKE_SESSIONS`，含 actor）（ADR-191）|
| 功能 | 連續兩次 `logout` → 204 / 204（冪等，ADR-190）|
| 功能 | Redis 不可用時的 `logout` / 踢人 → 503（不是 204、不是 500）（ADR-194）|
| 功能 | session 的 Redis key 過期後 → 401 |
| 功能 | 踢一個沒有 session 的使用者 → 204（冪等） |
| 權限 | 無 `USER_EDIT` 者呼叫踢人 → 403 |
| 權限 | 持 `USER_EDIT` 但範圍非 `all`（own/team/gov/ngo/zone）呼叫踢人 → 403（ADR-181） |
| 安全 | 已撤銷的 token 呼叫 `logout` / `logout-all` → 401（ADR-180） |
| 安全 | 沒有 `sid` 的 token 呼叫 `logout` → 401（不再是 no-op，ADR-180） |
| 迴歸 | `/auth/refresh` 行為不變（含重用偵測） |
| 迴歸 | 全套件——**預期需要大量修改既有測試**，見 `plan.md` |

---

## 9. Notion 票面對照

Notion 子票「移除後台權限，回去原有登入狀態」的頁面內文與留言皆為空，票的全部內容就是標題。標題的兩個子句拆開來看：

| 子句 | 交付方式 | 狀態 |
|---|---|---|
| 移除後台權限 | 權限每請求從 DB 解析、不烘進 JWT，撤掉授予下一個請求即失效（010）；再加上本票的強制終止能力 | ✅ 後端完成 |
| 回去原有登入狀態 | 身分失效 → 一般請求與 refresh 雙路 401 → **被踢出** → 重新登入後落在 platform 身分，持有什麼就看到什麼 | ⚠️ 後端完成，**前端未動** |

> **票主確認（2026-08-20）**：「回去原有登入狀態」的原意是「**沒有後台權限要先被踢出，然後他再次登入時看他還有哪些權限**」——不是「維持登入、靜默降權」。這與 ADR-096 的選擇一致，該 ADR 的決定據此確認，不需改動。

### ⚠️ 這張 Notion 票還不能收：前端缺 401 處理

後端會回 401，但 `Frontend/apps/demo/src/lib/` **整個目錄沒有任何 401 處理，也沒有 signOut**。所以今天真的撤掉某人的後台權限，他的觀感不是「被踢出去、重新登入」，而是**卡在一個壞掉的畫面**——既沒降權也沒登出。

「先被踢出」這個行為在前端補上 401 → signOut 之前是不可見的。`Spec/010` 的 spec.md「前端契約」第 2 點已經列了這件事，但那屬於另一張票。**本票（與 010）交付的是後端能力；Notion 那張子票要真的收掉，還差前端這一塊。**

---

## 10. 與 `Spec/010` 的關係

010 的 ADR-069 刻意讓本票**不成為它的前置**：`act` 簽在 JWT 而非存在 session，正是為了不依賴「每請求讀 session」。兩票各自獨立落地。

反過來，本票落地後 010 的 ADR-069 取捨有一部分被補上：`act` 在 JWT 造成的「舊 token 並存視窗」，在 session 被撤銷的情況下不再存在（session 一消失，帶舊 `act` 的 token 也一起失效）。**但身分切換本身仍會有並存視窗**——切換簽的是新 token、舊 token 的 session 沒有被撤銷，所以舊身分的 token 仍可用到過期。那是 ADR-069 明列並接受的取捨，本票不改變它。
