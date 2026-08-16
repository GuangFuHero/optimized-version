# Resource Search — Phase 1 (Migration + 主表查詢) Implementation Plan

**Goal:** 建立 `pg_trgm` 搜尋基礎設施（extension、6 個 `search_text` generated column、6 個 GIN 索引），並讓 `stations` / `tickets` 兩個既有 GraphQL 查詢支援 `q` 關鍵字參數。

**Architecture:** 不新增端點（ADR-077）。新增 `app/core/search.py` 提供 `build_search_condition()`——長度驗證、`%`/`_` escape、產生 `ILIKE` 條件；repository 的 `list_active` / `count_active` 多吃一個 `q` 參數，把條件併進既有的 `where` 子句；GraphQL resolver 只多傳一個參數。scope 過濾、bbox、分頁完全沿用既有路徑。

**Tech Stack:** FastAPI, Strawberry GraphQL, SQLAlchemy async, PostgreSQL + PostGIS + pg_trgm, alembic, pytest (`uv run pytest`), ruff。

**Source spec:** `Spec/011-resource-search/spec.md`（ADR-077~083）

**Branch:** `feat/resource-search-backend`（off `main`）→ PR to `main`

---

## Global Constraints

- **git root 是 `optimized-version/`（`Backend/` 的上層）**。一律用 `git add Backend/<path>`，**絕不使用 `git add -A` 或 `git add .`**——會掃進 `Frontend/` 等大型未追蹤目錄。
- 測試 `uv run pytest`；lint `uv run ruff check`。行長上限 110。
- Commit 用 conventional commits，不加 AI attribution trailer。
- **既有 baseline**：`tests/test_graphql` 有 95 個 `Group` NameError 失敗，是既有問題，非本次造成。判斷成敗以「新增測試全過 + 既有失敗數不增加」為準。
- 跨分支切換後若 `drop_all` 失敗，先 `DROP DATABASE disaster_rescue_test` 讓 conftest 重建。
- 不碰 PII 欄位與備註欄位（ADR-079）——本 phase 的 generated column 定義即為該決策的實作，**審查時逐欄位比對 spec §3**。

---

## Phase 1 範圍

| 納入 | 排除（Phase 2） |
|---|---|
| `pg_trgm` extension（正式 + 測試環境） | 1:N 的 `EXISTS` 子查詢（動態欄位、地址） |
| **全部 6 張表**的 `search_text` + GIN 索引 | `similarity()` 相關性排序 |
| `build_search_condition()` 與其單元測試 | `ticketTasks(q:)` |
| `stations(q:)`、`tickets(q:)` 主表搜尋 | |

**為何 migration 一次做完 6 張表**：拆兩次 migration 只是 churn，Phase 2 變成純查詢工作，不再動 schema。

**為何 `ticketTasks(q:)` 移到 Phase 2**：`ticket_tasks` 查詢強制要 `ticket_uuid`（`app/graphql/tickets/queries.py:101`），是「某張工單底下的任務」而非全域清單，對它加 `q` 價值極低。真正有用的是讓 `tickets` 的搜尋透過 `EXISTS` 涵蓋其下的 task 與 task_property——那是 Phase 2 的工作。

---

## File Structure

**Create**
- `app/core/search.py` — `build_search_condition()`、`MIN_QUERY_LENGTH` / `MAX_QUERY_LENGTH`、`SearchQueryError`
- `alembic/versions/<rev>_search_text_and_trgm_indexes.py` — **手寫，不用 autogenerate**（Task 2 Step 4）
- `tests/test_search_schema.py` — generated column 內容、定義漂移守衛、索引接線驗證
- `tests/test_search_helper.py` — `build_search_condition()` 單元測試
- `tests/test_graphql/test_search.py` — 端到端搜尋測試

**Modify**
- `app/models/geo.py` — `Station.search_text` + GIN index
- `app/models/request.py` — `Tickets.search_text` + GIN index
- `app/models/ticket_task.py` — `TicketTask.search_text` / `TaskProperty.search_text` + indexes
- `app/models/station_property.py` — `StationProperty.search_text` + index
- `app/models/secondary_location.py` — `SecondaryLocation.search_text` + index
- `app/repositories/geo_repository.py` — `StationRepository.list_active` / `count_active` 加 `q`
- `app/repositories/tickets_repository.py` — `TicketRepository.list_active` / `count_active` 加 `q`
- `app/graphql/geo/queries.py` — `stations(q:)`
- `app/graphql/tickets/queries.py` — `tickets(q:)`
- `tests/conftest.py` — bootstrap 加 `CREATE EXTENSION pg_trgm`

---

## Task 1: `pg_trgm` extension + 測試環境 bootstrap

> ⚠️ **必須第一個做。** 測試以 `Base.metadata.create_all` 建 schema（`tests/conftest.py:87`），而 bootstrap 目前只建 `postgis`（`:77`）。少了 `pg_trgm`，Task 2 加上 `gin_trgm_ops` 索引後**整個測試套件會在建表階段失敗**。

**Files:** Modify `tests/conftest.py`

