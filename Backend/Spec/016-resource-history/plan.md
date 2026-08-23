# Ticket/Resource Station History — Implementation Plan

**Goal:** 前台與後台都能看到單一 ticket / station 的完整異動時間軸——誰建立（含 AI 爬取／NGO／GOV）、誰編輯、誰配對任務，依 caller 權限分四層揭露欄位。

**Architecture:** REST 兩個唯讀端點。資料全部來自既有的 `audit_logs`，本票**不新增任何一張表、不改任何 schema**，唯一的 migration 只補索引。聚合、合併、推導、過濾全在應用層做完。

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/PostGIS, pytest (`uv run pytest`), ruff。無新依賴。

**Source spec:** `Spec/016-resource-history/spec.md`（ADR-127~145）

**Branch:** `feat/resource-history-backend`（off `feat/bulk-import-export-backend`，**不是 off main**，ADR-140）

---

## Global Constraints

- **唯讀。** 本票不新增任何寫入路徑。任何「順手修一下」的念頭（`task_assignments` 改軟刪、`source` 建 enum、GraphQL 的地址 PII 閘門）都已經在 ADR 裡明確劃到本票之外，各自另開票。
- **不動 schema。** 零新表、零新欄位。唯一 migration 只有三個索引（ADR-133）。
- **不動 `AUDITED_TABLES`。** 需要的 trigger 全部已經在 base 分支上（ADR-140）。若你發現少了哪張表的 trigger，那是範圍理解錯了——`crowd_sourcing` / `station_update_suggestions` / `photos` 是**刻意**不做的。
- **白名單 fail-closed。** 新欄位預設不出現。若某個欄位「應該要看得到但沒出現」，正解是去 `history_fields.py` 加一行並標 tier，不是在服務層開特例。
- **PR 依賴 #36 與 #42。** 兩張都合併前本票不能合。

## 範圍

| 納入 | 排除（明確不做） |
|---|---|
| 兩個 REST 唯讀端點 | GraphQL 巢狀欄位（ADR-138 否決） |
| 零跳／一跳／兩跳聚合 | 跨資源稽核查詢（「李四改過什麼」） |
| 已硬刪指派的 JSONB 反查 | `task_assignments` 改軟刪（ADR-132，另開票） |
| 2 個新 capability + seed | 重用 `audit.view` 當門票（ADR-127 否決） |
| 四層可見度（一般／PII／稽核／RAW） | 後端中文化（ADR-145 否決） |
| `audit_logs` 三個索引 | 任何 schema 變更 |
| 事件合併（同交易併一行） | keyset 分頁（ADR-134 否決） |
| `crawler`/`gov`/`ngo` 的 kind 推導 | 為爬蟲建 system 帳號（ADR-137） |
| 分類守衛測試 | 重用 `bulk_columns.py`（ADR-144 否決） |
| — | 回溯還原 restore / revert |
| — | 補 `crowd_sourcing` 等三張表的 trigger |

---

## Task 順序的關鍵

**Task 1（權限）排最前。** 理由同 015：seed 改動會影響所有既有 RBAC 測試的預期值，先做完、跑一次全套件確認沒有連帶紅燈，之後的紅燈才有診斷價值。

**Task 2（索引）排第二，在任何查詢寫出來之前。** 沒有索引時聚合查詢是 737 ms 的全表掃描（實測）。先補上，開發過程中的手動驗證才不會被假的慢速誤導，也不會有人因為「查詢好像很慢」去改對的 SQL。

**Task 3（白名單）排在服務層之前。** 它是純資料結構，沒有 DB 依賴，可以先用守衛測試逼出完整分類，服務層直接消費。

**Task 4~8 照資料流順序**：解析 row_id → 兩路查詢 → 合併事件 → 解析 actor → 套可見度。每一步都能獨立測，不需要端點存在。

**Task 9（端點）最後。** 到這一步時服務層已經全綠，端點只剩接線與分頁。

