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

- [ ] 新增查詢函式，讀不到回 `None`，連線失敗**讓例外往上拋**（不要吞成 `None`——那會把 Redis 故障偽裝成「session 已撤銷」，ADR-100 要的 log 就沒有原因可寫）

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

- [ ] `token_for` 改為 async 並建立真的 session
- [ ] `auth_headers_for` 跟著改 async
- [ ] `client` fixture 補上 `app.state.redis`（ADR-102）
- [ ] 逐一修 13 個檔案裡直呼 `create_access_token` 的 30 處

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

- [ ] `get_current_user` 增加 `redis` 參數（`Depends(get_redis)`）
- [ ] 解碼後、撈 user 前插入檢查
- [ ] 無 `sid` → 401；session 不存在 → 401；`user_uuid` 不符 → 401

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

- [ ] 從 `request.app.state.redis` 取得 client，顯式傳入 `get_current_user`

```python
user = await get_current_user(db=db, token=token, redis=request.app.state.redis)
```

**這一步不能跳過。** GraphQL 是這個後端的主要查詢介面，漏掉它等於撤銷只對 REST 生效——而那正是最難察覺的一種半成品。測試計畫裡「logout 後打 GraphQL 也 401」是專門釘住這條的。

## Task 5: Redis 故障 → 401 + log

**Files:** Modify `app/core/security.py`

- [ ] 包住 Redis 呼叫，`RedisError` 轉 401
- [ ] **error log 帶原因**，對外回應與一般 401 不可區分

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

- [ ] service：`revoke_user_sessions(db, redis, *, actor, target_uuid)`，先確認 target 存在（404）、再 `require_scope`、再 `revoke_all_for_user`
- [ ] endpoint：`POST /users/{uuid}/revoke-sessions`，`Perm.USER_EDIT`，回 204
- [ ] 撤銷數量寫 log，不回給呼叫端

**scope 檢查沿用 `require_scope`**，與 admin.py 其餘寫入動作同形——不要自己寫一套 team 比對，那是 `Spec/010` 之後最容易寫錯的地方。

## Task 7: 全套件 + Docker 驗收

- [ ] `uv run pytest` 全綠（本機 db 在 5433，見下方指令）
- [ ] `uv run ruff check` 對本票改動的檔案全綠
- [ ] Docker 完整驗證：實際 logout 後拿舊 token 打 REST 與 GraphQL，兩邊都要 401
- [ ] 回報使用者，由使用者決定是否發 PR（PR 需等 #37 先合）

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