- [x] **Step 1: 加 extension 到測試 bootstrap**

`tests/conftest.py` 第 77 行附近：

```python
    eng = create_async_engine(TEST_DB_URL, isolation_level="AUTOCOMMIT")
    async with eng.connect() as conn:
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
        # pg_trgm: 搜尋用的 gin_trgm_ops 運算子類別，create_all 建索引時需要（ADR-078）
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    await eng.dispose()
```

- [x] **Step 2: 確認 `tests/test_graphql/conftest.py` 共用同一個 bootstrap**

`tests/test_graphql/conftest.py:60-61` 只做 `drop_all` / `create_all`，extension 由上層 session fixture 建立。若它使用獨立的 DB URL，需比照加上。**確認後在此註記結論。**

- [x] **Step 3: 驗證**

```bash
cd Backend && uv run pytest tests/test_rbac_scopes.py -q
psql "$TEST_DB_URL" -c "SELECT extname FROM pg_extension WHERE extname IN ('postgis','pg_trgm')"
```

預期兩個 extension 都在。此時尚未有 `search_text`，測試應與改動前完全相同。

---

## Task 2: `search_text` generated column + GIN 索引（models + migration）

**Files:**
- Modify: `app/models/geo.py`、`app/models/request.py`、`app/models/ticket_task.py`、`app/models/station_property.py`、`app/models/secondary_location.py`
- Create: `alembic/versions/<rev>_search_text_and_trgm_indexes.py`

**Interfaces:** 每個 model 產出唯讀屬性 `search_text: Mapped[str]`，以及名為 `ix_<table>_search_text_trgm` 的 GIN 索引。

- [x] **Step 1: 寫失敗測試**

Create `tests/test_search_schema.py`:

```python
"""Schema-level tests for the search_text generated columns and their GIN indexes (feature 011)."""

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def test_station_search_text_is_generated_from_name_and_description(db):
    """search_text is maintained by PostgreSQL, not the application."""
    await db.execute(text(
        "INSERT INTO base_geometries (uuid, property_name, geometry) "
        "VALUES ('11111111-1111-1111-1111-111111111111', 'station', "
        "ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326))"
    ))
    await db.execute(text(
        "INSERT INTO stations (uuid, name, description) "
        "VALUES ('11111111-1111-1111-1111-111111111111', '光復國小', '收容所兼物資集散')"
    ))
    await db.commit()

    value = await db.scalar(text(
        "SELECT search_text FROM stations WHERE uuid = '11111111-1111-1111-1111-111111111111'"
    ))
    assert "光復國小" in value
    assert "收容所兼物資集散" in value


async def test_station_search_text_truncates_long_description(db):
    """description beyond 500 chars must not enter the index (ADR-081 cost ceiling)."""
    long_text = "水" * 600
    await db.execute(text(
        "INSERT INTO base_geometries (uuid, property_name, geometry) "
        "VALUES ('22222222-2222-2222-2222-222222222222', 'station', "
        "ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326))"
    ))
    await db.execute(text(
        "INSERT INTO stations (uuid, name, description) "
        "VALUES ('22222222-2222-2222-2222-222222222222', 'A', :d)"
    ), {"d": long_text})
    await db.commit()

    value = await db.scalar(text(
        "SELECT search_text FROM stations WHERE uuid = '22222222-2222-2222-2222-222222222222'"
    ))
    assert value.count("水") == 500


async def test_ticket_search_text_excludes_pii(db):
    """contact_* must never reach search_text (ADR-079)."""
    await db.execute(text(
        "INSERT INTO base_geometries (uuid, property_name, geometry) "
        "VALUES ('33333333-3333-3333-3333-333333333333', 'request', "
        "ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326))"
    ))
    await db.execute(text(
        "INSERT INTO tickets (uuid, title, description, contact_name, contact_email, "
        "contact_phone, status, priority) VALUES "
        "('33333333-3333-3333-3333-333333333333', '需要飲用水', '三樓住戶', "
        "'王小姐', 'wang@example.com', '0912345678', 'open', 'high')"
    ))
    await db.commit()

    value = await db.scalar(text(
        "SELECT search_text FROM tickets WHERE uuid = '33333333-3333-3333-3333-333333333333'"
    ))
    assert "需要飲用水" in value
    assert "王小姐" not in value
    assert "wang@example.com" not in value
    assert "0912345678" not in value


@pytest.mark.parametrize("table", [
    "stations", "tickets", "ticket_tasks",
    "station_properties", "task_properties", "secondary_locations",
])
async def test_search_text_gin_index_exists(db, table):
    """Every searchable table carries a trigram GIN index (ADR-081)."""
    found = await db.scalar(text(
        "SELECT indexdef FROM pg_indexes "
        "WHERE tablename = :t AND indexname = :i"
    ), {"t": table, "i": f"ix_{table}_search_text_trgm"})
    assert found is not None, f"{table} is missing its trigram GIN index"
    assert "gin" in found.lower()
    assert "gin_trgm_ops" in found


# 每張表的 search_text 由哪些欄位組成，是 ADR-079 正向表列的實作。
# 這份對照表是「防漂移守衛」：任何人日後在 generation 運算式裡加一個欄位
# （例如順手把 comment 加進去），這裡就會紅。GraphQL 層的 PII 測試抓不到這種改動,
# 因為那只驗證幾個特定字串搜不到,不驗證「還有哪些欄位進了索引」。
EXPECTED_SOURCE_COLUMNS = {
    "stations": {"name", "description"},
    "tickets": {"title", "description"},
    "ticket_tasks": {"task_name", "task_description"},
    "station_properties": {"property_name"},
    "task_properties": {"property_name", "property_value"},
    "secondary_locations": {
        "county", "city", "lane", "alley", "no", "floor", "room", "pole_id",
    },
}

# 絕不可出現在任何 search_text 裡（ADR-079）
FORBIDDEN_COLUMNS = {
    "contact_name", "contact_email", "contact_phone",   # PII
    "comment", "progress_note", "pole_note", "review_note",  # 自由文字備註
}


@pytest.mark.parametrize("table", sorted(EXPECTED_SOURCE_COLUMNS))
async def test_search_text_generation_expression_has_not_drifted(db, table):
    """The set of columns feeding search_text must match spec §3 exactly."""
    expr = await db.scalar(text(
        "SELECT pg_get_expr(d.adbin, d.adrelid) "
        "FROM pg_attrdef d "
        "JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum "
        "WHERE a.attrelid = :t::regclass AND a.attname = 'search_text'"
    ), {"t": table})
    assert expr is not None, f"{table}.search_text has no generation expression"

    for col in EXPECTED_SOURCE_COLUMNS[table]:
        assert col in expr, f"{table}.search_text no longer includes {col}"
    for col in FORBIDDEN_COLUMNS:
        assert col not in expr, f"{table}.search_text must never include {col} (ADR-079)"
```

