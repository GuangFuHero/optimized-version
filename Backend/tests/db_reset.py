"""The test databases: built once per run from alembic, reset between tests by truncation.

The run builds one template database with `alembic upgrade head` (or `Base.metadata.create_all`
when `TEST_SCHEMA=models`) and copies the rows the migrations inserted into a `pytest_baseline`
schema. Each pytest-xdist worker, or the single process of a plain run, clones that template;
`reset()` empties its tables and copies the baseline back before every test that asks for it.
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import asyncpg
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
BASELINE_SCHEMA = "pytest_baseline"
# Sessions with this setting on may change the schema; `own_db` turns it on for its copy.
ALLOW_DDL_SETTING = "pytest.allow_ddl"
# How long a reset waits for a lock before it gives up and names the likely cause.
LOCK_TIMEOUT = "10s"

# The extensions the migrations install, which `TEST_SCHEMA=models` has to install itself.
_EXTENSIONS = ("postgis", "pg_trgm", "h3", "h3_postgis")

# Rejects schema changes outside temporary objects. It runs at `ddl_command_end` and `sql_drop`
# rather than `ddl_command_start` because only those can tell a temporary table from a real one.
_BLOCK_DDL_SQL = f"""
CREATE FUNCTION pytest_block_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE
    command record;
BEGIN
    IF current_setting('{ALLOW_DDL_SETTING}', true) = 'on' THEN
        RETURN;
    END IF;
    IF TG_EVENT = 'sql_drop' THEN
        FOR command IN SELECT * FROM pg_event_trigger_dropped_objects() WHERE NOT is_temporary LOOP
            RAISE EXCEPTION 'DROP of % % in the shared test database: a test that changes the '
                'schema needs @pytest.mark.own_db', command.object_type, command.object_identity;
        END LOOP;
    ELSE
        FOR command IN SELECT * FROM pg_event_trigger_ddl_commands()
            WHERE schema_name IS NULL OR schema_name NOT LIKE 'pg\\_temp%' LOOP
            RAISE EXCEPTION '% on % in the shared test database: a test that changes the '
                'schema needs @pytest.mark.own_db', command.command_tag, command.object_identity;
        END LOOP;
    END IF;
END
$$;
CREATE EVENT TRIGGER pytest_block_ddl ON ddl_command_end EXECUTE FUNCTION pytest_block_ddl();
CREATE EVENT TRIGGER pytest_block_drop ON sql_drop EXECUTE FUNCTION pytest_block_ddl();
"""

# Ordinary tables in `public`, less alembic's bookkeeping and what extensions own.
_TABLES_SQL = """
SELECT c.relname FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  AND c.relname <> 'alembic_version'
  AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
  )
ORDER BY c.relname
"""

_reset_sql: dict[bool, str] = {}


def _dsn(url: str) -> str:
    """The asyncpg DSN for a SQLAlchemy URL."""
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def _with_name(url: str, name: str) -> str:
    """The same server URL pointing at database `name`."""
    return f"{url.rsplit('/', 1)[0]}/{name}"


def _ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def template_name(base_url: str) -> str:
    """The run's template database, named after the configured test database."""
    return f"{base_url.rsplit('/', 1)[-1]}_template"


async def _admin(admin_url: str, *statements: str) -> None:
    conn = await asyncpg.connect(_dsn(admin_url))
    try:
        for statement in statements:
            await conn.execute(statement)
    finally:
        await conn.close()


def _check_heads() -> None:
    """Stop the run when the migrations have no single head, before anything is built."""
    from scripts.check_alembic_heads import find_heads

    try:
        heads = find_heads(BACKEND_DIR / "alembic" / "versions")
    except ValueError as error:
        pytest.exit(f"The migrations cannot be read: {error}", returncode=4)
    if len(heads) > 1:
        listed = "\n".join(f"  {revision}  {path.name}" for revision, path in heads.items())
        pytest.exit(
            f"Alembic has {len(heads)} heads, so the test database cannot be built:\n{listed}\n"
            "Point the newer migration's down_revision at the other head, or run "
            "`alembic merge heads`.",
            returncode=4,
        )


