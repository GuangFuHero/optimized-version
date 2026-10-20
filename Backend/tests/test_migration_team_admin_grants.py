"""Migration 79a19cabc98a: existing databases gain the team admin's new grants (Spec/026).

Built like tests/test_migration_join_requests.py: stop before it, write the roles a deployed
database holds (one grant already set at runtime), upgrade, read the grants.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_BEFORE = "0662cf1d2c83"
_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_grants"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def _alembic_join_on(url: str, *args: str) -> None:
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


async def _grants(conn) -> set[tuple[str, str, str]]:
    """(role, capability, scope) for the two capabilities this revision grants."""
    rows = await conn.execute(
        text(
            "SELECT r.name, p.key, a.scope FROM role_permission_assign a"
            " JOIN roles r ON r.uuid = a.role_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
            " WHERE p.key IN ('team.edit', 'team.audit.view')"
        )
    )
    return set(rows.all())


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def grants():
    """Upgrade a database holding the roles, then step back; yield both grant sets."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)')
        await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
    engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await _alembic_join_on(_DB_URL, "upgrade", _BEFORE)
        async with engine.connect() as conn:
            for name, kind in (("admin", "team"), ("super_admin", "platform"), ("member", "team")):
                await conn.execute(
                    text("INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :n, :k)"),
                    {"n": name, "k": kind},
                )
            await conn.execute(
                text("INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'team.edit')")
            )
            # super_admin's team.edit at `all`, as the seed left it; must not be touched.
            await conn.execute(
                text(
                    "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
                    " SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p"
                    " WHERE r.name = 'super_admin' AND p.key = 'team.edit'"
                )
            )
        await _alembic_join_on(_DB_URL, "upgrade", "head")
        async with engine.connect() as conn:
            upgraded = await _grants(conn)
        await _alembic_join_on(_DB_URL, "downgrade", _BEFORE)
        async with engine.connect() as conn:
            downgraded = await _grants(conn)
        yield {"upgraded": upgraded, "downgraded": downgraded}
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)')
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="session")
async def test_existing_databases_gain_the_grants(grants):
    """What the seed would write on a new database."""
    assert grants["upgraded"] == {
        ("super_admin", "team.edit", "all"),
        ("admin", "team.edit", "team"),
        ("admin", "team.audit.view", "team"),
        ("super_admin", "team.audit.view", "all"),
    }


@pytest.mark.asyncio(loop_scope="session")
async def test_stepping_back_removes_only_what_it_added(grants):
    """The grant set before the revision stays."""
    assert grants["downgraded"] == {("super_admin", "team.edit", "all")}
