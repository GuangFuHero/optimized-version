"""Schema-level tests for the search_text generated columns and their GIN indexes (feature 011).

These guard the two things that are invisible at the API layer: what actually feeds the
search index (ADR-079's positive list), and whether the trigram operator class is wired
so the planner can use the index at all (ADR-081).
"""

import re

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio

_STATION_UUID = "11111111-1111-1111-1111-111111111111"
_LONG_UUID = "22222222-2222-2222-2222-222222222222"
_TICKET_UUID = "33333333-3333-3333-3333-333333333333"


async def _insert_station(db, uuid: str, name: str, description: str) -> None:
    """Insert a station across both halves of the joined-table inheritance."""
    await db.execute(
        text(
            "INSERT INTO base_geometries (uuid, property_name, geometry) "
            "VALUES (:u, 'station', ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326))"
        ),
        {"u": uuid},
    )
    # level / is_* are Python-side defaults on the model, which raw SQL bypasses.
    await db.execute(
        text(
            "INSERT INTO stations (uuid, name, description, level, is_duplicate, "
            "is_temporary, is_official) VALUES (:u, :n, :d, 0, false, false, false)"
        ),
        {"u": uuid, "n": name, "d": description},
    )
    await db.commit()


async def test_station_search_text_is_generated_from_name_and_description(db):
    """search_text is maintained by PostgreSQL, not the application."""
    await _insert_station(db, _STATION_UUID, "光復國小", "收容所兼物資集散")

    value = await db.scalar(
        text("SELECT search_text FROM stations WHERE uuid = :u"), {"u": _STATION_UUID}
    )
    assert "光復國小" in value
    assert "收容所兼物資集散" in value


async def test_station_search_text_truncates_long_description(db):
    """Description beyond 500 chars must not enter the index (ADR-081 cost ceiling)."""
    await _insert_station(db, _LONG_UUID, "A", "水" * 600)

    value = await db.scalar(
        text("SELECT search_text FROM stations WHERE uuid = :u"), {"u": _LONG_UUID}
    )
    assert value.count("水") == 500


async def test_ticket_search_text_excludes_pii(db):
    """contact_* must never reach search_text (ADR-079)."""
    await db.execute(
        text(
            "INSERT INTO base_geometries (uuid, property_name, geometry) "
            "VALUES (:u, 'request', ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326))"
        ),
        {"u": _TICKET_UUID},
    )
    await db.execute(
        text(
            "INSERT INTO tickets (uuid, title, description, contact_name, contact_email, "
            "contact_phone, status, priority) "
            "VALUES (:u, '需要飲用水', '三樓住戶', '王小姐', 'wang@example.com', "
            "'0912345678', 'open', 'high')"
        ),
        {"u": _TICKET_UUID},
    )
    await db.commit()

    value = await db.scalar(
        text("SELECT search_text FROM tickets WHERE uuid = :u"), {"u": _TICKET_UUID}
    )
    assert "需要飲用水" in value
    assert "王小姐" not in value
    assert "wang@example.com" not in value
    assert "0912345678" not in value


@pytest.mark.parametrize(
    "table",
    [
        "stations",
        "tickets",
        "ticket_tasks",
        "station_properties",
        "task_properties",
        "secondary_locations",
    ],
)
async def test_search_text_gin_index_exists(db, table):
    """Every searchable table carries a trigram GIN index (ADR-081)."""
    found = await db.scalar(
        text("SELECT indexdef FROM pg_indexes WHERE tablename = :t AND indexname = :i"),
        {"t": table, "i": f"ix_{table}_search_text_trgm"},
    )
    assert found is not None, f"{table} is missing its trigram GIN index"
    assert "gin" in found.lower()
    assert "gin_trgm_ops" in found


# 每張表的 search_text 由哪些欄位組成,是 ADR-079 正向表列的實作。
# 這份對照表是「防漂移守衛」:任何人日後在 generation 運算式裡加一個欄位
# (例如順手把 comment 加進去),這裡就會紅。GraphQL 層的 PII 測試抓不到這種改動,
# 因為那只驗證幾個特定字串搜不到,不驗證「還有哪些欄位進了索引」。
EXPECTED_SOURCE_COLUMNS = {
    "stations": {"name", "description"},
    "tickets": {"title", "description"},
    "ticket_tasks": {"task_name", "task_description"},
    "station_properties": {"property_name"},
    "task_properties": {"property_name", "property_value"},
    "secondary_locations": {
        "county",
        "city",
        "lane",
        "alley",
        "no",
        "floor",
        "room",
        "pole_id",
    },
}

# 絕不可出現在任何 search_text 裡 (ADR-079)
FORBIDDEN_COLUMNS = {
    "contact_name",
    "contact_email",
    "contact_phone",  # PII
    "comment",
    "progress_note",
    "pole_note",
    "review_note",  # 自由文字備註
}


