"""Guard the ADR-420 migration: suggestions get the field's value before, empty on existing rows.

Nothing is backfilled, since the value at the time of an old submit was never recorded. Downgrade drops
the column, and with it every value recorded.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The revision this one chains off, and this one.
_BEFORE = "b5d8e2a41c07"
_AFTER = "f563197f1f3c"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_previous_value"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


async def _column(engine) -> dict | None:
    """The previous_value column as the database describes it, or None without one."""
    async with engine.connect() as conn:
        columns = await conn.run_sync(lambda sync: inspect(sync).get_columns("station_update_suggestions"))
    return next((c for c in columns if c["name"] == "previous_value"), None)


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """The suggestions table before the migration, upgraded, then downgraded."""
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
        code, output = await _alembic("upgrade", _AFTER)
        assert code == 0, output
        column_after = await _column(engine)

        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        column_back = await _column(engine)
        await engine.dispose()

        yield {"column_after": column_after, "column_back": column_back}
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrade_adds_an_empty_text_column(outcomes):
    """Nullable text: rows sent before it read null, which the site shows as nothing recorded."""
    column = outcomes["column_after"]
    assert column is not None
    assert column["nullable"] is True
    assert column["type"].python_type is str


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_drops_the_column(outcomes):
    """The values recorded go with it."""
    assert outcomes["column_back"] is None
