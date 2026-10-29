"""Migration b5d8e2a41c07: existing databases gain `audit.export` for super_admin (ADR-414).

Built like tests/test_migration_team_admin_grants.py, twice: a database that never heard of the
capability, and one where someone already granted it at runtime through /admin/rbac — that grant,
and its scope, must survive the upgrade, and the downgrade must take every grant of the key with it.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# main's head this migration chains off (ADR-395, project_settings map view).
_BEFORE = "ba24b9c49284"
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


async def _grants(conn) -> set[tuple[str, str]]:
    """(holder, scope) of every grant of audit.export, by role name or by user name."""
    roles = await conn.execute(
        text(
            "SELECT r.name, a.scope FROM role_permission_assign a"
            " JOIN roles r ON r.uuid = a.role_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
            " WHERE p.key = 'audit.export'"
        )
    )
    users = await conn.execute(
        text(
            "SELECT u.name, a.scope FROM user_permission_assign a"
            " JOIN users u ON u.uuid = a.user_uuid JOIN permissions p ON p.uuid = a.permission_uuid"
            " WHERE p.key = 'audit.export'"
        )
    )
    return set(roles.all()) | set(users.all())


async def _key_exists(conn) -> bool:
    return bool(await conn.scalar(text("SELECT count(*) FROM permissions WHERE key = 'audit.export'")))


_RUNTIME_GRANTS = [
    # super_admin narrowed to `own` at runtime; the migration must not widen it back.
    (
        "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
        " SELECT gen_random_uuid(), r.uuid, p.uuid, 'own' FROM roles r, permissions p"
        " WHERE r.name = 'super_admin' AND p.key = 'audit.export'"
    ),
    (
        "INSERT INTO role_permission_assign (uuid, role_uuid, permission_uuid, scope)"
        " SELECT gen_random_uuid(), r.uuid, p.uuid, 'all' FROM roles r, permissions p"
        " WHERE r.name = 'data_auditor' AND p.key = 'audit.export'"
    ),
    ("INSERT INTO users (uuid, name, credibility_score) VALUES (gen_random_uuid(), '特例', 50)"),
    (
        "INSERT INTO user_permission_assign (uuid, user_uuid, permission_uuid, scope)"
        " SELECT gen_random_uuid(), u.uuid, p.uuid, 'all' FROM users u, permissions p"
        " WHERE u.name = '特例' AND p.key = 'audit.export'"
    ),
]


async def _run(suffix: str, *, granted_at_runtime: bool) -> dict:
    """Stop before the revision, write a deployed database's roles, upgrade, step back."""
    db_name = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_audit_export_{suffix}"
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
        await _alembic(url, "upgrade", _BEFORE)
        async with engine.connect() as conn:
            for name in ("super_admin", "data_auditor"):
                await conn.execute(
                    text("INSERT INTO roles (uuid, name, kind) VALUES (gen_random_uuid(), :n, 'platform')"),
                    {"n": name},
                )
            if granted_at_runtime:
                await conn.execute(
                    text("INSERT INTO permissions (uuid, key) VALUES (gen_random_uuid(), 'audit.export')")
                )
                for statement in _RUNTIME_GRANTS:
                    await conn.execute(text(statement))
        await _alembic(url, "upgrade", "head")
        async with engine.connect() as conn:
            upgraded = await _grants(conn)
        await _alembic(url, "downgrade", _BEFORE)
        async with engine.connect() as conn:
            downgraded, key_left = await _grants(conn), await _key_exists(conn)
        return {"upgraded": upgraded, "downgraded": downgraded, "key_left": key_left}
    finally:
        await engine.dispose()
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
        await admin.dispose()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """Both databases, migrated up and back."""
    return {
        "fresh": await _run("fresh", granted_at_runtime=False),
        "runtime": await _run("runtime", granted_at_runtime=True),
    }


@pytest.mark.asyncio(loop_scope="module")
async def test_an_existing_database_gives_super_admin_the_export(outcomes):
    """What the seed would write on a new database: super_admin at `all`, nobody else."""
    assert outcomes["fresh"]["upgraded"] == {("super_admin", "all")}


@pytest.mark.asyncio(loop_scope="module")
async def test_grants_set_at_runtime_are_left_as_they_are(outcomes):
    """A narrowed super_admin stays narrowed; other holders keep theirs."""
    assert outcomes["runtime"]["upgraded"] == {
        ("super_admin", "own"),
        ("data_auditor", "all"),
        ("特例", "all"),
    }


@pytest.mark.asyncio(loop_scope="module")
async def test_stepping_back_removes_the_key_and_every_grant(outcomes):
    """Role grants, user grants and the key itself all go."""
    for outcome in outcomes.values():
        assert outcome["downgraded"] == set()
        assert outcome["key_left"] is False
