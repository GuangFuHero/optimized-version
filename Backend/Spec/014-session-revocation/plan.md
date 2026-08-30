# Session Revocation — Implementation Plan

**Goal:** 讓每一條既有的撤銷路徑（logout、logout-all、改密碼、重設密碼、管理員踢人）在下一個請求就生效，消掉目前最長 15 分鐘的空窗。

**Architecture:** `get_current_user` 在解出 JWT 後多查一次 `session:{sid}`，讀不到就 401。撤銷端不需要任何改動——它們早就在刪那個 key，本票只是讓請求路徑開始看它。

**Tech Stack:** FastAPI, Strawberry GraphQL, SQLAlchemy async, PostgreSQL, Redis, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/014-session-revocation/spec.md`（ADR-099~105）

**Branch:** `feat/session-revocation-backend`（off `feat/multi-team-membership-backend`，**不是 off main**）

---

## Global Constraints

- **不動撤銷端。** `revoke_session()` / `revoke_all_for_user()` 與四個呼叫它們的端點行為已正確，本票對它們應是零 diff。改到它們就代表設計理解錯了。
- **不動 access token 壽命與 refresh 機制。**
- **不新增 permission、不改 seed**（ADR-103）。
- **不做無 migration 之外的資料變更。** 本票完全不碰 PostgreSQL。
- **PR 依賴 #37。** 基底是 010 的分支，010 未合併前本票不能發 PR。

## 範圍

| 納入 | 排除（明確不做） |
|---|---|
| 每請求 `session:{sid}` 存在性檢查 | denylist（ADR-099 否決） |
| Redis 故障 → 401 + error log | fail-open 降級與切換開關（ADR-100 否決） |
| 無 `sid` → 401；`user_uuid` 與 `sub` 比對 | 改 access token 壽命 |
| GraphQL 路徑同步受檢 | session 清單 / 單一裝置管理頁 |
| `POST /admin/users/{uuid}/revoke-sessions` | 專用的 `user.revoke_sessions` permission（ADR-103） |
| `conftest` 的 `token_for` 改為同時建 session | 測試環境跳過檢查（ADR-105 否決） |

---

## Task 順序的關鍵

**Task 2（測試基礎設施）必須排在 Task 3（加檢查）之前。** 反過來的話，加上檢查的那一刻全套件會有數百個測試同時變紅，而你分不清哪些是「預期中的 token 沒 session」、哪些是真的踩到了 bug。先讓 `token_for` 產出帶 session 的 token，套件維持全綠，再加檢查——那時剩下的紅燈才有診斷價值。

---

## Task 1: `session_is_live`

**Files:** Modify `app/repositories/session_repository.py`；Create `tests/test_session_revocation.py`

- [x] 新增查詢函式，讀不到回 `None`，連線失敗**讓例外往上拋**（不要吞成 `None`——那會把 Redis 故障偽裝成「session 已撤銷」，ADR-100 要的 log 就沒有原因可寫）

```python
async def session_is_live(self, sid: str) -> dict | None:
    """Return the session record if it is still live, else None.

    Deliberately does NOT catch connection errors: a Redis outage and a revoked session
    are different things, and the caller must be able to tell them apart (ADR-100).
    """
    return self._load(await self.redis.get(self.SESSION + sid))
```

**為什麼回記錄而不是 bool**：ADR-101 要比對 `user_uuid`，所以呼叫端需要記錄本身。回 bool 就得再讀一次。

## Task 2: 測試基礎設施

**Files:** Modify `tests/conftest.py`

- [x] `token_for` 改為 async 並建立真的 session
- [x] `auth_headers_for` 跟著改 async
- [x] `client` fixture 補上 `app.state.redis`（ADR-102）
- [x] 逐一修 13 個檔案裡直呼 `create_access_token` 的 30 處

```python
async def token_for(redis, user_uuid, role, team=None) -> str:
    """Mint an access token backed by a real session (feature 014).

    Production tokens always name a session, and `get_current_user` refuses one whose
    session it cannot find (ADR-099). A token minted without a session therefore
    authenticates nothing — so tests mint theirs the same way production does.
    """
    from app.core.identity import encode_act

    sid, _ = await SessionRepository(redis).create_session(str(user_uuid), "test")
    act = encode_act(str(role.uuid), str(team.uuid) if team is not None else None)
    return create_access_token(data={"sub": str(user_uuid)}, sid=sid, act=act)
