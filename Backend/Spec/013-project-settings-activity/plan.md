# Project Settings & Account Activity — Implementation Plan

**Goal:** 讓後台能設定「這場災害是哪些型別」並據此開關動態欄位，並讓後台看得到每個帳號的最後登入、最後活動與目前登入裝置數。

**Architecture:** 新增 `project_settings` 單列全域設定表 + `/admin/project-settings` 兩個 REST 端點（沿 ADR-035：維運操作走 REST 不走 GraphQL）。動態欄位設定加四個欄位（`disaster_types` / `label` / `sort_order` / `is_active`），既有的 `stationPropertyConfigs` / `taskPropertyConfigs` 查詢據此過濾與排序。`users` 加 `last_activity_at`，在 refresh token 輪替時寫入。`AdminUserListItem` 補三個欄位。

**Tech Stack:** FastAPI, Strawberry GraphQL, SQLAlchemy async, PostgreSQL, Redis, alembic, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/013-project-settings-activity/spec.md`（ADR-090~095）

**Branch:** `feat/project-settings-backend`（off `main`）

---

## Global Constraints

- **git root 是 `optimized-version/`（`Backend/` 的上層）**。一律 `git add Backend/<path>`，**絕不用 `git add -A` / `git add .`**（會掃進 `Frontend/` 等大型未追蹤目錄）。
- 跑測試前先 `docker compose up -d db redis`。測試 `uv run pytest`，lint `uv run ruff check`。行長上限 110。
- **驗收標準是全綠**。`main` 的 baseline 是 469 passed 零失敗（2026-08-16 實測）；011 合併後會更高，開工前先量一次當基準。
- 既有 ruff 錯誤有 7 個，全在 `tests/test_admin_api.py`、`tests/test_suggestion_review_scope.py`、`alembic/versions/e8b3c5f2a1d4_*`——**不是你造成的，不要順手改**（會擴大 diff）。
- **Spec 與實作放同一個 PR**，不另開文件 PR。
- **完成後不要自己開 PR**：先做完 §「Docker 驗收」，回報結果，等使用者決定。

---

## 範圍

| 納入 | 排除（明確不做） |
|---|---|
| `project_settings` 單列表 + 後台讀寫端點 | project / disaster_event entity（ADR-090 一個部署 = 一場混合型災害） |
| config 加 `disaster_types` / `label` / `sort_order` / `is_active` | 災難欄位範本表與套用動作（ADR-091 定義與啟用分離後不需要） |
| config 補 UNIQUE 約束 | 動態欄位的寫入驗證（ADR-092 維持無強制力） |
| 查詢依當前災害型別過濾、依 `sort_order` 排序、排除停用 | `required` / `unit` / `hint` / `default_value` / `min` / `max` / `group` 等欄位（ADR-095 刻意未加） |
| `users.last_activity_at`（refresh 時寫入） | 每請求更新活動時間（ADR-093：`users` 在 `AUDITED_TABLES`，會讓 `audit_logs` 每請求多一列） |
| `AdminUserListItem` 補三欄 | 範本的實際欄位內容（PM-Scure 的「三種災難情境下的動態欄位」才是內容來源） |

**不要切 phase。** 011 的教訓：切點若落在「寫到哪」而非「功能是否完整」，會付出成本卻沒交付價值。013 兩半（專案設定 / 活動時間）彼此無關但都不大，一次做完。

---

## File Structure

**Create**
- `app/models/project_settings.py` — `ProjectSettings`
- `app/repositories/project_settings_repository.py` — 讀取／更新單列設定
- `app/services/project_settings.py` — 讀寫 use-case（`Perm.PROJECT_EDIT` 把關）
- `alembic/versions/<rev>_project_settings_and_config_fields.py` — **手寫，不用 autogenerate**
- `tests/test_project_settings.py` — 單列不變式、權限、audit
- `tests/test_account_activity.py` — `last_activity_at` 寫入時機、後台三欄

**Modify**
- `app/core/permissions.py` — 新增 `PROJECT_VIEW` / `PROJECT_EDIT`
- `scripts/seed_rbac.py` — 授予 super_admin
- `app/models/property_config.py` — 兩個 config model 加四個欄位 + UNIQUE
- `app/models/auth.py` — `User.last_activity_at`
- `app/repositories/config_repository.py` — `list_by_type` 加災害型別過濾／`is_active`／排序；`upsert` 支援新欄位
- `app/repositories/session_repository.py` — `rotate()` 讓上層能寫 `last_activity_at`
- `app/api/v1/endpoints/auth/session.py` — refresh 時更新 `last_activity_at`
- `app/services/config.py` — `upsert_*_property_config` 加新參數
- `app/graphql/config/{types,queries,mutations}.py` — 曝露新欄位
- `app/api/v1/endpoints/admin.py` — `GET`/`PATCH /admin/project-settings`；`list_users` 補三欄
- `app/schemas/admin.py` — `AdminUserListItem` 加三欄；新增 `ProjectSettingsResponse` / `ProjectSettingsUpdate`
- `app/db/triggers.py` — `project_settings` 進 `AUDITED_TABLES`
- `tests/test_graphql/test_queries.py` — 既有 config 查詢測試需確認仍通過

---

## Task 1: `project_settings` 資料表與單列不變式

**Files:** Create `app/models/project_settings.py`、`tests/test_project_settings.py`

**Interfaces:** `ProjectSettings(uuid, name, disaster_types: list[str], started_at, created_at, updated_at)`

- [ ] **Step 1: 寫失敗測試**

```python
"""Tests for the single-row project settings table (feature 013, ADR-090)."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.project_settings import ProjectSettings

pytestmark = pytest.mark.asyncio


async def test_second_row_is_rejected(db):
    """The table holds exactly one row — the deployment's single disaster (ADR-090)."""
    db.add(ProjectSettings(name="花蓮 0816", disaster_types=["landslide", "flood"]))
    await db.commit()

    db.add(ProjectSettings(name="第二場災害", disaster_types=["fire"]))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_disaster_types_round_trips_as_a_list(db):
    """Mixed disasters are a set of types on one event, not separate events."""
    db.add(ProjectSettings(name="花蓮 0816", disaster_types=["landslide", "flood"]))
    await db.commit()
    value = await db.scalar(text("SELECT disaster_types FROM project_settings"))
    assert value == ["landslide", "flood"]


