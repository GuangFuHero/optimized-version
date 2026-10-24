"""Guard the ADR-344 migration's downgrade: it must not silently drop verdict_revoked events.

test_dedup_schema covers the upgraded constraint on both schemas. This covers the way back:
rebuilding the old CHECK fails while any `verdict_revoked` event exists, so a downgrade can never
lose a record of a revoked verdict; once there are none, the old constraint returns.
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

# The revision the verdict_revoked migration chains off.
_BEFORE = "1649d30b0122"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_verdict_revoked"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

_INSERT = text(
    "INSERT INTO dedup_audit_events (uuid, entity_kind, event_type, source_layer) "
    "VALUES (gen_random_uuid(), 'ticket_task', 'verdict_revoked', 'manual')"
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


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def downgrade_outcomes():
    """Upgrade, try a downgrade with a verdict_revoked row, then without; yield what happened."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
        engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        code, output = await _alembic("upgrade", "head")
        assert code == 0, output
        async with engine.connect() as conn:
            await conn.execute(_INSERT)
        blocked_code, _ = await _alembic("downgrade", _BEFORE)
        async with engine.connect() as conn:
            kept = (
                await conn.execute(
                    text("SELECT count(*) FROM dedup_audit_events WHERE event_type = 'verdict_revoked'")
                )
            ).scalar_one()
            await conn.execute(text("DELETE FROM dedup_audit_events"))
        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        try:
            async with engine.connect() as conn:
                await conn.execute(_INSERT)
            rejected_after = False
        except IntegrityError:
            rejected_after = True
        await engine.dispose()

        yield {"blocked_code": blocked_code, "kept": kept, "rejected_after": rejected_after}
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_refuses_while_a_verdict_revoked_event_exists(downgrade_outcomes):
    """Rebuilding the old CHECK validates existing rows, so the downgrade fails instead of deleting."""
    assert downgrade_outcomes["blocked_code"] != 0
    assert downgrade_outcomes["kept"] == 1


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_restores_the_old_constraint(downgrade_outcomes):
    """With no such events, the downgrade succeeds and the old event types are all that is allowed."""
    assert downgrade_outcomes["rejected_after"]