```

```python
# client fixture — GraphQL reads redis off app.state, not off the dependency (ADR-102)
app.state.redis = redis
```

**這一步的工作量被 010 大幅降低了。** `token_for` / `auth_headers_for` 是 010 才引入的集中 helper，多數測試已經在用；真正要逐一處理的是還在直呼 `create_access_token` 的地方。開工第一件事是先數清楚：

```bash
grep -rn "create_access_token" tests/ | grep -v conftest.py
```

**改成 async 會波及呼叫端的 fixture 形狀**——若某些同步 fixture 用了 `auth_headers_for`，它們也要變 async。這是預期成本，不是設計出錯。

## Task 3: 請求路徑加檢查（REST）

**Files:** Modify `app/core/security.py`

- [x] `get_current_user` 增加 `redis` 參數（`Depends(get_redis)`）
- [x] 解碼後、撈 user 前插入檢查
- [x] 無 `sid` → 401；session 不存在 → 401；`user_uuid` 不符 → 401

```python
payload = _decode_access_payload(token)
sid = payload.get("sid")
# A token that names no session cannot be checked against one, and the only tokens
# without a sid are ones that did not come from issue_token_pair. Refusing them keeps
# "omit the sid to skip the check" from being a way around this (ADR-101).
if not sid:
    raise _credentials_exception()
session = await SessionRepository(redis).session_is_live(sid)
if session is None or session["user_uuid"] != payload["sub"]:
    raise _credentials_exception()
```

**檢查放在 `_decode_access_payload` 之後、DB 查詢之前**：撤銷過的 token 不該再花一次 DB 往返。

**`get_current_session`（`app/core/security.py:264`）不加檢查**：它只服務 logout，而 logout 對已消失的 session 是 no-op，加檢查只會讓「登出兩次」變成 401。冪等的東西不該 fail-closed。

## Task 4: GraphQL 路徑

**Files:** Modify `app/graphql/context.py`

- [x] 從 `request.app.state.redis` 取得 client，顯式傳入 `get_current_user`

```python
user = await get_current_user(db=db, token=token, redis=request.app.state.redis)
```

**這一步不能跳過。** GraphQL 是這個後端的主要查詢介面，漏掉它等於撤銷只對 REST 生效——而那正是最難察覺的一種半成品。測試計畫裡「logout 後打 GraphQL 也 401」是專門釘住這條的。

## Task 5: Redis 故障 → 401 + log

**Files:** Modify `app/core/security.py`

- [x] 包住 Redis 呼叫，`RedisError` 轉 401
- [x] **error log 帶原因**，對外回應與一般 401 不可區分

```python
try:
    session = await SessionRepository(redis).session_is_live(sid)
except RedisError:
    # Fail closed (ADR-100). The response is indistinguishable from an invalid token on
    # purpose, so this log is the ONLY way anyone finds out why every request started
    # returning 401.
    logger.exception("session check failed: refusing the request because Redis is unreachable")
    raise _credentials_exception() from None