@pytest.mark.parametrize("table", sorted(EXPECTED_SOURCE_COLUMNS))
async def test_search_text_generation_expression_has_not_drifted(db, table):
    """The set of columns feeding search_text must match spec 011 §3 exactly."""
    expr = await db.scalar(
        text(
            "SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d "
            "JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum "
            "WHERE a.attrelid = CAST(:t AS regclass) AND a.attname = 'search_text'"
        ),
        {"t": table},
    )
    assert expr is not None, f"{table}.search_text has no generation expression"

    for col in EXPECTED_SOURCE_COLUMNS[table]:
        assert col in expr, f"{table}.search_text no longer includes {col}"
    for col in FORBIDDEN_COLUMNS:
        assert col not in expr, f"{table}.search_text must never include {col} (ADR-079)"


async def test_station_search_index_is_usable_by_the_planner(db):
    """Operator-class wiring check — NOT a performance assertion.

    Small tables are always seq-scanned regardless of indexes, so seq scan is disabled
    for this one query. If gin_trgm_ops is wired correctly the planner will pick the
    index; if the operator class does not match ILIKE '%...%' it cannot, and this fails.
    Actual query performance is validated separately against realistic data volumes.
    """
    await db.execute(text("SET LOCAL enable_seqscan = off"))
    rows = (
        await db.execute(
            text("EXPLAIN SELECT uuid FROM stations WHERE search_text ILIKE '%光復%'")
        )
    ).all()
    plan = "\n".join(row[0] for row in rows)
    assert "ix_stations_search_text_trgm" in plan, plan


async def _bulk_insert_stations(db, count: int, name_expr: str) -> None:
    """Insert `count` stations across both halves of the joined-table inheritance.

    `name_expr` is a SQL expression over `g` (the generate_series value) producing the
    station name, so callers control what does and does not share trigrams with a needle.
    """
    await db.execute(
        text(
            "INSERT INTO base_geometries (uuid, property_name, geometry) "
            "SELECT gen_random_uuid(), 'station', ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326) "
            "FROM generate_series(1, :n) g"
        ),
        {"n": count},
    )
    await db.execute(
        text(
            "INSERT INTO stations (uuid, name, description, level, is_duplicate, "
            "is_temporary, is_official) "
            f"SELECT bg.uuid, {name_expr}, '', 0, false, false, false "
            "FROM (SELECT uuid, row_number() OVER (ORDER BY uuid) AS g "
            "      FROM base_geometries WHERE property_name = 'station') bg"
        )
    )
    await db.execute(text("ANALYZE stations"))


def _bitmap_index_scan_rows(plan: str) -> int:
    """Rows the Bitmap Index Scan actually returned, i.e. how far the index narrowed.

    This is the number that matters, not the Bitmap Heap Scan's — the heap scan reports
    rows surviving the recheck, which is selective either way.
    """
    rows = re.search(r"Bitmap Index Scan\b.*?\(actual\b[^)]*?\brows=(\d+)", plan, re.S)
    assert rows, f"could not read the Bitmap Index Scan row count from plan:\n{plan}"
    return int(rows.group(1))


async def _index_rows_for(db, term: str) -> int:
    await db.execute(text("SET LOCAL enable_seqscan = off"))
    rows = (
        await db.execute(
            text(
                "EXPLAIN (ANALYZE) SELECT uuid FROM stations "
                f"WHERE search_text ILIKE '%{term}%'"
            )
        )
    ).all()
    return _bitmap_index_scan_rows("\n".join(row[0] for row in rows))


async def test_two_character_query_gets_no_selectivity_from_the_trigram_index(db):
    """ADR-150: pins down the cost the 2-character minimum knowingly accepts.

    pg_trgm extracts index keys from a `%...%` LIKE pattern only when the literal can form
    a full 3-character trigram — it cannot pad, because the surrounding text is unknown.
    A 2-character pattern yields no keys, so the scan falls back to GIN_SEARCH_MODE_ALL:
    the whole index is walked and every row rechecked.

    This is NOT a regression to fix — ADR-150 chose to keep MIN_QUERY_LENGTH at 2 because
    2-character CJK queries ("光復", "花蓮") are the main use case. The test exists so the
    number stays honest: if a future pg_trgm or planner change makes 2 characters
    selective, this goes red and ADR-150 can be revisited.
    """
    total = 2000
    await _bulk_insert_stations(db, total, "'花蓮縣光復鄉中正路' || bg.g || '號'")
    await db.execute(
        text(
            "INSERT INTO base_geometries (uuid, property_name, geometry) "
            "VALUES (:u, 'station', ST_SetSRID(ST_MakePoint(121.4, 23.6), 4326))"
        ),
        {"u": _STATION_UUID},
    )
    await db.execute(
        text(
            "INSERT INTO stations (uuid, name, description, level, is_duplicate, "
            "is_temporary, is_official) VALUES (:u, '台北市信義路四段站', '', 0, "
            "false, false, false)"
        ),
        {"u": _STATION_UUID},
    )
    await db.execute(text("ANALYZE stations"))

    two_char = await _index_rows_for(db, "信義")
    three_char = await _index_rows_for(db, "信義路")

    assert three_char == 1, (
        f"a 3-character term must be selective, index returned {three_char} rows"
    )
    assert two_char > total, (
        "if this fails, a 2-character term became selective — pg_trgm or the planner "
        f"changed and ADR-150 should be revisited (index returned {two_char} rows)"
    )
