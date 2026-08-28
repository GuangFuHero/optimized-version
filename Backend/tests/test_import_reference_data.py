"""Memory-safety and swap tests for scripts/import_reference_data.py.

This script's failure mode is memory, not correctness: an earlier version collected all ~9.2M OSM
address rows into a list and OOM-killed the 4 GB staging VM. The tests that matter here therefore
assert *laziness* — that `_osm_rows` and `_csv_chunks` never hold their source whole — rather than
only that the output is right. A refactor that reintroduces a list would still pass a
purely functional test, which is exactly how the original bug shipped.
"""

import tracemalloc
from types import GeneratorType

import osmium
import osmium.osm.mutable as mutable_osm
import pytest
from sqlalchemy import text

from scripts.import_reference_data import (
    _CHUNK_BYTES,
    _OSM_ADMIN_SQL,
    _copy_csv,
    _csv_chunks,
    _osm_rows,
)

# --------------------------------------------------------------------------- _csv_chunks


@pytest.mark.asyncio
async def test_csv_chunks_does_not_consume_the_whole_source():
    """The first chunk must be emitted long before the source generator is exhausted."""
    total = 200_000
    pulled = 0

    def source():
        nonlocal pulled
        for i in range(total):
            pulled += 1
            yield (i, "x" * 200)

    chunks = _csv_chunks(source())
    try:
        first = await anext(chunks)
    finally:
        await chunks.aclose()

    assert len(first) >= _CHUNK_BYTES
    # The assertion the whole rewrite exists for: COPY started while most rows were still unread.
    assert pulled < total // 2, f"consumed {pulled}/{total} rows to produce one chunk"


@pytest.mark.asyncio
async def test_csv_chunks_peak_memory_is_bounded_not_proportional():
    """Streaming ~110 MB of CSV must not cost ~110 MB of process memory."""
    rows = ((i, "x" * 900) for i in range(120_000))

    tracemalloc.start()
    tracemalloc.reset_peak()
    emitted = 0
    async for chunk in _csv_chunks(rows):
        emitted += len(chunk)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    assert emitted > 100 * 1024 * 1024, "test data too small to be evidence of anything"
    # A chunk is live three times at the moment it is yielded — the StringIO buffer (UCS-4, so 4x),
    # the str from getvalue(), and the encoded bytes — which measures at ~7.2x _CHUNK_BYTES. The
    # bound below is that plus headroom; what matters is that it does not move when `emitted` does.
    assert peak < 10 * _CHUNK_BYTES, f"peak {peak / 1e6:.1f} MB for {emitted / 1e6:.0f} MB streamed"


# --------------------------------------------------------------------------- _osm_rows


def _write_pbf(path, nodes):
    """Write a minimal .osm.pbf containing `nodes`, so the OSM tests need no 326 MB download."""
    writer = osmium.SimpleWriter(str(path))
    for node in nodes:
        writer.add_node(node)
    writer.close()


def test_osm_rows_is_a_generator(tmp_path):
    """Not merely iterable — an eagerly built list wrapped in iter() would pass a weaker check."""
    pbf = tmp_path / "one.osm.pbf"
    _write_pbf(pbf, [mutable_osm.Node(id=1, location=(121.5, 25.03), tags={"addr:housenumber": "12號"})])

    assert isinstance(_osm_rows(pbf), GeneratorType)


def test_osm_rows_parses_and_skips_unusable_nodes(tmp_path):
    """Only nodes with a house number, a valid location and a parseable address are yielded."""
    pbf = tmp_path / "mixed.osm.pbf"
    _write_pbf(
        pbf,
        [
            mutable_osm.Node(
                id=1,
                location=(121.5, 25.03),
                tags={"addr:housenumber": "12號", "addr:street": "文化路二段"},
            ),
            mutable_osm.Node(id=2, location=(121.6, 25.04), tags={"amenity": "cafe"}),
            # No location: reading .lon on this raises, which is why the guard exists.
            mutable_osm.Node(id=3, tags={"addr:housenumber": "7號"}),
            # Parses to nothing usable: parse_tw_address raises ValueError.
            mutable_osm.Node(id=4, location=(121.7, 25.05), tags={"addr:housenumber": "樓"}),
        ],
    )

    rows = list(_osm_rows(pbf))

    assert rows == [(1, "SRID=4326;POINT(121.5 25.03)", "文化路", "2", None, None, "12")]