async def test_disaster_types_defaults_to_empty(db):
    """An unconfigured deployment enables every field (empty = no filter)."""
    db.add(ProjectSettings(name="未設定"))
    await db.commit()
    assert await db.scalar(text("SELECT disaster_types FROM project_settings")) == []
```

- [ ] **Step 2: 實作 model**

單列不變式用**唯一部分索引**達成（比 CHECK 簡單，且不需要固定 PK 值）：

```python
__table_args__ = (
    Index("uq_project_settings_singleton", text("(true)"), unique=True),
)
```

`disaster_types` 用 `ARRAY(String)`，`server_default=text("'{}'")`。

> 為何是單列：ADR-090 選「一個部署 = 一場混合型災害」，不引入 project entity，因此 `tickets` / `stations` 不需要事件外鍵，既有查詢（RBAC scope、011 的搜尋、地圖 bbox）全部不受影響。

- [ ] **Step 3: 驗證**（此時 migration 還沒寫，測試靠 `create_all` 建表即可通過）

---

## Task 2: 動態欄位設定的四個新欄位

**Files:** Modify `app/models/property_config.py`；Extend `tests/test_project_settings.py`

- [ ] **Step 1: 寫失敗測試**

```python
async def test_config_unique_key_is_enforced_by_the_database(db):
    """upsert has always keyed on (type, property_name); the DB never guaranteed it."""
    db.add(StationPropertyConfig(station_type="shelter", property_name="發電機", data_type="integer"))
    await db.commit()
    db.add(StationPropertyConfig(station_type="shelter", property_name="發電機", data_type="string"))
    with pytest.raises(IntegrityError):
        await db.commit()