---

## Task 1: capability key 與 seed grant

**Files:** Modify `app/core/permissions.py`, `scripts/seed_rbac.py`, `RBAC_RESOURCE_ROLE_MATRIX.md`；Create `tests/test_history_permissions.py`

- [ ] `Perm` 新增兩個 key，各自放在所屬模組的區塊裡（不要擠成一塊）

```python
    # Ticket (PII split from the ticket itself: view != view_pii)
    TICKET_VIEW = "ticket.view"
    TICKET_VIEW_PII = "ticket.view_pii"
    # Feature 016 (ADR-127): the timeline is its own capability rather than a reuse of
    # audit.view — that key is auditor-only, and Notion's requirement is that a requester
    # can follow their own ticket. Not a reuse of ticket.view either: that one is in
    # PUBLIC_PERMS, so sharing it would put staff names and review timings in front of
    # anonymous visitors.
    TICKET_VIEW_HISTORY = "ticket.view_history"
    ...
    STATION_VIEW_HISTORY = "station.view_history"
```

- [ ] **不要**把新 key 加進 `PUBLIC_PERMS`（Guest 一律 `—`）
- [ ] `scripts/seed_rbac.py` 各角色加 grant，scope 與同角色的 `TICKET_VIEW_PII` 一致

```python
            Perm.TICKET_VIEW_PII: "own",   # 既有
            Perm.TICKET_VIEW_HISTORY: "own",   # ADR-128: mirrors view_pii's tiering
            Perm.STATION_VIEW_HISTORY: "own",
```

對照表（ADR-128）：`user` → own；`data_auditor` / `super_admin` → all；`admin` / `member` → **zone**。

> **`zone` 不是 `team`。** ADR-049 把 `team_uuid` 從 `base_geometries` 拿掉了，`in_scope()` 的 TEAM 分支對 ticket/station 一律 `getattr → None → False`（`app/core/rbac_scopes.py:77`）。發 `team` 等於發一個永遠不成立的授權。

- [ ] `RBAC_RESOURCE_ROLE_MATRIX.md` 加兩列
- [ ] **RED**：`tests/test_history_permissions.py` 先寫「每個角色對兩個 key 解析出的 scope」的斷言，跑起來應該全紅
- [ ] **GREEN**：跑 seed 後轉綠
- [ ] 跑一次**全套件**，確認 seed 改動沒有讓既有 RBAC 測試連帶紅燈

---

## Task 2: `audit_logs` 索引 migration

**Files:** Create `alembic/versions/xxxx_audit_logs_read_indexes.py`

- [ ] 新 migration，`down_revision` 指向 015 的 head

```python
def upgrade() -> None:
    """Index audit_logs for read access (ADR-133).

    The table was created with only its primary key (71bd05e07df3), so every read is a
    sequential scan over an append-only ledger fed by 39 tables. Measured on 996k rows /
    1.5 GB: the timeline aggregation went 737 ms -> 4.9 ms and the assignment lookup
    415 ms -> 0.95 ms. Writes cost about 15 microseconds more per row.
    """
    op.create_index(
        "ix_audit_logs_row_id_created_at", "audit_logs",
        ["row_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "ix_audit_logs_table_created_at", "audit_logs",
        ["table_name", sa.text("created_at DESC")],
    )
    # Partial + expression: the only way to reach an assignment whose row was hard-deleted
    # (ADR-132), where row_id is no longer derivable. The WHERE clause keeps it at ~2 MB.
    op.execute("""
        CREATE INDEX ix_audit_logs_assign_task ON audit_logs
        ((COALESCE(new_values->>'task_uuid', old_values->>'task_uuid')))
        WHERE table_name = 'task_assignments'
    """)
```

- [ ] `downgrade()` 三個 `drop_index`
- [ ] 確認 `alembic upgrade head` 在乾淨資料庫上能跑完（注意 015 已經有一支 migration，別造成多 head——參照 ADR-065 的處理）

