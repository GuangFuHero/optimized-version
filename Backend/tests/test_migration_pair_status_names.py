"""ADR-391: a pair card's verdict statuses say what was decided — confirmed_duplicate, not_duplicate.

`confirmed` / `rejected` read like "approved" / "refused" elsewhere (station suggestions, role
requests), and backwards for a card: `rejected` meant "not a duplicate", the good outcome for both
tickets. The migration renames the values in place and rebuilds the CHECK; the downgrade renames
them back. The audit event types keep `confirmed` / `rejected`: an event records what the reviewer
did, which reads the same either way.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The merge refs migration this one chains off (Spec 028).
_BEFORE = "c3f1a9d27b54"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_pair_status_names"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_LOWS = {
    "confirmed": "00000000-0000-0000-0000-000000000001",
    "rejected": "00000000-0000-0000-0000-000000000003",
    "dup_ignored": "00000000-0000-0000-0000-000000000005",
}


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


def _insert(status: str, low: str, high: str):
    return text(
        "INSERT INTO duplicate_pairs (uuid, entity_kind, low_uuid, high_uuid, method, source_layer, status) "
        f"VALUES (gen_random_uuid(), 'ticket', '{low}', '{high}', 'manual', 'manual', '{status}')"
    )


async def _statuses(engine) -> dict[str, str]:
    async with engine.connect() as conn:
        rows = await conn.execute(text("SELECT low_uuid::text, status FROM duplicate_pairs"))
        by_low = dict(rows.all())
    return {old: by_low[low] for old, low in _LOWS.items()}


async def _refuses(engine, status: str) -> bool:
    try:
        async with engine.begin() as conn:
            await conn.execute(
                _insert(
                    status, "00000000-0000-0000-0000-000000000007", "00000000-0000-0000-0000-000000000008"
                )
            )
        async with engine.begin() as conn:
            await conn.execute(
                text("DELETE FROM duplicate_pairs WHERE low_uuid = '00000000-0000-0000-0000-000000000007'")
            )
        return False
    except IntegrityError:
        return True


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """Stop before this migration with old-named cards, upgrade, then downgrade again."""
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
        async with engine.begin() as conn:
            for status, low in _LOWS.items():
                high = low[:-1] + str(int(low[-1]) + 1)
                await conn.execute(_insert(status, low, high))

        code, output = await _alembic("upgrade", "head")
        assert code == 0, output
        upgraded = await _statuses(engine)
        old_refused_after_upgrade = await _refuses(engine, "confirmed")

        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        downgraded = await _statuses(engine)
        new_refused_after_downgrade = await _refuses(engine, "confirmed_duplicate")
        await engine.dispose()

        yield {
            "upgraded": upgraded,
            "old_refused_after_upgrade": old_refused_after_upgrade,
            "downgraded": downgraded,
            "new_refused_after_downgrade": new_refused_after_downgrade,
        }
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrade_renames_the_verdicts_already_written(outcomes):
    """Cards decided before the rename read with the new names; pending ones are untouched."""
    assert outcomes["upgraded"] == {
        "confirmed": "confirmed_duplicate",
        "rejected": "not_duplicate",
        "dup_ignored": "dup_ignored",
    }


@pytest.mark.asyncio(loop_scope="module")
async def test_the_old_names_are_refused_after_the_upgrade(outcomes):
    """The rebuilt CHECK allows only the new names."""
    assert outcomes["old_refused_after_upgrade"]


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_renames_them_back(outcomes):
    """The way back restores the old names and the old CHECK."""
    assert outcomes["downgraded"] == {
        "confirmed": "confirmed",
        "rejected": "rejected",
        "dup_ignored": "dup_ignored",
    }
    assert outcomes["new_refused_after_downgrade"]
