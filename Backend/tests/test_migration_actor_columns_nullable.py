"""ADR-393: who reviewed a station merge, and who last changed a briefing or an announcement, may be NULL.

The mock seed's section 0 removes the mock accounts on every SEED_MOCK run. A real person's merge,
briefing or announcement that a mock account reviewed, published or last touched used to be deleted
with it, because these three columns could not be emptied. The upgrade lets them be NULL, so the
seed keeps the row and lets the reference go. The downgrade fills a briefing's or an announcement's
from its author, as `209c4375c3e1` did when the column was added, and refuses while a merge has no
reviewer: nobody can be named for it, and deleting the merge would lose the record of the change.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The head this migration chains off.
_BEFORE = "50e667b42105"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_actor_columns_nullable"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

AUTHOR = "99999999-0000-4000-8000-000000000001"
STATION = "99999999-0000-4000-8000-000000000002"
MERGE = "99999999-0000-4000-8000-000000000003"
BRIEFING = "99999999-0000-4000-8000-000000000004"
ANNOUNCEMENT = "99999999-0000-4000-8000-000000000005"
_COLUMNS = (
    ("station_suggestion_merges", "reviewed_by"),
    ("briefings", "updated_by"),
    ("announcements", "updated_by"),
)


async def _alembic(*args: str) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        *args,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": _DB_URL},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    return process.returncode, stdout.decode() + stderr.decode()


async def _drop(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}"')


async def _nullable(engine) -> dict[str, bool]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT table_name, column_name, is_nullable FROM information_schema.columns"
                " WHERE table_schema = 'public' AND (table_name, column_name) IN"
                " (('station_suggestion_merges', 'reviewed_by'), ('briefings', 'updated_by'),"
                " ('announcements', 'updated_by'))"
            )
        )
        found = {f"{table}.{column}": nullable == "YES" for table, column, nullable in rows.all()}
    return {f"{table}.{column}": found[f"{table}.{column}"] for table, column in _COLUMNS}


async def _updaters(engine) -> dict[str, str | None]:
    async with engine.connect() as conn:
        briefing = await conn.scalar(
            text(f"SELECT updated_by::text FROM briefings WHERE uuid = '{BRIEFING}'")
        )
        announcement = await conn.scalar(
            text(f"SELECT updated_by::text FROM announcements WHERE uuid = '{ANNOUNCEMENT}'")
        )
    return {"briefing": briefing, "announcement": announcement}


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """Stop before this migration with one row each, upgrade, empty the columns, then downgrade."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
        engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        code, output = await _alembic("upgrade", _BEFORE)
        assert code == 0, output
        before = await _nullable(engine)
        async with engine.begin() as conn:
            for statement in (
                f"INSERT INTO users (uuid, name, credibility_score) VALUES ('{AUTHOR}', '真人', 50)",
                (
                    "INSERT INTO base_geometries (uuid, property_name, geometry, created_by)"
                    f" VALUES ('{STATION}', 'station', ST_GeomFromText('POINT(121.5 23.7)', 4326),"
                    f" '{AUTHOR}')"
                ),
                (
                    "INSERT INTO stations (uuid, level, is_duplicate, is_temporary, is_official)"
                    f" VALUES ('{STATION}', 0, false, false, false)"
                ),
                (
                    "INSERT INTO station_suggestion_merges (uuid, station_uuid, changes, status, reviewed_by)"
                    f" VALUES ('{MERGE}', '{STATION}', '[]', 'applied', '{AUTHOR}')"
                ),
                (
                    "INSERT INTO briefings (uuid, content, state, status, created_by, updated_by)"
                    f" VALUES ('{BRIEFING}', '帶水', 'briefing', 'draft', '{AUTHOR}', '{AUTHOR}')"
                ),
                (
                    "INSERT INTO announcements (uuid, content, active, placement, created_by, updated_by)"
                    f" VALUES ('{ANNOUNCEMENT}', '停水', false, 'all', '{AUTHOR}', '{AUTHOR}')"
                ),
            ):
                await conn.execute(text(statement))

        code, output = await _alembic("upgrade", "head")
        assert code == 0, output
        after_upgrade = await _nullable(engine)
        async with engine.begin() as conn:
            for table, column in _COLUMNS:
                await conn.execute(text(f"UPDATE {table} SET {column} = NULL"))

        refused_code, refused_output = await _alembic("downgrade", _BEFORE)
        refused_nullable = await _nullable(engine)

        async with engine.begin() as conn:
            await conn.execute(text(f"UPDATE station_suggestion_merges SET reviewed_by = '{AUTHOR}'"))
        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        after_downgrade = await _nullable(engine)
        updaters = await _updaters(engine)
        await engine.dispose()

        yield {
            "before": before,
            "after_upgrade": after_upgrade,
            "refused_code": refused_code,
            "refused_output": refused_output,
            "refused_nullable": refused_nullable,
            "after_downgrade": after_downgrade,
            "updaters": updaters,
        }
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_the_upgrade_lets_the_three_columns_be_null(outcomes):
    """NOT NULL before, nullable after, and the rows written before keep their values until emptied."""
    assert set(outcomes["before"].values()) == {False}
    assert set(outcomes["after_upgrade"].values()) == {True}


@pytest.mark.asyncio(loop_scope="module")
async def test_the_downgrade_refuses_while_a_merge_has_no_reviewer(outcomes):
    """Nobody can be named for it, so the way back stops and says why, changing nothing."""
    assert outcomes["refused_code"] != 0
    assert "station_suggestion_merges" in outcomes["refused_output"]
    assert set(outcomes["refused_nullable"].values()) == {True}


@pytest.mark.asyncio(loop_scope="module")
async def test_the_downgrade_names_the_author_as_the_last_updater(outcomes):
    """As 209c4375c3e1's backfill did: the author stands in for an updater nobody can name."""
    assert set(outcomes["after_downgrade"].values()) == {False}
    assert outcomes["updaters"] == {"briefing": AUTHOR, "announcement": AUTHOR}