> **為何是「運算式漂移守衛」而不是「逐表 PII 斷言」**：`tickets` 是**唯一**有 `contact_*` 欄位的表，對其他五張表做 PII 斷言等於斷言一件恆真的事。真正的風險是「有人日後把某個備註欄位加進 generation 運算式」——這條測試同時擋住 PII 與備註兩類，且涵蓋全部 6 張表。

跑 `uv run pytest tests/test_search_schema.py` — 應全部失敗（欄位不存在）。

- [x] **Step 2: 加 `Station.search_text`**

`app/models/geo.py`，`Station` 類別內（`priority_score` 之後）：

```python
from sqlalchemy import Computed, Index

class Station(BaseGeometry):
    ...
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.uuid"), nullable=True)

    # 搜尋用串接欄位（ADR-081）。長欄位截斷 500 字元把 trigram 成本鎖成定值。
    # 欄位組成即 ADR-079 的正向表列——修改前請比對 Spec/011-resource-search/spec.md §3。
    search_text: Mapped[str] = mapped_column(
        String,
        Computed(
            "coalesce(name, '') || ' ' || left(coalesce(description, ''), 500)",
            persisted=True,
        ),
    )

    __table_args__ = (
        Index(
            "ix_stations_search_text_trgm",
            "search_text",
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"},
        ),
    )
```

> ⚠️ `Station` 目前沒有 `__table_args__`，但**有 `__mapper_args__`**。兩者不同、可並存，別覆蓋掉 `__mapper_args__` 的 `polymorphic_identity`。

- [x] **Step 3: 其餘 5 個 model 比照辦理**

| Model | 檔案 | `Computed` 運算式 |
|---|---|---|
| `Tickets` | `app/models/request.py` | `coalesce(title,'') \|\| ' ' \|\| left(coalesce(description,''), 500)` |
| `TicketTask` | `app/models/ticket_task.py` | `coalesce(task_name,'') \|\| ' ' \|\| left(coalesce(task_description,''), 500)` |
| `TaskProperty` | `app/models/ticket_task.py` | `coalesce(property_name,'') \|\| ' ' \|\| left(coalesce(property_value,''), 500)` |
| `StationProperty` | `app/models/station_property.py` | `coalesce(property_name,'')` |
| `SecondaryLocation` | `app/models/secondary_location.py` | `coalesce(county,'') \|\| ' ' \|\| coalesce(city,'') \|\| ' ' \|\| coalesce(lane,'') \|\| ' ' \|\| coalesce(alley,'') \|\| ' ' \|\| coalesce(no,'') \|\| ' ' \|\| coalesce(floor,'') \|\| ' ' \|\| coalesce(room,'') \|\| ' ' \|\| coalesce(pole_id,'')` |

索引名一律 `ix_<table>_search_text_trgm`。

> **注意 `SecondaryLocation` 的欄位語意**：`lane` 實際存**路／街（road）**、`alley` 實際存**巷弄**，與欄位字面意思不符（見 spec §3）。本 Task 順手加 `comment=` 說明，見 Step 5。

- [x] **Step 4: 手寫 migration**