---

## Task 3: 分層白名單

**Files:** Create `app/services/history_fields.py`, `tests/test_history_fields.py`

- [ ] **RED**：先寫守衛測試（ADR-144）

```python
def test_every_column_is_classified():
    """A column added to any audited table must be given a tier or an explicit exclusion.

    Without this, a new column lands in the audit payload silently — `search_text` from
    feature 011 is exactly what that looks like — and the whitelist quietly rots.
    """
    for table, model in HISTORY_MODELS.items():
        cols = {c.name for c in model.__table__.columns}
        known = set(FIELD_TIERS[table]) | set(EXCLUDED[table])
        assert cols - known == set(), f"{table} 新增欄位未分類: {cols - known}"
```

- [ ] 定義 tier

```python
class Tier(StrEnum):
    """How much authority a field's value requires (ADR-130)."""

    PUBLIC = "public"   # any caller who passed *.view_history
    PII = "pii"         # ticket.view_pii and in scope, else masked
    AUDIT = "audit"     # audit.view
```

- [ ] `FIELD_TIERS`：`{table: {column: Tier}}`，照 spec.md §5 的表填
- [ ] `EXCLUDED`：`{table: {column: "理由"}}`——**每一項都要寫理由**

```python
EXCLUDED = {
    "tickets": {
        "uuid": "the resource's own id; the caller already knows what it is looking at",
        "search_text": "denormalised index column from feature 011; changes on every "
                       "title/description edit and means nothing to a reader",
        "review_note": None,  # not excluded — see FIELD_TIERS, Tier.AUDIT
    },
    ...
}
```

- [ ] **GREEN**：守衛測試轉綠
- [ ] 額外斷言：`FIELD_TIERS` 與 `EXCLUDED` 的 key 不重疊（一個欄位不能既分層又排除）

---

## Task 4: row_id 解析

**Files:** Create `app/services/history.py`；Modify `tests/test_history_service.py`

- [ ] `resolve_scope_ids(db, entity, uuid) -> tuple[set[UUID], set[UUID]]`
      回傳 `(所有相關 row_id, 該資源的 task uuids)`。第二個給 Task 5 的 JSONB 反查用。

```python
async def resolve_scope_ids(db, *, entity: str, uuid: str):
    """Expand one resource into every audit row_id that belongs to its history (ADR-131).

    audit_logs.row_id is the primary key of the row that changed, not of the ticket the
    change belongs to — so the set has to be computed before audit_logs can be queried.
    Ticket needs two hops (task_assignments hangs off ticket_tasks, not off the ticket);
    station's children all hang directly off the station uuid, so it stops at one.
    """
```

- [ ] ticket：`base_geometries`/`tickets`（自己）+ `secondary_locations` + `ticket_tasks` + 兩跳的 `task_properties` / `task_assignments`
- [ ] station：自己 + `secondary_locations` + `station_properties`
- [ ] 用一個 `UNION ALL` 的子查詢一次拿完，不要 N 次來回
- [ ] 測試：建一張有 2 個任務、每個任務有指派與動態欄位的 ticket，斷言 row_id 集合的大小與內容

---

## Task 5: 兩路查詢與合流

**Files:** Modify `app/services/history.py`, `tests/test_history_service.py`

- [ ] 查詢 A：`WHERE row_id IN (:ids) ORDER BY created_at DESC LIMIT :cap`
- [ ] 查詢 B（只有 ticket 需要）：

```python
    # ADR-132: an assignment removed by unassign_task_actor is hard-deleted
    # (app/infrastructure/repository/base.py:102), so its row_id can no longer be derived
    # from ticket_tasks. The only remaining path is the audit payload itself.
    select(AuditLog).where(
        AuditLog.table_name == "task_assignments",
        func.coalesce(
            AuditLog.new_values["task_uuid"].astext,
            AuditLog.old_values["task_uuid"].astext,
        ).in_([str(u) for u in task_uuids]),
    )
```

