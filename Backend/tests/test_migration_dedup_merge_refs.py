"""Spec 028 (ADR-371): the columns that say where a merged ticket and a merged need went.

`tickets.replaced_by_uuid` points a ticket cancelled by a dedup resolve at the ticket that replaced
it; `ticket_tasks.merged_into_uuid` points a need folded into another at that need. Both are plain
records, so the migration's way back must not lose them: while either holds a value the downgrade
fails, and once neither does it drops both columns.
"""

import asyncio
import os
import sys
import uuid as uuidlib

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models.auth import User
from app.models.request import Tickets
from app.models.ticket_task import TicketTask
from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# main's head this migration chains off (#110, briefing status).
_BEFORE = "da152a6a9d7c"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_merge_refs"
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


async def _columns(engine) -> set[tuple[str, str]]:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE (table_name, column_name) IN "
                "(('tickets', 'replaced_by_uuid'), ('ticket_tasks', 'merged_into_uuid'))"
            )
        )
        return {(table, column) for table, column in rows.all()}


async def _seed(engine) -> dict[str, uuidlib.UUID]:
    """Two tickets with a need each; B and its need point at A and A's need."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        owner = User(name="開單者")
        session.add(owner)
        await session.flush()
        ids = {key: uuidlib.uuid4() for key in ("a", "b", "a_task", "b_task")}
        for key in ("a", "b"):
            session.add(
                Tickets(
                    uuid=ids[key],
                    property_name="request",
                    created_by=owner.uuid,
                    title=f"求助 {key}",
                    contact_name="聯絡人",
                    status="pending",
                    priority="medium",
                )
            )
        await session.flush()
        for key in ("a", "b"):
            session.add(
                TicketTask(
                    uuid=ids[f"{key}_task"],
                    ticket_uuid=ids[key],
                    task_type="hr",
                    task_name="清淤",
                    quantity=2,
                    created_by=owner.uuid,
                )
            )
        await session.commit()
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE tickets SET replaced_by_uuid = :a WHERE uuid = :b"), {"a": ids["a"], "b": ids["b"]}
        )
        await conn.execute(
            text("UPDATE ticket_tasks SET merged_into_uuid = :a WHERE uuid = :b"),
            {"a": ids["a_task"], "b": ids["b_task"]},
        )
    return ids


async def _rejects(engine, statement: str, params: dict) -> bool:
    try:
        async with engine.begin() as conn:
            await conn.execute(text(statement), params)
        return False
    except IntegrityError:
        return True


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """Upgrade, write the refs, try a downgrade with them, clear them, downgrade, upgrade again."""
    admin = create_async_engine(_ADMIN_DB_URL, isolation_level="AUTOCOMMIT")
    try:
        await _drop(admin)
        async with admin.connect() as conn:
            await conn.exec_driver_sql(f'CREATE DATABASE "{_DB_NAME}"')
        engine = create_async_engine(_DB_URL)
        async with engine.begin() as conn:
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis")
            await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        code, output = await _alembic("upgrade", "head")
        assert code == 0, output
        after_upgrade = await _columns(engine)
        ids = await _seed(engine)
        missing = uuidlib.uuid4()
        bad_ticket_ref = await _rejects(
            engine, "UPDATE tickets SET replaced_by_uuid = :m WHERE uuid = :a", {"m": missing, "a": ids["a"]}
        )
        bad_task_ref = await _rejects(
            engine,
            "UPDATE ticket_tasks SET merged_into_uuid = :m WHERE uuid = :a",
            {"m": missing, "a": ids["a_task"]},
        )

        blocked_code, blocked_output = await _alembic("downgrade", _BEFORE)
        kept = await _columns(engine)
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE tickets SET replaced_by_uuid = NULL"))
        task_ref_blocked_code, _ = await _alembic("downgrade", _BEFORE)
        async with engine.begin() as conn:
            await conn.execute(text("UPDATE ticket_tasks SET merged_into_uuid = NULL"))
        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        after_downgrade = await _columns(engine)
        reupgrade_code, reupgrade_output = await _alembic("upgrade", "head")
        await engine.dispose()

        yield {
            "after_upgrade": after_upgrade,
            "bad_ticket_ref": bad_ticket_ref,
            "bad_task_ref": bad_task_ref,
            "blocked_code": blocked_code,
            "blocked_output": blocked_output,
            "kept": kept,
            "task_ref_blocked_code": task_ref_blocked_code,
            "after_downgrade": after_downgrade,
            "reupgrade": (reupgrade_code, reupgrade_output),
        }
    finally:
        await _drop(admin)
        await admin.dispose()


_BOTH = {("tickets", "replaced_by_uuid"), ("ticket_tasks", "merged_into_uuid")}


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrade_adds_both_columns(outcomes):
    """Head has the ticket's and the need's merge reference."""
    assert outcomes["after_upgrade"] == _BOTH


@pytest.mark.asyncio(loop_scope="module")
async def test_references_must_point_at_existing_rows(outcomes):
    """Both are foreign keys: a uuid that is no ticket, or no need, is refused."""
    assert outcomes["bad_ticket_ref"]
    assert outcomes["bad_task_ref"]


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_refuses_while_a_ticket_or_need_holds_a_reference(outcomes):
    """A downgrade would drop where a merged ticket or need went, so it fails while any is set."""
    assert outcomes["blocked_code"] != 0
    assert "replaced_by_uuid" in outcomes["blocked_output"]
    assert outcomes["kept"] == _BOTH
    assert outcomes["task_ref_blocked_code"] != 0


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_drops_both_columns_once_none_is_set(outcomes):
    """With no references left the downgrade succeeds, and upgrading again works."""
    assert outcomes["after_downgrade"] == set()
    code, output = outcomes["reupgrade"]
    assert code == 0, output