> ⚠️ **不要使用 `alembic revision --autogenerate`。** 這個 migration 同時包含 extension、generated column、PostgreSQL 專屬的 GIN operator class、column comment 四種 autogenerate 支援不完整或完全不支援的東西。用 autogenerate 會產生一個**看似完整、實則缺項**的骨架，反而比從零手寫更容易漏——而且 reviewer 無從分辨哪些是工具產生、哪些是人工補的。

只產生空白 revision，內容全部手寫：

```bash
cd Backend && uv run alembic revision -m "search_text and trgm indexes"
```

```python
"""search_text generated columns + trigram GIN indexes (feature 011, ADR-078/081).

Hand-written, not autogenerated: computed columns, the gin_trgm_ops operator class and
column comments are all outside what Alembic's autogenerate reliably detects.
"""

revision = "<rev>"
down_revision = "<prev>"

# (table, generation expression) —— 欄位組成即 ADR-079 的正向表列。
# 修改前必須比對 Spec/011-resource-search/spec.md §3,並更新
# tests/test_search_schema.py 的 EXPECTED_SOURCE_COLUMNS。
_SEARCH_TEXT = [
    ("stations", "coalesce(name, '') || ' ' || left(coalesce(description, ''), 500)"),
    ("tickets", "coalesce(title, '') || ' ' || left(coalesce(description, ''), 500)"),
    ("ticket_tasks",
     "coalesce(task_name, '') || ' ' || left(coalesce(task_description, ''), 500)"),
    ("station_properties", "coalesce(property_name, '')"),
    ("task_properties",
     "coalesce(property_name, '') || ' ' || left(coalesce(property_value, ''), 500)"),
    ("secondary_locations",
     "coalesce(county, '') || ' ' || coalesce(city, '') || ' ' || coalesce(lane, '') || ' ' "
     "|| coalesce(alley, '') || ' ' || coalesce(no, '') || ' ' || coalesce(floor, '') || ' ' "
     "|| coalesce(room, '') || ' ' || coalesce(pole_id, '')"),
]


def upgrade() -> None:
    # 必須在任何 gin_trgm_ops 索引之前
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    for table, expr in _SEARCH_TEXT:
        op.execute(
            f"ALTER TABLE {table} ADD COLUMN search_text text "
            f"GENERATED ALWAYS AS ({expr}) STORED"
        )
        op.execute(
            f"CREATE INDEX ix_{table}_search_text_trgm "
            f"ON {table} USING gin (search_text gin_trgm_ops)"
        )

    op.execute("COMMENT ON COLUMN secondary_locations.lane IS "
               "'路／街名（road）——注意：欄位名為 lane 但實際存路名，非巷'")
    op.execute("COMMENT ON COLUMN secondary_locations.alley IS "
               "'巷弄——注意：欄位名為 alley 但實際存巷弄'")


def downgrade() -> None:
    for table, _ in reversed(_SEARCH_TEXT):
        op.execute(f"DROP INDEX IF EXISTS ix_{table}_search_text_trgm")
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS search_text")

    # pg_trgm 刻意不移除：extension 是整個資料庫共用的能力，其他 migration 或
    # 資料庫物件可能已經依賴它。downgrade 後資料庫不會完全回到原狀,這是刻意的。
```

> `ALTER TABLE ... DROP COLUMN` 會連帶移除該欄位上的索引，`DROP INDEX` 那行是防禦性的顯式寫法（讓 downgrade 的意圖在 diff 上一眼可讀）。

- [x] **Step 5: `secondary_locations` 欄位語意註解**

同一個 migration 內：

```python
op.execute("COMMENT ON COLUMN secondary_locations.lane IS "
           "'路／街名（road）——注意：欄位名為 lane 但實際存路名，非巷'")
op.execute("COMMENT ON COLUMN secondary_locations.alley IS "
           "'巷弄——注意：欄位名為 alley 但實際存巷弄'")
```

同步在 `app/models/secondary_location.py` 的欄位加 `comment=` 參數，讓 model 與 DB 一致。

- [x] **Step 6: 驗證**

```bash
cd Backend && uv run alembic upgrade head
uv run pytest tests/test_search_schema.py -q          # 全綠
uv run alembic downgrade -1 && uv run alembic upgrade head   # 可逆
uv run pytest -q                                       # 既有失敗數不增加
```

- [x] **Step 7: Commit**

```bash
git add Backend/app/models Backend/alembic/versions Backend/tests/conftest.py Backend/tests/test_search_schema.py
git commit -m "feat(search): add search_text generated columns and trigram GIN indexes"
```

---

## Task 3: `build_search_condition()` 搜尋條件建構器

**Files:** Create `app/core/search.py`、`tests/test_search_helper.py`

**Interfaces:**
- `MIN_QUERY_LENGTH = 2`、`MAX_QUERY_LENGTH = 50`（**Python `str` 長度 = Unicode code point 數**）
- `class SearchQueryError(ValueError)`
- `build_search_condition(q: str | None, first_column, *more_columns) -> list` — 回傳可直接展開進 `select().where(*conds)` 的條件 list；`q` 為 `None`／空白時回傳 `[]`

> **放在 `app/core/` 而非 `app/graphql/`**：repository 要用它，而 repository 不該 import graphql 層。