```

**測法**：用一個會拋 `RedisError` 的假 client 替換 `app.dependency_overrides[get_redis]`，斷言 401 **且** log 有記錄（`caplog`）。只斷言 401 是不夠的——沒有 log 的 fail-closed 在故障當下是查不出來的。

## Task 6: 踢人端點

**Files:** Modify `app/services/admin.py`、`app/api/v1/endpoints/admin.py`

- [x] service：`revoke_user_sessions(db, redis, *, actor, target_uuid)`，先確認 target 存在（404）、再 `require_scope`、再 `revoke_all_for_user`
- [x] endpoint：`POST /users/{uuid}/revoke-sessions`，`Perm.USER_EDIT`，回 204
- [x] 撤銷數量寫 log，不回給呼叫端

**scope 檢查沿用 `require_scope`**，與 admin.py 其餘寫入動作同形——不要自己寫一套 team 比對，那是 `Spec/010` 之後最容易寫錯的地方。

## Task 7: 全套件 + Docker 驗收

- [x] `uv run pytest -q` → **516 passed / 0 failed**（baseline 501 + 本票 15）
- [x] code review 修補後（2026-08-25）：**524 passed / 0 failed**（再 +8，見 Task 8）
- [x] `uv run ruff check` 對本票改動的 7 個檔案全綠
- [x] **Docker 完整驗證通過**（2026-08-20，實跑；細節見下）
- [ ] 回報使用者，由使用者決定是否發 PR（PR 需等 #37 先合）

### Docker 驗收實測

真的起容器、真的註冊登入、真的拿同一把 token 前後比對：

| 檢查 | 結果 |
|---|---|
| logout 前 REST `/users/me` / GraphQL | 200 / 200 |
| `POST /auth/logout` | 204 |
| **logout 後，同一把 token** REST / GraphQL | **401 / 401** |
| 匿名 GraphQL 查詢 | 200（Guest 不受影響） |
| Redis 停掉後的已認證請求 | **401**，且 log 留下 `refusing the request: Redis (the session store) is unreachable` |
| Redis 復原後 | 200 |
| admin 踢人 → 被踢者下一個請求 | 204 → **401**；admin 自己不受影響（200） |
| 非管理員呼叫踢人端點 | 403 |
| 踢人的數量 | 只進 log（`revoked 3 session(s) for user …`），回應是 204 無 body |

**驗證用的是一次性資料庫，沒有動到 dev DB。** dev DB 的 `alembic_version` 停在別的分支留下的 revision（`f2b7c9d4e0a3`），`alembic upgrade head` 會 `Can't locate revision`。與其修別人的 dev DB，這次另建 `disaster_rescue_dockerverify` 跑 migration + seed，驗完 drop 掉。開發時要在 dev DB 上跑這個分支，得先自行處理那個 revision。

```bash
export TEST_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5433/disaster_rescue_test"
export TEST_ADMIN_DB_URL="postgresql+asyncpg://postgres:postgres@localhost:5433/postgres"
uv run pytest -q
```

---

## 開工前先確認

1. **#37 是否已合併。** 若已合併，基底改成 `main` 並 rebase。
2. **切分支後先 DROP test DB。** 2026-08-20 從 012 的分支切過來時實際踩到：`tests/test_graphql` 出現 96 個 error，訊息是 `column "team_uuid" of relation "user_role_assign" does not exist`——表停在上一個分支的 schema。conftest 每個測試都 `drop_all` + `create_all`（`tests/conftest.py:87-88`），照理不該發生，所以**根因未查清**；但 DROP 掉整個 test DB 讓它重建可以確實解決，重跑後 131 passed。看到大量 `UndefinedColumnError` 時先做這件事，不要花時間 debug 測試：

```bash
docker exec backend-db-1 psql -U postgres -c "DROP DATABASE IF EXISTS disaster_rescue_test;"
```

3. **baseline 是全綠。** 2026-08-20 在本分支的基底（`feat/multi-team-membership-backend`）實跑 `uv run pytest -q` → **501 passed / 0 failed**，`tests/test_graphql/` 131 passed。所以本票落地後出現的每一個紅燈都是本票造成的，沒有需要事先扣掉的既有失敗。
4. **Redis 測試用的是 db 15 的真 redis**（`tests/conftest.py:48`），不是 fakeredis——所以 session 的建立與撤銷在測試裡都是真的，這對本票是好事。


---

## 實作紀錄（2026-08-20）

實際交付與計畫的差異，三處：

**1. `SessionRepository` 只能在函式內匯入。** `app/repositories/session_repository.py:8` 反過來從 `app.core.security` 匯入 token hashing，模組頂層匯入會閉合循環。`_require_live_session` 內部匯入，原因寫在該處註解。

**2. 踢人端點是 checkpoint 1 only，不是「沿用既有 scope 判定」。** ADR-103 初版的說法站不住：010 之後使用者沒有單一 team，目標使用者身上沒有 team 可供 checkpoint 2 比對。ADR 已更正，實務影響為零（seed 裡只有 `super_admin` 持有 `user.edit`）。

**3. GraphQL 的撤銷測試必須住在 `tests/test_graphql/`。** 一開始寫在 `tests/test_session_revocation.py`，單獨跑會過、全套件跑會炸 `attached to a different loop`——GraphQL 請求不吃 `get_db` override，用的是真正的 application engine，而 `tests/test_graphql/` 的 fixture 才處理它的生命週期。已搬到 `tests/test_graphql/test_session_revocation.py`，兩邊都留了指路的註解。

