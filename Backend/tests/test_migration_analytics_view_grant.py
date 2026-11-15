"""Migration 162b65c8ff5f: existing databases gain `analytics.view` as the RBAC seed grants it.

Built like tests/test_migration_team_admin_grants.py: stop before the revision, write the roles a
deployed database holds (one grant already set at runtime), upgrade, read the grants, step back.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.permissions import Perm
from scripts.seed_rbac import ROLES_DATA
from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_BEFORE = "42cb936beed5"
_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_analytics_view"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def _alembic(*args: str) -> None:
    """Run alembic against the scratch database in a subprocess, failing the test on an error."""
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
    if process.returncode != 0:
        pytest.fail(f"alembic {' '.join(args)} failed:\n{stdout.decode()}\n{stderr.decode()}")


async def _state(conn) -> dict:
    """{role: scope} for every grant of analytics.view, and whether the key is registered."""
    rows = await conn.execute(
        text(
            "SELECT r.name, a.scope FROM role_permission_assign a"
            " JOIN roles r ON r.uuid = a.role_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
            " WHERE p.key = 'analytics.view'"
        )
    )
    key = await conn.scalar(text("SELECT count(*) FROM permissions WHERE key = 'analytics.view'"))
    return {"grants": dict(rows.all()), "key": bool(key)}


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def states():
    """Upgrade a database holding the seeded roles, then step back; yield both states."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)')
        await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
    engine = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await _alembic("upgrade", _BEFORE)
        async with engine.connect() as conn:
            for spec in ROLES_DATA:
                await conn.execute(
                    text("INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :n, :k)"),
                    {"n": spec["name"], "k": spec["kind"]},
                )
            # member narrowed to `none` at runtime before the key reached the migration.
            await conn.execute(
                text("INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'analytics.view')")
            )
            await conn.execute(
                text(
                    "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
                    " SELECT gen_random_uuid(), r.uuid, p.uuid, 'none' FROM roles r, permissions p"
                    " WHERE r.name = 'member' AND p.key = 'analytics.view'"
                )
            )
        await _alembic("upgrade", "head")
        async with engine.connect() as conn:
            upgraded = await _state(conn)
        await _alembic("downgrade", _BEFORE)
        async with engine.connect() as conn:
            downgraded = await _state(conn)
        yield {"upgraded": upgraded, "downgraded": downgraded}
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}" WITH (FORCE)')
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="session")
async def test_existing_databases_gain_what_the_seed_grants(states):
    """Every role the seed grants analytics.view gets it, except where a runtime grant already stood."""
    seeded = {
        spec["name"]: spec["permissions"][Perm.ANALYTICS_VIEW]
        for spec in ROLES_DATA
        if Perm.ANALYTICS_VIEW in spec["permissions"]
    }
    assert states["upgraded"]["grants"] == {**seeded, "member": "none"}


@pytest.mark.asyncio(loop_scope="session")
async def test_stepping_back_removes_the_key_and_every_grant(states):
    """The runtime grant goes with the key."""
    assert states["downgraded"] == {"grants": {}, "key": False}
