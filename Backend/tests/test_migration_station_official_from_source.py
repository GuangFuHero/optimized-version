"""Migration af6e25b0d8db: `is_official` is worked out from `source`, which holds two values.

Built like tests/test_migration_audit_export_grant.py: stop before the revision, write the stations a
deployed database holds, upgrade, look, and step back.
"""

import asyncio
import os
import sys
import uuid as uuid_mod

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_BEFORE = "b5d8e2a41c07"
_REVISION = "af6e25b0d8db"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (source, is_official) as a deployed database may hold them, and what each becomes.
_ROWS = {
    "seed's official": (("gov", True), ("official", True)),
    "imported": (("import", False), ("official", True)),
    "made in the back office": (("official", False), ("official", True)),
    "made on the site": (("user", False), ("user", False)),
    "marked official by hand": (("user", True), ("official", True)),
    "from somewhere else": (("crawler", False), (None, False)),
    "not known": ((None, False), (None, False)),
}


async def _alembic(url: str, *args: str) -> None:
    """Run alembic against `url` in a subprocess, failing the test on an error."""
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "alembic",
        *args,
        cwd=_BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": url},
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        pytest.fail(f"alembic {' '.join(args)} failed:\n{stdout.decode()}\n{stderr.decode()}")


async def _insert(conn, station_uuid: str, source: str | None, is_official: bool | None = None) -> None:
    await conn.execute(
        text(
            "INSERT INTO base_geometries (uuid, property_name, geometry)"
            " VALUES (:u, 'station', ST_GeomFromText('POINT(121.5 23.7)', 4326))"
        ),
        {"u": station_uuid},
    )
    columns, values = "uuid, level, is_duplicate, is_temporary, source", ":u, 0, false, false, :s"
    if is_official is not None:
        columns, values = f"{columns}, is_official", f"{values}, :o"
    await conn.execute(
        text(f"INSERT INTO stations ({columns}) VALUES ({values})"),
        {"u": station_uuid, "s": source, "o": is_official},
    )


async def _states(conn, uuids: dict[str, str]) -> dict[str, tuple]:
    rows = (await conn.execute(text("SELECT uuid::text, source, is_official FROM stations"))).all()
    by_uuid = {row[0]: (row[1], row[2]) for row in rows}
    return {case: by_uuid[station_uuid] for case, station_uuid in uuids.items()}


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcome():
    """One database, migrated up and back, with what it said at each step."""
    db_name = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_station_official"
    url = TEST_DB_URL.rsplit("/", 1)[0] + "/" + db_name
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await conn.exec_driver_sql(f'CREATE DATABASE "{db_name}"')
    engine = create_async_engine(url, isolation_level="AUTOCOMMIT")
    uuids = {case: str(uuid_mod.uuid4()) for case in _ROWS}
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await _alembic(url, "upgrade", _BEFORE)
        async with engine.connect() as conn:
            for case, ((source, is_official), _) in _ROWS.items():
                await _insert(conn, uuids[case], source, is_official)
        await _alembic(url, "upgrade", _REVISION)
        async with engine.connect() as conn:
            upgraded = await _states(conn, uuids)
            refused = None
            try:
                await _insert(conn, str(uuid_mod.uuid4()), "gov")
            except IntegrityError as err:
                refused = str(err.orig)
            await conn.execute(
                text("UPDATE stations SET source = 'user' WHERE uuid = :u"), {"u": uuids["imported"]}
            )
            followed = (await _states(conn, {"imported": uuids["imported"]}))["imported"]
        await _alembic(url, "downgrade", _BEFORE)
        async with engine.connect() as conn:
            downgraded = await _states(conn, uuids)
        return {"upgraded": upgraded, "refused": refused, "followed": followed, "downgraded": downgraded}
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_every_old_value_becomes_user_official_or_not_known(outcome):
    """The seed's `gov`, an import and anything marked official are official; only `user` stays as it was."""
    assert outcome["upgraded"] == {case: after for case, (_, after) in _ROWS.items()}


@pytest.mark.asyncio(loop_scope="module")
async def test_a_source_outside_the_two_values_is_refused(outcome):
    """The CHECK holds whatever writes the row, the seed and plain SQL included."""
    assert outcome["refused"] is not None and "ck_stations_source" in outcome["refused"]


@pytest.mark.asyncio(loop_scope="module")
async def test_is_official_follows_source_when_it_changes(outcome):
    """Nothing writes `is_official` any more; it changes with `source`."""
    assert outcome["followed"] == ("user", False)


@pytest.mark.asyncio(loop_scope="module")
async def test_stepping_back_keeps_each_station_official_or_not(outcome):
    """A plain column again, true where `source` is official; the old `gov` and `import` stay folded."""
    expected = {case: after for case, (_, after) in _ROWS.items()}
    expected["imported"] = ("user", False)  # the test above moved it
    assert outcome["downgraded"] == expected
