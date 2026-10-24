"""Guard the ADR-363 migration: existing live announcements are cut down to one per page.

Before it, any number of announcements could be live at once. The upgrade takes down every live one
that a later-published live one overlaps on a page, the result of publishing them in order under the
new rule, then puts on the unique indexes. The downgrade numbers the live ones by when they went live.
"""

import asyncio
import os
import sys

import pytest
import pytest_asyncio
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import _ADMIN_DB_URL, TEST_DB_URL

# The revision the one-live-per-page migration chains off.
_BEFORE = "79a19cabc98a"

_DB_NAME = f"{TEST_DB_URL.rsplit('/', 1)[-1]}_one_live_per_page"
_DB_URL = TEST_DB_URL.rsplit("/", 1)[0] + "/" + _DB_NAME
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Live before the upgrade, oldest first: (content, placement, minutes ago it went live).
_LIVE_BEFORE = [
    ("e", "admin_page", 60),
    ("d", "public_page", 50),
    ("a", "public_page", 40),
    ("b", "all", 30),
    ("g", "public_page", 25),
    ("c", "admin_page", 20),
]

_INSERT = text(
    "INSERT INTO announcements (uuid, content, active, placement, created_by, updated_by, published_at)"
    " VALUES (gen_random_uuid(), :content, true, :placement, :user, :user,"
    "         now() - make_interval(mins => :minutes))"
)

_LIVE = text("SELECT content FROM announcements WHERE active AND delete_at IS NULL")


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


async def _second_live_refused(engine, user) -> bool:
    """Whether a new live announcement on the site is refused while one is live there."""
    try:
        async with engine.connect() as conn:
            await conn.execute(
                _INSERT, {"content": "extra", "placement": "public_page", "user": user, "minutes": 0}
            )
        return False
    except IntegrityError:
        return True


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def outcomes():
    """Seed several live announcements before the migration, upgrade, downgrade; yield what was seen."""
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
        async with engine.connect() as conn:
            user = (
                await conn.execute(
                    text(
                        "INSERT INTO users (uuid, name, credibility_score)"
                        " VALUES (gen_random_uuid(), 'admin', 50) RETURNING uuid"
                    )
                )
            ).scalar_one()
            for content, placement, minutes in _LIVE_BEFORE:
                await conn.execute(
                    _INSERT, {"content": content, "placement": placement, "user": user, "minutes": minutes}
                )

        code, output = await _alembic("upgrade", "e4b7c2a19d63")
        assert code == 0, output
        async with engine.connect() as conn:
            live_after = set((await conn.execute(_LIVE)).scalars())
            columns = await conn.run_sync(
                lambda sync: {c["name"] for c in inspect(sync).get_columns("announcements")}
            )
        refused_after = await _second_live_refused(engine, user)

        code, output = await _alembic("downgrade", _BEFORE)
        assert code == 0, output
        async with engine.connect() as conn:
            order_back = dict(
                (
                    await conn.execute(
                        text(
                            "SELECT content, display_order FROM announcements"
                            " WHERE active AND delete_at IS NULL"
                        )
                    )
                ).all()
            )
        refused_back = await _second_live_refused(engine, user)

        code, output = await _alembic("upgrade", "e4b7c2a19d63")
        assert code == 0, output
        async with engine.connect() as conn:
            live_again = set((await conn.execute(_LIVE)).scalars())
        await engine.dispose()

        yield {
            "live_after": live_after,
            "columns": columns,
            "refused_after": refused_after,
            "order_back": order_back,
            "refused_back": refused_back,
            "live_again": live_again,
        }
    finally:
        await _drop(admin)
        await admin.dispose()


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrade_keeps_only_what_a_newer_live_one_does_not_overlap(outcomes):
    """b, on both pages, replaced e, d and a; then g replaced it on the site and c on the admin page."""
    assert outcomes["live_after"] == {"g", "c"}


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrade_drops_the_order_and_refuses_a_second_live_one(outcomes):
    """display_order is gone, and the database itself refuses a second live announcement on a page."""
    assert "display_order" not in outcomes["columns"]
    assert outcomes["refused_after"]


@pytest.mark.asyncio(loop_scope="module")
async def test_downgrade_numbers_the_live_ones_by_when_they_went_live(outcomes):
    """The way back restores the order column, numbering by publish time, and allows several live again."""
    assert outcomes["order_back"] == {"g": 1, "c": 2}
    assert not outcomes["refused_back"]


@pytest.mark.asyncio(loop_scope="module")
async def test_upgrading_again_cuts_down_what_went_live_meanwhile(outcomes):
    """A second site announcement put live after the downgrade replaces g when the upgrade runs again."""
    assert outcomes["live_again"] == {"extra", "c"}