**4. `test_db` 被 pytest 當成測試收集。** `tests/test_graphql/conftest.py` 的 `test_db` 是個 async context manager，但名字以 `test_` 開頭——直接 import 進測試檔，pytest 就會把它收成一個什麼都不做的「測試」。本票的 GraphQL 測試檔改用 `as _test_db` 別名避開。**`test_queries.py` / `test_work_zone.py` / `test_zone_scope.py` 三個既有檔案仍有這個問題**（各多算一個空測試），屬既有噪音，不在本票順手改。

計畫沒預料到、但確實踩到的一處：**`tests/test_security.py` 有自己的 `client` fixture**（`:32`），沒有 `get_redis` override。認證一旦要讀 Redis，那個 fixture 底下的每個已認證路由都 500。已補上與共用 fixture 相同的接線。這正是 Task 2 要排在 Task 3 之前的理由——它是在加了檢查之後才紅的，而那時全套件其餘部分是綠的，所以一眼就能定位。

---

## Task 8: PR #38 code review 修補（2026-08-25）

review 報告見 scratchpad `PR38-review.md`；每一項都以實跑測試取證。本任務只處理其中兩項安全問題，其餘（稽核、lint、計數、測試缺口）未動。

### 8-1 `get_current_session` 補上 live-session 檢查（ADR-180）

- [x] 先寫紅燈測試：`tests/test_session_revocation.py` 的 `test_logout_all_is_refused_once_the_session_is_gone` / `test_logout_is_refused_once_the_session_is_gone` / `test_logout_refuses_a_token_with_no_sid`
- [x] `app/core/security.py:313` — `get_current_session` 多收 `redis=Depends(get_redis)`，呼叫 `_require_live_session`
- [x] `app/api/v1/endpoints/auth/session.py:163` — logout 的 docstring 更正（sid-less token 不再是 no-op）
- [x] 三個端點（logout / logout-all / switch-identity）都不用改

### 8-2 踢人端點明確要求 `Scope.ALL`（ADR-181）

- [x] 先寫紅燈測試：`test_kicking_needs_user_edit_at_scope_all`，parametrize `own/team/gov/ngo/zone`
- [x] `app/services/admin.py:218-225` — `require_scope` 的回傳值拿來比對 `Scope.ALL`，否則 403
- [x] `gov` / `ngo` 兩個 scope 在修補前就已經 403（平台角色無 team，`resolve_scope` 回 NONE），實際紅的是 `own` / `team` / `zone` 三個

### 驗收

- [x] 紅燈確認：修補前 6 failed / 15 passed
- [x] 綠燈確認：修補後 `tests/test_session_revocation.py` 21 passed
- [x] 全套件 `uv run pytest -q` → **524 passed / 0 failed**（2026-08-25 實跑，無回歸）
- [x] `uv run ruff check` 對本次改動的 4 個檔案全綠
- [ ] Docker 完整驗證（未跑；本次為純邏輯修補，全套件已涵蓋兩個行為）

### 未處理（review 有提、本次刻意不動）

- 踢人動作沒有稽核紀錄，log 也沒有 actor uuid
- 本 PR 引入的 2 個 ruff 錯誤（`test_loaders.py` I001、`test_zone_scope.py` E501）
- `revoke_user_sessions` 越層讀 repo 內部、`smembers` 讀兩次、撤銷數會多算過期 sid
- 測試缺口：「踢人不會踢到自己」無斷言；Redis 斷線的 fail-closed 只驗了 REST（GraphQL 走 `app.state.redis`，dependency override 打不到）

---

## Task 9: PR #38 第二輪 review 修補（2026-08-30）

reviewer 在 PR #38 上留了 7 條 inline comment，**全部屬實、全部處理**。裁定寫成 ADR-189~195
（`decisions.md`）。其中 ADR-190 推翻 ADR-180 的實作位置，ADR-193 收掉 Task 8 之前留下的重複方法。

### 9-1 change-password 也登出呼叫者：釘住行為（ADR-189）

- [x] 使用者裁定：「改密碼成功後登出」就是預期流程，行為不變
- [x] `tests/test_session_revocation.py` — `test_change_password_signs_the_changing_device_out_as_well`
- [x] ADR-189 記錄呼叫者在撤銷範圍內，以及被否決的「保留當前 session」方案

### 9-2 logout 回復冪等（ADR-190，推翻 ADR-180 的位置）

