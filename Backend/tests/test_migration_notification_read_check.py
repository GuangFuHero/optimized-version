"""Migration 9dd1f61063fe: a notification is read exactly when it has a read time.

Two databases: one whose rows agree, and one holding a row that does not, which the upgrade refuses
rather than guess which column is right.
"""

import asyncio
import os
import sys
from datetime import UTC, datetime

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_BEFORE = "af6e25b0d8db"
_REVISION = "9dd1f61063fe"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_NOON = datetime(2026, 10, 29, 4, 0, tzinfo=UTC)


async def _alembic(url: str, *args: str) -> tuple[int, str]:
    """Run alembic against `url` in a subprocess; returns its exit code and what it wrote to stderr."""
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
    _, stderr = await process.communicate()
    return process.returncode, stderr.decode()


async def _notify(conn, title: str, *, read: bool, read_at: datetime | None) -> None:
    await conn.execute(
        text(
            "INSERT INTO notifications (uuid, recipient_uuid, type, priority, title, body, read, read_at)"
            " SELECT gen_random_uuid(), uuid, 'system', 'medium', :t, '內容', :r, :at"
            " FROM users WHERE name = '收件人'"
        ),
        {"t": title, "r": read, "at": read_at},
    )


async def _refused(conn, title: str, *, read: bool, read_at: datetime | None) -> str | None:
    """The error a disagreeing row gets, or None when it is stored."""
    try:
        await _notify(conn, title, read=read, read_at=read_at)
    except IntegrityError as err:
        return str(err.orig)
    return None


async def _run(suffix: str, *, disagreeing_row: bool) -> dict:
    db_name = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_notification_read_{suffix}"
    url = TEST_DB_URL.rsplit("/", 1)[0] + "/" + db_name
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await conn.exec_driver_sql(f'CREATE DATABASE "{db_name}"')
    engine = create_async_engine(url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        assert (await _alembic(url, "upgrade", _BEFORE))[0] == 0
        async with engine.connect() as conn:
            await conn.execute(
                text(
                    "INSERT INTO users (uuid, name, credibility_score)"
                    " VALUES (gen_random_uuid(), '收件人', 50)"
                )
            )
            await _notify(conn, "未讀", read=False, read_at=None)
            await _notify(conn, "已讀", read=True, read_at=_NOON)
            if disagreeing_row:
                await _notify(conn, "已讀沒時間", read=True, read_at=None)
        code, stderr = await _alembic(url, "upgrade", _REVISION)
        upgraded = code == 0
        result = {"upgraded": upgraded}
        if not upgraded:
            result["says"] = stderr
        if upgraded:
            async with engine.connect() as conn:
                result["read_without_time"] = await _refused(conn, "a", read=True, read_at=None)
                result["time_without_read"] = await _refused(conn, "b", read=False, read_at=_NOON)
                result["agreeing"] = await _refused(conn, "c", read=True, read_at=_NOON)
            assert (await _alembic(url, "downgrade", _BEFORE))[0] == 0
            async with engine.connect() as conn:
                result["after_downgrade"] = await _refused(conn, "d", read=True, read_at=None)
        return result
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await admin.dispose()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """Both databases, migrated up and, where it went up, back."""
    return {
        "agreeing": await _run("agreeing", disagreeing_row=False),
        "disagreeing": await _run("disagreeing", disagreeing_row=True),
    }


@pytest.mark.asyncio(loop_scope="module")
async def test_after_the_upgrade_a_disagreeing_row_is_refused_either_way(outcomes):
    """Read with no time, or a time on an unread one; a row that agrees is stored as before."""
    agreeing = outcomes["agreeing"]
    assert agreeing["upgraded"] is True
    assert "ck_notifications_read_matches_read_at" in agreeing["read_without_time"]
    assert "ck_notifications_read_matches_read_at" in agreeing["time_without_read"]
    assert agreeing["agreeing"] is None


@pytest.mark.asyncio(loop_scope="module")
async def test_a_database_holding_a_disagreeing_row_does_not_upgrade(outcomes):
    """Nothing to guess from: the upgrade stops, says how many rows and how to list them."""
    disagreeing = outcomes["disagreeing"]
    assert disagreeing["upgraded"] is False
    assert "1 notifications have `read` and `read_at` disagreeing" in disagreeing["says"]
    assert (
        "SELECT uuid, read, read_at FROM notifications WHERE NOT (read = (read_at IS NOT NULL))"
        in disagreeing["says"]
    )


@pytest.mark.asyncio(loop_scope="module")
async def test_stepping_back_drops_the_check(outcomes):
    """Back before the revision, a disagreeing row is stored again."""
    assert outcomes["agreeing"]["after_downgrade"] is None