> **簽章必須保證至少一個欄位。** 實測 SQLAlchemy 2.0.45：`or_()` 無參數時**不會拋錯**，只發 deprecation warning 並產生**空字串** `''`——誤用會靜默產生一個壞條件塞進 `.where()`，而不是明確失敗。這是 repository 共用的基礎設施，invariant 要在 API 邊界上由簽章保證（`first_column` 為位置必填參數），不能只靠呼叫端自律。

- [x] **Step 1: 寫失敗測試**

Create `tests/test_search_helper.py`:

```python
"""Unit tests for the search condition builder (feature 011, ADR-082)."""

import pytest

from app.core.search import MAX_QUERY_LENGTH, SearchQueryError, build_search_condition
from app.models.geo import Station


def _compiled(cond) -> str:
    return str(cond.compile(compile_kwargs={"literal_binds": True}))


def test_none_query_produces_no_condition():
    assert build_search_condition(None, Station.search_text) == []


def test_blank_query_produces_no_condition():
    assert build_search_condition("   ", Station.search_text) == []


def test_single_character_query_is_rejected():
    with pytest.raises(SearchQueryError):
        build_search_condition("水", Station.search_text)


def test_two_character_query_is_accepted():
    assert len(build_search_condition("光復", Station.search_text)) == 1


def test_overlong_query_is_rejected():
    with pytest.raises(SearchQueryError):
        build_search_condition("光" * (MAX_QUERY_LENGTH + 1), Station.search_text)


def test_calling_without_a_column_is_a_type_error():
    """The invariant is enforced by the signature, not by a runtime check.

    SQLAlchemy's or_() accepts zero clauses and silently yields an empty condition
    (deprecation warning only), so a missing column would corrupt the query rather
    than fail loudly. The signature must make that unrepresentable.
    """
    with pytest.raises(TypeError):
        build_search_condition("光復")


# --- wildcard escaping -------------------------------------------------------
# _escape() 處理三個字元,順序是 \ → % → _ (先處理 escape 字元本身,
# 否則後面產生的 \% 會被二次處理成 \\%)。三個都要有測試釘住。

def test_percent_is_escaped():
    """A user typing % must not turn into a match-everything query."""
    assert r"100\%" in _compiled(build_search_condition("100%", Station.search_text)[0])


def test_underscore_is_escaped():
    """_ is ILIKE's single-character wildcard and must be matched literally."""
    assert r"a\_b" in _compiled(build_search_condition("a_b", Station.search_text)[0])


def test_backslash_is_escaped():
    """The escape character itself must be escaped first, or everything after breaks."""
    assert r"C:\\foo" in _compiled(build_search_condition(r"C:\foo", Station.search_text)[0])


def test_mixed_wildcards_are_escaped_in_the_right_order():
    r"""`100%\_` must not double-escape: the \ produced by escaping % is not re-escaped."""
    compiled = _compiled(build_search_condition(r"100%\_", Station.search_text)[0])
    assert r"100\%\\\_" in compiled


def test_multiple_columns_are_or_ed():
    conds = build_search_condition("光復", Station.name, Station.description)
    assert len(conds) == 1  # a single OR clause, not one condition per column
```

- [x] **Step 2: 實作**

Create `app/core/search.py`:

```python
"""Keyword search condition builder (feature 011, ADR-078/082).

Chinese text search uses pg_trgm + ILIKE rather than tsvector: PostgreSQL's built-in
full-text search does not segment Chinese, so "花蓮縣光復鄉" becomes a single token and
searching "光復" finds nothing. Trigram matching is character-level and needs no
segmentation (ADR-078).
"""

from sqlalchemy import or_

# 長度以 Python str 計算,即 Unicode code point 數。對中文查詢而言
# 「2 個 code point」= 「2 個字」,正是我們要的語意。
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 50

# ILIKE 的萬用字元。使用者輸入的這些字元必須 escape，否則會改變查詢語意
# （"100%" 會變成 "以 100 開頭的任何東西"）。
# 順序有意義:先處理 escape 字元本身,否則後面產生的 \% 會被二次處理。
_ESCAPE_CHAR = "\\"
_WILDCARDS = ("\\", "%", "_")


class SearchQueryError(ValueError):
    """Raised when the caller's query string is outside the accepted length range."""


def _escape(value: str) -> str:
    """Escape ILIKE wildcards so user input is matched literally."""
    for char in _WILDCARDS:
        value = value.replace(char, _ESCAPE_CHAR + char)
    return value


def build_search_condition(q: str | None, first_column, *more_columns) -> list:
    """Build the WHERE conditions implementing keyword search over the given columns.

    Returns a list suitable for `select().where(*conditions)`:
    - `[]` when there is nothing to search for (caller passes it through unchanged).
    - a single-element list holding one OR clause when there is.

    At least one column is required by the signature. or_() accepts zero clauses and
    silently produces an empty condition (deprecation warning only, SQLAlchemy 2.0.45),
    which would corrupt the caller's query instead of failing — so the invariant is
    enforced structurally rather than by a runtime check.

    Raises SearchQueryError outside the accepted length range (ADR-082):

    - **Below MIN_QUERY_LENGTH**: a single CJK character has such poor trigram
      selectivity that the index scan matches most rows and degrades to a full scan
      plus recheck — and the result is meaningless to the user anyway.
    - **Above MAX_QUERY_LENGTH**: an application-level resource bound on untrusted
      input. Query cost scales with several factors — the number of trigrams extracted
      from the pattern (each is a separate GIN key lookup), the size of the candidate
      set those keys match, and the per-row recheck of the `%...%` pattern. Bounding
      the query length caps the first factor directly and is the only one of the three
      we can control at the API boundary.
    """
    if q is None:
        return []
    cleaned = q.strip()
    if not cleaned:
        return []
    if len(cleaned) < MIN_QUERY_LENGTH:
        raise SearchQueryError(f"搜尋關鍵字至少 {MIN_QUERY_LENGTH} 個字")
    if len(cleaned) > MAX_QUERY_LENGTH:
        raise SearchQueryError(f"搜尋關鍵字不得超過 {MAX_QUERY_LENGTH} 個字")

    pattern = f"%{_escape(cleaned)}%"
    columns = (first_column, *more_columns)
    return [or_(*(col.ilike(pattern, escape=_ESCAPE_CHAR) for col in columns))]
```