- [ ] 合流後用 `AuditLog.uuid` 去重——**現存的指派兩條查詢都會撈到**
- [ ] 上限 2000 列，超過設 `truncated`
- [ ] **關鍵測試**：指派 → 取消指派 → 斷言時間軸上同時有 `ASSIGNED` 與 `UNASSIGNED` 兩個事件，且 `task_assignments` 表已經是空的

---

## Task 6: 事件合併與型別推導

**Files:** Modify `app/services/history.py`, `tests/test_history_service.py`

- [ ] 按 `(row_id, created_at)` 分組（ADR-134）

```python
# PostgreSQL's now() is the transaction timestamp, so every audit row written by one
# request shares a created_at down to the microsecond. That makes it a reliable
# transaction key for grouping — and it is also why ordering *within* a transaction is
# impossible, which is precisely what grouping removes the need for.
```

- [ ] 推導 `event_type`：

| 條件 | event_type |
|---|---|
| `action = INSERT` | `CREATED`（`task_assignments` → `ASSIGNED`） |
| `action = DELETE` 且 `table = task_assignments` | `UNASSIGNED` |
| `base_geometries` UPDATE 且 `delete_at` NULL → 非 NULL | `DELETED`（ADR-135） |
| `base_geometries` UPDATE 且 `delete_at` 非 NULL → NULL | `RESTORED` |
| 其餘 UPDATE | `UPDATED` |

- [ ] 欄位變更：只列 `old_values[k] != new_values[k]` 的欄位；`geometry` 特例（ADR-141）只設 `changed: true`，不帶 before/after
- [ ] 測試：建立一張 ticket 應該產生**一個** `CREATED` 事件（背後是 `base_geometries` + `tickets` 兩列）
- [ ] 測試：軟刪除產生 `DELETED` 而不是 `UPDATED`，且 `delete_at` 不出現在 changes 裡

---

## Task 7: actor 解析

**Files:** Modify `app/services/history.py`, `tests/test_history_service.py`

- [ ] 批次 JOIN `users` 把 `user_uuid` 解析成 `{uuid, name, is_removed}`——**一次查詢**，不要每個事件查一次
- [ ] `kind` 推導（ADR-136 / ADR-137）

```python
def _actor_kind(action: str, user_uuid, new_values) -> str:
    """Who acted. NULL means the write never went through an HTTP request (ADR-136).

    `source` refines system only on INSERT: on an UPDATE it is merely the row's current
    source value, so a crawler-created station edited by a person would otherwise be
    attributed to the crawler (ADR-137).
    """
    if user_uuid is not None:
        return "user"
    if action == "INSERT" and new_values:
        source = new_values.get("source")
        if source in ("crawler", "gov", "ngo"):
            return source
    return "system"
```

- [ ] **不實作** `kind: "unknown"`：使用者是軟刪（`delete_at`），列一直都在，孤立 UUID 不會發生（ADR-136）
- [ ] `task_assignments` 的 `actor_uuid` 也要解析成人名（被指派者，不是操作者）
- [ ] 測試：`user_uuid IS NULL` + `source='crawler'` 的 INSERT → `kind == "crawler"`
- [ ] 測試：`user_uuid` 有值 + `source='crawler'` 的 UPDATE → `kind == "user"`（**這是 ADR-137 的核心，不能漏**）
- [ ] 測試：`delete_at` 有值的使用者 → `is_removed == True` 且 `name` 仍然有值

---

## Task 8: 四層可見度過濾

**Files:** Modify `app/services/history.py`, `tests/test_history_permissions.py`

- [ ] 一次解析 caller 的兩個附加 scope，快取起來（別在迴圈裡重複解析）

```python
    pii_scope = await resolve_scope(actor, Perm.TICKET_VIEW_PII, db, cache=cache)
    audit_scope = await resolve_scope(actor, Perm.AUDIT_VIEW, db, cache=cache)
```