async def test_config_defaults(db):
    """New rows are enabled, unordered and enabled for every disaster type."""
    cfg = StationPropertyConfig(station_type="shelter", property_name="發電機", data_type="integer")
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    assert cfg.disaster_types == []      # 空陣列 = 不分災害型別一律啟用
    assert cfg.is_active is True
    assert cfg.sort_order == 0
    assert cfg.label is None             # 前端回退顯示 property_name
```

- [ ] **Step 2: 加欄位**

| 欄位 | 型別 | 預設 | 用途 |
|---|---|---|---|
| `disaster_types` | `ARRAY(String)` | `'{}'` | 啟用於哪些災害型別；空 = 全部（沿用 `station_type='all'` 慣例） |
| `label` | `String(100)` | `NULL` | 顯示文字，可自由修改。**`property_name` 是不可變的鍵**（ADR-095） |
| `sort_order` | `Integer` | `0` | 表單欄位順序 |
| `is_active` | `Boolean` | `true` | 停用開關（比刪除安全，刪除會讓既有資料變孤兒） |

兩張表都加，並各加 `UniqueConstraint`：`uq_station_prop(station_type, property_name)`、`uq_task_prop(task_type, property_name)`。

> **`property_name` 不可變**：`station_properties` / `task_properties` 是**以字串**對應到 config，沒有外鍵（`app/models/station_property.py:16`、`app/models/ticket_task.py:47`），改名會讓既有資料變孤兒。目前 `app/services/config.py` 只有 `upsert`（以該鍵為鍵），所以改名在 API 上不存在——**不要好心新增 rename 端點**。

---

## Task 3: Migration（手寫）

**Files:** Create `alembic/versions/<rev>_project_settings_and_config_fields.py`

- [ ] **Step 1: 產生空白 revision**

```bash
cd Backend && uv run alembic revision -m "project settings and config fields"
```

> ⚠️ **不要 `--autogenerate`。** 這個 migration 含 ARRAY 預設值、唯一部分索引、`COMMENT ON COLUMN`——autogenerate 會產生看似完整、實則缺項的骨架。011 已踩過這個決定，沿用。

- [ ] **Step 2: 內容**

```python
def upgrade() -> None:
    op.create_table(
        "project_settings",
        sa.Column("uuid", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("disaster_types", postgresql.ARRAY(sa.String()),
                  server_default=sa.text("'{}'"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("uuid"),
    )
    # 單列不變式：一個部署 = 一場（混合型）災害（ADR-090）
    op.execute("CREATE UNIQUE INDEX uq_project_settings_singleton ON project_settings ((true))")

    for table, type_col in (("station_property_config", "station_type"),
                            ("task_property_config", "task_type")):
        op.add_column(table, sa.Column("disaster_types", postgresql.ARRAY(sa.String()),
                                       server_default=sa.text("'{}'"), nullable=False))
        op.add_column(table, sa.Column("label", sa.String(100), nullable=True))
        op.add_column(table, sa.Column("sort_order", sa.Integer(),
                                       server_default="0", nullable=False))
        op.add_column(table, sa.Column("is_active", sa.Boolean(),
                                       server_default=sa.true(), nullable=False))
        op.create_unique_constraint(f"uq_{table}_key", table, [type_col, "property_name"])

    op.add_column("users", sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True))
```

> **UNIQUE 約束可能在既有資料上失敗**——若正式／staging 的 config 表已有重複的 `(type, property_name)`，`create_unique_constraint` 會炸。兩張表目前是空的（`seed_rbac.py` 與 `seed_mock_scenarios.sql` 各建 0 列），但**部署前要先查一次**：
> ```sql
> SELECT station_type, property_name, count(*) FROM station_property_config
> GROUP BY 1,2 HAVING count(*) > 1;
> ```

- [ ] **Step 3: 驗證可逆 + 兩條建表路徑一致**

```bash
# 乾淨 DB 上 upgrade → downgrade -1 → upgrade
docker compose exec -T db psql -U postgres -d postgres -c "CREATE DATABASE alembic_check"
SQLALCHEMY_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/alembic_check uv run alembic upgrade head
# ...downgrade / upgrade...
# 再比對 alembic 與 create_all 建出的欄位定義是否一致（011 用過這個檢查，很有效）
```

---

## Task 4: 查詢過濾——災害型別、停用、排序

**Files:** Modify `app/repositories/config_repository.py`、`app/services/config.py`、`app/graphql/config/*`；Extend tests

- [ ] **Step 1: 寫失敗測試**（GraphQL 端到端，放 `tests/test_graphql/`）

- 設定 `disaster_types = {landslide, flood}` 時，兩種型別的欄位都回傳，同名欄位只出現一次
- `disaster_types = '{}'` 的欄位在任何設定下都回傳
- 火災專屬欄位在 `{flood}` 設定下**不**回傳
- `is_active = false` 的欄位不出現
- 回傳依 `sort_order` 排序；相同時依 `property_name` 穩定排序
- `label IS NULL` 時回傳 `property_name` 作為顯示文字
- **災害型別變更後欄位清單即時反映**（無需套用動作——這正是 ADR-091 拆「定義/啟用」換來的）

- [ ] **Step 2: 實作**

`list_by_type` 追加：

```sql
AND (disaster_types = '{}' OR disaster_types && :current_types)
AND is_active = true
ORDER BY sort_order, property_name, uuid
```

`&&` 是 PostgreSQL 陣列交集運算子——混合災害由單一條件處理，不需迴圈或多次查詢。

> **目前 `list_by_type` 完全沒有 `ORDER BY`**（`app/repositories/config_repository.py:17-26`），順序由 PostgreSQL 自行決定，同一查詢跑兩次可能不同。加排序同時修掉這個既有問題。

當前災害型別從 `project_settings.disaster_types` 讀取。單列表，可在 request scope 快取；**先不要為此建快取機制**，一次查詢很便宜。

---

## Task 5: 專案設定的後台端點

**Files:** Create `app/services/project_settings.py`、`app/repositories/project_settings_repository.py`；Modify `app/core/permissions.py`、`scripts/seed_rbac.py`、`app/api/v1/endpoints/admin.py`、`app/schemas/admin.py`

- [ ] **Step 1: 新增 capability**

`app/core/permissions.py` 加 `PROJECT_VIEW = "project.view"` / `PROJECT_EDIT = "project.edit"`，`scripts/seed_rbac.py` 的 super_admin 清單加上（`:73-89` 那段），scope 為 `"all"`。

> 為何是新 capability 而非複用 `FIELD_EDIT`：改災害型別會**連動整批欄位的可見性**，比改單一欄位重得多。ADR-013 的 capability 目錄是 code-owned（ADR-057），新增是正常操作。

- [ ] **Step 2: 端點**

```
GET   /admin/project-settings   → ProjectSettingsResponse   （PROJECT_VIEW）
PATCH /admin/project-settings   → ProjectSettingsResponse   （PROJECT_EDIT）
```

沿用 `admin.py` 既有形態：`dependencies=[security.has_permission(Perm.X)]`。**PATCH 是 upsert**——表若為空就建立那唯一一列，否則更新它。

- [ ] **Step 3: 測試**：非 super_admin 讀寫皆 403；PATCH 在空表上會建立；重複 PATCH 不會產生第二列。

- [ ] **Step 4: `project_settings` 加入 `AUDITED_TABLES`**（`app/db/triggers.py`），並測試變更會寫入 `audit_logs`。

---

## Task 6: `last_activity_at`

**Files:** Modify `app/models/auth.py`、`app/repositories/session_repository.py`、`app/api/v1/endpoints/auth/session.py`；Create `tests/test_account_activity.py`

- [ ] **Step 1: 寫失敗測試**

- refresh 之後 `users.last_activity_at` 被更新
- 只登入不 refresh 時 `last_activity_at` 維持 `NULL`（證明寫入點是 refresh 而非登入）
- **未 refresh 的一般請求不會更新**（守 ADR-093 的核心取捨）

- [ ] **Step 2: 實作**

寫入點在 `POST /auth/refresh`（`app/api/v1/endpoints/auth/session.py:63`）——`rotate()` 已回傳 `(sid, user_uuid, new_raw_token)`，端點拿 `user_uuid` 寫 DB 即可，**`session_repository` 不需要知道 DB 的存在**（它是純 Redis 元件，別把 `AsyncSession` 傳進去）。

> **絕對不要改成每請求更新。** `users` 在 `AUDITED_TABLES`（`app/db/triggers.py:7`），每請求 `UPDATE users` 會讓 `audit_logs` **每請求多一列**，稽核表會被活動記錄淹沒。access token TTL 15 分鐘 → 活躍使用者約每 15 分鐘 refresh 一次，這個粒度對「帳號還活著嗎」綽綽有餘。

---

## Task 7: 後台使用者列表三個欄位

**Files:** Modify `app/schemas/admin.py`、`app/api/v1/endpoints/admin.py`；Extend `tests/test_account_activity.py`

- [ ] **Step 1: 寫失敗測試**——`GET /admin/users` 回傳 `last_login_at` / `last_activity_at` / `active_session_count`；`active_session_count` 反映實際 Redis session 數；**Redis 不可用時該欄位為 `null` 而非整個列表失敗**。

- [ ] **Step 2: 實作**

`active_session_count` 取自 Redis `user_sessions:{uuid}` set 的 size。**預設分頁 `limit=100`，必須用 pipeline 批次取**，不要迴圈打 100 次 round trip。

> `last_login_at` 是零成本——欄位早就在寫了（`session.py:59`、`sso.py:83`/`:163`），只是 `AdminUserListItem` 沒回傳（`app/schemas/admin.py:9-16`）。

---

## Task 8: 全套件 + Docker 驗收

- [ ] **Step 1: 全套件**

```bash
cd Backend && COVERAGE_CORE=sysmon uv run pytest -q -p no:randomly   # 必須全綠
uv run ruff check   # 我的檔案乾淨；既有 7 個錯誤不動
```

> `COVERAGE_CORE=sysmon` 是必要的——預設 tracer 量不到 ASGI client 路徑，會誤報覆蓋率偏低。

- [ ] **Step 2: Docker 完整驗收**（**這是回報前的必要條件**）

```bash
docker compose build backend
docker compose up -d db redis backend
docker compose exec -T -e PYTHONPATH=/app backend alembic upgrade head
docker compose exec -T -e PYTHONPATH=/app backend python scripts/seed_rbac.py
```

以 HTTP 驗證：

- [ ] `PATCH /admin/project-settings` 設定 `disaster_types=["landslide","flood"]`（需 super_admin token）
- [ ] 非 super_admin 呼叫 → 403
- [ ] 重複 PATCH 不產生第二列
- [ ] 建三筆 config：土石流專屬、水災專屬、火災專屬 + 一筆 `disaster_types='{}'`
- [ ] `stationPropertyConfigs` 只回傳前兩筆與通用那筆，火災那筆不出現
- [ ] 把設定改成 `["fire"]`，同一查詢立刻改回傳火災那筆（**無需套用動作**）
- [ ] `is_active=false` 的欄位消失
- [ ] `sort_order` 生效
- [ ] 登入 → `GET /admin/users` 看到 `last_login_at`、`active_session_count=1`、`last_activity_at=null`
- [ ] 呼叫 `/auth/refresh` → `last_activity_at` 有值
- [ ] `audit_logs` 有 `project_settings` 的變更記錄
- [ ] **造的測試資料全部清乾淨**

- [ ] **Step 3: 回報，不要開 PR**

回報全套件數字、docker 驗收結果、任何只有跑容器才會發現的問題（011 就是這樣抓到日誌噪音的）。**等使用者說要發才開 PR。**

---

## 開工前先做

1. `git log --oneline -1` 確認在 `feat/project-settings-backend`。
2. `docker compose up -d db redis`。
3. `COVERAGE_CORE=sysmon uv run pytest -q -p no:randomly` 量一次 baseline 數字並記下來。
4. 讀 `Spec/013-project-settings-activity/spec.md` 與 `decisions.md`（ADR-090~095）——**特別是 ADR-092「動態欄位設定維持無強制力」**：不要好心在 `create_station_property` / `create_task_property` 加驗證，那是明確排除的。