- [x] `app/core/security.py` — `get_current_session` 回到只解 token；連 `redis` 參數一併移除（三個呼叫端各自有）
- [x] `app/api/v1/endpoints/auth/session.py` — `logout` 對已消失的 session no-op 回 204；`logout_all` 先確認呼叫者自己的 session 還活著，否則什麼都不撤
- [x] 三個舊測試改寫成新行為，另加 `test_a_sid_less_token_cannot_sign_anyone_out_of_anything` 釘住 ADR-180 要擋的攻擊仍被擋住

### 9-3 踢人：稽核 + actor + 目標限制（ADR-191）

- [x] `app/services/admin.py` — `_record_session_revocation()` 手寫 `AuditLog`（`action="REVOKE_SESSIONS"`）
- [x] `app/services/admin.py` — `_holds_super_admin()`；踢自己 409、踢 super_admin 403
- [x] `app/api/v1/endpoints/admin.py` — log 行補 actor；`AdminConflictError` → 409；**actor uuid 在呼叫服務前先讀出來**（服務會 commit，`expire_on_commit` 之後在 logging 裡碰 `.uuid` 會 `MissingGreenlet`——實際踩到）
- [x] 三個測試：稽核列內容、踢自己、踢 super_admin

### 9-4 dev Redis 設定對齊 staging（ADR-192）

- [x] `docker-compose.yml` — `--appendonly yes --maxmemory-policy noeviction` + `./.redis:/data`
- [x] `.gitignore` — 補 `.redis/`

### 9-5 `session_is_live` 併回 `get_session`（ADR-193）

- [x] `app/repositories/session_repository.py` — 刪掉重複方法，docstring 的兩段契約併進 `get_session`
- [x] `app/core/security.py` — `_require_live_session` 改呼叫 `get_session`

### 9-6 Redis 故障回 503（ADR-194）

- [x] `app/services/admin.py` — 踢人路徑接住 `RedisError` → 503
- [x] `app/api/v1/endpoints/auth/session.py` — `logout` / `logout-all` 同樣處理（ADR-190 之後它們自己讀 Redis 了）
- [x] `test_a_kick_during_a_redis_outage_is_503_not_500`、`test_logout_reports_a_redis_outage_rather_than_claiming_success`

### 9-7 `sid` 也 pin 到 `act`（ADR-195）

- [x] `app/core/security.py` — `_require_live_session` 比對 `session["act"] == payload["act"]`
- [x] `tests/test_identity_switching.py` — `test_the_pre_switch_token_stops_working`
- [x] **兩個測試 helper 的 session/token `act` 不一致，已修**：`tests/test_graphql/conftest.py:160`、`tests/test_graphql/test_station_photo.py:134` 建 session 時沒帶 `act`，token 卻帶了。這是 ADR-105 想避免的漂移，不加這道檢查看不出來。

### 順手修掉的既有 lint

- [x] `tests/test_zone_scope.py` E501（Task 8「未處理」清單裡的一項）；`test_loaders.py` 的 I001 已不復存在

### 驗收（2026-08-30 實跑）

- [x] `tests/test_session_revocation.py` 28 passed、`tests/test_identity_switching.py` 26 passed
- [x] 全套件 `uv run pytest -q -p no:randomly` → **680 passed / 0 failed**
- [x] `uv run ruff check` 對本次改動的 9 個檔案全綠
- [x] Docker 完整驗證（2026-08-30 補跑，見 Task 10）

**跑測試前先 DROP test DB。** 本次實際踩到兩次：第一次 116 failed、第二次 4 failed + 136 errors
（`Field Coordinator` 角色查不到、大量 `KeyError: 'data'`），DROP 之後同一份程式碼 680 passed。
與「開工前先確認」第 2 點是同一個現象，**在同一個 session 內連跑兩次全套件就會出現**。

```bash
docker exec backend-db-1 psql -U postgres -c "DROP DATABASE IF EXISTS disaster_rescue_test WITH (FORCE);"
```

### 仍未處理（review 提過，這次也沒動）

- `revoke_user_sessions` 越層讀 `repo.redis` / `repo.USER_SESSIONS`，且撤銷數會把已過期的 sid 算進去（只影響 log 與稽核列裡的數字）
- Redis 斷線的 fail-closed 只驗了 REST；GraphQL 讀 `app.state.redis`，dependency override 打不到

