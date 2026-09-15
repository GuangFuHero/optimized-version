"""Guard that `alembic upgrade head` and `Base.metadata` describe the same tables and columns.

Every other test builds its schema with `Base.metadata.create_all` (see conftest's `db` and
`db_session`), so the suite has no way to see a column that exists in one and not the other.
That is exactly how `users.password` survived: `d19cda4d9871` was the expand half of an
expand/contract pair whose contract stage was never written, so migration-built databases
carried a column the models had already dropped, and nothing failed.

This runs the real migrations against a throwaway database and diffs the result, so the next
divergence is caught here rather than by hand. Only table and column *names* are compared —
types and nullability drift for legitimate reasons (server defaults, dialect aliases) and
would make this noisy without catching more of the class of bug it exists for.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401 — loads every model onto Base.metadata
from app.models.auth import Base
from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_MIGRATION_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_migrations"
_MIGRATION_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _MIGRATION_DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Postgres objects that are never in Base.metadata: alembic's bookkeeping table and what the
# PostGIS extension installs.
_IGNORED_TABLES = {"alembic_version", "spatial_ref_sys"}


def _reflect(connection) -> dict[str, set[str]]:
    inspector = inspect(connection)
    return {
        table: {column["name"] for column in inspector.get_columns(table)}
        for table in inspector.get_table_names()
        if table not in _IGNORED_TABLES
    }


async def _drop_migration_db(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_MIGRATION_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_MIGRATION_DB_NAME}"')


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def migrated_schema():
    """Build a throwaway database with `alembic upgrade head` and yield `{table: {columns}}`.

    Alembic runs as a subprocess rather than in-process because `alembic/env.py` calls
    `asyncio.run()`, which cannot be re-entered from inside pytest-asyncio's running loop, and
    because it reads `SQLALCHEMY_DATABASE_URL` at import time — already bound to the ordinary
    test DB by then. A subprocess is also how migrations actually run.

    Session-scoped so the migrations run once; the yielded value is a plain dict, so the
    function-scoped tests can read it from their own event loops.
    """
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop_migration_db(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_MIGRATION_DB_NAME}"')

        setup = create_async_engine(_MIGRATION_DB_URL, isolation_level="AUTOCOMMIT")
        async with setup.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await setup.dispose()

        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "alembic",
            "upgrade",
            "head",
            cwd=_BACKEND_DIR,
            env={**os.environ, "SQLALCHEMY_DATABASE_URL": _MIGRATION_DB_URL},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            pytest.fail(f"alembic upgrade head failed:\n{stdout.decode()}\n{stderr.decode()}")

        engine = create_async_engine(_MIGRATION_DB_URL)
        async with engine.connect() as conn:
            schema = await conn.run_sync(_reflect)
        await engine.dispose()

        yield schema
    finally:
        await _drop_migration_db(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="session")
async def test_migrations_and_models_define_the_same_tables(migrated_schema):
    """A table created by a migration but not by a model, or the reverse, is a bug in one of them."""
    model_tables = set(Base.metadata.tables)
    assert set(migrated_schema) == model_tables, (
        f"only in migrations: {sorted(set(migrated_schema) - model_tables)}; "
        f"only in models: {sorted(model_tables - set(migrated_schema))}"
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_migrations_and_models_define_the_same_columns(migrated_schema):
    """Reports every drifting table at once, so one run shows the whole gap rather than the first."""
    drift = {}
    for name, table in Base.metadata.tables.items():
        if name not in migrated_schema:
            continue  # the table test above already reports this
        model_columns = {column.name for column in table.columns}
        only_migrations = migrated_schema[name] - model_columns
        only_models = model_columns - migrated_schema[name]
        if only_migrations or only_models:
            drift[name] = {
                "only in migrations": sorted(only_migrations),
                "only in models": sorted(only_models),
            }
    assert not drift, f"migration/model column drift: {drift}"
