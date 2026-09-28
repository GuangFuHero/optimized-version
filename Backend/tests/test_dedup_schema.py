"""Dedup table constraints after Spec 020 (ADR-294), on both ways the schema gets built.

Every other test builds its schema from the models (`create_all`), and
test_migrations_match_models compares column *names* only, so a CHECK constraint written wrong
in the migration would pass everything else. These run the same assertions against the models
and against a database built by `alembic upgrade head` → `downgrade -1` → `upgrade head`.
"""

import asyncio
import json
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_dedup_schema"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOW, HIGH = "00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"


async def _insert_pair(conn: AsyncConnection, *, method: str, version: str | None, evidence=None):
    result = await conn.execute(
        text(
            "INSERT INTO duplicate_pairs (uuid, entity_kind, low_uuid, high_uuid, method, source_layer, "
            "status, engine_version, evidence) "
            "VALUES (gen_random_uuid(), 'ticket', :low, :high, :method, 'fast', 'suggested', :version, "
            "CAST(:evidence AS jsonb)) RETURNING evidence"
        ),
        {
            "low": LOW,
            "high": HIGH,
            "method": method,
            "version": version,
            "evidence": None if evidence is None else json.dumps(evidence),
        },
    )
    return result.scalar_one()


async def _insert_event(conn: AsyncConnection, *, event_type: str, version: str | None) -> None:
    await conn.execute(
        text(
            "INSERT INTO dedup_audit_events (uuid, entity_kind, event_type, source_layer, engine_version) "
            "VALUES (gen_random_uuid(), 'ticket', :event_type, 'fast', :version)"
        ),
        {"event_type": event_type, "version": version},
    )


async def _rejects(conn: AsyncConnection, statement) -> bool:
    """Whether `statement` fails a constraint; a savepoint keeps the outer transaction usable."""
    try:
        async with conn.begin_nested():
            await statement
    except IntegrityError:
        return True
    return False


async def _check_all(conn: AsyncConnection) -> None:
    # An engine-produced card must say which engine version judged it.
    assert await _rejects(conn, _insert_pair(conn, method="fast_rule", version=None))
    # A card an admin made by hand has no engine behind it.
    assert await _insert_pair(conn, method="manual", version=None) is None
    await conn.execute(text("DELETE FROM duplicate_pairs"))
    # Evidence is opaque JSON and comes back as stored.
    evidence = {"components": [{"name": "distance", "score": 0.97, "weight": 2.0, "passed": True}]}
    assert await _insert_pair(conn, method="fast_rule", version="fast-v1", evidence=evidence) == evidence

    await _insert_event(conn, event_type="hint_shown", version="fast-v1")
    await _insert_event(conn, event_type="manual_note", version=None)  # not every event is an engine's
    assert await _rejects(conn, _insert_event(conn, event_type="hint_dismissed", version="fast-v1"))

    columns = (
        await conn.execute(
            text("SELECT column_name FROM information_schema.columns WHERE table_name = 'duplicate_pairs'")
        )
    ).scalars()
    assert "score_components" not in set(columns)


@pytest.mark.asyncio
async def test_model_schema_constraints(db):
    """The schema every other test runs on."""
    conn = await db.connection()
    await _check_all(conn)
    await db.rollback()


async def _alembic(*args: str) -> None:
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


async def _drop(admin) -> None:
    async with admin.connect() as conn:
        await conn.exec_driver_sql(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            f"WHERE datname = '{_DB_NAME}' AND pid <> pg_backend_pid()"
        )
        await conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{_DB_NAME}"')


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def migrated_db_url():
    """A throwaway database migrated up, one step down, and up again (the dedup migration is head)."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
        setup = create_async_engine(_DB_URL, isolation_level="AUTOCOMMIT")
        async with setup.connect() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        await setup.dispose()

        await _alembic("upgrade", "head")
        await _alembic("downgrade", "-1")
        await _alembic("upgrade", "head")
        yield _DB_URL
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_migration_schema_constraints(migrated_db_url):
    """The schema production actually gets."""
    engine = create_async_engine(migrated_db_url)
    try:
        async with engine.connect() as conn, conn.begin():
            await _check_all(conn)
            await conn.rollback()
    finally:
        await engine.dispose()