- [ ] `Tier.PUBLIC` 直接放行
- [ ] `Tier.PII`：in scope 給原值，否則走 `app/graphql/masking.py` 的 `mask_name` / `mask_email` / `mask_phone`；地址與座標無 masking 函式，直接不給值（只留欄位名 + `changed: true`）
- [ ] `Tier.AUDIT`：`audit_scope != Scope.NONE` 才給
- [ ] RAW：`audit_scope != Scope.NONE` 時每個事件附 `raw: {old_values, new_values}`
- [ ] 測試矩陣：`user`(own) / `member`(zone) / `data_auditor`(all) / `super_admin`(all) × 四層，斷言各看到什麼
- [ ] **關鍵測試**：`super_admin` 拿得到 RAW（含 `search_text`），`member` 拿不到
- [ ] **關鍵測試**：RAW 永遠不含 `password_hash`（trigger 已剝除，這是回歸保險）

> ⚠️ `expire_on_commit` 陷阱（015 踩過）：本票是單一請求單次讀取，不會在一個請求裡多次 commit，所以**不需要** `stable_actor`。但測試 fixture 也**不要**用 `expire_on_commit=False` 去繞任何東西。

---

## Task 9: REST 端點與分頁

**Files:** Create `app/api/v1/endpoints/history.py`, `app/schemas/history.py`；Modify `app/api/v1/api.py`

- [ ] 兩個端點，走專案既有的回應 envelope

```
GET /api/v1/history/tickets/{uuid}?limit=50&offset=0
GET /api/v1/history/stations/{uuid}?limit=50&offset=0
```

- [ ] 授權：`require_scope(actor, Perm.*_VIEW_HISTORY, db, resource=該資源)`——**兩個檢查點一次做完**
- [ ] 資源不存在 → 404；scope 不符依 ADR-023 的既有規則（`own` 不符 403、`zone` 不符 404）
- [ ] 分頁在應用層切（ADR-139），`meta` 帶 `total` / `truncated` / `limit` / `offset`
- [ ] `limit` 上限 200，`offset` 非負，超出範圍回 422
- [ ] 掛進 `app/api/v1/api.py`
- [ ] 測試：完整的端點層測試（授權、分頁邊界、404/403）

---

## Task 10: docker 完整驗證

- [ ] 乾淨資料庫（另建一個 DB，**不要用 dev DB**）跑 `alembic upgrade head` + `seed_rbac`
- [ ] 實際建一張 ticket → 加任務 → 指派 → 取消指派 → 改動態欄位 → 軟刪除，然後打端點確認六個事件都在、順序正確
- [ ] 以 `user` / `member` / `data_auditor` / `super_admin` 四種 token 各打一次，確認四層可見度
- [ ] `EXPLAIN ANALYZE` 確認兩條查詢都走索引（不是 Seq Scan）
- [ ] 全套件 + ruff
- [ ] 覆蓋率：`COVERAGE_CORE=sysmon uv run pytest --cov`（預設 tracer 量不到 ASGI client 路徑，會誤報偏低）

---

## 驗收

- [ ] Notion 三件事都看得到：誰建立（含 crawler/gov/ngo）、誰編輯、誰配對任務
- [ ] **被取消的指派看得到**（`ASSIGNED` + `UNASSIGNED` 各一個事件）
- [ ] 建立一張 ticket 在時間軸上是**一行**不是兩行
- [ ] 軟刪除顯示為 `DELETED` 不是 `UPDATED`
- [ ] `user` 看不到別人的單的歷史；`member` 看得到轄區內的
- [ ] 無 `view_pii` 時 `contact_phone` 是遮罩過的，地址不給值
- [ ] `super_admin` 拿得到 RAW
- [ ] 新增一個欄位到 `tickets` 而不分類 → `test_every_column_is_classified` 紅燈
- [ ] 兩條查詢都走索引
- [ ] 全套件綠、ruff 乾淨