- [x] **Step 3: 驗證並 commit**

```bash
cd Backend && uv run pytest tests/test_search_helper.py -q && uv run ruff check app/core/search.py
git add Backend/app/core/search.py Backend/tests/test_search_helper.py
git commit -m "feat(search): add ILIKE search condition builder with length and wildcard guards"
```

---

## Task 4: `stations(q:)` 主表搜尋

**Files:** Modify `app/repositories/geo_repository.py`、`app/graphql/geo/queries.py`；Create `tests/test_graphql/test_search.py`

- [x] **Step 1: 寫失敗測試**

Create `tests/test_graphql/test_search.py`（沿用該目錄既有的 GraphQL client fixture 慣例）:

```python
"""End-to-end keyword search tests (feature 011, Phase 1)."""

STATIONS_Q = """
query($q: String) {
  stations(q: $q) {
    items { uuid name }
    pageInfo { totalCount }
  }
}
"""


async def test_search_matches_station_name(client, seeded_stations):
    resp = await client.post("/graphql", json={"query": STATIONS_Q, "variables": {"q": "光復"}})
    names = [i["name"] for i in resp.json()["data"]["stations"]["items"]]
    assert "光復國小" in names
    assert "瑞穗鄉公所" not in names


async def test_search_matches_description(client, seeded_stations):
    resp = await client.post("/graphql", json={"query": STATIONS_Q, "variables": {"q": "收容"}})
    assert resp.json()["data"]["stations"]["pageInfo"]["totalCount"] >= 1


async def test_no_query_returns_everything(client, seeded_stations):
    resp = await client.post("/graphql", json={"query": STATIONS_Q, "variables": {"q": None}})
    assert resp.json()["data"]["stations"]["pageInfo"]["totalCount"] == 3


async def test_single_character_query_is_rejected(client, seeded_stations):
    resp = await client.post("/graphql", json={"query": STATIONS_Q, "variables": {"q": "水"}})
    assert resp.json()["errors"][0]["message"].startswith("搜尋關鍵字至少")


async def test_total_count_reflects_the_filter(client, seeded_stations):
    """count_active must apply the same condition as list_active — otherwise paging breaks."""
    resp = await client.post("/graphql", json={"query": STATIONS_Q, "variables": {"q": "光復"}})
    data = resp.json()["data"]["stations"]
    assert data["pageInfo"]["totalCount"] == len(data["items"])
```

- [x] **Step 2: repository 加 `q` —— `list_active` 與 `count_active` MUST 共用同一個 predicate builder**

> ⚠️ **這是強制要求，不是建議。** 兩個方法各自組條件時，加新篩選條件的人只會改到 `list_active`，`count_active` 悄悄少一個條件——`total_count` 與實際列數不符，前端分頁跳號。這種 bug 不會讓任何既有測試變紅。Step 1 最後那個測試是安全網，**但結構上讓它不可能發生才是解法**：兩個方法都不得自己組條件。

`app/repositories/geo_repository.py`，`StationRepository`：