# --------------------------------------------------------------------------- _copy_csv


@pytest.mark.asyncio
async def test_copy_csv_loads_from_a_generator_and_drops_staging(db):
    """The whole path — generator in, rows in the live table, no staging table left behind."""
    conn = await db.connection()
    rows = (
        (
            f"6500100-{i:03d}",
            "臺北市",
            "信義區",
            f"里{i}",
            f"SRID=4326;MULTIPOLYGON(((121 25, 121.{i} 25, 121 25.{i}, 121 25)))",
        )
        for i in range(5)
    )

    count = await _copy_csv(
        conn, "ref_villages", ["villcode", "county", "town", "village", "geom"], rows
    )

    assert count == 5
    assert await conn.scalar(text("SELECT count(*) FROM ref_villages")) == 5
    assert await conn.scalar(text("SELECT to_regclass('ref_villages_staging')")) is None


@pytest.mark.asyncio
async def test_copy_csv_replaces_rather_than_appends(db):
    """A re-import must leave only the new rows — the TRUNCATE half of the swap."""
    conn = await db.connection()
    await conn.execute(
        text("INSERT INTO ref_roads (county, town, road) VALUES ('臺北市', '信義區', '舊路')")
    )

    count = await _copy_csv(
        conn, "ref_roads", ["county", "town", "road"], iter([("臺北市", "信義區", "新路")])
    )

    assert count == 1
    assert await conn.scalar(text("SELECT road FROM ref_roads")) == "新路"


@pytest.mark.asyncio
async def test_copy_csv_handles_an_empty_source(db):
    """Zero rows must complete the swap, not raise — COPY with no chunks is a valid empty load."""
    conn = await db.connection()
    await conn.execute(
        text("INSERT INTO ref_roads (county, town, road) VALUES ('臺北市', '信義區', '舊路')")
    )

    count = await _copy_csv(conn, "ref_roads", ["county", "town", "road"], iter([]))

    assert count == 0
    assert await conn.scalar(text("SELECT count(*) FROM ref_roads")) == 0


@pytest.mark.asyncio
async def test_osm_admin_sql_fills_admin_columns_once_per_point(db):
    """The pre-swap UPDATE stamps 縣市/鄉鎮市區/村里, and overlapping polygons must not duplicate rows."""
    conn = await db.connection()
    # Two villages whose polygons overlap over the whole unit square. Real 村里 boundaries do this
    # at their margins; a join instead of an UPDATE would emit two rows here and break the PK.
    unit_square = "ST_GeomFromText('MULTIPOLYGON(((0 0, 0 1, 1 1, 1 0, 0 0)))', 4326)"
    await conn.execute(
        text(
            "INSERT INTO ref_villages (villcode, county, town, village, geom) VALUES "
            f"('A', '臺北市', '信義區', '甲里', {unit_square}), "
            f"('B', '臺北市', '信義區', '乙里', {unit_square})"
        )
    )
    rows = iter(
        [
            (1, "SRID=4326;POINT(0.5 0.5)", "文化路", "2", None, None, "12"),  # inside both
            (2, "SRID=4326;POINT(9 9)", "中山路", None, None, None, "3"),  # inside neither
        ]
    )

    count = await _copy_csv(
        conn,
        "osm_address_points",
        ["id", "geom", "road", "section", "lane", "alley", "no"],
        rows,
        pre_swap_sql=_OSM_ADMIN_SQL,
    )

    assert count == 2, "an overlapping polygon must not duplicate a point"
    inside = (
        await conn.execute(
            text("SELECT county, town, village, road, no FROM osm_address_points WHERE id = 1")
        )
    ).one()
    assert inside == ("臺北市", "信義區", inside.village, "文化路", "12")
    assert inside.village in ("甲里", "乙里")
    # Outside every polygon is a legitimate result (offshore, boundary gaps) — NULL, not a failure.
    outside = (
        await conn.execute(text("SELECT county, road FROM osm_address_points WHERE id = 2"))
    ).one()
    assert outside == (None, "中山路")