---

## Task 10: ADR-192 的 docker 實測（2026-08-30）

Task 9 把 docker 驗證留成未勾選（「本次除 `docker-compose.yml` 的 Redis 設定外皆為邏輯修補」）。
這裡把那一項補上——真的起容器、真的登入、真的殺 Redis。

**環境**：獨立 project name `pr38verify`（不動使用者現有的 `backend-*` 容器），backend 開在 8001，
db/redis 不對外開 port。`alembic upgrade head` + `scripts/seed_rbac.py`（要帶 `PYTHONPATH=/app`）。

### 10-1 設定確實生效

| 檢查 | 結果 |
|---|---|
| `CONFIG GET appendonly` | `yes` |
| `CONFIG GET maxmemory-policy` | `noeviction` |
| `CONFIG GET maxmemory` | `536870912`（512mb）|
| `/data` 內容 | `appendonlydir/` 存在，bind 到 `Backend/.redis` |

### 10-2 session 撐不撐得過 Redis 消失（新舊設定對照）

同一個帳號、同一把 access token，唯一變數是 Redis 的設定。

| 情境 | 舊設定（`allkeys-lru`，無 volume） | 新設定（`appendonly` + bind mount） |
|---|---|---|
| `docker restart`（graceful） | **活著**（SIGTERM 觸發 RDB 存檔） | 活著 |
| `docker kill` 後 start（crash / OOM） | **死了——該 token 永久 401** | **活著**（200） |
| 容器重建（改設定 / 換 image / `down` 後 up） | **死了**（匿名 volume 被換掉） | **活著**（200） |

> **ADR-192 原文的措辭已更正。** 原本寫「容器重啟 = 一次登出所有人」（reviewer 原話也是如此），
> 實測不成立：graceful restart 會存 RDB。真正會掉的是 crash 與容器重建兩種，風險成立但觸發條件較窄。

### 10-3 `noeviction` 對 session key 的保護（決定性對照）

同一份填充壓力（20000 次 200 bytes 寫入，`maxmemory 3mb`）：

| 設定 | `evicted_keys` | session key | 寫入 |
|---|---|---|---|
| `allkeys-lru` | **13635** | **EXISTS → 0（被淘汰，該使用者當場登出）** | 20000 次全成功 |
| `noeviction` | **0** | EXISTS → 1（完好） | 14198 次回 `OOM command not allowed` |

OOM 期間既有 session 的**讀取**仍然 200——認證不受影響，只有寫入被擋。這正是想要的取捨。

### 10-4 實測發現的殘留問題（ADR-192 沒解決，另開票）

**Redis 每次重啟後，連線池裡每一條殘留連線的第一個請求都會回一次 401。**

舊連線讀到 `redis.exceptions.ConnectionError: Connection closed by server`，`_require_live_session`
依 ADR-100 fail-closed，log 留下 `refusing the request: Redis (the session store) is unreachable`。

實測（先用 30 個並發請求把連線池撐開，再重啟 Redis）：

| 批次 | 結果 |
|---|---|
| 重啟前 30 並發 | 30× 200 |
| 重啟後第一批 30 並發 | **24× 200 / 6× 401** |
| 緊接著第二批 30 並發 | 29× 200 / **1× 401** |
| 之後 | 全 200 |

新舊設定都會發生，跟 ADR-192 無關。根因：`app/main.py:42` 的 `aioredis.from_url()` 沒有設
`health_check_interval`，也沒有 `retry_on_error`，所以殘留連線要等到被用到、炸掉、換掉才恢復。

對使用者而言這是**假登出**，而且依 ADR-100 的設計，它跟真正的撤銷長得一模一樣。修法很短
（`from_url(..., health_check_interval=30, retry_on_error=[ConnectionError])`），但那是新的行為決策、
要自己的 ADR，**不混進本輪 review 修補**。

### 驗收

- [x] Redis 設定實測生效（10-1）
- [x] 新舊設定對照，三種情境（10-2）
- [x] `noeviction` 對 session key 的保護，決定性對照（10-3）
- [x] 驗證環境已完全清除（`docker compose -p pr38verify down -v`），使用者原有的 `backend-*` 容器未受影響
- [ ] 連線池殘留連線造成的假 401 —— **未修，已記錄，需另開票**