```python
    def _active_conditions(
        self, *, bounds=None, station_type: str | None = None,
        q: str | None = None, extra_filters=(),
    ) -> list:
        """The single source of truth for "which stations match this request".

        Both list_active() and count_active() MUST build their WHERE clause from this
        and nothing else — a condition that exists in one but not the other makes
        total_count disagree with the returned rows and breaks pagination.
        """
        conditions = [self.model.delete_at.is_(None), *extra_filters]
        if bounds:
            bbox = func.ST_MakeEnvelope(
                bounds.min_lng, bounds.min_lat, bounds.max_lng, bounds.max_lat, 4326
            )
            conditions.append(func.ST_Intersects(self.model.geometry, bbox))
        if station_type:
            conditions.append(self.model.type == station_type)
        conditions.extend(build_search_condition(q, self.model.search_text))
        return conditions

    async def list_active(
        self, db: AsyncSession, *,
        bounds=None, station_type: str | None = None, q: str | None = None,
        skip: int = 0, limit: int = 50, extra_filters=(),
    ) -> list[Station]:
        """List active stations with optional bbox/type/keyword filter and RBAC scope conditions."""
        conditions = self._active_conditions(
            bounds=bounds, station_type=station_type, q=q, extra_filters=extra_filters
        )
        result = await db.execute(
            select(self.model).where(*conditions)
            .order_by(
                self.model.priority_score.desc().nulls_last(), self.model.created_at.desc()
            )
            .offset(skip).limit(limit)
        )
        return result.scalars().all()

    async def count_active(
        self, db: AsyncSession, *,
        bounds=None, station_type: str | None = None, q: str | None = None,
        extra_filters=(),
    ) -> int:
        """Count active stations — MUST use the same conditions as list_active()."""
        conditions = self._active_conditions(
            bounds=bounds, station_type=station_type, q=q, extra_filters=extra_filters
        )
        return await db.scalar(
            select(func.count()).select_from(select(self.model).where(*conditions).subquery())
        )
```

**Review 檢查點**：`list_active` 與 `count_active` 的函式本體中，**不得出現任何 `.where(` 以外的條件組裝**；兩者的條件都必須來自 `_active_conditions()` 的單一呼叫。

- [x] **Step 3: GraphQL resolver 加參數**

**錯誤處理慣例（已查證，不需再確認）**：`app/graphql/schema.py:29` 是 `strawberry.Schema(query=Query, mutation=Mutation)`——**沒有設定任何 error masking extension**。既有慣例是 resolver 直接 `raise ValueError("訊息")`（`app/graphql/announcements/mutations.py:47`、`app/graphql/suggestions/fields.py:36`），Strawberry 將 `str(exc)` 放進 `errors[0].message`。既有測試也只斷言 `body.get("errors")` 為真（`tests/test_graphql/test_announcements.py:73`）。

因此 **`SearchQueryError`（`ValueError` 子類別）不需要任何額外處理**——直接讓它從 resolver 傳播即可，訊息會原樣出現在 `errors[0].message`，與既有 domain error 行為一致。**不要**新增 masking extension 或自訂 handler，那會改變全站既有錯誤的行為，超出本票範圍。

`app/graphql/geo/queries.py`：

```python
    async def stations(
        self, info: strawberry.types.Info,
        bounds: BoundsInput | None = None,
        station_type: str | None = None,
        q: str | None = None,
        skip: int = 0, limit: int = 50,
    ) -> StationConnection:
        """List stations within an optional geographic bounding box.

        `q` is a keyword filter over the station's name and description (ADR-077/079).
        PII and free-text note fields are deliberately not searchable.
        ...
        """
```

- [x] **Step 4: 驗證**

```bash
cd Backend && COVERAGE_CORE=sysmon uv run pytest tests/test_graphql/test_search.py -q
uv run pytest -q     # 既有失敗數不增加
```

> `COVERAGE_CORE=sysmon` 是必要的——預設 tracer 量不到 ASGI client 路徑，會誤報 service/endpoint 覆蓋率偏低。

- [x] **Step 5: Commit**

```bash
git add Backend/app/repositories/geo_repository.py Backend/app/graphql/geo/queries.py Backend/tests/test_graphql/test_search.py
git commit -m "feat(search): add q keyword filter to the stations query"
```

---

## Task 5: `tickets(q:)` 主表搜尋

**Files:** Modify `app/repositories/tickets_repository.py`、`app/graphql/tickets/queries.py`；Extend `tests/test_graphql/test_search.py`

- [x] **Step 1: 寫失敗測試**

在 `tests/test_graphql/test_search.py` 追加。**最重要的是 PII 測試**：

```python
TICKETS_Q = """
query($q: String) {
  tickets(q: $q) { items { uuid title } pageInfo { totalCount } }
}
"""


async def test_ticket_search_matches_title(client, seeded_tickets):
    resp = await client.post("/graphql", json={"query": TICKETS_Q, "variables": {"q": "飲用水"}})
    assert resp.json()["data"]["tickets"]["pageInfo"]["totalCount"] == 1


async def test_ticket_search_cannot_find_by_phone(client, seeded_tickets):
    """ADR-079: searching by a contact phone number must return nothing, even for an
    `all`-scope caller. Otherwise the field-level PII masking is meaningless."""
    resp = await client.post("/graphql", json={"query": TICKETS_Q, "variables": {"q": "0912345678"}})
    assert resp.json()["data"]["tickets"]["pageInfo"]["totalCount"] == 0


async def test_ticket_search_cannot_find_by_contact_name(client, seeded_tickets):
    resp = await client.post("/graphql", json={"query": TICKETS_Q, "variables": {"q": "王小姐"}})
    assert resp.json()["data"]["tickets"]["pageInfo"]["totalCount"] == 0


async def test_search_composes_with_status_filter(client, seeded_tickets):
    """q must AND with existing filters, not replace them."""
    ...


async def test_search_composes_with_scope_filter(client, zone_scoped_user, seeded_tickets):
    """A ticket matching the keyword but outside the caller's zone must not appear."""
    ...
```