def _alembic_upgrade(url: str) -> None:
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ, "SQLALCHEMY_DATABASE_URL": url},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        lines = (result.stdout + result.stderr).strip().splitlines()
        # Alembic logs each step before it runs, so the last one is the migration that failed.
        failed = [line for line in lines if "Running upgrade" in line][-1:]
        tail = "\n".join([*failed, *lines[-25:]])
        pytest.exit(f"`alembic upgrade head` failed, so no test can run:\n{tail}", returncode=4)


async def _create_from_models(url: str) -> None:
    """Build the schema from the models, with the extensions and triggers the migrations add."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    import app.models  # noqa: F401 — loads every model onto Base.metadata
    from app.db.session import Base
    from app.db.triggers import (
        AUDIT_TRIGGER_FUNC_SQL,
        AUDITED_TABLES,
        PROTECT_AUDIT_LOGS_FUNC_SQL,
        PROTECT_AUDIT_LOGS_TRIGGER_SQL,
        get_audit_trigger_sql,
    )

    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            for extension in _EXTENSIONS:
                await conn.execute(text(f"CREATE EXTENSION IF NOT EXISTS {extension} CASCADE"))
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text(AUDIT_TRIGGER_FUNC_SQL))
            for table in AUDITED_TABLES:
                await conn.execute(text(get_audit_trigger_sql(table)))
            await conn.execute(text(PROTECT_AUDIT_LOGS_FUNC_SQL))
            await conn.execute(text(PROTECT_AUDIT_LOGS_TRIGGER_SQL))
    finally:
        await engine.dispose()


async def _snapshot_baseline(conn) -> None:
    """Copy every non-empty table into the baseline schema, then lock the schema down."""
    await conn.execute(f"CREATE SCHEMA {BASELINE_SCHEMA}")
    for (table,) in await conn.fetch(_TABLES_SQL):
        if await conn.fetchval(f"SELECT EXISTS (SELECT 1 FROM public.{_ident(table)})"):
            await conn.execute(
                f"CREATE TABLE {BASELINE_SCHEMA}.{_ident(table)} AS TABLE public.{_ident(table)}"
            )
    await conn.execute(_BLOCK_DDL_SQL)


async def _model_drift(conn) -> list[str]:
    """Table and column names that differ between the built schema and `Base.metadata`."""
    import app.models  # noqa: F401
    from app.db.session import Base

    built: dict[str, set[str]] = {}
    for (table,) in await conn.fetch(_TABLES_SQL):
        built[table] = {
            name
            for (name,) in await conn.fetch(
                "SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass"
                " AND attnum > 0 AND NOT attisdropped",
                f"public.{_ident(table)}",
            )
        }
    lines = []
    for table in sorted(built.keys() - Base.metadata.tables.keys()):
        lines.append(f"  table {table}: only in migrations")
    for table in sorted(Base.metadata.tables.keys() - built.keys()):
        lines.append(f"  table {table}: only in models")
    for table in sorted(built.keys() & Base.metadata.tables.keys()):
        model_columns = {column.name for column in Base.metadata.tables[table].columns}
        if only := sorted(built[table] - model_columns):
            lines.append(f"  {table}: columns only in migrations: {', '.join(only)}")
        if only := sorted(model_columns - built[table]):
            lines.append(f"  {table}: columns only in models: {', '.join(only)}")
    return lines


async def _build_template(base_url: str, admin_url: str, from_models: bool) -> list[str]:
    name = template_name(base_url)
    url = _with_name(base_url, name)
    await _admin(
        admin_url,
        f"DROP DATABASE IF EXISTS {_ident(name)} WITH (FORCE)",
        f"CREATE DATABASE {_ident(name)}",
    )
    if from_models:
        await _create_from_models(url)
    else:
        _alembic_upgrade(url)
    conn = await asyncpg.connect(_dsn(url))
    try:
        drift = [] if from_models else await _model_drift(conn)
        await _snapshot_baseline(conn)
    finally:
        await conn.close()
    return drift


def build_template(config, base_url: str, admin_url: str) -> None:
    """Check the heads and build the run's template; print any model/migration name drift."""
    mode = os.getenv("TEST_SCHEMA", "alembic")
    if mode not in ("alembic", "models"):
        pytest.exit(f"TEST_SCHEMA must be `alembic` or `models`, not `{mode}`", returncode=4)
    if mode == "alembic":
        _check_heads()
    drift = asyncio.run(_build_template(base_url, admin_url, from_models=mode == "models"))
    reporter = config.pluginmanager.get_plugin("terminalreporter")
    if drift and reporter is not None:
        reporter.write_line(
            "WARNING: the migrations and the models name different tables or columns:\n" + "\n".join(drift),
            yellow=True,
            bold=True,
        )