- [x] **Step 2: 實作**（比照 Task 4）

- [x] **Step 3: 驗證並 commit**

```bash
git add Backend/app/repositories/tickets_repository.py Backend/app/graphql/tickets/queries.py Backend/tests/test_graphql/test_search.py
git commit -m "feat(search): add q keyword filter to the tickets query"
```

---

## Task 6: 索引接線正確性驗證（**不是**效能驗證）

**Files:** Extend `tests/test_search_schema.py`

> **這個 Task 驗證的是 wiring correctness，不是 production 效能。** 它證明的是「`gin_trgm_ops` operator class 與 `ILIKE '%...%'` 查詢相容，planner **能夠**使用這個索引」——這是最容易靜默壞掉的地方（例如索引誤建成 `gin(search_text)` 沒帶 operator class，或誤用 `btree`）。
>
> 它**不能**證明 production 查詢會走索引、也不能證明查詢夠快。真正的效能驗證需要有代表性的資料量與 `EXPLAIN ANALYZE`，屬於 staging benchmark，列在 Phase 2 預告。

- [x] **Step 1: 確認 operator class 與查詢相容**

```python
async def test_station_search_index_is_usable_by_the_planner(db):
    """Operator-class wiring check — NOT a performance assertion.

    Small tables are always seq-scanned regardless of indexes, so seq scan is disabled
    for this one query. If gin_trgm_ops is wired correctly the planner will pick the
    index; if the operator class does not match ILIKE '%...%' it cannot, and this fails.
    Actual query performance is validated separately against realistic data volumes.
    """
    await db.execute(text("SET LOCAL enable_seqscan = off"))
    plan = await db.scalar(text(
        "EXPLAIN (FORMAT TEXT) SELECT uuid FROM stations WHERE search_text ILIKE '%光復%'"
    ))
    assert "ix_stations_search_text_trgm" in plan
```

- [x] **Step 2: 全套件驗證**

```bash
cd Backend && COVERAGE_CORE=sysmon uv run pytest -q
uv run ruff check
```

---

## Task 7: PR

- [x] **Step 1: 自我檢查**

- [x] 6 個 `search_text` 的欄位組成逐一比對 `spec.md` §3——**沒有任何 `contact_*` 或 `comment` / `progress_note` / `pole_note`**
- [x] `tests/test_search_schema.py` 的 `EXPECTED_SOURCE_COLUMNS` 與 migration 的 `_SEARCH_TEXT` 一致
- [x] **`list_active` 與 `count_active` 的本體中不存在任何條件組裝**，兩者的條件都來自 `_active_conditions()` 的單一呼叫
- [x] `build_search_condition` 的第一個欄位是位置必填參數（無欄位呼叫會 `TypeError`）
- [x] wildcard escape 對 `%`、`_`、`\` 三者皆有測試，且含混合案例
- [x] migration 為手寫，未使用 autogenerate；可 `downgrade -1` 後再 `upgrade head`
- [x] 未新增 GraphQL error masking extension 或自訂 handler（沿用既有 `raise ValueError` 慣例）
- [x] `uv run ruff check` 乾淨
- [x] 既有測試失敗數與改動前相同

- [x] **Step 2: 開 PR**

```bash
cd /Users/liuxiangxin/Documents/sideproject/optimized-version
git push -u origin feat/resource-search-backend
gh pr create --base main --title "feat(search): keyword search infrastructure and main-table filters (011 Phase 1)" --body "..."
```

PR body 需包含：
- 範圍：Phase 1 = migration + 主表搜尋；Phase 2（1:N EXISTS、相關性排序、`ticketTasks`）另開
- **可搜欄位表**與明確排除的 PII／備註欄位（讓 reviewer 直接核對，這是本 PR 最需要被檢查的地方）
- 部署注意：migration 會 `CREATE EXTENSION pg_trgm`，需確認正式環境 DB 使用者有建立 extension 的權限
- Test plan：新增測試清單 + 既有 baseline 失敗數

---

## Phase 2 預告（不在本 PR）

- `stations` 的 `EXISTS`：`station_properties`、`secondary_locations`
- `tickets` 的 `EXISTS`：`ticket_tasks` → `task_properties`、`secondary_locations`
- `similarity()` 相關性排序（ADR-083）
- `ticketTasks(q:)`（若屆時仍判斷有價值）
- **Staging 效能驗證**：以有代表性的資料量 `EXPLAIN ANALYZE` 實測——(1) `q` 單獨查詢的延遲；(2) `q` + `bounds` 組合時 planner 在 trigram GIN 與 PostGIS GiST 之間的選擇；(3) 2 字查詢在地理集中的資料集上的候選集大小。Phase 1 的 Task 6 只驗證索引接線正確，**不涵蓋這三項**（spec §6 已記錄為待實測）