async def _build_reset_sql(url: str) -> None:
    """Work out, once per worker, the statements that bring the database back to the baseline."""
    conn = await asyncpg.connect(_dsn(url))
    try:
        tables = [table for (table,) in await conn.fetch(_TABLES_SQL)]
        restores = []
        for (table,) in await conn.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
            BASELINE_SCHEMA,
        ):
            # Generated columns compute themselves and refuse a value.
            columns = ", ".join(
                _ident(name)
                for (name,) in await conn.fetch(
                    "SELECT attname FROM pg_attribute WHERE attrelid = $1::regclass"
                    " AND attnum > 0 AND NOT attisdropped AND attgenerated = '' ORDER BY attnum",
                    f"public.{_ident(table)}",
                )
            )
            restores.append(
                f"INSERT INTO public.{_ident(table)} ({columns})"
                f" SELECT {columns} FROM {BASELINE_SCHEMA}.{_ident(table)};"
            )
        sequences = [
            f"SELECT setval('public.{_ident(name)}', {value});"
            for name, value in await conn.fetch(
                "SELECT sequencename, last_value FROM pg_sequences"
                " WHERE schemaname = 'public' AND last_value IS NOT NULL"
            )
        ]
    finally:
        await conn.close()
    # Replica mode skips the triggers: the audit trail must not log the reset, and the
    # audit_logs guard would refuse the TRUNCATE.
    head = (
        f"BEGIN; SET LOCAL lock_timeout = '{LOCK_TIMEOUT}';"
        " SET LOCAL session_replication_role = replica;"
        f" TRUNCATE {', '.join('public.' + _ident(t) for t in tables)} RESTART IDENTITY CASCADE;"
    )
    _reset_sql[False] = f"{head} COMMIT;"
    _reset_sql[True] = " ".join([head, *restores, *sequences, "COMMIT;"])


def create_worker_db(base_url: str, admin_url: str, url: str) -> None:
    """Give this process its own clone of the template and prepare its reset."""
    name = url.rsplit("/", 1)[-1]
    asyncio.run(
        _admin(
            admin_url,
            f"DROP DATABASE IF EXISTS {_ident(name)} WITH (FORCE)",
            f"CREATE DATABASE {_ident(name)} TEMPLATE {_ident(template_name(base_url))}",
        )
    )
    asyncio.run(_build_reset_sql(url))


async def reset(engine, *, baseline: bool = True) -> None:
    """Empty every table, then copy the baseline back unless `baseline` is False.

    Runs on a connection of `engine`, which the pool then hands to the test's session.
    """
    if not _reset_sql:
        raise RuntimeError(
            "The test database was never built: tests/conftest.py's pytest_sessionstart did not "
            "run. Run pytest from Backend/, or pass it the tests directory."
        )
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        try:
            await raw.driver_connection.execute(_reset_sql[baseline])
        except asyncpg.exceptions.LockNotAvailableError as error:
            raise RuntimeError(
                f"Resetting the test database waited {LOCK_TIMEOUT} for a lock: a connection an "
                "earlier test opened is still holding one. Close or dispose it in that test."
            ) from error


async def create_own_db(base_url: str, admin_url: str, name: str) -> str:
    """A fresh copy of the template where schema changes are allowed; returns its URL."""
    await _admin(
        admin_url,
        f"DROP DATABASE IF EXISTS {_ident(name)} WITH (FORCE)",
        f"CREATE DATABASE {_ident(name)} TEMPLATE {_ident(template_name(base_url))}",
        f"ALTER DATABASE {_ident(name)} SET {ALLOW_DDL_SETTING} = 'on'",
    )
    return _with_name(base_url, name)


async def drop_own_db(admin_url: str, name: str) -> None:
    """Drop a copy `create_own_db` made."""
    await _admin(admin_url, f"DROP DATABASE IF EXISTS {_ident(name)} WITH (FORCE)")
